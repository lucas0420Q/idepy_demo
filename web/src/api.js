// Cliente de la API. El frontend NUNCA se conecta a la base: todo pasa por acá.

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const ESPERA_MAXIMA_MS = 10_000;

export class ErrorApi extends Error {
  constructor(mensaje, status) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status; // 0 = no hubo respuesta (API caída o sin red)
  }
}

async function pedir(ruta, senal) {
  // Se cancela si el componente lo pide (senal) o si la API tarda demasiado.
  const senales = [AbortSignal.timeout(ESPERA_MAXIMA_MS), senal].filter(Boolean);

  let respuesta;
  try {
    respuesta = await fetch(BASE + ruta, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.any(senales),
    });
  } catch (error) {
    if (senal?.aborted) throw error; // cancelación pedida: no es un error para el usuario
    if (error.name === 'TimeoutError') {
      throw new ErrorApi('La API no respondió a tiempo. Intentá de nuevo.', 0);
    }
    throw new ErrorApi(`No se pudo conectar con la API (${BASE}). Verificá que esté en marcha.`, 0);
  }

  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // respuesta sin JSON: se informa abajo con un mensaje genérico
  }
  if (!respuesta.ok) {
    throw new ErrorApi(cuerpo?.error?.mensaje ?? `La API respondió con un error (${respuesta.status}).`, respuesta.status);
  }
  return cuerpo;
}

export const api = {
  unidades: (senal) => pedir('/api/unidades', senal),
  recurso: (senal) => pedir('/api/recurso', senal),
  buscar: (q, unidad, senal) => {
    const parametros = new URLSearchParams({ q });
    if (unidad) parametros.set('unidad', unidad);
    return pedir(`/api/vias?${parametros}`, senal);
  },
  via: (id, senal) => pedir(`/api/vias/${encodeURIComponent(id)}`, senal),
};
