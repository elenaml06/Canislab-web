-- ─── EL PESO OBJETIVO SE GUARDA EN KILOS ────────────────────────────────────
--
-- POR QUÉ (25 de agosto). Caso real: "creé el primer menú poniendo que
-- pesaba 7 kg y que está rellenita, y luego actualicé el peso a 6.2 pero
-- sigue quedándose en rellenito, entonces sigue metiendo menos kcal".
--
-- El fallo era peor que el olvido de cambiar la condición. El peso objetivo
-- se calculaba en cada pantalla dividiendo el peso de HOY (rellenito =
-- peso ÷ 1,20), así que bajaba con el perro y el ratio quedaba clavado en
-- 1,20 pesara lo que pesara. Medido con Lola:
--
--     7,0 kg -> 263 kcal   6,5 -> 249   6,2 -> 240   5,9 -> 231
--
-- Adelgazaba y le dábamos menos comida. La dieta no podía terminar nunca.
--
-- Ahora el objetivo se fija cuando se marca la condición y se guarda aquí.
-- Deja de moverse hasta que alguien vuelva a mirar al perro.
--
-- SE PUEDE EJECUTAR ANTES O DESPUÉS DE DESPLEGAR: la app aguanta que la
-- columna no exista todavía (guarda el resto de la ficha y avisa por
-- consola). Pero hasta que se ejecute, el objetivo no se guarda y se
-- recalcula en cada pantalla, o sea que el fallo sigue ahí.
--
-- Se ejecuta en Supabase -> SQL Editor. Es idempotente.

ALTER TABLE public.perros
  ADD COLUMN IF NOT EXISTS peso_objetivo_kg NUMERIC;

COMMENT ON COLUMN public.perros.peso_objetivo_kg IS
  'Peso objetivo en kg, fijado al marcar la condición corporal. NO se '
  'recalcula al pesar al perro: si se recalculara, bajaría con él y la '
  'dieta no terminaría nunca. NULL = ficha anterior al 25/08/2026; la app '
  'lo calcula al vuelo y pide confirmarlo en Evolución.';

-- Comprobación:
--   select nombre, peso_actual, condicion_idx, peso_objetivo_kg
--   from public.perros order by updated_at desc limit 10;
