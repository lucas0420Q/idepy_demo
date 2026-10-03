#!/usr/bin/env bash
# importar.sh — Carga reproducible de la demo IDEPY en PostgreSQL (Postgres.app, puerto 5433).
#
# Pasos:
#   1. Migraciones 000..N (crean base, extensiones, esquemas, tablas, vista, usuario).
#   2. ogr2ogr: datos/idepy_demo.gpkg -> esquema staging (carga cruda, sin transformar).
#   3. transformar.sql: staging -> modelo final idepy aplicando las reglas.
#
# Se puede ejecutar todas las veces que se quiera (idempotente). El GeoPackage se abre
# solo para lectura.
#
# Uso (desde la raíz del repo):   ./database/scripts/importar.sh
#
# Requiere api/.env con PGPASSWORD (contraseña de idepy_app). Variables opcionales para
# la conexión administrativa: ADMIN_PGHOST, ADMIN_PGPORT, ADMIN_PGUSER, PGBIN.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="${PGBIN:-/Applications/Postgres.app/Contents/Versions/17/bin}"
HOST="${ADMIN_PGHOST:-localhost}"
PUERTO="${ADMIN_PGPORT:-5433}"
USUARIO="${ADMIN_PGUSER:-lucas10}"
BASE="idepy_demo"
GPKG="$RAIZ/datos/idepy_demo.gpkg"
ENV_API="$RAIZ/api/.env"

paso() { printf '\n==> %s\n' "$*"; }
error() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

psql_admin() {
  # client_min_messages=warning: oculta los NOTICE "already exists" de las migraciones
  PGOPTIONS='-c client_min_messages=warning' \
    "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$HOST" -p "$PUERTO" -U "$USUARIO" "$@"
}

# --- Comprobaciones previas -------------------------------------------------------------
[[ -x "$PGBIN/psql" ]]    || error "No se encontró psql en $PGBIN (definí PGBIN)."
[[ -x "$PGBIN/ogr2ogr" ]] || error "No se encontró ogr2ogr en $PGBIN (definí PGBIN)."
[[ -f "$GPKG" ]]          || error "No existe $GPKG."
[[ -f "$ENV_API" ]]       || error "Falta api/.env. Copiá api/.env.example a api/.env y definí PGPASSWORD."

# Solo se lee la línea PGPASSWORD de api/.env (no se cargan las demás variables).
APP_PASSWORD="$(grep -E '^PGPASSWORD=' "$ENV_API" | tail -n 1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
[[ -n "$APP_PASSWORD" ]] || error "PGPASSWORD está vacío en api/.env."
[[ "$APP_PASSWORD" != "cambiar_esta_contrasena" ]] || error "Cambiá el PGPASSWORD de ejemplo en api/.env."

psql_admin -d postgres -c 'SELECT 1' >/dev/null \
  || error "No hay conexión a $HOST:$PUERTO como $USUARIO. ¿Está iniciado Postgres.app?"

# --- 1. Migraciones ----------------------------------------------------------------------
paso "Migraciones"
psql_admin -d postgres -f "$RAIZ/database/migrations/000_crear_base.sql"
# Todas las migraciones 001..N en orden. app_password solo la usa 006_rol_app.sql.
for archivo in "$RAIZ"/database/migrations/[0-9][0-9][0-9]_*.sql; do
  [[ "$(basename "$archivo")" == 000_* ]] && continue
  echo "    $(basename "$archivo")"
  psql_admin -d "$BASE" -v app_password="$APP_PASSWORD" -f "$archivo"
done

# --- 2. Carga cruda a staging ------------------------------------------------------------
paso "ogr2ogr: $(basename "$GPKG") -> staging"
#   active_schema=staging  las tablas se crean (y se reemplazan) en el esquema staging
#   -overwrite          recrea las tablas de staging (idempotente)
#   -nlt PROMOTE_TO_MULTI  garantiza tipos Multi*
#   SRID: se conserva el del GeoPackage (EPSG:4674); no se reproyecta.
"$PGBIN/ogr2ogr" -f PostgreSQL \
  "PG:host=$HOST port=$PUERTO dbname=$BASE user=$USUARIO active_schema=staging" \
  "$GPKG" unidades_demo vias_demo \
  -overwrite -nlt PROMOTE_TO_MULTI \
  -lco GEOMETRY_NAME=geom -lco FID=fid -lco SPATIAL_INDEX=GIST

# --- 3. Transformación -------------------------------------------------------------------
paso "Transformación staging -> idepy"
psql_admin -d "$BASE" -f "$RAIZ/database/scripts/transformar.sql"

paso "Listo. Verificación: psql -h $HOST -p $PUERTO -U $USUARIO -d $BASE -f database/scripts/verificar.sql"
