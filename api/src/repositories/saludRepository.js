import { query } from '../db/pool.js';

// Consulta mínima para comprobar que la base responde y que la vista tiene datos.
export async function verificarBase() {
  const [fila] = await query('SELECT count(*) AS calles FROM idepy.via');
  return fila;
}
