// Metadatos del recurso y unidades administrativas.

import * as recursoRepository from '../repositories/recursoRepository.js';
import * as unidadesRepository from '../repositories/unidadesRepository.js';

export async function obtenerMetadatos() {
  const [recursos, reglas, abreviaturas, nombresExcluidos, resumen] = await Promise.all([
    recursoRepository.listarRecursos(),
    recursoRepository.listarReglas(),
    recursoRepository.listarAbreviaturas(),
    recursoRepository.listarNombresExcluidos(),
    recursoRepository.obtenerResumen(),
  ]);

  return {
    recurso: recursos[0] ?? null,
    reglas,
    abreviaturas,
    nombres_excluidos: nombresExcluidos,
    resumen,
    sistema_referencia: {
      almacenamiento: 'EPSG:4674 (SIRGAS 2000 geográfico)',
      salida_api: 'EPSG:4326 (WGS 84, GeoJSON)',
    },
  };
}

export async function listarUnidades() {
  const filas = await unidadesRepository.listarUnidades();
  return {
    type: 'FeatureCollection',
    features: filas.map(({ geometria, ...propiedades }) => ({
      type: 'Feature',
      id: propiedades.id,
      geometry: geometria,
      properties: propiedades,
    })),
  };
}
