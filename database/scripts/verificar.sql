-- verificar.sql
-- Controles de la carga. Cada fila muestra el resultado obtenido, el esperado y si coincide.
--
--   psql -h localhost -p 5433 -U lucas10 -d idepy_demo -f database/scripts/verificar.sql
--
-- Resultado esperado: todas las filas de la primera tabla con ok = t.

\pset null '(nulo)'

\echo
\echo '=== Controles (todas las filas deben tener ok = t) ==='

WITH busqueda AS (
  -- Misma función que usa la API
  SELECT c.consulta, v.nombre_mostrado, u.codigo
  FROM (VALUES ('cerro cora'), ('mariscal lopez'), ('muñoz'), ('1')) AS c(consulta)
  CROSS JOIN LATERAL idepy.buscar_vias(c.consulta) b
  JOIN idepy.via v ON v.id = b.via_id
  JOIN idepy.unidad_administrativa u ON u.id = v.unidad_administrativa_id
),
controles (orden, control, resultado, esperado) AS (
  VALUES
  (1,  'Unidades administrativas',
       (SELECT count(*)::text FROM idepy.unidad_administrativa), '3'),
  (2,  'Segmentos en staging',
       (SELECT count(*)::text FROM staging.vias_demo), '10712'),
  (3,  'Segmentos en via_segmento',
       (SELECT count(*)::text FROM idepy.via_segmento), '10709'),
  (4,  'Segmentos con nombre excluido (S7n, O, S) cargados',
       (SELECT count(*)::text FROM idepy.via_segmento s
          JOIN idepy.unidad_administrativa u ON u.id = s.unidad_administrativa_id
          JOIN idepy.nombre_excluido e ON e.nombre = s.nombre_original AND e.codigo_unidad = u.codigo), '0'),
  (5,  'Segmentos sin unidad asignada',
       (SELECT count(*)::text FROM idepy.via_segmento WHERE unidad_administrativa_id IS NULL), '0'),
  (6,  'Segmentos cuya unidad no coincide con DPTO||DISTRITO de origen',
       (SELECT count(*)::text FROM idepy.via_segmento s
          JOIN idepy.unidad_administrativa u ON u.id = s.unidad_administrativa_id
          JOIN staging.vias_demo o ON o.fid = s.fid_origen
        WHERE u.codigo <> o.dpto || o.distrito), '0'),
  (7,  'Segmentos por distrito (1103/1107/1114)',
       (SELECT string_agg(u.codigo || '=' || n, ' ' ORDER BY u.codigo)
          FROM (SELECT unidad_administrativa_id, count(*) n FROM idepy.via_segmento GROUP BY 1) x
          JOIN idepy.unidad_administrativa u ON u.id = x.unidad_administrativa_id),
       '1103=3222 1107=4344 1114=3143'),
  (8,  'Geometrías nulas, vacías o inválidas (unidades + segmentos + calles)',
       (SELECT (
          (SELECT count(*) FROM idepy.unidad_administrativa WHERE geometria IS NULL OR ST_IsEmpty(geometria) OR NOT ST_IsValid(geometria)) +
          (SELECT count(*) FROM idepy.via_segmento          WHERE geometria IS NULL OR ST_IsEmpty(geometria) OR NOT ST_IsValid(geometria)) +
          (SELECT count(*) FROM idepy.via                   WHERE geometria IS NULL OR ST_IsEmpty(geometria) OR NOT ST_IsValid(geometria))
        )::text), '0'),
  (9,  'SRID distintos en todas las geometrías',
       (SELECT string_agg(DISTINCT srid::text, ',') FROM (
          SELECT ST_SRID(geometria) srid FROM idepy.unidad_administrativa
          UNION ALL SELECT ST_SRID(geometria) FROM idepy.via_segmento
          UNION ALL SELECT ST_SRID(geometria) FROM idepy.via) g), '4674'),
  (10, 'Tipo de geometría de la vista via',
       (SELECT string_agg(DISTINCT GeometryType(geometria), ',') FROM idepy.via), 'MULTILINESTRING'),
  (11, 'Segmentos agrupados en la vista via (suma)',
       (SELECT sum(cantidad_segmentos)::text FROM idepy.via), '10709'),
  (12, 'Longitud total: vista via = via_segmento',
       (SELECT ((SELECT sum(longitud_total_m) FROM idepy.via) = (SELECT sum(longitud_m) FROM idepy.via_segmento))::text), 'true'),
  (13, 'nombre_original con "?" conservado (segmentos / nombres)',
       (SELECT count(*) || ' / ' || count(DISTINCT nombre_original) FROM idepy.via_segmento WHERE nombre_original LIKE '%?%'), '75 / 11'),
  (14, 'nombre_busqueda = normalizar_nombre(nombre_original)',
       (SELECT count(*)::text FROM idepy.via_segmento WHERE nombre_busqueda <> idepy.normalizar_nombre(nombre_original)), '0'),
  (15, 'Búsqueda "cerro cora": calles / distritos',
       (SELECT count(*) || ' / ' || count(DISTINCT codigo) FROM busqueda WHERE consulta = 'cerro cora'), '3 / 3'),
  (16, 'Búsqueda "mariscal lopez": calles / distritos',
       (SELECT count(*) || ' / ' || count(DISTINCT codigo) FROM busqueda WHERE consulta = 'mariscal lopez'), '3 / 3'),
  (17, 'Búsqueda "muñoz"',
       (SELECT string_agg(nombre_mostrado, ', ') FROM busqueda WHERE consulta = 'muñoz'), 'MU?OZ'),
  (18, 'Búsqueda "1" (solo token exacto 1)',
       (SELECT string_agg(nombre_mostrado, ', ' ORDER BY nombre_mostrado) FROM busqueda WHERE consulta = '1'),
       '1, CALLE 1, D027 - EX RUTA 1, PASILLO 1'),
  (19, 'Búsqueda sin letras ni números ("...") devuelve 0 filas',
       (SELECT count(*)::text FROM idepy.buscar_vias('...')), '0'),
  (20, 'Normalización de ejemplo',
       idepy.normalizar_nombre('Avda. Mcal. López / Tte.Cnel. MU?OZ'), 'AVENIDA MARISCAL LOPEZ TENIENTE CORONEL MUNOZ'),
  -- Doble lectura de abreviaturas (007)
  (21, 'Búsqueda "cap" incluye CAPILLA CUE (lectura literal) y CAPITAN BADO (expandida)',
       (SELECT count(DISTINCT v.nombre_busqueda)::text FROM idepy.buscar_vias('cap') b JOIN idepy.via v ON v.id = b.via_id
         WHERE v.nombre_busqueda IN ('CAPILLA CUE', 'CAPITAN BADO')), '2'),
  (22, 'Búsqueda "ing" incluye INGAVI',
       (SELECT count(*)::text FROM idepy.buscar_vias('ing') b JOIN idepy.via v ON v.id = b.via_id
         WHERE v.nombre_busqueda = 'INGAVI'), '2'),
  (23, 'Búsqueda "dr": la lectura literal (DREBUL) queda en rango 5, después de DOCTOR',
       (SELECT b.rango::text FROM idepy.buscar_vias('dr') b JOIN idepy.via v ON v.id = b.via_id
         WHERE v.nombre_busqueda = 'VALENTIN DREBUL'), '5'),
  (24, 'Búsqueda "av mcal lopez" (palabras completas, sin cambios)',
       (SELECT count(*)::text FROM idepy.buscar_vias('av mcal lopez')), '2')
)
SELECT orden AS "#", control, resultado, esperado, resultado IS NOT DISTINCT FROM esperado AS ok
FROM controles
ORDER BY orden;

\echo
\echo '=== Detalle de las búsquedas de prueba ==='

SELECT c.consulta, b.rango, v.nombre_mostrado, u.nombre AS distrito, v.cantidad_segmentos, v.longitud_total_m
FROM (VALUES (1, 'cerro cora'), (2, 'mariscal lopez'), (3, 'muñoz'), (4, '1')) AS c(orden, consulta)
CROSS JOIN LATERAL idepy.buscar_vias(c.consulta) b
JOIN idepy.via v ON v.id = b.via_id
JOIN idepy.unidad_administrativa u ON u.id = v.unidad_administrativa_id
ORDER BY c.orden, b.rango, v.nombre_busqueda, u.nombre;

\echo
\echo '=== Calles con variantes de escritura (agrupadas por nombre_busqueda) ==='

SELECT v.nombre_mostrado, u.nombre AS distrito, v.variantes
FROM idepy.via v
JOIN idepy.unidad_administrativa u ON u.id = v.unidad_administrativa_id
WHERE cardinality(v.variantes) > 1
ORDER BY u.nombre, v.nombre_busqueda;

\echo
\echo '=== Resumen ==='

SELECT u.codigo, u.nombre, count(v.*) AS calles, sum(v.cantidad_segmentos) AS segmentos,
       round(sum(v.longitud_total_m) / 1000.0, 1) AS km
FROM idepy.unidad_administrativa u
LEFT JOIN idepy.via v ON v.unidad_administrativa_id = u.id
GROUP BY u.codigo, u.nombre
ORDER BY u.codigo;
