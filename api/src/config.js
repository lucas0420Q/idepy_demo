// Configuración leída de variables de entorno (api/.env, cargado con node --env-file).
// Si falta algo obligatorio, la API no arranca y dice qué falta.

const OBLIGATORIAS = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];

const faltantes = OBLIGATORIAS.filter((nombre) => !process.env[nombre]);
if (faltantes.length > 0) {
  throw new Error(
    `Faltan variables de entorno: ${faltantes.join(', ')}. ` +
      'Copiá api/.env.example a api/.env y completalo.'
  );
}

export const config = {
  puerto: Number(process.env.PORT ?? 3000),
  // Uno o varios orígenes separados por coma
  origenesCors: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean),
  db: {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  },
};
