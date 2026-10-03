import { query } from '../db/pool.js';

// Tolerancia de simplificación para la LISTA de resultados, en grados (EPSG:4674).
// 0.00002° ≈ 2 m: no se nota a escala de barrio y reduce el peso de la respuesta.
// El detalle (/api/vias/:id) devuelve la geometría completa.
const TOLERANCIA_SIMPLIFICACION = 0.00002;

// La normalización NO se reimplementa en JavaScript: se le pide a la base.
export async function normalizar(texto) {
  const [fila] = await query('SELECT idepy.normalizar_nombre($1) AS normalizada', [texto]);
  return fila.normalizada;
}

// Busca con idepy.buscar_vias (la misma función que prueba database/scripts/verificar.sql).
// Primero ordena y corta (LIMIT) y recién después calcula el GeoJSON, solo de las filas
// que se devuelven. "total" cuenta todas las coincidencias, antes del LIMIT.
export function buscar(texto, codigoUnidad, limite) {
  return query(
    `WITH coincidencias AS (
       SELECT b.via_id, b.rango, v.nombre_busqueda, u.nombre AS unidad_nombre,
              count(*) OVER () AS total
       FROM idepy.buscar_vias($1) b
       JOIN idepy.via v ON v.id = b.via_id
       JOIN idepy.unidad_administrativa u ON u.id = v.unidad_administrativa_id
       WHERE ($2::text IS NULL OR u.codigo = $2)
       ORDER BY b.rango, v.nombre_busqueda, u.nombre, b.via_id
       LIMIT $3
     )
     SELECT c.total, c.rango,
            v.id, v.nombre_mostrado AS nombre, v.nombre_busqueda, v.variantes,
            u.codigo AS unidad_codigo, u.nombre AS unidad_nombre,
            v.cantidad_segmentos, v.longitud_total_m,
            ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(v.geometria, $4), 4326), 6)::json AS geometria
     FROM coincidencias c
     JOIN idepy.via v ON v.id = c.via_id
     JOIN idepy.unidad_administrativa u ON u.id = v.unidad_administrativa_id
     ORDER BY c.rango, v.nombre_busqueda, u.nombre, v.id`,
    [texto, codigoUnidad, limite, TOLERANCIA_SIMPLIFICACION]
  );
}

// Cuántas coincidencias hay en las OTRAS unidades (para el aviso "sin resultados en
// este distrito, pero hay N en otros").
export function contarEnOtrasUnidades(texto, codigoUnidad) {
  return query(
    `SELECT u.codigo, u.nombre, count(*) AS cantidad
     FROM idepy.buscar_vias($1) b
     JOIN idepy.via v ON v.id = b.via_id
     JOIN idepy.unidad_administrativa u ON u.id = v.unidad_administrativa_id
     WHERE u.codigo <> $2
     GROUP BY u.codigo, u.nombre
     ORDER BY u.nombre`,
    [texto, codigoUnidad]
  );
}

// Detalle de una calle: datos, desgloses por longitud, segmentos, fuente y geometría
// completa en EPSG:4326.
export async function obtenerPorId(id) {
  const filas = await query(
    `WITH v AS (
       SELECT * FROM idepy.via WHERE id = $1
     ),
     seg AS (
       SELECT s.*
       FROM idepy.via_segmento s
       JOIN v ON s.unidad_administrativa_id = v.unidad_administrativa_id
             AND s.nombre_busqueda = v.nombre_busqueda
     )
     SELECT v.id, v.nombre_mostrado AS nombre, v.nombre_busqueda, v.variantes,
            v.cantidad_segmentos, v.longitud_total_m,
            json_build_object('codigo', u.codigo, 'nombre', u.nombre, 'tipo', u.tipo) AS unidad,
            (SELECT json_agg(json_build_object(
                      'valor', x.tipo_via, 'segmentos', x.n, 'longitud_m', x.l,
                      'porcentaje', round(100.0 * x.l / v.longitud_total_m, 1))
                    ORDER BY x.l DESC, x.tipo_via)
             FROM (SELECT tipo_via, count(*) AS n, sum(longitud_m) AS l FROM seg GROUP BY tipo_via) x
            ) AS por_tipo_via,
            (SELECT json_agg(json_build_object(
                      'valor', x.superficie, 'segmentos', x.n, 'longitud_m', x.l,
                      'porcentaje', round(100.0 * x.l / v.longitud_total_m, 1))
                    ORDER BY x.l DESC, x.superficie)
             FROM (SELECT superficie, count(*) AS n, sum(longitud_m) AS l FROM seg GROUP BY superficie) x
            ) AS por_superficie,
            (SELECT json_agg(json_build_object(
                      'fid_origen', s.fid_origen, 'nombre_original', s.nombre_original,
                      'tipo_via', s.tipo_via, 'superficie', s.superficie, 'longitud_m', s.longitud_m)
                    ORDER BY s.fid_origen)
             FROM seg s
            ) AS segmentos,
            (SELECT json_agg(json_build_object(
                      'nombre', r.nombre, 'organismo', r.organismo, 'producto', r.producto,
                      'periodo_referencia', r.periodo_referencia)
                    ORDER BY r.id)
             FROM idepy.recurso r
             WHERE r.id IN (SELECT DISTINCT recurso_id FROM seg)
            ) AS fuentes,
            -- La misma calle (mismo nombre_busqueda) en otras unidades administrativas
            (SELECT coalesce(json_agg(json_build_object('id', o.id, 'codigo', ou.codigo, 'nombre', ou.nombre)
                                      ORDER BY ou.nombre), '[]'::json)
             FROM idepy.via o
             JOIN idepy.unidad_administrativa ou ON ou.id = o.unidad_administrativa_id
             WHERE o.nombre_busqueda = v.nombre_busqueda AND o.id <> v.id
            ) AS misma_calle_en_otras_unidades,
            ST_AsGeoJSON(ST_Transform(v.geometria, 4326), 6)::json AS geometria
     FROM v
     JOIN idepy.unidad_administrativa u ON u.id = v.unidad_administrativa_id`,
    [id]
  );
  return filas[0] ?? null;
}
