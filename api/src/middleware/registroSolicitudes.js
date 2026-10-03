// Log de cada solicitud: fecha, id, método, ruta, status y duración.
// El id también se devuelve en el header X-Request-Id y en los errores 5xx, para poder
// encontrar en el log el detalle de un error que el cliente reporta.

import { randomUUID } from 'node:crypto';

export function registroSolicitudes(req, res, next) {
  const inicio = process.hrtime.bigint();
  req.id = randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);

  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return; // sin ruido durante las pruebas
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    console.log(
      `${new Date().toISOString()} [${req.id}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)} ms`
    );
  });

  next();
}
