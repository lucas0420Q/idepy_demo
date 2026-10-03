// Reglas del caso de uso "consultar calles": validación, límite de resultados, aviso de
// coincidencias en otras unidades y forma de la respuesta (GeoJSON).

import * as viasRepository from '../repositories/viasRepository.js';
import * as unidadesRepository from '../repositories/unidadesRepository.js';
import { errorNoEncontrado, errorValidacion } from '../errores.js';
import { validarBusqueda, validarId } from './validacion.js';

export const LIMITE_RESULTADOS = 150;

export async function buscarVias(parametros) {
  const { q, unidad } = validarBusqueda(parametros);

  if (unidad && !(await unidadesRepository.existeUnidad(unidad))) {
    throw errorValidacion(`No existe la unidad administrativa con código ${unidad}.`);
  }

  const normalizada = await viasRepository.normalizar(q);
  if (normalizada === '') {
    throw errorValidacion('La búsqueda debe contener al menos una letra o un número.');
  }

  const [filas, otras] = await Promise.all([
    viasRepository.buscar(q, unidad, LIMITE_RESULTADOS),
    unidad ? viasRepository.contarEnOtrasUnidades(q, unidad) : null,
  ]);

  const total = filas.length > 0 ? filas[0].total : 0;

  return {
    consulta: { q, unidad, normalizada },
    total,
    limite: LIMITE_RESULTADOS,
    hay_mas: total > filas.length,
    otras_unidades: otras && {
      total: otras.reduce((suma, fila) => suma + fila.cantidad, 0),
      por_unidad: otras,
    },
    resultados: {
      type: 'FeatureCollection',
      features: filas.map((fila) => ({
        type: 'Feature',
        id: fila.id,
        geometry: fila.geometria,
        properties: {
          id: fila.id,
          nombre: fila.nombre,
          nombre_busqueda: fila.nombre_busqueda,
          variantes: fila.variantes,
          unidad: { codigo: fila.unidad_codigo, nombre: fila.unidad_nombre },
          cantidad_segmentos: fila.cantidad_segmentos,
          longitud_total_m: fila.longitud_total_m,
          rango: fila.rango,
        },
      })),
    },
  };
}

export function obtenerRed() {
  return viasRepository.listarRed();
}

export async function obtenerVia(idTexto) {
  const id = validarId(idTexto);
  const via = await viasRepository.obtenerPorId(id);
  if (!via) {
    throw errorNoEncontrado(`No existe una calle con id ${id}.`);
  }

  const { geometria, ...propiedades } = via;
  return { type: 'Feature', id: via.id, geometry: geometria, properties: propiedades };
}
