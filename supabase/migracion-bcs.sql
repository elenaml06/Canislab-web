-- ─── EL BCS DE 9 PUNTOS, EN SU PROPIA COLUMNA ────────────────────────────────
--
-- POR QUÉ NO BASTA `condicion_idx`. Son CINCO escalones, y equivalen a cinco
-- valores sueltos del BCS: 2, 4, 5, 7 y 9. Un BCS 6 -- "por encima del
-- ideal", el más común en consulta -- solo se puede guardar redondeándolo a
-- 5 o a 7, y redondear la condición corporal mueve el peso objetivo un 10 %.
-- De ese peso objetivo salen las kcal de la ración. En una ficha clínica eso
-- no vale.
--
-- Se queda NULL en las fichas de los dueños: no se inventa un 5 donde no lo
-- ha dicho nadie. Cuando está, es el que manda para calcular (ver
-- `bcsVigente` en src/bcs.js); cuando no, manda `condicion_idx`.
--
-- Se ejecuta en el SQL Editor de Supabase. Es idempotente: se puede volver a
-- lanzar sin romper nada.

alter table public.perros
  add column if not exists bcs smallint;

-- Que no entre un número imposible. La escala es de 1 a 9 y no hay medios
-- puntos: un 4,5 es una observación que no existe en la escala.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'perros_bcs_valido'
  ) then
    alter table public.perros
      add constraint perros_bcs_valido
      check (bcs is null or (bcs >= 1 and bcs <= 9));
  end if;
end $$;

comment on column public.perros.bcs is
  'Body Condition Score de 9 puntos (WSAVA). NULL en las fichas rellenadas por un dueño, que usan condicion_idx (5 escalones = BCS 2, 4, 5, 7 y 9).';
