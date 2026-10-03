-- 004_datos_referencia.sql
-- Metadatos del recurso, reglas de transformación y nombres excluidos. Idempotente
-- (ON CONFLICT ... DO UPDATE: volver a ejecutarlo actualiza los textos).
-- Solo se registran datos conocidos: no se inventan fechas ni responsables.

INSERT INTO idepy.recurso (nombre, organismo, producto, periodo_referencia, epsg_origen, formato_origen, observaciones)
VALUES (
  'Vías de comunicación – Departamento Central (muestra de 3 distritos)',
  'Instituto Nacional de Estadística (INE)',
  'Cartografía Digital 2022',
  '2022',
  4674,
  'Shapefile del INE (Vías_Central.shp, Distritos_Central.shp); muestra exportada a GeoPackage en QGIS',
  'La ficha de metadatos (.qmd) del INE declara EPSG:32721, pero el .prj y las coordenadas corresponden a EPSG:4674 (SIRGAS 2000 geográfico); se usa 4674. '
  || 'El período de referencia corresponde al recurso: no hay fecha por calle. '
  || 'Los nombres se conservan como los publica el INE (75 segmentos tienen "?" en lugar de Ñ).'
)
ON CONFLICT (nombre) DO UPDATE SET
  organismo          = EXCLUDED.organismo,
  producto           = EXCLUDED.producto,
  periodo_referencia = EXCLUDED.periodo_referencia,
  epsg_origen        = EXCLUDED.epsg_origen,
  formato_origen     = EXCLUDED.formato_origen,
  observaciones      = EXCLUDED.observaciones;

INSERT INTO idepy.regla_transformacion (codigo, tipo, descripcion) VALUES
  ('FILTRO_DISTRITOS', 'FILTRO',
   'Preparación en QGIS: se seleccionaron los distritos 1103 Fernando de la Mora, 1107 Lambaré y 1114 San Lorenzo (Departamento Central) y solo segmentos con nombre.'),
  ('REFERENCIA_ESPACIAL_4674', 'REFERENCIA_ESPACIAL',
   'Se usa EPSG:4674 (SIRGAS 2000 geográfico) según el .prj y las coordenadas; la ficha .qmd declara EPSG:32721 por error. Las geometrías se guardan en 4674 y la API las entrega en EPSG:4326 (ST_Transform).'),
  ('EXCLUSION_NOMBRES_INVALIDOS', 'EXCLUSION',
   'Se excluyen en la importación los segmentos cuyo nombre figura en la tabla nombre_excluido para su distrito ("S7n" en Lambaré, "O" en San Lorenzo, "S" en Fernando de la Mora; un segmento cada uno).'),
  ('LIMPIEZA_TRIM', 'LIMPIEZA',
   'nombre_original = nombre del INE con trim de espacios en los extremos; no se corrige ningún otro carácter.'),
  ('NORMALIZACION_NOMBRE', 'NORMALIZACION',
   'nombre_busqueda = idepy.normalizar_nombre(nombre_original): mayúsculas, sin tildes (Ñ->N), "?"->N, caracteres no alfanuméricos->espacio, espacios colapsados, trim. La misma función normaliza la búsqueda del usuario.'),
  ('EXPANSION_ABREVIATURAS', 'NORMALIZACION',
   'Dentro de la normalización, cada token que coincide con una abreviatura de la tabla abreviatura se reemplaza por su expansión (ej. AVDA->AVENIDA, MCAL->MARISCAL).'),
  ('ASIGNACION_POR_CODIGO', 'ASIGNACION',
   'Cada segmento se asigna a la unidad administrativa cuyo código (CLAVE) es igual a DPTO || DISTRITO del segmento. Nunca por nombre ni por intersección espacial.'),
  ('AGRUPACION_CALLE', 'AGRUPACION',
   'Una calle es el conjunto de segmentos con igual nombre_busqueda dentro de una misma unidad administrativa (vista materializada via). Se muestra la variante original más frecuente.')
ON CONFLICT (codigo) DO UPDATE SET
  tipo        = EXCLUDED.tipo,
  descripcion = EXCLUDED.descripcion;

INSERT INTO idepy.nombre_excluido (nombre, codigo_unidad, motivo) VALUES
  ('S7n', '1107', 'Nombre sin significado identificable; superó el filtro de QGIS.'),
  ('O',   '1114', 'Nombre de una sola letra sin significado; superó el filtro de QGIS.'),
  ('S',   '1103', 'Nombre de una sola letra sin significado; superó el filtro de QGIS.')
ON CONFLICT (nombre, codigo_unidad) DO UPDATE SET motivo = EXCLUDED.motivo;
