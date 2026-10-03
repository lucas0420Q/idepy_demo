// Hooks que piden datos a la API y exponen su estado: cargando / ok / error.
// Cada pedido se cancela (AbortController) si el componente pide otro antes de que
// llegue la respuesta: así una respuesta vieja nunca pisa a una nueva.

import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const ESPERA_TECLEO_MS = 220; // se busca cuando el usuario deja de escribir

const esCancelacion = (error) => error.name === 'AbortError';

// Distritos (GeoJSON) y metadatos del recurso: se piden una vez al iniciar.
export function useCatalogo() {
  const [estado, setEstado] = useState({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    setEstado({ estado: 'cargando' });
    Promise.all([api.unidades(control.signal), api.recurso(control.signal)])
      .then(([unidades, metadatos]) => setEstado({ estado: 'ok', unidades, metadatos }))
      .catch((error) => {
        if (!esCancelacion(error)) setEstado({ estado: 'error', error: error.message });
      });
    return () => control.abort();
  }, [intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { ...estado, reintentar };
}

// Búsqueda de calles. Mientras carga conserva los resultados anteriores (la lista no
// "parpadea"). Estados: vacio | cargando | ok | invalida (400) | error.
export function useBusqueda(texto, unidad) {
  const [estado, setEstado] = useState({ estado: 'vacio' });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const q = texto.trim();
    if (!q) {
      setEstado({ estado: 'vacio' });
      return undefined;
    }
    const control = new AbortController();
    setEstado((anterior) => ({ ...anterior, estado: 'cargando', error: undefined }));

    const temporizador = setTimeout(() => {
      api
        .buscar(q, unidad, control.signal)
        .then((datos) => setEstado({ estado: 'ok', datos }))
        .catch((error) => {
          if (esCancelacion(error)) return;
          // 400 = la búsqueda no es válida (ej. solo signos): se muestra como aviso, no como falla
          setEstado({ estado: error.status === 400 ? 'invalida' : 'error', error: error.message });
        });
    }, ESPERA_TECLEO_MS);

    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [texto, unidad, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { ...estado, reintentar };
}

// Ficha de detalle de una calle.
export function useDetalle(id) {
  const [estado, setEstado] = useState({ estado: 'vacio' });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (id === null) {
      setEstado({ estado: 'vacio' });
      return undefined;
    }
    const control = new AbortController();
    setEstado({ estado: 'cargando' });
    api
      .via(id, control.signal)
      .then((datos) => setEstado({ estado: 'ok', datos }))
      .catch((error) => {
        if (!esCancelacion(error)) setEstado({ estado: 'error', error: error.message });
      });
    return () => control.abort();
  }, [id, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { ...estado, reintentar };
}
