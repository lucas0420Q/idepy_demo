-- transformar.sql
-- staging (carga cruda) -> modelo final idepy, aplicando las reglas de
-- idepy.regla_transformacion. Todo en UNA transacción: si un control falla, no queda
-- nada a medias. Idempotente: vacía y vuelve a cargar las tablas de datos.

\set ON_ERROR_STOP on

BEGIN;

-- Controles previos sobre staging -----------------------------------------------------
DO $$
DECLARE
  n integer;
BEGIN
  -- La CLAVE de cada unidad debe ser DPTO || DISTRITO
  SELECT count(*) INTO n FROM staging.unidades_demo WHERE clave IS DISTINCT FROM dpto || distrito;
  IF n > 0 THEN
    RAISE EXCEPTION 'Hay % unidades cuya CLAVE no coincide con DPTO || DISTRITO', n;
  END IF;

  -- Todo segmento debe tener una unidad con su código (regla ASIGNACION_POR_CODIGO)
  SELECT count(*) INTO n
  FROM staging.vias_demo v
  WHERE NOT EXISTS (SELECT 1 FROM staging.unidades_demo u WHERE u.clave = v.dpto || v.distrito);
  IF n > 0 THEN
    RAISE EXCEPTION 'Hay % segmentos sin unidad administrativa para su código DPTO || DISTRITO', n;
  END IF;
END
$$;

-- Recarga ------------------------------------------------------------------------------
-- RESTART IDENTITY: los id vuelven a empezar en 1, así la recarga da siempre los mismos id.
TRUNCATE idepy.via_segmento, idepy.unidad_administrativa RESTART IDENTITY;

-- Unidades administrativas (los 3 distritos). El departamento no se carga como fila porque
-- no tenemos su polígono; unidad_padre_id queda NULL.
INSERT INTO idepy.unidad_administrativa (codigo, nombre, tipo, geometria)
SELECT btrim(clave), btrim(dist_desc_), 'DISTRITO', ST_Multi(geom)
FROM staging.unidades_demo
ORDER BY clave;

-- Segmentos de vía.
--   * unidad: por código oficial (DPTO || DISTRITO = codigo). LEFT JOIN a propósito: si
--     faltara la unidad, el NOT NULL de unidad_administrativa_id hace fallar la carga en
--     vez de descartar filas en silencio.
--   * nombre_original: trim y nada más (regla LIMPIEZA_TRIM).
--   * nombre_busqueda: normalizar_nombre() (reglas NORMALIZACION_NOMBRE y EXPANSION_ABREVIATURAS).
--   * exclusión de nombres inválidos (regla EXCLUSION_NOMBRES_INVALIDOS).
INSERT INTO idepy.via_segmento
  (recurso_id, unidad_administrativa_id, fid_origen, nombre_original, nombre_busqueda,
   tipo_via, superficie, longitud_m, geometria)
SELECT r.id,
       u.id,
       v.fid,
       btrim(v.nombre),
       idepy.normalizar_nombre(v.nombre),
       btrim(v.destipovia),
       btrim(v.desrodavia),
       v.long_metro,
       ST_Multi(v.geom)
FROM staging.vias_demo v
CROSS JOIN (
  SELECT id FROM idepy.recurso
  WHERE nombre = 'Vías de comunicación – Departamento Central (muestra de 3 distritos)'
) r
LEFT JOIN idepy.unidad_administrativa u ON u.codigo = v.dpto || v.distrito
WHERE NOT EXISTS (
  SELECT 1 FROM idepy.nombre_excluido e
  WHERE e.nombre = btrim(v.nombre) AND e.codigo_unidad = v.dpto || v.distrito
)
ORDER BY v.fid;

-- Control posterior: la cantidad cargada debe ser staging menos los excluidos ------------
DO $$
DECLARE
  en_staging integer;
  excluidos  integer;
  cargados   integer;
BEGIN
  SELECT count(*) INTO en_staging FROM staging.vias_demo;
  SELECT count(*) INTO excluidos
  FROM staging.vias_demo v
  JOIN idepy.nombre_excluido e ON e.nombre = btrim(v.nombre) AND e.codigo_unidad = v.dpto || v.distrito;
  SELECT count(*) INTO cargados FROM idepy.via_segmento;

  IF cargados <> en_staging - excluidos THEN
    RAISE EXCEPTION 'Carga inconsistente: staging=%, excluidos=%, cargados=%', en_staging, excluidos, cargados;
  END IF;
  RAISE INFO 'Segmentos: staging=%, excluidos=%, cargados=%', en_staging, excluidos, cargados;
END
$$;

-- Calles agrupadas
REFRESH MATERIALIZED VIEW idepy.via;

COMMIT;

ANALYZE idepy.unidad_administrativa;
ANALYZE idepy.via_segmento;
ANALYZE idepy.via;
