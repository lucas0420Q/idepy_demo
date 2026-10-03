-- 003_tablas.sql
-- Modelo físico mínimo (subconjunto del DER conceptual de 12 entidades). Idempotente.

-- Recurso: el conjunto de datos de origen y sus metadatos --------------------------------
CREATE TABLE IF NOT EXISTS idepy.recurso (
  id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre             text    NOT NULL UNIQUE,
  organismo          text    NOT NULL,
  producto           text    NOT NULL,
  periodo_referencia text    NOT NULL,
  epsg_origen        integer NOT NULL CHECK (epsg_origen > 0),
  formato_origen     text    NOT NULL,
  observaciones      text
);

COMMENT ON TABLE idepy.recurso IS 'Recurso de datos de origen. La fecha/período es del recurso, no hay fecha por calle.';

-- Unidad administrativa (en la demo: 3 distritos) ----------------------------------------
-- codigo = DPTO || DISTRITO del INE (ej. 1107 = Central / Lambaré).
CREATE TABLE IF NOT EXISTS idepy.unidad_administrativa (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo          varchar(4) NOT NULL UNIQUE,
  nombre          text       NOT NULL,
  tipo            text       NOT NULL,
  unidad_padre_id integer    NULL REFERENCES idepy.unidad_administrativa (id),
  geometria       geometry(MultiPolygon, 4674) NOT NULL,
  CONSTRAINT unidad_codigo_formato CHECK (codigo ~ '^[0-9]{2}([0-9]{2})?$'),
  CONSTRAINT unidad_tipo_valido    CHECK (tipo IN ('DEPARTAMENTO', 'DISTRITO')),
  CONSTRAINT unidad_nombre_no_vacio CHECK (btrim(nombre) <> ''),
  CONSTRAINT unidad_no_es_su_padre CHECK (unidad_padre_id IS DISTINCT FROM id),
  CONSTRAINT unidad_geometria_valida CHECK (ST_IsValid(geometria) AND NOT ST_IsEmpty(geometria))
);

CREATE INDEX IF NOT EXISTS unidad_administrativa_geometria_gist ON idepy.unidad_administrativa USING gist (geometria);
CREATE INDEX IF NOT EXISTS unidad_administrativa_padre_idx      ON idepy.unidad_administrativa (unidad_padre_id);

-- Segmento de vía: cada registro del INE es un TRAMO, no una calle completa ---------------
CREATE TABLE IF NOT EXISTS idepy.via_segmento (
  id                       bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recurso_id               integer NOT NULL REFERENCES idepy.recurso (id),
  unidad_administrativa_id integer NOT NULL REFERENCES idepy.unidad_administrativa (id),
  fid_origen               integer NOT NULL,
  nombre_original          text    NOT NULL,
  nombre_busqueda          text    NOT NULL,
  tipo_via                 text    NOT NULL,
  superficie               text    NOT NULL,
  longitud_m               integer NOT NULL,
  geometria                geometry(MultiLineString, 4674) NOT NULL,
  CONSTRAINT via_segmento_origen_unico UNIQUE (recurso_id, fid_origen),
  CONSTRAINT via_segmento_nombre_original_trim CHECK (nombre_original <> '' AND nombre_original = btrim(nombre_original)),
  CONSTRAINT via_segmento_nombre_busqueda_no_vacio CHECK (nombre_busqueda <> ''),
  CONSTRAINT via_segmento_tipo_via_valido CHECK (tipo_via IN
    ('Avenida', 'Calle Urbana', 'Pasillo Peatonal', 'Pasillo Vehicular', 'Ruta Departamental', 'Ruta Nacional')),
  CONSTRAINT via_segmento_superficie_valida CHECK (superficie IN
    ('Adoquinado', 'Asfalto', 'Empedrado', 'Hormigón', 'Tierra')),
  CONSTRAINT via_segmento_longitud_positiva CHECK (longitud_m > 0),
  CONSTRAINT via_segmento_geometria_valida  CHECK (ST_IsValid(geometria) AND NOT ST_IsEmpty(geometria))
);

COMMENT ON COLUMN idepy.via_segmento.nombre_original IS 'Nombre tal como lo publica el INE (solo trim). Incluye "?" en lugar de Ñ: no se corrige.';
COMMENT ON COLUMN idepy.via_segmento.nombre_busqueda IS 'idepy.normalizar_nombre(nombre_original), materializado. Recalcular si cambia idepy.abreviatura.';
COMMENT ON COLUMN idepy.via_segmento.longitud_m      IS 'Long_Metro del INE (metros).';

CREATE INDEX IF NOT EXISTS via_segmento_geometria_gist ON idepy.via_segmento USING gist (geometria);
CREATE INDEX IF NOT EXISTS via_segmento_unidad_idx     ON idepy.via_segmento (unidad_administrativa_id);
-- recurso_id ya está indexado como primera columna de via_segmento_origen_unico.

-- Reglas de transformación aplicadas (trazabilidad del proceso) ---------------------------
CREATE TABLE IF NOT EXISTS idepy.regla_transformacion (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo      text NOT NULL UNIQUE,
  descripcion text NOT NULL,
  tipo        text NOT NULL,
  CONSTRAINT regla_codigo_formato CHECK (codigo ~ '^[A-Z0-9_]+$'),
  CONSTRAINT regla_tipo_valido    CHECK (tipo IN
    ('FILTRO', 'EXCLUSION', 'LIMPIEZA', 'NORMALIZACION', 'ASIGNACION', 'AGRUPACION', 'REFERENCIA_ESPACIAL'))
);

-- Nombres excluidos en la importación (datos de la regla EXCLUSION_NOMBRES_INVALIDOS) ----
-- Lista explícita en vez de heurística: un criterio como "menos de 2 letras" también
-- eliminaría nombres válidos como "1".
CREATE TABLE IF NOT EXISTS idepy.nombre_excluido (
  nombre        text       NOT NULL,
  codigo_unidad varchar(4) NOT NULL,
  motivo        text       NOT NULL,
  PRIMARY KEY (nombre, codigo_unidad)
);
