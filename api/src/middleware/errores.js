// Manejo centralizado de errores. Al cliente le llega siempre un JSON con la forma
//   { "error": { "codigo": "...", "mensaje": "..." } }
// y NUNCA detalles internos (SQL, stack, nombres de tablas). El detalle va al log.

import { ErrorHttp } from '../errores.js';

// Códigos de error de conexión de Node/pg y de PostgreSQL que significan "la base no
// está disponible" (servidor caído, credenciales rechazadas, base inexistente, etc.)
const ERRORES_CONEXION = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT',
  '08000', '08001', '08003', '08006', // connection_exception
  '28000', '28P01',                   // autenticación rechazada
  '3D000',                            // base inexistente
  '57P01', '57P02', '57P03',          // servidor apagándose / iniciando
]);

function esErrorDeConexion(error) {
  return (
    ERRORES_CONEXION.has(error.code) ||
    /timeout exceeded when trying to connect|Connection terminated/i.test(error.message ?? '')
  );
}

export function rutaNoEncontrada(req, res) {
  res.status(404).json({
    error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: `No existe la ruta ${req.method} ${req.path}.` },
  });
}

// Express reconoce un manejador de errores porque recibe 4 parámetros (aunque no use next).
export function manejadorErrores(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  // Errores esperados (validación, no encontrado): se informan tal cual.
  if (error instanceof ErrorHttp) {
    return res.status(error.status).json({ error: { codigo: error.codigo, mensaje: error.message } });
  }

  // Errores inesperados: detalle completo al log, mensaje genérico al cliente.
  console.error(`[${req.id}] ${req.method} ${req.originalUrl} ->`, error);

  if (esErrorDeConexion(error)) {
    return res.status(503).json({
      error: {
        codigo: 'BASE_NO_DISPONIBLE',
        mensaje: 'La base de datos no está disponible en este momento. Intentá de nuevo en unos minutos.',
        referencia: req.id,
      },
    });
  }

  if (error.code === '57014') { // statement_timeout
    return res.status(503).json({
      error: { codigo: 'CONSULTA_DEMORADA', mensaje: 'La consulta tardó demasiado. Probá con una búsqueda más específica.', referencia: req.id },
    });
  }

  return res.status(500).json({
    error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error interno. Intentá de nuevo más tarde.', referencia: req.id },
  });
}
