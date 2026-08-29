-- ─── LOS PACIENTES DEL VETERINARIO ──────────────────────────────────────────
--
-- Fase 2 de la parte para veterinarios. El plan entero está en
-- VETERINARIOS.md, en el repo de la API.
--
-- LA IDEA, EN UNA FRASE: `perros.user_id` sigue significando lo mismo que
-- hoy -- de quién es la ficha --, y una tabla nueva responde a una sola
-- pregunta: ¿puede esta cuenta ver este perro?
--
-- ⚠️ POR QUÉ UN PACIENTE PROPIO TAMBIÉN LLEVA FILA EN `accesos`, aunque
-- parezca redundante. Cuando un veterinario da de alta a un paciente, la
-- ficha es suya: `perros.user_id` = él. Pero su PROPIO perro también. Esa
-- columna no los distingue, y sin distinguirlos el interruptor de modo le
-- mete su perro entre los pacientes y al revés.
--
-- Lo que los separa es esto: un paciente tiene fila aquí y su perro no. La
-- lista de pacientes son los perros CON fila; la de perros propios, los que
-- no la tienen.
--
-- Y de paso hace que la fase 3 -- que el dueño le comparta un perro suyo --
-- sea AÑADIR FILAS y no reescribir el acceso: un solo camino para "¿puede
-- verlo?" desde el primer día.
--
-- Se ejecuta en Supabase -> SQL Editor. Es idempotente.
-- La app aguanta que esto no se haya ejecutado: si la tabla no existe,
-- ningún perro es paciente y todo se comporta como hasta ahora.

BEGIN;

-- ─── 1. QUIÉN PUEDE VER QUÉ PERRO ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.accesos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perro_id     uuid NOT NULL REFERENCES public.perros(id) ON DELETE CASCADE,
  profesional  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'creado_por_el_profesional' = paciente que dio de alta él (fase 2)
  -- 'invitado_por_el_tutor'     = perro que le comparte su dueño (fase 3)
  origen       TEXT NOT NULL DEFAULT 'creado_por_el_profesional',
  estado       TEXT NOT NULL DEFAULT 'activo',   -- 'activo' | 'revocado'
  creado_en    timestamptz NOT NULL DEFAULT now(),
  revocado_en  timestamptz,
  UNIQUE (perro_id, profesional)
);

COMMENT ON TABLE public.accesos IS
  'Responde a una sola pregunta: ¿puede esta cuenta ver este perro? Un '
  'paciente tiene fila aquí; el perro propio del veterinario, no. Es lo '
  'único que los distingue, porque los dos tienen perros.user_id = él.';

COMMENT ON COLUMN public.accesos.estado IS
  'Se revoca poniendo ''revocado'', NO borrando la fila: quién tuvo acceso '
  'y hasta cuándo es exactamente el dato que hará falta el día que alguien '
  'pregunte.';

CREATE INDEX IF NOT EXISTS accesos_por_profesional
  ON public.accesos (profesional) WHERE estado = 'activo';

ALTER TABLE public.accesos ENABLE ROW LEVEL SECURITY;

-- El profesional ve y gestiona SUS accesos. El dueño del perro también los
-- ve -- es su perro, tiene derecho a saber quién entra -- y puede revocarlos.
DROP POLICY IF EXISTS accesos_leer ON public.accesos;
CREATE POLICY accesos_leer ON public.accesos FOR SELECT
  USING (
    profesional = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perros p
                WHERE p.id = accesos.perro_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS accesos_crear ON public.accesos;
CREATE POLICY accesos_crear ON public.accesos FOR INSERT
  WITH CHECK (
    profesional = auth.uid()
    AND EXISTS (SELECT 1 FROM public.perros p
                 WHERE p.id = accesos.perro_id AND p.user_id = auth.uid())
  );

-- ⚠️ REVOCAR LO PUEDE HACER EL DUEÑO, y esto no es un detalle: es su perro
-- y sus datos. Un acceso concedido que no se puede quitar es un acceso que
-- nadie recuerda haber dado.
DROP POLICY IF EXISTS accesos_actualizar ON public.accesos;
CREATE POLICY accesos_actualizar ON public.accesos FOR UPDATE
  USING (
    profesional = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perros p
                WHERE p.id = accesos.perro_id AND p.user_id = auth.uid())
  );

-- ⚠️ LAS POLÍTICAS DE `perros` Y `menus` NO SE TOCAN AQUÍ, y es correcto.
-- En esta fase el paciente lo da de alta el propio veterinario, así que
-- `perros.user_id` ya es él y la política que existe hoy le deja verlo. La
-- política que mira `accesos` hace falta en la FASE 3, cuando el perro sea
-- de otro. Cambiarla ahora sería tocar algo que funciona sin ningún caso
-- que lo necesite.

-- ─── 2. QUIÉN GENERÓ CADA MENÚ ──────────────────────────────────────────────
--
-- Es lo que la suplantación habría hecho imposible: sin esta columna, un
-- menú del veterinario y uno que el dueño se hizo un domingo son la misma
-- fila. La primera vez que alguien pregunte "¿esta pauta la hice yo o la
-- hizo la app?", esto es lo que contesta.

ALTER TABLE public.menus
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.menus.creado_por IS
  'Quién generó este menú. NULL = anterior al 28/08/2026. No es lo mismo '
  'que user_id, que es de quién es la cuenta donde vive.';

-- ─── 3. LOS DATOS DEL TUTOR DEL PACIENTE ────────────────────────────────────
--
-- Un paciente tiene dueño aunque ese dueño no use Rawku -- que es el caso
-- normal en una consulta. Van en `perros` y no en una tabla de personas a
-- propósito: no estamos montando un CRM, es el nombre y el teléfono que el
-- veterinario apunta para saber de quién es el perro.

ALTER TABLE public.perros
  ADD COLUMN IF NOT EXISTS tutor_nombre   TEXT,
  ADD COLUMN IF NOT EXISTS tutor_contacto TEXT;

COMMIT;

-- ─── COMPROBAR QUE HA IDO BIEN ──────────────────────────────────────────────
--
-- 1. La tabla y sus políticas:
--      select tablename, policyname from pg_policies where tablename = 'accesos';
--    Tienen que salir tres: accesos_leer, accesos_crear, accesos_actualizar.
--
-- 2. Las columnas nuevas:
--      select column_name from information_schema.columns
--       where table_name = 'menus' and column_name = 'creado_por';
--      select column_name from information_schema.columns
--       where table_name = 'perros' and column_name like 'tutor_%';
--
-- 3. LA QUE IMPORTA, y hay que hacerla desde la app con dos cuentas: que la
--    cuenta A no pueda crearse un acceso sobre un perro de la cuenta B.
--    Desde el SQL Editor no se puede comprobar -- allí eres service_role y
--    las políticas no se aplican. En la consola del navegador, con la sesión
--    de A:
--
--      await supabase.from('accesos')
--        .insert({ perro_id: '<un perro de B>', profesional: '<id de A>' })
--
--    Tiene que devolver error. Si devuelve ok, la política no está haciendo
--    su trabajo y NO se puede seguir con la fase 3.
