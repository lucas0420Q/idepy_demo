// Formato de números y textos para mostrar (no es normalización de búsqueda: esa la
// hace la base de datos).

const entero = new Intl.NumberFormat('es-PY');
const unDecimal = new Intl.NumberFormat('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dosDecimales = new Intl.NumberFormat('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatoEntero = (n) => entero.format(n);
export const formatoPorcentaje = (p) => `${unDecimal.format(p)} %`;
export const formatoLongitud = (m) =>
  m >= 1000 ? `${dosDecimales.format(m / 1000)} km` : `${entero.format(Math.round(m))} m`;

export const plural = (n, singular, pluralTexto) => (n === 1 ? singular : pluralTexto);

// "FERNANDO DE LA MORA" -> "Fernando de la Mora"
const MINUSCULAS = new Set(['de', 'la', 'del', 'y', 'el', 'los', 'las']);
export function tituloNombre(texto) {
  return texto
    .toLowerCase()
    .replace(/(^|[\s(])(\p{L}+)/gu, (_, antes, palabra) =>
      antes && MINUSCULAS.has(palabra) ? antes + palabra : antes + palabra[0].toUpperCase() + palabra.slice(1)
    );
}

// Para HTML que se arma como texto (tooltips y etiquetas de Leaflet). En JSX no hace
// falta: React ya escapa.
export const escaparHtml = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// El INE publica "?" en lugar de Ñ en algunos nombres (ej. "MU?OZ")
export const tieneCaracterDanado = (nombre) => nombre.includes('?');
