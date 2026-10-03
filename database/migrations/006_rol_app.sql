-- 006_rol_app.sql
-- Usuario de la API con permisos mínimos (solo lectura). Idempotente.
--
-- La contraseña NO está en este archivo: se pasa como variable de psql desde
-- importar.sh, que la lee de api/.env (archivo no versionado):
--   psql -v app_password='...' -f 006_rol_app.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'idepy_app') THEN
    CREATE ROLE idepy_app LOGIN;
  END IF;
END
$$;

-- Fuera del bloque DO porque psql no reemplaza variables dentro de $$ ... $$.
-- El servidor la guarda como hash SCRAM-SHA-256 (password_encryption).
ALTER ROLE idepy_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
  CONNECTION LIMIT 20 PASSWORD :'app_password';

-- Defensa en profundidad: aunque tuviera permisos de escritura por error, sus
-- transacciones son de solo lectura, y ninguna consulta puede colgarse más de 5 s.
ALTER ROLE idepy_app IN DATABASE idepy_demo SET default_transaction_read_only = on;
ALTER ROLE idepy_app IN DATABASE idepy_demo SET statement_timeout = '5s';
ALTER ROLE idepy_app IN DATABASE idepy_demo SET search_path = idepy, public;

-- Solo lucas10 (dueño) e idepy_app pueden conectarse a esta base.
REVOKE ALL     ON DATABASE idepy_demo FROM PUBLIC;
GRANT  CONNECT ON DATABASE idepy_demo TO idepy_app;

-- Esquema idepy: solo lectura de lo que usa la API. Sin acceso a staging.
GRANT USAGE ON SCHEMA idepy TO idepy_app;
GRANT SELECT ON
  idepy.recurso,
  idepy.unidad_administrativa,
  idepy.via_segmento,
  idepy.via,
  idepy.regla_transformacion,
  idepy.nombre_excluido,
  idepy.abreviatura          -- la lee normalizar_nombre(), que se ejecuta con los permisos de quien la llama
TO idepy_app;

-- Funciones: se revoca el EXECUTE por defecto a PUBLIC y se otorga solo a idepy_app.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA idepy FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION
  idepy.f_unaccent(text),
  idepy.normalizar_texto(text),
  idepy.normalizar_nombre(text),
  idepy.buscar_vias(text)
TO idepy_app;
