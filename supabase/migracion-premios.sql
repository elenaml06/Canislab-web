-- ─── LOS PREMIOS, QUE DILUYEN LA RACIÓN ─────────────────────────────────────
--
-- POR QUÉ (11 de septiembre de 2026). Cuatro fuentes dicen lo mismo y una
-- trae el mecanismo:
--
--   «Los alimentos y premios desequilibrados no se deben proporcionar en más
--    de un 10 % de la ingesta calórica diaria total. Cuando se agregan
--    alimentos desequilibrados a una dieta completa y equilibrada, SE PRODUCE
--    UNA DILUCIÓN DE NUTRIENTES, y los nutrientes esenciales pueden quedar
--    POR DEBAJO DE LOS REQUERIMIENTOS MÍNIMOS.»
--                                          (Ettinger 8ª ed., cap. 192)
--
-- Lo repiten el cap. 175 del mismo libro -- que además los define, «premios,
-- sobras de la mesa, suplementos» -- y Fascetti & Delaney 2ª ed. cap. 7.
--
-- O sea que un dueño que sigue el menú al gramo y luego da premios NO está
-- dando el menú que le calculamos. El motor ya sabe contarlo: formula la
-- ración con las kcal QUE QUEDAN y le sigue exigiendo el día entero de
-- nutrientes. Pero solo si se lo decimos, y para decírselo en CADA petición
-- hay que guardar la respuesta: sin esta columna la ficha se contesta una vez
-- y se olvida al recargar.
--
-- QUÉ SE GUARDA. La CLAVE de la respuesta, no un número de kcal. Nadie sabe
-- las calorías de la galleta que le da a su perro, y la fuente habla en
-- porcentaje de la ingesta diaria: es el motor quien convierte, con el DER de
-- ese perro. Las cuatro claves las sirve `GET /vocabulario` y son:
--
--     ninguno · alguno · hasta_el_maximo · mas_del_maximo
--
-- ⚠️ NO se pone CHECK con esa lista a propósito: el día que el motor añada o
-- renombre un nivel, un CHECK aquí dejaría de guardar fichas sin que nadie
-- entienda por qué, y quien manda es el motor. Lo valida la API, que devuelve
-- un 422 con el nombre de los niveles que conoce.
--
-- SE PUEDE EJECUTAR ANTES O DESPUÉS DE DESPLEGAR: la app aguanta que la
-- columna no exista todavía (guarda el resto de la ficha y avisa por
-- consola, ver COLUMNAS_NUEVAS en `src/supabase.js`). Pero hasta que se
-- ejecute, la respuesta no se guarda y la ficha vuelve a preguntarla.
--
-- Se ejecuta en Supabase -> SQL Editor. Es idempotente.

ALTER TABLE public.perros
  ADD COLUMN IF NOT EXISTS premios_nivel TEXT;

COMMENT ON COLUMN public.perros.premios_nivel IS
  'Cuánto come el perro FUERA de su ración, como clave de respuesta: '
  'ninguno / alguno / hasta_el_maximo / mas_del_maximo. El motor la '
  'convierte a kcal con el DER de este perro y formula la ración con las '
  'que quedan, exigiéndole igual el día entero de nutrientes (Ettinger 8ª '
  'ed. caps. 175 y 192; Fascetti & Delaney 2ª ed. cap. 7: no más del 10 % '
  'de las calorías del día). NULL = ficha anterior al 11/09/2026 o columna '
  'recién creada; la app vuelve a preguntarlo, que es mejor que dar por '
  'hecho que no le da ninguno.';

-- Comprobación:
--   select nombre, premios_nivel from public.perros order by updated_at desc limit 10;
