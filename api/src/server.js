// Punto de entrada: levanta el servidor HTTP.
//   npm start      (o npm run dev para reiniciar al guardar cambios)

import { crearApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';

const servidor = crearApp().listen(config.puerto, () => {
  console.log(`API IDEPY demo escuchando en http://localhost:${config.puerto}/api`);
  console.log(`CORS permitido para: ${config.origenesCors.join(', ')}`);
});

// Cierre ordenado (Ctrl+C): deja de aceptar solicitudes y cierra las conexiones a la base.
function cerrar(senal) {
  console.log(`\n${senal} recibido, cerrando...`);
  servidor.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
