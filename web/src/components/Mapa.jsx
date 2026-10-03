// Mapa Leaflet (react-leaflet) con mapa base OpenStreetMap.
// Capas, de abajo hacia arriba:
//   distritos (polígonos + etiqueta) -> coincidencias de la búsqueda -> calle seleccionada
// Cada capa va en su propio "pane" para que el orden no dependa de qué dato llegó primero.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, ScaleControl, TileLayer, useMap } from 'react-leaflet';
import { escaparHtml, tituloNombre } from '../formato.js';

const CENTRO_INICIAL = [-25.345, -57.555]; // Gran Asunción, hasta que cargan los distritos

// zIndex de cada pane y si recibe clics. Cada pane tiene su propio canvas, que cubre todo
// el mapa: si un pane sin capas interactivas recibiera eventos, taparía los clics y
// tooltips de las coincidencias que están debajo.
const PANES = {
  distritos: { zIndex: 350, interactivo: false },
  resultados: { zIndex: 410, interactivo: true },
  seleccion: { zIndex: 420, interactivo: false },
};

// Colores tomados de las variables CSS, así el mapa sigue el modo claro/oscuro.
function leerColores() {
  const css = getComputedStyle(document.documentElement);
  const valor = (nombre) => css.getPropertyValue(nombre).trim();
  return {
    acento: valor('--accent'),
    suave: valor('--accent-soft'),
    tenue: valor('--muted'),
    resaltado: valor('--hl'),
    contorno: valor('--hl-case'),
  };
}

function useColores() {
  const [colores, setColores] = useState(leerColores);
  useEffect(() => {
    const consulta = matchMedia('(prefers-color-scheme: dark)');
    const actualizar = () => setColores(leerColores());
    consulta.addEventListener('change', actualizar);
    return () => consulta.removeEventListener('change', actualizar);
  }, []);
  return colores;
}

// Crea los panes y un renderer canvas por pane (canvas dibuja miles de líneas rápido).
function usePanes() {
  const map = useMap();
  const [renderers] = useState(() => {
    const resultado = {};
    for (const [nombre, { zIndex, interactivo }] of Object.entries(PANES)) {
      if (!map.getPane(nombre)) {
        const pane = map.createPane(nombre);
        pane.style.zIndex = zIndex;
        if (!interactivo) pane.style.pointerEvents = 'none';
      }
      resultado[nombre] = L.canvas({ pane: nombre, padding: 0.4, tolerance: 6 });
    }
    return resultado;
  });
  return renderers;
}

function Atribucion() {
  const map = useMap();
  useEffect(() => {
    const texto = 'Datos: INE, Cartografía Digital 2022';
    map.attributionControl.setPrefix(false).addAttribution(texto);
    return () => map.attributionControl.removeAttribution(texto);
  }, [map]);
  return null;
}

function CapaDistritos({ unidades, unidadActiva, colores, renderer }) {
  const map = useMap();
  const capas = useRef(new Map());

  useEffect(() => {
    if (!unidades) return undefined;
    const grupo = L.layerGroup().addTo(map);
    capas.current = new Map();
    for (const f of unidades.features) {
      const capa = L.geoJSON(f, { renderer, interactive: false }).addTo(grupo);
      capas.current.set(f.properties.codigo, capa);
      const [lon, lat] = f.properties.etiqueta;
      L.marker([lat, lon], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'dlabel',
          html: escaparHtml(tituloNombre(f.properties.nombre)),
          iconSize: [220, 18],
          iconAnchor: [110, 9],
        }),
      }).addTo(grupo);
    }
    return () => grupo.remove();
  }, [map, unidades, renderer]);

  // Resalta el distrito filtrado y atenúa los demás
  useEffect(() => {
    for (const [codigo, capa] of capas.current) {
      const activa = !unidadActiva || unidadActiva === codigo;
      capa.setStyle({
        color: colores.tenue,
        weight: activa && unidadActiva ? 2.2 : 1.4,
        opacity: activa ? 0.9 : 0.35,
        fillColor: colores.suave,
        fillOpacity: activa ? (unidadActiva ? 0.3 : 0.15) : 0.04,
      });
    }
  }, [unidades, unidadActiva, colores]);

  return null;
}

function CapaResultados({ features, colores, renderer, onSeleccionar }) {
  const map = useMap();
  // El clic usa siempre la versión más reciente de onSeleccionar sin recrear la capa
  const alSeleccionar = useRef(onSeleccionar);
  useLayoutEffect(() => {
    alSeleccionar.current = onSeleccionar;
  });

  useEffect(() => {
    const grupo = L.featureGroup().addTo(map);
    for (const f of features) {
      const capa = L.geoJSON(f, {
        renderer,
        style: { color: colores.acento, weight: 3.4, opacity: 1 },
      });
      capa.bindTooltip(
        `${escaparHtml(f.properties.nombre)}<span class="t2">${escaparHtml(tituloNombre(f.properties.unidad.nombre))}</span>`,
        { sticky: true, direction: 'top', offset: [0, -6] }
      );
      capa.on('click', () => alSeleccionar.current(f.id, true));
      capa.addTo(grupo);
    }
    return () => grupo.remove();
  }, [map, features, colores, renderer]);

  return null;
}

// Calle seleccionada: línea gruesa con borde oscuro ("casing") para que se distinga.
function CapaSeleccion({ geometria, colores, renderer }) {
  const map = useMap();
  useEffect(() => {
    if (!geometria) return undefined;
    const grupo = L.layerGroup([
      L.geoJSON(geometria, { renderer, interactive: false, style: { color: colores.contorno, weight: 8.5, opacity: 0.85 } }),
      L.geoJSON(geometria, { renderer, interactive: false, style: { color: colores.resaltado, weight: 4.6, opacity: 1 } }),
    ]).addTo(map);
    return () => grupo.remove();
  }, [map, geometria, colores, renderer]);
  return null;
}

// Mueve la vista cada vez que cambia "vista" ({ geojson, padding, maxZoom }).
function ControlVista({ vista }) {
  const map = useMap();
  useEffect(() => {
    if (!vista?.geojson) return;
    const limites = L.geoJSON(vista.geojson).getBounds();
    if (!limites.isValid()) return;
    const animar = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.flyToBounds(limites, {
      padding: [vista.padding, vista.padding],
      maxZoom: vista.maxZoom ?? 18,
      duration: 0.6,
      animate: animar,
    });
  }, [map, vista]);
  return null;
}

function Capas({ unidades, unidadActiva, resultados, geometriaSeleccion, vista, onSeleccionar }) {
  const colores = useColores();
  const renderers = usePanes();
  return (
    <>
      <CapaDistritos unidades={unidades} unidadActiva={unidadActiva} colores={colores} renderer={renderers.distritos} />
      <CapaResultados features={resultados} colores={colores} renderer={renderers.resultados} onSeleccionar={onSeleccionar} />
      <CapaSeleccion geometria={geometriaSeleccion} colores={colores} renderer={renderers.seleccion} />
      <ControlVista vista={vista} />
    </>
  );
}

export default function Mapa(props) {
  return (
    <>
      <MapContainer className="map" center={CENTRO_INICIAL} zoom={12} zoomSnap={0.25} minZoom={11} maxZoom={19}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <Atribucion />
        <ScaleControl imperial={false} position="bottomright" />
        <Capas {...props} />
      </MapContainer>
      <div className="legend" aria-hidden="true">
        <div><span className="sw s" />Calle seleccionada</div>
        <div><span className="sw m" />Otras coincidencias</div>
        <div><span className="sw d" />Límite de distrito</div>
      </div>
    </>
  );
}
