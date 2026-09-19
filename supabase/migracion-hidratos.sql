-- ─── LOS HIDRATOS: UNA RESPUESTA DE TRES ESTADOS ────────────────────────────
--
-- ⚠️ ESTA MIGRACIÓN FALTABA, Y ESO FUE UN FALLO EN PRODUCCIÓN (19 de
-- septiembre de 2026). La columna se empezó a escribir desde la app el 17 de
-- septiembre, con `con_hidratos` añadida a `filaDePerro` y a `COLUMNAS_NUEVAS`
-- en `src/supabase.js`, y **el SQL no se escribió**. Comprobado sondeando el
-- esquema de producción con la clave pública:
--
--     perros.con_hidratos     -> 42703  «column perros.con_hidratos does not exist»
--     perros.premios_nivel    -> 42501  permiso denegado  (o sea: EXISTE)
--     perros.peso_objetivo_kg -> 42501  permiso denegado  (o sea: EXISTE)
--
-- Y no se quedó en que no se guardaran los hidratos. `esColumnaQueNoExiste`
-- miraba solo el CÓDIGO del error, así que ese PGRST204 valía para cualquier
-- columna de la lista: al guardar una ficha se quitaba primero
-- `peso_objetivo_kg`, luego `premios_nivel` y por fin el culpable. La ficha se
-- guardaba sin dar ningún error y sin dos respuestas que sí existían.
--
-- Lo que vio Elena: el menú de Cairo con «bastantes premios» y con «ninguno»
-- daba EXACTAMENTE las mismas kcal. El motor nunca vio la respuesta.
--
-- QUÉ SE GUARDA, Y POR QUÉ ES `BOOLEAN` Y NO UN `NOT NULL`. La pregunta tiene
-- TRES estados y los tres dicen cosas distintas:
--
--     NULL   sin contestar -- no entran, salvo que una patología los pida
--     false  «no» -- no entran NUNCA, ni con una patología que los pida
--     true   «sí» -- entran aunque el perro no tenga nada
--
-- Con dos estados, «no he contestado» y «no quiero» serían lo mismo, y no lo
-- son: el segundo es una exclusión del dueño y esas no se tocan jamás
-- (regla 4). Por eso NO lleva DEFAULT: un default convertiría el primero en
-- uno de los otros dos en todas las fichas que ya existen.
--
-- Se ejecuta en Supabase -> SQL Editor. Es idempotente.

ALTER TABLE public.perros
  ADD COLUMN IF NOT EXISTS con_hidratos BOOLEAN;

COMMENT ON COLUMN public.perros.con_hidratos IS
  'Si la ración puede llevar cereales y tubérculos cocidos. TRES estados: '
  'NULL = sin contestar (no entran salvo que una patología los pida), '
  'false = el dueño dice que no (no entran nunca, ni con patología que los '
  'pida), true = sí (entran aunque el perro no tenga nada). Que un BARF no '
  'lleve hidratos es criterio NUESTRO, no de fuente. Sin DEFAULT a propósito: '
  'convertiría «sin contestar» en una respuesta en todas las fichas que ya '
  'existen.';

-- Comprobación:
--   select nombre, con_hidratos, premios_nivel, peso_objetivo_kg
--     from public.perros order by updated_at desc limit 10;
