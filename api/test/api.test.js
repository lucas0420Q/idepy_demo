// Pruebas de integración: llaman a la API completa (rutas -> servicios -> base real).
// Requieren Postgres.app en marcha, los datos cargados (database/scripts/importar.sh)
// y api/.env configurado.
//   npm test

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test'; // silencia el log de solicitudes

const { crearApp } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');

const app = crearApp();
after(() => pool.end());

// Busca y devuelve el cuerpo de la respuesta (verifica status 200)
async function buscar(parametros) {
  const respuesta = await request(app).get('/api/vias').query(parametros);
  assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
  return respuesta.body;
}
const nombres = (cuerpo) => cuerpo.resultados.features.map((f) => f.properties.nombre);
const distritos = (cuerpo) => cuerpo.resultados.features.map((f) => f.properties.unidad.codigo);

describe('GET /api/health', () => {
  test('responde ok con la base conectada', async () => {
    const r = await request(app).get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.base_de_datos, 'ok');
  });
});

describe('GET /api/recurso', () => {
  test('devuelve metadatos del recurso y reglas aplicadas', async () => {
    const r = await request(app).get('/api/recurso');
    assert.equal(r.status, 200);
    assert.equal(r.body.recurso.organismo, 'Instituto Nacional de Estadística (INE)');
    assert.equal(r.body.recurso.epsg_origen, 4674);
    const codigos = r.body.reglas.map((regla) => regla.codigo);
    assert.ok(codigos.includes('ASIGNACION_POR_CODIGO'));
    assert.ok(codigos.includes('BUSQUEDA_DOBLE_LECTURA_ABREVIATURAS'));
    assert.deepEqual(r.body.resumen, { unidades: 3, segmentos: 10709, calles: 2118, longitud_total_m: r.body.resumen.longitud_total_m });
    assert.deepEqual(r.body.calidad, {
      segmentos_con_caracter_danado: 75,
      nombres_con_caracter_danado: 11,
      segmentos_fuera_de_su_unidad: 74,
      calles_con_variantes: 21,
    });
  });
});

describe('GET /api/unidades', () => {
  test('devuelve los 3 distritos como GeoJSON en EPSG:4326', async () => {
    const r = await request(app).get('/api/unidades');
    assert.equal(r.status, 200);
    assert.equal(r.body.type, 'FeatureCollection');
    assert.deepEqual(r.body.features.map((f) => f.properties.codigo).sort(), ['1103', '1107', '1114']);
    const [lon, lat] = r.body.features[0].geometry.coordinates[0][0][0];
    assert.ok(lon > -58 && lon < -57 && lat > -26 && lat < -25, 'coordenadas lon/lat de Gran Asunción');
    assert.equal(r.body.features[0].properties.etiqueta.length, 2);
  });
});

describe('GET /api/red', () => {
  test('devuelve todas las calles (2.118) como GeoJSON, comprimido y con caché', async () => {
    const r = await request(app).get('/api/red').set('Accept-Encoding', 'gzip');
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-encoding'], 'gzip');
    assert.match(r.headers['cache-control'], /max-age=300/);
    assert.equal(r.body.type, 'FeatureCollection');
    assert.equal(r.body.features.length, 2118);
    const f = r.body.features[0];
    assert.equal(f.geometry.type, 'MultiLineString');
    assert.deepEqual(Object.keys(f.properties).sort(), ['id', 'nombre', 'unidad']);
  });
});

describe('GET /api/vias (búsqueda)', () => {
  test('"cerro cora" -> 3 calles, una por distrito', async () => {
    const cuerpo = await buscar({ q: 'cerro cora' });
    assert.equal(cuerpo.total, 3);
    assert.deepEqual(nombres(cuerpo), ['CERRO CORA', 'CERRO CORA', 'CERRO CORA']);
    assert.equal(new Set(distritos(cuerpo)).size, 3);
    assert.equal(cuerpo.consulta.normalizada, 'CERRO CORA');
  });

  test('"mariscal lopez" -> 3 calles', async () => {
    const cuerpo = await buscar({ q: 'mariscal lopez' });
    assert.equal(cuerpo.total, 3);
    assert.equal(new Set(distritos(cuerpo)).size, 3);
  });

  test('"muñoz" -> encuentra "MU?OZ" (el nombre original no se corrige)', async () => {
    const cuerpo = await buscar({ q: 'muñoz' });
    assert.deepEqual(nombres(cuerpo), ['MU?OZ']);
  });

  test('"1" -> solo nombres con el token exacto 1', async () => {
    const cuerpo = await buscar({ q: '1' });
    assert.deepEqual([...nombres(cuerpo)].sort(), ['1', 'CALLE 1', 'D027 - EX RUTA 1', 'PASILLO 1']);
    assert.equal(nombres(cuerpo)[0], '1', 'la coincidencia exacta va primero');
  });

  test('las abreviaturas de la consulta se expanden ("av mcal lopez")', async () => {
    const cuerpo = await buscar({ q: 'av mcal lopez' });
    assert.equal(cuerpo.consulta.normalizada, 'AVENIDA MARISCAL LOPEZ');
    assert.equal(cuerpo.total, 2);
  });

  test('doble lectura de abreviaturas: "cap" encuentra CAPITAN... y también CAPILLA CUE, al final', async () => {
    const cuerpo = await buscar({ q: 'cap' });
    const lista = nombres(cuerpo);
    assert.ok(lista.includes('CAPILLA CUE'));
    const ultimaCapitan = lista.findLastIndex((n) => n.startsWith('CAPITAN'));
    assert.ok(ultimaCapitan < lista.indexOf('CAPILLA CUE'), 'la lectura expandida va antes que la literal');
  });

  test('variantes de escritura agrupadas en una sola calle', async () => {
    const cuerpo = await buscar({ q: 'cacique lambare', unidad: '1107' });
    const calle = cuerpo.resultados.features.find((f) => f.properties.nombre_busqueda === 'AVENIDA CACIQUE LAMBARE');
    assert.ok(calle);
    assert.equal(calle.properties.variantes.length, 3);
  });

  test('filtro por unidad', async () => {
    const cuerpo = await buscar({ q: 'cerro cora', unidad: '1107' });
    assert.equal(cuerpo.total, 1);
    assert.deepEqual(distritos(cuerpo), ['1107']);
    assert.equal(cuerpo.otras_unidades.total, 2);
  });

  test('sin resultados en la unidad: informa coincidencias en otras unidades', async () => {
    const cuerpo = await buscar({ q: 'muñoz', unidad: '1107' });
    assert.equal(cuerpo.total, 0);
    assert.deepEqual(cuerpo.otras_unidades, {
      total: 1,
      por_unidad: [{ codigo: '1103', nombre: 'FERNANDO DE LA MORA', cantidad: 1 }],
    });
  });

  test('sin filtro de unidad no se calcula otras_unidades', async () => {
    const cuerpo = await buscar({ q: 'cerro cora' });
    assert.equal(cuerpo.otras_unidades, null);
  });

  test('límite de 150 resultados con indicación de que hay más', async () => {
    const cuerpo = await buscar({ q: 'a' });
    assert.equal(cuerpo.resultados.features.length, 150);
    assert.equal(cuerpo.limite, 150);
    assert.ok(cuerpo.total > 150);
    assert.equal(cuerpo.hay_mas, true);
  });

  test('cada resultado trae geometría GeoJSON en EPSG:4326', async () => {
    const cuerpo = await buscar({ q: 'cerro cora' });
    const geometria = cuerpo.resultados.features[0].geometry;
    assert.equal(geometria.type, 'MultiLineString');
    const [lon, lat] = geometria.coordinates[0][0];
    assert.ok(lon > -58 && lon < -57 && lat > -26 && lat < -25);
  });

  test('un texto con apóstrofes o SQL se trata como texto (consultas parametrizadas)', async () => {
    const cuerpo = await buscar({ q: "'; DROP TABLE idepy.via; --" });
    assert.ok(Array.isArray(cuerpo.resultados.features));
  });
});

describe('GET /api/vias (validación)', () => {
  const casos = [
    [{}, /obligatorio/],
    [{ q: '' }, /vacío/],
    [{ q: 'a'.repeat(101) }, /100 caracteres/],
    [{ q: '...' }, /al menos una letra o un número/],
    [{ q: 'x', unidad: 'abc' }, /código numérico/],
    [{ q: 'x', unidad: '9999' }, /No existe la unidad/],
  ];
  for (const [parametros, mensaje] of casos) {
    test(`400 para ${JSON.stringify(parametros).slice(0, 60)}`, async () => {
      const r = await request(app).get('/api/vias').query(parametros);
      assert.equal(r.status, 400);
      assert.equal(r.body.error.codigo, 'PARAMETRO_INVALIDO');
      assert.match(r.body.error.mensaje, mensaje);
    });
  }

  test('400 si q se repite', async () => {
    const r = await request(app).get('/api/vias?q=a&q=b');
    assert.equal(r.status, 400);
  });
});

describe('GET /api/vias/:id (detalle)', () => {
  test('devuelve detalle completo con desgloses que suman la longitud total', async () => {
    const busqueda = await buscar({ q: 'cerro cora', unidad: '1114' });
    const id = busqueda.resultados.features[0].id;

    const r = await request(app).get(`/api/vias/${id}`);
    assert.equal(r.status, 200);
    const p = r.body.properties;
    assert.equal(r.body.type, 'Feature');
    assert.equal(r.body.geometry.type, 'MultiLineString');
    assert.equal(p.nombre, 'CERRO CORA');
    assert.equal(p.unidad.codigo, '1114');
    assert.equal(p.segmentos.length, p.cantidad_segmentos);
    const suma = (lista) => lista.reduce((total, item) => total + item.longitud_m, 0);
    assert.equal(suma(p.por_tipo_via), p.longitud_total_m);
    assert.equal(suma(p.por_superficie), p.longitud_total_m);
    assert.equal(suma(p.segmentos), p.longitud_total_m);
    assert.equal(p.fuentes[0].producto, 'Cartografía Digital 2022');
    assert.deepEqual(p.misma_calle_en_otras_unidades.map((o) => o.codigo).sort(), ['1103', '1107']);
  });

  test('404 si la calle no existe', async () => {
    const r = await request(app).get('/api/vias/999999');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.codigo, 'NO_ENCONTRADO');
  });

  test('400 si el id no es un entero positivo', async () => {
    const r = await request(app).get('/api/vias/abc');
    assert.equal(r.status, 400);
  });
});

describe('Requisitos generales', () => {
  test('ruta inexistente -> 404 en JSON', async () => {
    const r = await request(app).get('/api/no-existe');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.codigo, 'RUTA_NO_ENCONTRADA');
  });

  test('CORS: se permite el frontend local y no otros orígenes', async () => {
    const permitido = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    assert.equal(permitido.headers['access-control-allow-origin'], 'http://localhost:5173');
    const ajeno = await request(app).get('/api/health').set('Origin', 'http://otro-sitio.example');
    assert.equal(ajeno.headers['access-control-allow-origin'], undefined);
  });

  test('no se anuncia la tecnología del servidor y cada respuesta lleva un id', async () => {
    const r = await request(app).get('/api/health');
    assert.equal(r.headers['x-powered-by'], undefined);
    assert.match(r.headers['x-request-id'], /^[0-9a-f]{8}$/);
  });
});
