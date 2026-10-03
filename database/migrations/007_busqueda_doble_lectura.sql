-- 007_busqueda_doble_lectura.sql
-- Reemplaza idepy.buscar_vias (definida en 005) para aceptar la "doble lectura" de las
-- abreviaturas en la consulta del usuario. Idempotente.
--
-- Problema: la consulta pasa por la misma normalización que los datos, que expande
-- abreviaturas. Una palabra a medio escribir que coincide con una abreviatura se expande
-- y deja de encontrar lo que el usuario buscaba ("cap" -> CAPITAN, no encuentra CAPILLA;
-- "ing" -> INGENIERO, no encuentra INGAVI).
--
-- Solución: cada token de la consulta que es una abreviatura se cumple con
--   * su lectura expandida (contenida en el nombre: "CAPITAN"), O
--   * su lectura literal, solo como COMIENZO de una palabra ("CAP" -> CAPILLA).
-- (La lectura literal como "contenido en cualquier parte" se descartó: "DR" aparece
-- dentro de PEDRO, ANDRES, ALEJANDRO.)
--
-- Todo sigue en SQL: los tokens salen de normalizar_texto() (paso 1 de la normalización)
-- y las expansiones de la MISMA tabla idepy.abreviatura que usa normalizar_nombre().
-- Los datos no cambian.

-- Nuevo tipo de regla: reglas de búsqueda (se muestran en los metadatos) ---------------
ALTER TABLE idepy.regla_transformacion DROP CONSTRAINT IF EXISTS regla_tipo_valido;
ALTER TABLE idepy.regla_transformacion ADD CONSTRAINT regla_tipo_valido CHECK (tipo IN
  ('FILTRO', 'EXCLUSION', 'LIMPIEZA', 'NORMALIZACION', 'ASIGNACION', 'AGRUPACION',
   'REFERENCIA_ESPACIAL', 'BUSQUEDA'));

INSERT INTO idepy.regla_transformacion (codigo, tipo, descripcion) VALUES
  ('BUSQUEDA_TOKENS', 'BUSQUEDA',
   'La consulta se normaliza con la misma función que los datos y se divide en palabras (tokens). Deben cumplirse TODOS: un token solo numérico debe ser una palabra exacta del nombre ("1" no encuentra "14 DE MAYO"); los demás deben estar contenidos en el nombre.'),
  ('BUSQUEDA_DOBLE_LECTURA_ABREVIATURAS', 'BUSQUEDA',
   'Un token de la consulta que es una abreviatura se cumple con su expansión (CAP -> contiene CAPITAN) o con su forma literal como comienzo de una palabra (CAP -> CAPILLA). Así una palabra a medio escribir no se pierde por coincidir con una abreviatura.'),
  ('BUSQUEDA_ORDEN', 'BUSQUEDA',
   'Orden de resultados: 1 coincidencia exacta, 2 empieza con la consulta, 3 todas las palabras como comienzo de palabra, 4 resto de coincidencias, 5 coincidencias que solo se cumplen con la lectura literal de una abreviatura; luego alfabético y por distrito.')
ON CONFLICT (codigo) DO UPDATE SET
  tipo        = EXCLUDED.tipo,
  descripcion = EXCLUDED.descripcion;

-- Búsqueda ---------------------------------------------------------------------------
-- rango: 1 exacta, 2 empieza con, 3 todos los tokens como comienzo de palabra,
--        4 resto (lectura expandida), 5 solo se cumple con la lectura literal.
-- Devuelve 0 filas si la consulta no tiene letras ni números.
CREATE OR REPLACE FUNCTION idepy.buscar_vias(consulta text)
RETURNS TABLE (via_id integer, rango integer)
LANGUAGE sql STABLE PARALLEL SAFE STRICT
BEGIN ATOMIC
  -- MATERIALIZED: la consulta se analiza UNA vez por búsqueda, no por cada calle.
  WITH q AS MATERIALIZED (
    SELECT
      idepy.normalizar_nombre(consulta)                         AS texto,     -- consulta completa normalizada
      array_agg(t.token ORDER BY t.posicion)                    AS tokens,    -- tokens sin expandir
      array_agg(coalesce(a.expansion, t.token) ORDER BY t.posicion) AS formas, -- lectura expandida
      array_agg(a.abreviatura IS NOT NULL ORDER BY t.posicion)  AS es_abreviatura,
      -- Patrón del token NO abreviatura más largo (el más selectivo). Es obligatorio en
      -- toda coincidencia y permite usar el índice trigram (que no sirve con LIKE ALL
      -- ni con OR). Si todos los tokens son abreviaturas, '%' (sin filtro previo).
      coalesce('%' || (array_agg(t.token ORDER BY length(t.token) DESC, t.token)
                       FILTER (WHERE a.abreviatura IS NULL))[1] || '%', '%') AS patron_principal
    FROM unnest(string_to_array(idepy.normalizar_texto(consulta), ' ')) WITH ORDINALITY AS t(token, posicion)
    LEFT JOIN idepy.abreviatura a ON a.abreviatura = t.token
    HAVING count(*) > 0
  )
  SELECT v.id,
         CASE
           WHEN v.nombre_busqueda = q.texto                 THEN 1
           WHEN starts_with(v.nombre_busqueda, q.texto)     THEN 2
           WHEN m.cumple_expandida AND m.todos_prefijo      THEN 3
           WHEN m.cumple_expandida                          THEN 4
           ELSE 5
         END
  FROM q
  CROSS JOIN idepy.via v
  CROSS JOIN LATERAL (
    -- Evalúa cada token contra el nombre de la calle
    SELECT bool_and(c.expandida)               AS cumple_expandida,
           bool_and(c.expandida OR c.literal)  AS cumple,
           bool_and(c.prefijo)                 AS todos_prefijo
    FROM unnest(q.tokens, q.formas, q.es_abreviatura) AS t(token, forma, es_abreviatura)
    CROSS JOIN LATERAL (
      SELECT
        -- lectura expandida: numérico = palabra exacta; si no, contenido
        CASE WHEN t.token ~ '^[0-9]+$'
             THEN t.token = ANY (string_to_array(v.nombre_busqueda, ' '))
             ELSE strpos(v.nombre_busqueda, t.forma) > 0
        END AS expandida,
        -- lectura literal de una abreviatura: comienzo de alguna palabra
        t.es_abreviatura AND strpos(' ' || v.nombre_busqueda, ' ' || t.token) > 0 AS literal,
        -- la lectura expandida aparece como comienzo de palabra
        strpos(' ' || v.nombre_busqueda, ' ' || t.forma) > 0 AS prefijo
    ) c
  ) m
  WHERE v.nombre_busqueda LIKE q.patron_principal
    AND m.cumple;
END;

COMMENT ON FUNCTION idepy.buscar_vias(text) IS
  'Búsqueda de calles: todos los tokens deben cumplirse (numéricos como palabra exacta; abreviaturas con doble lectura). Devuelve un rango 1-5 para ordenar.';
