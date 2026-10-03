// Rutas de la API. Son delgadas: reciben la solicitud, llaman al servicio y responden.
// En Express 5 un error (o promesa rechazada) dentro de un handler async llega solo al
// manejador central de errores; no hace falta try/catch en cada ruta.

import { Router } from 'express';
import * as viasService from '../services/viasService.js';
import * as catalogoService from '../services/catalogoService.js';
import { verificarBase } from '../repositories/saludRepository.js';

export const rutas = Router();

// Estado de la API y de la conexión a la base. Responde 503 si la base no está disponible.
rutas.get('/health', async (req, res) => {
  const fecha = new Date().toISOString();
  try {
    await verificarBase();
    res.json({ estado: 'ok', api: 'ok', base_de_datos: 'ok', fecha });
  } catch (error) {
    console.error(`[health] base de datos no disponible: ${error.code ?? error.message}`);
    res.status(503).json({ estado: 'error', api: 'ok', base_de_datos: 'no disponible', fecha });
  }
});

rutas.get('/recurso', async (req, res) => {
  res.json(await catalogoService.obtenerMetadatos());
});

rutas.get('/unidades', async (req, res) => {
  res.json(await catalogoService.listarUnidades());
});

rutas.get('/vias', async (req, res) => {
  res.json(await viasService.buscarVias(req.query));
});

rutas.get('/vias/:id', async (req, res) => {
  res.json(await viasService.obtenerVia(req.params.id));
});
