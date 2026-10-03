// Componente principal: guarda el estado de la consulta (distrito, texto, calle
// seleccionada, pestaña) y lo reparte entre el panel y el mapa.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBusqueda, useCatalogo, useDetalle } from './hooks.js';
import { tituloNombre } from './formato.js';
import Buscador from './components/Buscador.jsx';
import ListaResultados from './components/ListaResultados.jsx';
import FichaDetalle from './components/FichaDetalle.jsx';
import Metadatos from './components/Metadatos.jsx';
import Mapa from './components/Mapa.jsx';

// Estado inicial, igual que el prototipo: "cerro cora" con la de San Lorenzo seleccionada
const INICIAL = { texto: 'cerro cora', unidad: '1114', nombreBusqueda: 'CERRO CORA' };
const MAXIMO_PARA_ENCUADRAR = 80; // con más resultados se encuadra el distrito o la muestra
const SIN_RESULTADOS = []; // misma referencia siempre: evita redibujar la capa en cada render

export default function App() {
  const [pestana, setPestana] = useState('buscar');
  const [unidad, setUnidad] = useState('');
  const [texto, setTexto] = useState(INICIAL.texto);
  const [seleccionId, setSeleccionId] = useState(null);
  const [vista, setVista] = useState(null);

  const catalogo = useCatalogo();
  const busqueda = useBusqueda(texto, unidad);
  const detalle = useDetalle(seleccionId);

  const resultados =
    busqueda.estado === 'vacio' ? SIN_RESULTADOS : (busqueda.datos?.resultados.features ?? SIN_RESULTADOS);
  const featureSeleccionada = resultados.find((f) => f.id === seleccionId) ?? null;
  // Para resaltar: geometría completa del detalle si ya llegó; si no, la de la lista
  const geometriaSeleccion =
    (detalle.estado === 'ok' && detalle.datos.id === seleccionId ? detalle.datos.geometry : null) ??
    featureSeleccionada?.geometry ??
    null;

  const unidades = catalogo.unidades ?? null;
  const unidadFeature = unidad ? unidades?.features.find((f) => f.properties.codigo === unidad) : null;

  // Refs con el valor más reciente, para usarlos dentro de efectos sin re-ejecutarlos
  const actual = useRef({});
  actual.current = { seleccionId, resultados, unidades, unidadFeature };
  const primeraBusqueda = useRef(true);
  const encuadrarDetalle = useRef(false);
  const fichaRef = useRef(null);

  // Encuadre "general": coincidencias, distrito filtrado o toda la muestra
  const vistaGeneral = useCallback((lista) => {
    const { unidades: todas, unidadFeature: filtrada } = actual.current;
    if (lista.length > 0 && lista.length <= MAXIMO_PARA_ENCUADRAR) {
      return { geojson: { type: 'FeatureCollection', features: lista }, padding: 50, maxZoom: 16.5 };
    }
    if (filtrada) return { geojson: filtrada, padding: 20 };
    if (todas) return { geojson: todas, padding: 20 };
    return null;
  }, []);

  // Cuando llegan resultados nuevos
  useEffect(() => {
    if (busqueda.estado === 'vacio') {
      setSeleccionId(null);
      setVista(vistaGeneral([]));
      return;
    }
    const datos = busqueda.datos;
    if (busqueda.estado !== 'ok' || !datos) return;
    const lista = datos.resultados.features;

    if (primeraBusqueda.current) {
      primeraBusqueda.current = false;
      const inicial = lista.find(
        (f) => f.properties.unidad.codigo === INICIAL.unidad && f.properties.nombre_busqueda === INICIAL.nombreBusqueda
      );
      if (inicial) setSeleccionId(inicial.id);
      setVista(vistaGeneral(lista));
      return;
    }

    // Si la calle seleccionada ya no está entre los resultados, se deselecciona
    const seleccionada = lista.find((f) => f.id === actual.current.seleccionId);
    if (!seleccionada) setSeleccionId(null);
    setVista(seleccionada ? { geojson: seleccionada, padding: 60, maxZoom: 17.5 } : vistaGeneral(lista));
  }, [busqueda.estado, busqueda.datos, vistaGeneral]);

  // Si se eligió una calle que no está en la lista (ej. "existe también en..."),
  // se encuadra cuando llega su detalle.
  useEffect(() => {
    if (detalle.estado === 'ok' && encuadrarDetalle.current) {
      encuadrarDetalle.current = false;
      setVista({ geojson: detalle.datos.geometry, padding: 60, maxZoom: 17.5 });
    }
  }, [detalle.estado, detalle.datos]);

  // Si los distritos llegan después que la búsqueda, se encuadra la muestra
  useEffect(() => {
    if (unidades && actual.current.resultados.length === 0) setVista(vistaGeneral([]));
  }, [unidades, vistaGeneral]);

  const seleccionar = useCallback((id, desdeMapa) => {
    setSeleccionId(id);
    if (desdeMapa) setPestana('buscar');
    const enLista = actual.current.resultados.find((f) => f.id === id);
    if (enLista) setVista({ geojson: enLista, padding: 60, maxZoom: 17.5 });
    else encuadrarDetalle.current = true;
    requestAnimationFrame(() => fichaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, []);

  const cerrarFicha = () => {
    setSeleccionId(null);
    setVista(vistaGeneral(resultados));
  };

  const elegirEjemplo = (ejemplo) => {
    setTexto(ejemplo.q);
    setUnidad(ejemplo.unidad);
  };

  return (
    <div className="app">
      <section className="panel" aria-label="Consulta">
        <header className="head">
          <div className="eyebrow">
            IDEPY · Caso de uso: consultar información vial <span className="badge">Demo</span>
          </div>
          <h1>Consulta de vías por distrito</h1>
          <p className="sub">
            Muestra real del INE, Cartografía Digital 2022: Lambaré, Fernando de la Mora y San Lorenzo (Central).
          </p>
        </header>

        <div className="tabs" role="tablist">
          <button
            className="tab"
            role="tab"
            id="tab-buscar"
            aria-selected={pestana === 'buscar'}
            aria-controls="pane-buscar"
            onClick={() => setPestana('buscar')}
          >
            Buscar
          </button>
          <button
            className="tab"
            role="tab"
            id="tab-meta"
            aria-selected={pestana === 'meta'}
            aria-controls="pane-meta"
            onClick={() => setPestana('meta')}
          >
            Metadatos del recurso
          </button>
        </div>

        <div className="scroll">
          <div id="pane-buscar" role="tabpanel" aria-labelledby="tab-buscar" hidden={pestana !== 'buscar'}>
            <div className="section">
              {catalogo.estado === 'error' && (
                <div className="empty error" role="alert">
                  <b>No se pudo cargar la lista de distritos.</b>
                  <span className="note">{catalogo.error}</span>
                  <button type="button" className="linkbtn" onClick={catalogo.reintentar}>
                    Reintentar
                  </button>
                </div>
              )}
              <Buscador
                unidades={unidades}
                errorUnidades={catalogo.estado === 'error'}
                unidad={unidad}
                onUnidad={setUnidad}
                texto={texto}
                onTexto={setTexto}
                onEjemplo={elegirEjemplo}
              />
              <ListaResultados
                busqueda={busqueda}
                texto={texto}
                nombreUnidad={unidadFeature ? tituloNombre(unidadFeature.properties.nombre) : null}
                seleccionId={seleccionId}
                onSeleccionar={seleccionar}
                onVerTodos={() => setUnidad('')}
              />
              <FichaDetalle
                ref={fichaRef}
                detalle={detalle}
                nombreProvisorio={featureSeleccionada?.properties.nombre}
                metadatos={catalogo.metadatos}
                onCerrar={cerrarFicha}
                onSeleccionar={seleccionar}
              />
            </div>
          </div>
          <div id="pane-meta" role="tabpanel" aria-labelledby="tab-meta" hidden={pestana !== 'meta'}>
            <div className="section meta">
              <Metadatos catalogo={catalogo} />
            </div>
          </div>
        </div>

        <footer className="foot">
          Demo del caso de uso. Los datos llegan desde PostgreSQL/PostGIS a través de la API Node.js.
        </footer>
      </section>

      <section className="mapwrap" aria-label="Mapa">
        <Mapa
          unidades={unidades}
          unidadActiva={unidad}
          resultados={resultados}
          geometriaSeleccion={geometriaSeleccion}
          vista={vista}
          onSeleccionar={seleccionar}
        />
      </section>
    </div>
  );
}
