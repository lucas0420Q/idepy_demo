#!/usr/bin/env bash
# importar.sh — Carga reproducible de la demo IDEPY en PostgreSQL + PostGIS.
#
# Pasos:
#   1. Migraciones 000..N (crean base, extensiones, esquemas, tablas, vista, usuario).
#   2. Carga cruda de datos/idepy_demo.gpkg en el esquema staging:
#        - con ogr2ogr si está disponible (camino principal), o
#        - con database/datos/staging.sql (la misma carga guardada como SQL) si no hay
#          ogr2ogr, por ejemplo en Windows sin QGIS.
#   3. transformar.sql: staging -> modelo final idepy aplicando las reglas.
#
# Se puede ejecutar todas las veces que se quiera (idempotente). El GeoPackage se abre
# solo para lectura.
#
# Uso (desde la raíz del repo):
#   macOS (Postgres.app, puerto 5433):  ./database/scripts/importar.sh
#   Windows (Git Bash, instalador oficial de PostgreSQL, puerto 5432):
#     ADMIN_PGPASSWORD='<contraseña del usuario postgres>' bash database/scripts/importar.sh
#
# Requiere api/.env con PGPASSWORD (contraseña de idepy_app). Variables opcionales:
#   ADMIN_PGHOST, ADMIN_PGPORT, ADMIN_PGUSER, ADMIN_PGPASSWORD  conexión administrativa
#   PGBIN            carpeta de psql
#   OGR2OGR          ruta de ogr2ogr (por defecto, junto a psql)
#   CARGA_STAGING    "sql" para usar staging.sql aunque haya ogr2ogr

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Valores por defecto según el sistema operativo
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*)  # Windows (Git Bash): instalador oficial de PostgreSQL 17
    PGBIN="${PGBIN:-/c/Program Files/PostgreSQL/17/bin}"
    PUERTO="${ADMIN_PGPORT:-5432}"
    USUARIO="${ADMIN_PGUSER:-postgres}"
    ;;
  *)                          # macOS: Postgres.app crea el superusuario con el usuario de macOS
    PGBIN="${PGBIN:-/Applications/Postgres.app/Contents/Versions/17/bin}"
    PUERTO="${ADMIN_PGPORT:-5433}"
    USUARIO="${ADMIN_PGUSER:-${USER:-postgres}}"
    ;;
esac
HOST="${ADMIN_PGHOST:-localhost}"
OGR2OGR="${OGR2OGR:-$PGBIN/ogr2ogr}"
BASE="idepy_demo"
GPKG="$RAIZ/datos/idepy_demo.gpkg"
STAGING_SQL="$RAIZ/database/datos/staging.sql"
ENV_API="$RAIZ/api/.env"

# Contraseña del superusuario (en Windows el instalador la pide; Postgres.app no usa)
if [[ -n "${ADMIN_PGPASSWORD:-}" ]]; then
  export PGPASSWORD="$ADMIN_PGPASSWORD"
fi

paso() { printf '\n==> %s\n' "$*"; }
error() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
# En Windows los programas terminan en .exe
ejecutable() { [[ -x "$1" || -x "$1.exe" ]]; }

psql_admin() {
  # client_min_messages=warning: oculta los NOTICE "already exists" de las migraciones
  PGOPTIONS='-c client_min_messages=warning' \
    "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$HOST" -p "$PUERTO" -U "$USUARIO" "$@"
}

# --- Comprobaciones previas -------------------------------------------------------------
ejecutable "$PGBIN/psql" || error "No se encontró psql en \"$PGBIN\" (definí PGBIN)."
[[ -f "$ENV_API" ]]      || error "Falta api/.env. Copiá api/.env.example a api/.env y definí PGPASSWORD."

# Solo se lee la línea PGPASSWORD de api/.env (no se cargan las demás variables).
# tr -d '\r': por si el archivo se guardó con finales de línea de Windows.
APP_PASSWORD="$(grep -E '^PGPASSWORD=' "$ENV_API" | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -E 's/^["'\'']//; s/["'\'']$//')"
[[ -n "$APP_PASSWORD" ]] || error "PGPASSWORD está vacío en api/.env."
[[ "$APP_PASSWORD" != "cambiar_esta_contrasena" ]] || error "Cambiá el PGPASSWORD de ejemplo en api/.env."

psql_admin -d postgres -c 'SELECT 1' >/dev/null \
  || error "No hay conexión a $HOST:$PUERTO como $USUARIO. ¿Está iniciado PostgreSQL? (en Windows, ¿definiste ADMIN_PGPASSWORD?)"

# ¿Cómo se carga staging?
if [[ "${CARGA_STAGING:-}" != "sql" ]] && ejecutable "$OGR2OGR" && [[ -f "$GPKG" ]]; then
  MODO_CARGA="ogr2ogr"
elif [[ -f "$STAGING_SQL" ]]; then
  MODO_CARGA="sql"
else
  error "No se encontró ogr2ogr (\"$OGR2OGR\") ni database/datos/staging.sql."
fi

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
if [[ "$MODO_CARGA" == "ogr2ogr" ]]; then
  paso "ogr2ogr: $(basename "$GPKG") -> staging"
  #   active_schema=staging  las tablas se crean (y se reemplazan) en el esquema staging
  #   -overwrite          recrea las tablas de staging (idempotente)
  #   -nlt PROMOTE_TO_MULTI  garantiza tipos Multi*
  #   -preserve_fid       conserva el fid original del GeoPackage (trazabilidad)
  #   SRID: se conserva el del GeoPackage (EPSG:4674); no se reproyecta.
  "$OGR2OGR" -f PostgreSQL \
    "PG:host=$HOST port=$PUERTO dbname=$BASE user=$USUARIO active_schema=staging" \
    "$GPKG" unidades_demo vias_demo \
    -overwrite -nlt PROMOTE_TO_MULTI -preserve_fid \
    -lco GEOMETRY_NAME=geom -lco FID=fid -lco SPATIAL_INDEX=GIST
else
  paso "staging.sql -> staging (sin ogr2ogr; misma carga, generada con generar_staging_sql.sh)"
  psql_admin -d "$BASE" -f "$STAGING_SQL"
fi

# --- 3. Transformación -------------------------------------------------------------------
paso "Transformación staging -> idepy"
psql_admin -d "$BASE" -f "$RAIZ/database/scripts/transformar.sql"

paso "Listo. Verificación: psql -h $HOST -p $PUERTO -U $USUARIO -d $BASE -f database/scripts/verificar.sql"
