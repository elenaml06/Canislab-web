-- ─── EL ROL PROFESIONAL: QUIÉN ES VETERINARIO Y QUIÉN SOLO LO DICE ──────────
--
-- Fase 0 de la parte para veterinarios. El plan entero está en
-- VETERINARIOS.md, en el repo de la API.
--
-- QUÉ AÑADE
--   rol                 'tutor' (todo el mundo hoy) o 'profesional'
--   num_colegiado       lo que la persona declara al pedirlo
--   rol_verificado_en   cuándo se comprobó ese número. VACÍO = no comprobado
--
-- LA REGLA, que vive en src/rol.js: el modo profesional se enciende sólo si
-- rol = 'profesional' Y rol_verificado_en tiene fecha. Las dos. `rol` es lo
-- que la persona PIDE; `rol_verificado_en` es que alguien lo aprobó.
--
-- ⚠️ LO QUE HACE FALTA ENTENDER ANTES DE EJECUTAR ESTO
--
-- Sin la segunda mitad de este archivo, las columnas solas serían PEOR que
-- no tenerlas. `profiles` tiene seguridad por fila y cada persona puede
-- editar su propia fila -- que es lo correcto para el nombre o el correo.
-- Pero eso significa que cualquiera, desde la consola del navegador y con
-- la clave pública que va en el bundle, podría hacer:
--
--     supabase.from('profiles')
--       .update({ rol: 'profesional', rol_verificado_en: 'now()' })
--       .eq('id', <su propio id>)
--
-- y ascenderse. Con el plan de arriba, de ese rol cuelga poder pautar por
-- debajo de los mínimos de FEDIAF y firmar la pauta con un número de
-- colegiado. Un rol que se autoconcede no puede sostener eso.
--
-- Es exactamente el mismo motivo por el que `plan` no lo escribe la app
-- sino el webhook de Stripe con la clave secreta: si el propio interesado
-- puede escribir el campo que le da acceso, el campo no vale nada.
--
-- CÓMO SE IMPIDE, y por qué con un disparador y no tocando las políticas:
-- las políticas de `profiles` ya existen y funcionan (el login y el premium
-- dependen de ellas). Reescribirlas para excluir tres columnas es fácil de
-- hacer mal y se rompe algo que hoy va bien. Un disparador se añade encima
-- sin tocar nada de lo que hay, y dice una sola cosa: estas dos columnas no
-- las cambia nadie que no sea service_role.
--
-- `num_colegiado` SÍ lo puede escribir la persona: es su solicitud, no su
-- acreditación. Declarar un número no enciende nada.
--
-- CÓMO SE ACREDITA A ALGUIEN (a mano, desde el SQL Editor de Supabase, que
-- usa service_role y por tanto se salta el disparador):
--
--     update public.profiles
--        set rol = 'profesional', rol_verificado_en = now()
--      where id = '<uuid>';
--
-- Y para retirarlo, rol_verificado_en = null. No caduca solo: lo quita una
-- persona.
--
-- Se ejecuta en Supabase -> SQL Editor. Es idempotente.
-- La app aguanta que esto no se haya ejecutado todavía: getPerfil hace
-- select('*'), las columnas no vienen, y nadie es profesional. Que es lo
-- correcto.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rol               TEXT NOT NULL DEFAULT 'tutor',
  ADD COLUMN IF NOT EXISTS num_colegiado     TEXT,
  ADD COLUMN IF NOT EXISTS rol_verificado_en TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.rol IS
  '''tutor'' o ''profesional''. Es lo que la persona PIDE. Por sí solo no '
  'enciende nada: hace falta además rol_verificado_en. Ver src/rol.js.';

COMMENT ON COLUMN public.profiles.num_colegiado IS
  'Número de colegiado declarado. Lo puede escribir la propia persona: es '
  'su solicitud. Se imprime en la pauta firmada SOLO si la cuenta está '
  'acreditada.';

COMMENT ON COLUMN public.profiles.rol_verificado_en IS
  'Cuándo se comprobó el número de colegiado, a mano. NULL = sin comprobar. '
  'Sólo lo escribe service_role: lo impide el disparador de abajo.';

-- ─── QUE NADIE SE ASCIENDA A SÍ MISMO ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.solo_service_role_toca_el_rol()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- El SQL Editor y el webhook entran como service_role: ahí sí se cambia.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- IS DISTINCT FROM y no <> : con <>, cualquier comparación contra NULL da
  -- NULL en vez de verdadero, y el disparador dejaría pasar justo el caso
  -- que importa -- pasar rol_verificado_en de NULL a una fecha.
  IF NEW.rol IS DISTINCT FROM OLD.rol
     OR NEW.rol_verificado_en IS DISTINCT FROM OLD.rol_verificado_en THEN
    RAISE EXCEPTION
      'El rol profesional no se puede cambiar desde la app: lo acredita una persona.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_el_rol ON public.profiles;
CREATE TRIGGER proteger_el_rol
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.solo_service_role_toca_el_rol();

COMMIT;

-- ─── COMPROBAR QUE HA IDO BIEN ──────────────────────────────────────────────
--
-- 1. Las columnas están y todo el mundo es 'tutor':
--      select rol, count(*) from public.profiles group by rol;
--
-- 2. El disparador está puesto:
--      select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass;
--
-- 3. LA QUE DE VERDAD IMPORTA — que un usuario normal NO puede ascenderse.
--    Esto no se puede comprobar desde el SQL Editor, porque ahí eres
--    service_role y el disparador te deja pasar a propósito. Hay que
--    probarlo desde la app, con una sesión de usuario de verdad: abrir la
--    consola del navegador estando dentro y ejecutar
--
--      await supabase.from('profiles')
--        .update({ rol: 'profesional', rol_verificado_en: new Date().toISOString() })
--        .eq('id', (await supabase.auth.getUser()).data.user.id)
--
--    Tiene que devolver error. Si devuelve ok, el disparador no está
--    haciendo su trabajo y NO se puede seguir con el resto del plan.
