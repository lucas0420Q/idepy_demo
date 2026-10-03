-- recalcular_nombre_busqueda.sql
-- Ejecutar después de modificar idepy.abreviatura (o la normalización).
-- nombre_busqueda es una columna materializada: no se actualiza sola porque
-- normalizar_nombre() lee una tabla y por eso no puede ser IMMUTABLE.
--
--   psql -h localhost -p 5433 -U lucas10 -d idepy_demo -f database/scripts/recalcular_nombre_busqueda.sql

\set ON_ERROR_STOP on

BEGIN;

UPDATE idepy.via_segmento
SET nombre_busqueda = idepy.normalizar_nombre(nombre_original)
WHERE nombre_busqueda IS DISTINCT FROM idepy.normalizar_nombre(nombre_original);

-- Sin CONCURRENTLY: no puede ir dentro de una transacción, y así la vista queda
-- consistente con la tabla en el mismo COMMIT.
REFRESH MATERIALIZED VIEW idepy.via;

COMMIT;

ANALYZE idepy.via;
