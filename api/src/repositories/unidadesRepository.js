import { query } from '../db/pool.js';

// Polígonos en EPSG:4326 (lo que espera Leaflet/GeoJSON) con 6 decimales (~0,1 m).
// No se simplifican: son 3 polígonos y pesan ~65 KB en total.
export function listarUnidades() {
  return query(`
    SELECT u.id, u.codigo, u.nombre, u.tipo,
           count(v.id)                         AS cantidad_calles,
           coalesce(sum(v.cantidad_segmentos), 0) AS cantidad_segmentos,
           coalesce(sum(v.longitud_total_m), 0)   AS longitud_total_m,
           ST_AsGeoJSON(ST_Transform(u.geometria, 4326), 6)::json AS geometria
    FROM idepy.unidad_administrativa u
    LEFT JOIN idepy.via v ON v.unidad_administrativa_id = u.id
    GROUP BY u.id
    ORDER BY u.nombre`);
}

export async function existeUnidad(codigo) {
  const filas = await query('SELECT 1 FROM idepy.unidad_administrativa WHERE codigo = $1', [codigo]);
  return filas.length > 0;
}
