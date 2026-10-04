#!/usr/bin/env bash
# generar_staging_sql.sh — Regenera database/datos/staging.sql a partir del GeoPackage.
#
# staging.sql es la MISMA carga cruda que hace ogr2ogr, pero guardada como SQL. Sirve para
# cargar la base en computadoras sin GDAL/ogr2ogr (por ejemplo, Windows sin QGIS):
# importar.sh la usa automáticamente si no encuentra ogr2ogr.
#
# Solo hace falta volver a generarlo si cambia datos/idepy_demo.gpkg.
#   ./database/scripts/generar_staging_sql.sh

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="${PGBIN:-/Applications/Postgres.app/Contents/Versions/17/bin}"
OGR2OGR="${OGR2OGR:-$PGBIN/ogr2ogr}"

# Mismas opciones que la carga directa de importar.sh, con el driver PGDump (archivo SQL)
# y COPY (más rápido de cargar que INSERT).
"$OGR2OGR" --config PG_USE_COPY YES -f PGDump "$RAIZ/database/datos/staging.sql" \
  "$RAIZ/datos/idepy_demo.gpkg" unidades_demo vias_demo \
  -nlt PROMOTE_TO_MULTI -preserve_fid \
  -lco SCHEMA=staging -lco CREATE_SCHEMA=OFF -lco DROP_TABLE=IF_EXISTS \
  -lco GEOMETRY_NAME=geom -lco FID=fid -lco SPATIAL_INDEX=GIST

echo "Generado: database/datos/staging.sql ($(wc -c < "$RAIZ/database/datos/staging.sql") bytes)"
