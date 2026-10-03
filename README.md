# IDEPY Demo – Consulta de calles por unidad administrativa

Trabajo práctico de Análisis de Sistemas sobre la **IDEPY** (Infraestructura de Datos
Espaciales del Paraguay). Es una demo acotada de **un solo caso de uso**:

> Consultar calles según una unidad administrativa (distrito) y mostrarlas sobre un mapa.

No es un sistema completo de IDEPY.

## Arquitectura

```
React + Leaflet  ──HTTP/JSON──▶  API Node.js (Express)  ──SQL──▶  PostgreSQL + PostGIS
   (web/)                           (api/)                          (database/)
```

- El frontend **nunca** se conecta directamente a la base de datos.
- No se usa GeoServer en esta demo.

## Estructura del repositorio

| Carpeta     | Contenido |
|-------------|-----------|
| `database/` | Migraciones SQL numeradas e idempotentes, script de carga y verificación |
| `api/`      | API REST en Node.js + Express |
| `web/`      | Frontend React + Vite + Leaflet |
| `datos/`    | `idepy_demo.gpkg`: muestra preparada en QGIS (no se modifica) |
| `docs/`     | Documentación y prototipo de referencia de la interfaz |
| `qgis/`     | Proyecto QGIS con el que se preparó la muestra (no se modifica) |

## Datos

- Fuente: Instituto Nacional de Estadística (INE), Cartografía Digital 2022.
- Alcance: distritos de Fernando de la Mora (1103), Lambaré (1107) y San Lorenzo (1114), departamento Central.
- Sistema de referencia: SIRGAS 2000 geográfico (EPSG:4674).

## Requisitos

- Node.js ≥ 20, npm, git
- Postgres.app (PostgreSQL 17 + PostGIS) en `localhost:5433`

## Estado

En construcción. Las instrucciones completas de instalación y uso se agregan al final del proyecto.
