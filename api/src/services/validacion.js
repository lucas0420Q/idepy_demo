// Validación de parámetros de entrada. Funciones puras (sin base de datos), por eso se
// pueden probar de forma aislada (test/validacion.test.js).
// Ojo: acá NO se normaliza el texto; eso lo hace la función SQL idepy.normalizar_nombre.

import { errorValidacion } from '../errores.js';

export const LARGO_MAXIMO_Q = 100;
const CODIGO_UNIDAD = /^[0-9]{2}([0-9]{2})?$/; // mismo formato que el CHECK de la tabla
const ID_ENTERO = /^[1-9][0-9]{0,9}$/;
const MAXIMO_INTEGER = 2_147_483_647; // límite del tipo integer de PostgreSQL

// Express entrega un arreglo si el parámetro se repite (?q=a&q=b): se rechaza.
function unSoloValor(valor, nombre) {
  if (Array.isArray(valor) || (valor !== undefined && typeof valor !== 'string')) {
    throw errorValidacion(`El parámetro "${nombre}" debe enviarse una sola vez.`);
  }
  return valor;
}

export function validarBusqueda(parametros = {}) {
  const q = unSoloValor(parametros.q, 'q');
  const unidad = unSoloValor(parametros.unidad, 'unidad');

  if (q === undefined) {
    throw errorValidacion('El parámetro "q" (texto a buscar) es obligatorio.');
  }
  const texto = q.trim();
  if (texto.length === 0) {
    throw errorValidacion('El parámetro "q" no puede estar vacío.');
  }
  // [...texto] cuenta caracteres reales (una "ñ" o una tilde cuentan como uno)
  if ([...texto].length > LARGO_MAXIMO_Q) {
    throw errorValidacion(`El parámetro "q" admite como máximo ${LARGO_MAXIMO_Q} caracteres.`);
  }
  // PostgreSQL no acepta el carácter nulo en un texto: se rechaza antes de consultar.
  if (texto.includes('\u0000')) {
    throw errorValidacion('El parámetro "q" contiene caracteres no válidos.');
  }

  let codigoUnidad = null;
  if (unidad !== undefined && unidad.trim() !== '') {
    codigoUnidad = unidad.trim();
    if (!CODIGO_UNIDAD.test(codigoUnidad)) {
      throw errorValidacion('El parámetro "unidad" debe ser un código numérico de unidad administrativa (ej. 1107).');
    }
  }

  return { q: texto, unidad: codigoUnidad };
}

export function validarId(valor) {
  if (typeof valor !== 'string' || !ID_ENTERO.test(valor) || Number(valor) > MAXIMO_INTEGER) {
    throw errorValidacion('El identificador de la calle debe ser un número entero positivo.');
  }
  return Number(valor);
}
