-- 000_crear_base.sql
-- Crea la base idepy_demo si no existe.
-- Se ejecuta conectado a la base "postgres" (CREATE DATABASE no puede ir dentro de
-- otra base ni de una transacción, y no admite IF NOT EXISTS).
-- Idempotente: \gexec solo ejecuta el CREATE si la consulta devuelve una fila.

SELECT 'CREATE DATABASE idepy_demo ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'idepy_demo')
\gexec
