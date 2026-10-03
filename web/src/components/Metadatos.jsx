import { formatoEntero, formatoLongitud, tituloNombre } from '../formato.js';

// Pestaña "Metadatos del recurso". Todo sale de la API (/api/recurso y /api/unidades):
// recurso, reglas aplicadas, abreviaturas, nombres excluidos e indicadores de calidad.
export default function Metadatos({ catalogo }) {
  if (catalogo.estado === 'cargando') {
    return <p className="note cargando" role="status">Cargando metadatos…</p>;
  }
  if (catalogo.estado === 'error') {
    return (
      <div className="empty error" role="alert">
        <b>No se pudieron cargar los metadatos.</b>
        <span className="note">{catalogo.error}</span>
        <button type="button" className="linkbtn" onClick={catalogo.reintentar}>
          Reintentar
        </button>
      </div>
    );
  }

  const { recurso, reglas, abreviaturas, nombres_excluidos: excluidos, resumen, calidad, sistema_referencia: src } =
    catalogo.metadatos;
  const distritos = [...catalogo.unidades.features]
    .map((f) => f.properties)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <>
      <h3>Recurso</h3>
      <table>
        <tbody>
          <tr><th>Nombre</th><td>{recurso.nombre}</td></tr>
          <tr><th>Organismo productor</th><td>{recurso.organismo}</td></tr>
          <tr><th>Producto</th><td>{recurso.producto}</td></tr>
          <tr><th>Período de referencia</th><td>{recurso.periodo_referencia}</td></tr>
          <tr><th>Formato original</th><td>{recurso.formato_origen}</td></tr>
          <tr>
            <th>SRC</th>
            <td>
              Almacenado en <code>{src.almacenamiento}</code>; la API lo entrega en <code>{src.salida_api}</code>.
            </td>
          </tr>
          <tr><th>Unidad de registro</th><td>Segmento de vía, no calle completa</td></tr>
          <tr><th>Observaciones</th><td>{recurso.observaciones}</td></tr>
        </tbody>
      </table>

      <h3>Contenido de la muestra</h3>
      <table>
        <thead>
          <tr>
            <th>Distrito</th>
            <td className="n lbl">Segmentos</td>
            <td className="n lbl">Calles</td>
            <td className="n lbl">Longitud</td>
          </tr>
        </thead>
        <tbody>
          {distritos.map((d) => (
            <tr key={d.codigo}>
              <th>
                {tituloNombre(d.nombre)} <span className="mono">{d.codigo}</span>
              </th>
              <td className="n">{formatoEntero(d.cantidad_segmentos)}</td>
              <td className="n">{formatoEntero(d.cantidad_calles)}</td>
              <td className="n">{formatoLongitud(d.longitud_total_m)}</td>
            </tr>
          ))}
          <tr>
            <th><b>Total</b></th>
            <td className="n"><b>{formatoEntero(resumen.segmentos)}</b></td>
            <td className="n"><b>{formatoEntero(resumen.calles)}</b></td>
            <td className="n"><b>{formatoLongitud(resumen.longitud_total_m)}</b></td>
          </tr>
        </tbody>
      </table>
      <p className="note">
        Una calle es el conjunto de segmentos con el mismo nombre normalizado dentro de un distrito:{' '}
        {formatoEntero(resumen.segmentos)} segmentos forman {formatoEntero(resumen.calles)} calles.
      </p>

      <h3>Reglas aplicadas</h3>
      <ol>
        {reglas.map((regla) => (
          <li key={regla.codigo}>
            <code>{regla.codigo}</code> {regla.descripcion}
          </li>
        ))}
      </ol>

      <h3>Abreviaturas expandidas</h3>
      <ul className="abrev">
        {abreviaturas.map((a) => (
          <li key={a.abreviatura}>
            <code>{a.abreviatura}</code> → {a.expansion}
          </li>
        ))}
      </ul>

      <h3>Problemas de calidad detectados</h3>
      <ul>
        <li>
          La ficha de metadatos del INE declara un sistema de referencia distinto al real (ver «Observaciones» en
          Recurso).
        </li>
        <li>
          {formatoEntero(calidad.segmentos_con_caracter_danado)} segmentos ({calidad.nombres_con_caracter_danado}{' '}
          nombres) tienen «?» en lugar de Ñ, por ejemplo «MU?OZ». Se conservan tal como los publica el INE.
        </li>
        <li>
          {calidad.calles_con_variantes} calles tienen variantes de escritura en el mismo distrito (por ejemplo «GRAL.
          GENES» y «GENERAL GENES»); se agrupan al normalizar.
        </li>
        <li>
          {calidad.segmentos_fuera_de_su_unidad} segmentos no tocan el polígono de su propio distrito (quedan sobre los
          límites). Por eso la asignación al distrito se hace por código oficial y no por ubicación.
        </li>
        <li>
          Nombres sin significado excluidos en la importación:{' '}
          {excluidos.map((e, i) => (
            <span key={`${e.codigo_unidad}-${e.nombre}`}>
              {i > 0 && ', '}«{e.nombre}» ({tituloNombre(e.unidad)})
            </span>
          ))}
          .
        </li>
      </ul>
    </>
  );
}
