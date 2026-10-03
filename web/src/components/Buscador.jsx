import { tituloNombre } from '../formato.js';

const EJEMPLOS = [
  { etiqueta: 'Cerro Corá', q: 'cerro cora', unidad: '' },
  { etiqueta: 'Mariscal López', q: 'mariscal lopez', unidad: '' },
  { etiqueta: 'Muñoz', q: 'muñoz', unidad: '' },
  { etiqueta: '1 (numérica)', q: '1', unidad: '' },
  { etiqueta: 'España en Lambaré', q: 'españa', unidad: '1107' },
  { etiqueta: 'Cap (abreviatura)', q: 'cap', unidad: '' },
];

export default function Buscador({ unidades, errorUnidades, unidad, onUnidad, texto, onTexto, onEjemplo }) {
  const opciones = unidades
    ? [...unidades.features].sort((a, b) => a.properties.nombre.localeCompare(b.properties.nombre, 'es'))
    : [];

  return (
    <form className="form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
      <div className="field">
        <label htmlFor="dist">Unidad administrativa (distrito)</label>
        <select id="dist" value={unidad} onChange={(e) => onUnidad(e.target.value)} disabled={!unidades}>
          <option value="">
            {unidades ? 'Todos los distritos de la muestra' : errorUnidades ? 'Distritos no disponibles' : 'Cargando distritos…'}
          </option>
          {opciones.map((f) => (
            <option key={f.properties.codigo} value={f.properties.codigo}>
              {tituloNombre(f.properties.nombre)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="q">Nombre de la calle</label>
        <input
          type="search"
          id="q"
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          placeholder="Ej.: Cerro Corá, Mcal. López, 14 de Mayo"
          enterKeyHint="search"
          maxLength={100}
        />
      </div>
      <div className="chips">
        <span>Probar:</span>
        {EJEMPLOS.map((ejemplo) => (
          <button key={ejemplo.etiqueta} type="button" className="chip" onClick={() => onEjemplo(ejemplo)}>
            {ejemplo.etiqueta}
          </button>
        ))}
      </div>
    </form>
  );
}
