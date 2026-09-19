-- ─── LOS PREMIOS, UNO A UNO ─────────────────────────────────────────────────
--
-- PEDIDO EXPRESO (Elena, 19 de septiembre de 2026): «ADEMÁS no me pregunta qué
-- tipo de premios le das. Que dijimos que tenía que preguntarlo». Y ya lo había
-- pedido el 16: «tiene que haber una parte en la que elija lo que le da y se
-- meta en el plato».
--
-- `premios_nivel` guarda CUÁNTO come fuera de su ración. Esto guarda CUÁLES, y
-- son dos cosas distintas con dos efectos distintos en el motor:
--
--   · sin declarar -> son kcal a ciegas. El motor formula la ración con las que
--     quedan y le sigue exigiendo el DÍA ENTERO de nutrientes, porque de lo que
--     lleva dentro un premio no sabemos nada. Eso es la dilución que describe
--     Ettinger 8ª ed. cap. 192.
--   · declarado -> entra en el plato como gramos FIJOS. Sus nutrientes cuentan
--     dentro de los 43 requisitos y no hace falta apretar nada, porque no queda
--     ninguna parte del día a ciegas.
--
-- Es literalmente lo que hace el formulador de Sean Delaney -- coeditor de
-- Fascetti & Delaney, una de nuestras cuatro fuentes --: «Some of these can be
-- selected as "Treats & Enticers" when creating a recipe (...) no more than 10%
-- of daily calories IF NOT CALLED FOR AND ACCOUNTED FOR SPECIFICALLY IN THE
-- RECIPE». Declarado = está en la receta.
--
-- QUÉ FORMA TIENE: {"nombre del alimento": gramos al día}, con los nombres tal
-- cual los escribe el catálogo. SOLO alimentos del catálogo, y lo impone el
-- motor: de una ficha sabemos su composición y la rehace un auditor contra su
-- fuente. Un nombre que no está NO se ignora en silencio -- el motor lo
-- devuelve en `premios_que_no_conocemos`, porque un premio que el dueño cree
-- declarado y que no se cuenta es peor que no preguntarlo.
--
-- ⚠️ SIN CHECK Y SIN DEFAULT, por lo mismo que `premios_nivel`: la lista de
-- alimentos la manda el motor y un CHECK aquí dejaría de guardar fichas el día
-- que entre una ficha nueva. NULL = no ha declarado ninguno, que no es lo mismo
-- que declarar cero.
--
-- Se ejecuta en Supabase -> SQL Editor. Es idempotente.

ALTER TABLE public.perros
  ADD COLUMN IF NOT EXISTS premios_declarados JSONB;

COMMENT ON COLUMN public.perros.premios_declarados IS
  'Qué premios concretos come fuera de su ración: {"nombre del alimento": '
  'gramos al día}, con los nombres del catálogo. Lo declarado entra en el '
  'plato como gramos fijos y sus nutrientes cuentan; lo NO declarado sigue '
  'contando como kcal a ciegas con su dilución (Ettinger 8ª ed. cap. 192). '
  'NULL = no ha declarado ninguno, que no es declarar cero.';

-- Comprobación:
--   select nombre, premios_nivel, premios_declarados
--     from public.perros order by updated_at desc limit 10;
