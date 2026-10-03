-- 002_normalizacion.sql
-- Normalización de nombres de calles. ÚNICA implementación: la usan la carga de datos
-- (columna via_segmento.nombre_busqueda) y la búsqueda del usuario (la API llama a
-- idepy.normalizar_nombre; no reimplementa nada en JavaScript). Idempotente.
--
-- Se divide en dos funciones por el tema de la volatilidad:
--
-- 1) unaccent() es STABLE, no IMMUTABLE: busca su diccionario por search_path, así que
--    su resultado podría cambiar si cambia el search_path. El patrón correcto es un
--    "wrapper" que llama a la versión de dos argumentos con el diccionario calificado
--    por esquema ('public.unaccent'). Ya no depende del search_path y declararlo
--    IMMUTABLE es honesto.
--
-- 2) La expansión de abreviaturas lee la tabla idepy.abreviatura. Una función que lee
--    una tabla NO es inmutable (si se agrega una abreviatura, cambia el resultado), así
--    que normalizar_nombre se declara STABLE. Marcarla IMMUTABLE sería mentirle a
--    Postgres y un índice sobre ella quedaría desactualizado sin aviso.
--    Por eso nombre_busqueda es una columna materializada (calculada en la carga) y el
--    índice trigram va sobre la columna, no sobre una expresión.
--    Consecuencia: si se modifica idepy.abreviatura hay que ejecutar
--    database/scripts/recalcular_nombre_busqueda.sql.

-- Wrapper inmutable de unaccent ------------------------------------------------------
CREATE OR REPLACE FUNCTION idepy.f_unaccent(texto text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
RETURN public.unaccent('public.unaccent'::regdictionary, texto);

COMMENT ON FUNCTION idepy.f_unaccent(text) IS
  'unaccent() con diccionario calificado por esquema: no depende del search_path, por eso es IMMUTABLE.';

-- Paso 1: limpieza de caracteres (inmutable) ------------------------------------------
--   "?" -> "N"   (en los datos del INE "?" reemplaza a la Ñ; va primero, antes de que
--                 el paso de caracteres no alfanuméricos lo convierta en espacio)
--   sin tildes   (Ñ -> N incluida, aceptado)
--   mayúsculas
--   todo lo que no sea A-Z o 0-9 -> un espacio (una secuencia de varios caracteres
--                 de ese tipo se convierte en UN solo espacio)
--   trim
CREATE OR REPLACE FUNCTION idepy.normalizar_texto(texto text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
RETURN btrim(
  regexp_replace(
    upper(idepy.f_unaccent(replace(texto, '?', 'N'))),
    '[^A-Z0-9]+', ' ', 'g'
  )
);

COMMENT ON FUNCTION idepy.normalizar_texto(text) IS
  'Mayúsculas, sin tildes, "?"->N, no alfanumérico->espacio, espacios colapsados, trim. Sin abreviaturas.';

-- Tabla de abreviaturas ----------------------------------------------------------------
-- Se guardan ya normalizadas (sin punto, en mayúsculas). Una abreviatura es un solo
-- token; la expansión puede tener varios (TCNEL -> TENIENTE CORONEL).
CREATE TABLE IF NOT EXISTS idepy.abreviatura (
  abreviatura text PRIMARY KEY,
  expansion   text NOT NULL,
  CONSTRAINT abreviatura_un_token  CHECK (abreviatura ~ '^[A-Z0-9]+$'),
  CONSTRAINT expansion_normalizada CHECK (expansion <> '' AND expansion = idepy.normalizar_texto(expansion))
);

COMMENT ON TABLE idepy.abreviatura IS
  'Abreviaturas expandidas token por token en normalizar_nombre(). Si se modifica, ejecutar scripts/recalcular_nombre_busqueda.sql.';

INSERT INTO idepy.abreviatura (abreviatura, expansion) VALUES
  ('AVDA',  'AVENIDA'),
  ('AV',    'AVENIDA'),
  ('MCAL',  'MARISCAL'),
  ('CNEL',  'CORONEL'),
  ('GRAL',  'GENERAL'),
  ('TTE',   'TENIENTE'),
  ('TCNEL', 'TENIENTE CORONEL'),
  ('PTE',   'PRESIDENTE'),
  ('DR',    'DOCTOR'),
  ('DRA',   'DOCTORA'),
  ('STA',   'SANTA'),
  ('STO',   'SANTO'),
  ('SGTO',  'SARGENTO'),
  ('CAP',   'CAPITAN'),
  ('CPTAN', 'CAPITAN'),
  ('PROF',  'PROFESOR'),
  ('PBRO',  'PRESBITERO'),
  ('MONS',  'MONSENOR'),
  ('ING',   'INGENIERO'),
  ('GDOR',  'GOBERNADOR'),
  ('CTE',   'COMANDANTE'),
  ('SDO',   'SOLDADO')
ON CONFLICT (abreviatura) DO UPDATE SET expansion = EXCLUDED.expansion;

-- Paso 2: normalización completa (STABLE, porque lee idepy.abreviatura) ---------------
-- Divide el texto limpio en tokens, reemplaza cada token que sea una abreviatura por su
-- expansión y vuelve a unirlos respetando el orden original. Devuelve '' si el texto
-- no tiene letras ni números.
CREATE OR REPLACE FUNCTION idepy.normalizar_nombre(texto text)
RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE STRICT
BEGIN ATOMIC
  SELECT coalesce(string_agg(coalesce(a.expansion, t.token), ' ' ORDER BY t.posicion), '')
  FROM unnest(string_to_array(idepy.normalizar_texto(texto), ' ')) WITH ORDINALITY AS t(token, posicion)
  LEFT JOIN idepy.abreviatura a ON a.abreviatura = t.token;
END;

COMMENT ON FUNCTION idepy.normalizar_nombre(text) IS
  'Normalización única de nombres: normalizar_texto() + expansión de abreviaturas por token. Usada en datos y en búsquedas.';
