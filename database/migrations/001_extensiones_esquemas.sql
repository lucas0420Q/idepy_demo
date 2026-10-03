-- 001_extensiones_esquemas.sql
-- Extensiones y esquemas. Idempotente.
--
--   public  : extensiones (PostGIS, unaccent, pg_trgm)
--   staging : carga cruda del GeoPackage con ogr2ogr (sin transformar)
--   idepy   : modelo final que consulta la API

CREATE EXTENSION IF NOT EXISTS postgis  SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm  SCHEMA public;

CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS idepy;

COMMENT ON SCHEMA staging IS 'Carga cruda desde datos/idepy_demo.gpkg (ogr2ogr). No accesible para la API.';
COMMENT ON SCHEMA idepy   IS 'Modelo final de la demo IDEPY (tablas, vista materializada y funciones).';

-- Nadie, salvo el dueño, puede crear objetos en public ni en los esquemas propios.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA staging FROM PUBLIC;
REVOKE ALL ON SCHEMA idepy   FROM PUBLIC;
