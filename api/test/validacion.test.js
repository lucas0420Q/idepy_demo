// Pruebas unitarias de validación de parámetros. No necesitan base de datos.
//   npm run test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarBusqueda, validarId } from '../src/services/validacion.js';
import { ErrorHttp } from '../src/errores.js';

// Verifica que la función lance un error 400 cuyo mensaje contenga el texto indicado
function rechaza(funcion, textoMensaje) {
  assert.throws(funcion, (error) => {
    assert.ok(error instanceof ErrorHttp);
    assert.equal(error.status, 400);
    assert.match(error.message, textoMensaje);
    return true;
  });
}

test('q es obligatorio', () => {
  rechaza(() => validarBusqueda({}), /obligatorio/);
});

test('q vacío o solo espacios se rechaza', () => {
  rechaza(() => validarBusqueda({ q: '' }), /vacío/);
  rechaza(() => validarBusqueda({ q: '    ' }), /vacío/);
});

test('q admite de 1 a 100 caracteres', () => {
  assert.equal(validarBusqueda({ q: 'a' }).q, 'a');
  assert.equal(validarBusqueda({ q: 'a'.repeat(100) }).q.length, 100);
  rechaza(() => validarBusqueda({ q: 'a'.repeat(101) }), /100 caracteres/);
});

test('el largo cuenta caracteres, no bytes (ñ y tildes cuentan uno)', () => {
  assert.doesNotThrow(() => validarBusqueda({ q: 'ñ'.repeat(100) }));
  assert.doesNotThrow(() => validarBusqueda({ q: 'á'.repeat(100) }));
});

test('q se recorta (trim) pero no se normaliza en JavaScript', () => {
  // La normalización (mayúsculas, tildes, abreviaturas) la hace la base de datos.
  assert.deepEqual(validarBusqueda({ q: '  Avda. Mcal. López ' }), { q: 'Avda. Mcal. López', unidad: null });
});

test('q repetido en la URL se rechaza', () => {
  rechaza(() => validarBusqueda({ q: ['a', 'b'] }), /una sola vez/);
});

test('q con carácter nulo se rechaza', () => {
  rechaza(() => validarBusqueda({ q: 'a\u0000b' }), /no válidos/);
});

test('unidad es opcional', () => {
  assert.equal(validarBusqueda({ q: 'x' }).unidad, null);
  assert.equal(validarBusqueda({ q: 'x', unidad: '' }).unidad, null);
});

test('unidad debe ser un código numérico', () => {
  assert.equal(validarBusqueda({ q: 'x', unidad: '1107' }).unidad, '1107');
  rechaza(() => validarBusqueda({ q: 'x', unidad: 'Lambaré' }), /código numérico/);
  rechaza(() => validarBusqueda({ q: 'x', unidad: '110' }), /código numérico/);
  rechaza(() => validarBusqueda({ q: 'x', unidad: "1107' OR 1=1" }), /código numérico/);
  rechaza(() => validarBusqueda({ q: 'x', unidad: ['1107', '1114'] }), /una sola vez/);
});

test('id de calle: entero positivo dentro del rango de integer', () => {
  assert.equal(validarId('1'), 1);
  assert.equal(validarId('2147483647'), 2147483647);
  for (const invalido of ['0', '-1', '1.5', 'abc', '1e3', '01', '', '2147483648']) {
    rechaza(() => validarId(invalido), /entero positivo/);
  }
});
