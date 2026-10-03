-- 005_vista_via.sql
-- Vista materializada "via" (calle agrupada) y función de búsqueda. Idempotente.
--
-- Calle = segmentos con igual (nombre_busqueda, unidad_administrativa_id). Una calle que
-- existe en 3 distritos da 3 filas distintas.
--
-- Es MATERIALIZADA porque los datos cambian solo al reimportar: se calcula una vez
-- (REFRESH MATERIALIZED VIEW) y cada búsqueda lee un resultado ya agrupado e indexado.

CREATE MATERIALIZED VIEW IF NOT EXISTS idepy.via AS
WITH por_variante AS (
  -- Cada forma de escritura original dentro de la calle, con su peso
  SELECT unidad_administrativa_id, nombre_busqueda, nombre_original,
         count(*)        AS segmentos,
         sum(longitud_m) AS longitud
  FROM idepy.via_segmento
  GROUP BY unidad_administrativa_id, nombre_busqueda, nombre_original
),
variantes AS (
  -- Ordenadas de la más frecuente a la menos (desempate: más longitud, luego alfabético).
  -- La primera es el nombre que se muestra.
  SELECT unidad_administrativa_id, nombre_busqueda,
         array_agg(nombre_original ORDER BY segmentos DESC, longitud DESC, nombre_original) AS variantes
  FROM por_variante
  GROUP BY unidad_administrativa_id, nombre_busqueda
),
totales AS (
  SELECT unidad_administrativa_id, nombre_busqueda,
         count(*)::integer      AS cantidad_segmentos,
         sum(longitud_m)::bigint AS longitud_total_m
  FROM idepy.via_segmento
  GROUP BY unidad_administrativa_id, nombre_busqueda
),
geometrias AS (
  -- ST_Collect sobre MultiLineStrings devolvería un GEOMETRYCOLLECTION; por eso primero
  -- se desarma cada segmento en sus LineStrings (ST_Dump) y se juntan esas líneas.
  -- ST_Collect no fusiona ni modifica la geometría: solo la agrupa.
  SELECT s.unidad_administrativa_id, s.nombre_busqueda,
         ST_Multi(ST_Collect(d.geom ORDER BY s.id, d.path))::geometry(MultiLineString, 4674) AS geometria
  FROM idepy.via_segmento s
  CROSS JOIN LATERAL ST_Dump(s.geometria) AS d
  GROUP BY s.unidad_administrativa_id, s.nombre_busqueda
)
SELECT
  -- id determinístico: mismo dato de entrada => mismo id. Puede cambiar si se reimportan
  -- datos distintos (limitación documentada).
  (row_number() OVER (ORDER BY u.codigo, v.nombre_busqueda))::integer AS id,
  v.nombre_busqueda,
  v.variantes[1] AS nombre_mostrado,
  v.variantes,
  v.unidad_administrativa_id,
  t.cantidad_segmentos,
  t.longitud_total_m,
  g.geometria
FROM variantes v
JOIN totales    t USING (unidad_administrativa_id, nombre_busqueda)
JOIN geometrias g USING (unidad_administrativa_id, nombre_busqueda)
JOIN idepy.unidad_administrativa u ON u.id = v.unidad_administrativa_id;

COMMENT ON MATERIALIZED VIEW idepy.via IS
  'Calle = segmentos agrupados por (nombre_busqueda, unidad_administrativa_id). Refrescar tras cada importación.';

-- UNIQUE en id: necesario para REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS via_id_uq             ON idepy.via (id);
CREATE UNIQUE INDEX IF NOT EXISTS via_unidad_nombre_uq  ON idepy.via (unidad_administrativa_id, nombre_busqueda);
CREATE INDEX        IF NOT EXISTS via_nombre_trgm       ON idepy.via USING gin (nombre_busqueda public.gin_trgm_ops);
CREATE INDEX        IF NOT EXISTS via_geometria_gist    ON idepy.via USING gist (geometria);

-- Búsqueda ---------------------------------------------------------------------------
-- La consulta se normaliza con la MISMA función que los datos y se divide en tokens.
-- TODOS los tokens deben cumplirse:
--   * token solo numérico -> debe ser una palabra exacta del nombre
--     ("1" no encuentra "14 DE MAYO" ni "1RO DE MARZO")
--   * otro token          -> debe estar contenido en el nombre
-- rango (para ordenar): 1 coincidencia exacta, 2 empieza con la consulta,
--   3 todos los tokens son prefijo de alguna palabra, 4 el resto.
-- Devuelve 0 filas si la consulta no tiene letras ni números.
CREATE OR REPLACE FUNCTION idepy.buscar_vias(consulta text)
RETURNS TABLE (via_id integer, rango integer)
LANGUAGE sql STABLE PARALLEL SAFE STRICT
BEGIN ATOMIC
  -- MATERIALIZED: los tokens y patrones se calculan UNA vez por búsqueda, no por fila.
  WITH q AS MATERIALIZED (
    SELECT n.texto,
           string_to_array(n.texto, ' ') AS tokens,
           -- un patrón '%TOKEN%' por token: condición de "contenido"
           ARRAY(SELECT '%' || t || '%' FROM unnest(string_to_array(n.texto, ' ')) AS t) AS patrones,
           -- patrón del token más largo (el más selectivo). Es redundante con "patrones",
           -- pero el índice trigram solo se puede usar con un LIKE simple, no con LIKE ALL.
           (SELECT '%' || t || '%' FROM unnest(string_to_array(n.texto, ' ')) AS t
            ORDER BY length(t) DESC, t LIMIT 1) AS patron_principal,
           -- tokens numéricos: deben aparecer como palabra completa
           ARRAY(SELECT t FROM unnest(string_to_array(n.texto, ' ')) AS t WHERE t ~ '^[0-9]+$') AS numeros
    FROM idepy.normalizar_nombre(consulta) AS n(texto)
    WHERE n.texto <> ''
  )
  SELECT v.id,
         CASE
           WHEN v.nombre_busqueda = q.texto THEN 1
           WHEN starts_with(v.nombre_busqueda, q.texto) THEN 2
           WHEN NOT EXISTS (
             SELECT 1 FROM unnest(q.tokens) AS t
             WHERE NOT EXISTS (
               SELECT 1 FROM unnest(string_to_array(v.nombre_busqueda, ' ')) AS palabra
               WHERE starts_with(palabra, t)
             )
           ) THEN 3
           ELSE 4
         END
  FROM idepy.via v
  CROSS JOIN q
  WHERE v.nombre_busqueda LIKE q.patron_principal
    AND v.nombre_busqueda LIKE ALL (q.patrones)
    AND q.numeros <@ string_to_array(v.nombre_busqueda, ' ');
END;

COMMENT ON FUNCTION idepy.buscar_vias(text) IS
  'Búsqueda de calles: normaliza con normalizar_nombre(), exige todos los tokens (numéricos como palabra exacta) y devuelve un rango para ordenar.';
