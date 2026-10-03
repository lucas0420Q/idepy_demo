import {
  formatoEntero,
  formatoLongitud,
  plural,
  tieneCaracterDanado,
  tituloNombre,
} from '../formato.js';

export default function ListaResultados({ busqueda, texto, nombreUnidad, seleccionId, onSeleccionar, onVerTodos }) {
  const { estado, datos, error } = busqueda;

  if (estado === 'vacio') {
    return (
      <div className="empty">
        <b>Escribí el nombre de una calle.</b>
        <span className="note">
          La búsqueda ignora mayúsculas, tildes y abreviaturas (Mcal., Avda., Cnel.). Una calle que existe en varios
          distritos aparece una vez por distrito.
        </span>
      </div>
    );
  }

  if (estado === 'invalida') {
    return (
      <div className="empty">
        <b>{error}</b>
        <span className="note">Probá con una parte del nombre de la calle.</span>
      </div>
    );
  }

  if (estado === 'error') {
    return (
      <div className="empty error" role="alert">
        <b>No se pudo realizar la búsqueda.</b>
        <span className="note">{error}</span>
        <button type="button" className="linkbtn" onClick={busqueda.reintentar}>
          Reintentar
        </button>
      </div>
    );
  }

  // cargando sin resultados previos
  if (!datos) {
    return (
      <p className="note cargando" role="status">
        Buscando…
      </p>
    );
  }

  const cargando = estado === 'cargando';
  const features = datos.resultados.features;

  if (features.length === 0) {
    const otras = datos.otras_unidades;
    return (
      <div className="empty" aria-busy={cargando}>
        <b>
          No se encontraron calles con «{texto.trim()}»{nombreUnidad ? ` en ${nombreUnidad}` : ' en la muestra'}.
        </b>
        {otras?.total > 0 ? (
          <>
            <span className="note">
              Hay {otras.total} {plural(otras.total, 'coincidencia', 'coincidencias')} en otros distritos de la muestra
              ({otras.por_unidad.map((u) => `${tituloNombre(u.nombre)}: ${u.cantidad}`).join(', ')}).
            </span>
            <button type="button" className="linkbtn" onClick={onVerTodos}>
              Ver en todos los distritos
            </button>
          </>
        ) : (
          <span className="note">
            Revisá la escritura o probá con una parte del nombre. Solo se incluyen calles con nombre registrado por el
            INE.
          </span>
        )}
      </div>
    );
  }

  const cantidadDistritos = new Set(features.map((f) => f.properties.unidad.codigo)).size;
  const esNumerica = /^[0-9]+$/.test(datos.consulta.normalizada);

  return (
    <div className={cargando ? 'resultados cargando' : 'resultados'} aria-busy={cargando}>
      <div className="summary" role="status">
        <span>
          <b>{formatoEntero(datos.total)}</b> {plural(datos.total, 'calle', 'calles')} en <b>{cantidadDistritos}</b>{' '}
          {plural(cantidadDistritos, 'distrito', 'distritos')}
        </span>
        <span>{cargando ? 'Buscando…' : esNumerica ? 'Número: coincidencia exacta' : 'Ordenado por relevancia'}</span>
      </div>
      <p className="norm">
        Búsqueda normalizada: <code>{datos.consulta.normalizada}</code>
      </p>
      <ul className="results">
        {features.map((f) => {
          const p = f.properties;
          return (
            <li key={f.id}>
              <button
                type="button"
                className="res"
                aria-current={seleccionId === f.id}
                onClick={() => onSeleccionar(f.id, false)}
              >
                <span className="nm">
                  {p.nombre}
                  {tieneCaracterDanado(p.nombre) && (
                    <span className="flag" title="Carácter dañado en la fuente">
                      ?
                    </span>
                  )}
                </span>
                <span className="ds">
                  <span className="dchip">{p.unidad.codigo}</span>
                  {tituloNombre(p.unidad.nombre)} · {p.cantidad_segmentos}{' '}
                  {plural(p.cantidad_segmentos, 'segmento', 'segmentos')}
                </span>
                <span className="ln">{formatoLongitud(p.longitud_total_m)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {datos.hay_mas && (
        <div className="more">
          Se muestran {features.length} de {formatoEntero(datos.total)}. Escribí más letras para acotar.
        </div>
      )}
    </div>
  );
}
