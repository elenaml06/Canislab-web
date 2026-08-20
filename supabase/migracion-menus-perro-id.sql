-- ─────────────────────────────────────────────────────────────────────────────
-- Adoptar los menús guardados que se quedaron sin perro
--
-- QUÉ PASÓ
-- La app guardaba los menús con `perro_id` vacío: la llamada era
-- `guardarMenu(usuario.id, null, {...})`, y ese `null` era justo el perro.
-- Como `getMenus(perroId)` filtra por esa columna, ningún menú guardado
-- hasta hoy se podría encontrar nunca. El código ya está corregido: los
-- menús NUEVOS se guardan con su perro. Esto arregla los VIEJOS.
--
-- QUÉ HACE
-- A cada menú sin dueño le asigna el perro de su propia cuenta. El
-- `user_id` sí se guardaba bien, así que no hay ninguna ambigüedad
-- mientras cada cuenta tenga un solo perro (que es el caso ahora).
--
-- Si una cuenta tuviera varios perros, se elige el más antiguo — el mismo
-- que la app considera "el perro" hoy (getPerros ordena por created_at
-- ascendente y coge el primero). Así lo que se ve tras la migración
-- coincide con lo que la app venía enseñando.
--
-- CÓMO EJECUTARLO
-- Supabase → SQL Editor → pegar y ejecutar. Es seguro repetirlo: sólo
-- toca filas con perro_id vacío, así que a la segunda no hace nada.
--
-- ANTES DE EJECUTAR, para ver cuántas filas se van a tocar:
--   select count(*) from menus where perro_id is null;
-- ─────────────────────────────────────────────────────────────────────────────

begin;

update menus m
set perro_id = elegido.perro_id
from (
  select distinct on (user_id)
         user_id,
         id as perro_id
  from perros
  order by user_id, created_at asc
) elegido
where m.perro_id is null
  and m.user_id = elegido.user_id;

commit;

-- COMPROBACIÓN — debería devolver 0 filas.
-- Si devuelve alguna, son menús de cuentas que no tienen ningún perro
-- guardado (se borró el perro pero quedaron sus menús). Esos no se pueden
-- adoptar automáticamente: no hay a quién asignarlos.
--   select count(*) from menus where perro_id is null;
