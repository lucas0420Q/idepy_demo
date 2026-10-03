// Pool de conexiones a PostgreSQL. Toda consulta pasa por query(), que usa SIEMPRE
// parámetros ($1, $2...): los valores viajan separados del SQL, así que no hay
// inyección SQL posible.

import pg from 'pg';
import { config } from '../config.js';

// count(*) y sum() de enteros devuelven bigint, que pg entrega como texto para no perder
// precisión. Nuestros valores son chicos (miles), así que se convierten a Number.
pg.types.setTypeParser(pg.types.builtins.INT8, (valor) => Number(valor));

export const pool = new pg.Pool({
  ...config.db,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'idepy-demo-api',
});

// Un error en una conexión inactiva (ej. se reinició Postgres) no debe tumbar la API.
pool.on('error', (error) => {
  console.error(`[db] error en conexión inactiva: ${error.message}`);
});

export async function query(sql, parametros = []) {
  const resultado = await pool.query(sql, parametros);
  return resultado.rows;
}
