import {
  formatoEntero,
  formatoLongitud,
  formatoPorcentaje,
  plural,
  tieneCaracterDanado,
  tituloNombre,
} from '../formato.js';

function Barras({ items }) {
  return (
    <div className="bars">
      {items.map((item) => (
        <div className="bar" key={item.valor}>
          <span>{item.valor}</span>
          <span className="track">
            <span className="fill" style={{ display: 'block', width: `${item.porcentaje}%` }} />
          </span>
          <span className="v">{formatoPorcentaje(item.porcentaje)}</span>
        </div>
      ))}
    </div>
  );
}

// En React 19 "ref" llega como una prop común (para hacer scroll hasta la ficha).
export default function FichaDetalle({ detalle, nombreProvisorio, metadatos, onCerrar, onSeleccionar, ref }) {
  if (detalle.estado === 'vacio') return null;

  const encabezado = (titulo, ubicacion) => (
    <div className="top">
      <button type="button" className="close" onClick={onCerrar}>
        ← Volver a la lista
      </button>
      <h2>{titulo}</h2>
      {ubicacion}
    </div>
  );

  if (detalle.estado === 'cargando') {
    return (
      <article className="detail" ref={ref} aria-busy="true">
        {encabezado(nombreProvisorio ?? 'Calle', <div className="loc">Cargando ficha…</div>)}
      </article>
    );
  }

  if (detalle.estado === 'error') {
    return (
      <article className="detail" ref={ref} role="alert">
        {encabezado(nombreProvisorio ?? 'Calle', <div className="loc">No se pudo cargar la ficha.</div>)}
        <div className="block">
          <p className="note warn">{detalle.error}</p>
          <button type="button" className="linkbtn" onClick={detalle.reintentar}>
            Reintentar
          </button>
        </div>
      </article>
    );
  }

  const p = detalle.datos.properties;
  const otrasVariantes = p.variantes.slice(1);
  const recurso = metadatos?.recurso;
  const hayObservaciones =
    tieneCaracterDanado(p.nombre) || otrasVariantes.length > 0 || p.misma_calle_en_otras_unidades.length > 0;

  return (
    <article className="detail" ref={ref} aria-live="polite">
      {encabezado(
        p.nombre,
        <div className="loc">
          {tituloNombre(p.unidad.nombre)} · código INE <span className="mono">{p.unidad.codigo}</span>
        </div>
      )}

      <dl className="kv">
        <div>
          <dt>Longitud</dt>
          <dd>{formatoLongitud(p.longitud_total_m)}</dd>
        </div>
        <div>
          <dt>Segmentos</dt>
          <dd>{formatoEntero(p.cantidad_segmentos)}</dd>
        </div>
        <div>
          <dt>Distrito</dt>
          <dd>{p.unidad.codigo}</dd>
        </div>
      </dl>

      <div className="block">
        <span className="lbl">Tipo de vía (por longitud)</span>
        <Barras items={p.por_tipo_via} />
      </div>
      <div className="block">
        <span className="lbl">Superficie (por longitud)</span>
        <Barras items={p.por_superficie} />
      </div>

      {hayObservaciones && (
        <div className="block">
          <span className="lbl">Observaciones</span>
          {tieneCaracterDanado(p.nombre) && (
            <p className="note warn">
              El nombre tiene un carácter dañado en la fuente («?», probablemente Ñ). Se muestra tal como lo publica el
              INE.
            </p>
          )}
          {otrasVariantes.length > 0 && (
            <p className="note">
              También registrada como: {otrasVariantes.map((v) => `«${v}»`).join(', ')}. Se agrupan porque coinciden
              al normalizar.
            </p>
          )}
          {p.misma_calle_en_otras_unidades.length > 0 && (
            <p className="note">
              Una calle con el mismo nombre existe en:{' '}
              {p.misma_calle_en_otras_unidades.map((otra, i) => (
                <span key={otra.id}>
                  {i > 0 && ', '}
                  <button type="button" className="linkbtn inline" onClick={() => onSeleccionar(otra.id, false)}>
                    {tituloNombre(otra.nombre)}
                  </button>
                </span>
              ))}
              .
            </p>
          )}
        </div>
      )}

      <div className="block">
        <details>
          <summary className="lbl">
            {p.cantidad_segmentos} {plural(p.cantidad_segmentos, 'segmento', 'segmentos')} de origen
          </summary>
          <table className="segs">
            <thead>
              <tr>
                <th>fid</th>
                <th>Tipo</th>
                <th>Superficie</th>
                <th className="n">Long.</th>
              </tr>
            </thead>
            <tbody>
              {p.segmentos.map((s) => (
                <tr key={s.fid_origen} title={s.nombre_original}>
                  <td className="mono">{s.fid_origen}</td>
                  <td>{s.tipo_via}</td>
                  <td>{s.superficie}</td>
                  <td className="n mono">{formatoEntero(s.longitud_m)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="block">
        <span className="lbl">Fuente</span>
        {p.fuentes.map((fuente) => (
          <dl className="src" key={fuente.nombre}>
            <dt>Organismo</dt>
            <dd>{fuente.organismo}</dd>
            <dt>Producto</dt>
            <dd>{fuente.producto}</dd>
            <dt>Referencia</dt>
            <dd>Período {fuente.periodo_referencia}. El dato no tiene fecha por calle.</dd>
            {recurso && (
              <>
                <dt>SRC origen</dt>
                <dd>
                  <span className="mono">EPSG:{recurso.epsg_origen}</span> SIRGAS 2000
                </dd>
              </>
            )}
          </dl>
        ))}
      </div>
    </article>
  );
}
