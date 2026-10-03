import { query } from '../db/pool.js';

export function listarRecursos() {
  return query(`
    SELECT id, nombre, organismo, producto, periodo_referencia, epsg_origen,
           formato_origen, observaciones
    FROM idepy.recurso
    ORDER BY id`);
}

export function listarReglas() {
  return query(`
    SELECT codigo, tipo, descripcion
    FROM idepy.regla_transformacion
    ORDER BY id`);
}

export function listarAbreviaturas() {
  return query(`
    SELECT abreviatura, expansion
    FROM idepy.abreviatura
    ORDER BY abreviatura`);
}

export function listarNombresExcluidos() {
  return query(`
    SELECT e.nombre, e.codigo_unidad, u.nombre AS unidad, e.motivo
    FROM idepy.nombre_excluido e
    LEFT JOIN idepy.unidad_administrativa u ON u.codigo = e.codigo_unidad
    ORDER BY e.codigo_unidad, e.nombre`);
}

export async function obtenerResumen() {
  const [fila] = await query(`
    SELECT (SELECT count(*) FROM idepy.unidad_administrativa) AS unidades,
           (SELECT count(*) FROM idepy.via_segmento)          AS segmentos,
           (SELECT count(*) FROM idepy.via)                   AS calles,
           (SELECT sum(longitud_m) FROM idepy.via_segmento)   AS longitud_total_m`);
  return fila;
}
