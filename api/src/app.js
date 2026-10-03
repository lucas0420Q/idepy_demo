// Arma la aplicación Express (sin levantar el servidor, para poder probarla).

import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { rutas } from './routes/index.js';
import { registroSolicitudes } from './middleware/registroSolicitudes.js';
import { manejadorErrores, rutaNoEncontrada } from './middleware/errores.js';

export function crearApp() {
  const app = express();

  app.disable('x-powered-by'); // no anunciar qué tecnología usa el servidor

  app.use(registroSolicitudes);

  // CORS: solo el frontend local puede llamar a la API desde el navegador, y solo con GET.
  app.use(cors({ origin: config.origenesCors, methods: ['GET'] }));

  app.use('/api', rutas);

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}
