-- ─── DOS AGUJEROS QUE ENCONTRÓ EL SCRIPT CONTRA LA BASE DE VERDAD ───────────
--
-- Los dos salieron el 29 de agosto ejecutando `node scripts/probar-seguridad.mjs`
-- contra Supabase de producción. Ninguno de los dos lo habría visto la batería
-- de la app, porque el servidor de mentira contesta lo que le decimos: no
-- tiene ni permisos de tabla ni disparadores.
--
-- ═══ 1. LA TABLA `accesos` NO TIENE PERMISOS: LA FASE 2 ESTÁ ROTA ═══════════
--
-- Medido: `permission denied for table accesos`, código 42501. Eso NO es la
-- seguridad por fila -- son los PERMISOS DE TABLA, que van por debajo. Da
-- igual lo buenas que sean las políticas si el rol no puede ni mirar la tabla.
--
-- Es la trampa que ya está escrita en CLAUDE.md, del revés:
--   «service_role se salta la seguridad por fila, pero NO los permisos de
--    tabla. Si una tabla se creó a mano, hace falta GRANT.»
-- `accesos` se creó a mano con SQL, así que le pasa lo mismo con los roles
-- `authenticated` y `anon`.
--
-- QUÉ ESTABA PASANDO EN LA APP, y es lo peor: al dar de alta un paciente,
-- `marcarComoPaciente` fallaba, el fallo se recogía en Sentry y NO se rompía
-- el alta -- a propósito, porque perder la ficha recién rellenada sería peor.
-- Resultado: el paciente se creaba pero NO quedaba marcado como paciente, así
-- que aparecía entre los perros del veterinario. Sin ningún error en pantalla.
--
-- Y HAY UNA VERDE FALSA QUE ESTO DESTAPA. En la comprobación de seguridad,
-- «una cuenta no puede darse acceso al perro de otra» salía OK -- pero no
-- porque la política funcionara: es que NADIE podía tocar la tabla. Con los
-- permisos puestos, esa comprobación vuelve a significar algo, y hay que
-- volver a ejecutarla.

GRANT SELECT, INSERT, UPDATE ON public.accesos TO authenticated;

-- Sin DELETE a propósito: un acceso no se borra, se revoca poniendo
-- estado = 'revocado'. Quién tuvo acceso y hasta cuándo es exactamente el dato
-- que hará falta el día que alguien pregunte.
--
-- Y sin nada para `anon`: sin sesión no hay a quién dar acceso ni de quién.

-- ═══ 2. CUALQUIERA SE PUEDE REGALAR EL PREMIUM ══════════════════════════════
--
-- Medido: una cuenta recién creada se puso `plan = 'premium'` ella sola, con
-- la clave pública que va dentro del bundle de la app. O sea, desde la consola
-- del navegador, cualquiera.
--
-- `plan` y `suscripcion_activa_hasta` los escribe el WEBHOOK DE STRIPE con la
-- clave secreta, nunca la app. Es el mismo argumento que el del rol: si el
-- propio interesado puede escribir el campo que le da acceso, el campo no
-- vale nada.
--
-- Hoy no hay nada cobrando, así que no es una urgencia -- pero tiene que estar
-- cerrado ANTES de abrir al público, y es justo la clase de cosa de la que
-- nadie se acuerda el día del lanzamiento.
--
-- Se arregla ampliando el disparador que ya existe en vez de añadir otro: una
-- sola función que protege las CUATRO columnas que dan acceso, para que no
-- puedan separarse.

CREATE OR REPLACE FUNCTION public.solo_service_role_toca_el_rol()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ⚠️ CORREGIDO (29 agosto) — SE BLOQUEA A LAS SESIONES DE USUARIO, NO SE
  -- PERMITE SOLO A service_role. Parece lo mismo y no lo es.
  --
  -- Antes decía `IF auth.role() = 'service_role' THEN RETURN NEW`, dando por
  -- hecho que el SQL Editor entra como service_role. NO ENTRA: ahí no hay
  -- ningún JWT, así que `auth.role()` vale NULL y el disparador saltaba.
  -- Resultado: NO SE PODÍA ACREDITAR A NADIE POR NINGÚN CAMINO -- ni desde la
  -- app (correcto) ni desde el SQL Editor (que es el camino bueno). La
  -- función de acreditar existía y no funcionaba.
  --
  -- El JWT solo puede traer tres roles, y los firma Supabase: 'anon' con la
  -- clave pública, 'authenticated' con la sesión de una persona, y
  -- 'service_role' con la secreta. Los dos primeros son el peligro; todo lo
  -- demás (SQL Editor, migraciones, service_role) es alguien que ya tiene la
  -- llave de la casa. Así que se nombra el peligro, que además es la lista
  -- cerrada, en vez de intentar nombrar todo lo que es de fiar.
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'anon' THEN
    RETURN NEW;
  END IF;

  -- IS DISTINCT FROM y no <> : con <>, cualquier comparación contra NULL da
  -- NULL en vez de verdadero, y el disparador dejaría pasar justo el caso que
  -- importa -- pasar un campo de NULL a un valor.
  IF NEW.rol IS DISTINCT FROM OLD.rol
     OR NEW.rol_verificado_en IS DISTINCT FROM OLD.rol_verificado_en THEN
    RAISE EXCEPTION
      'El rol profesional no se puede cambiar desde la app: lo acredita una persona.';
  END IF;

  -- ⚠️ AÑADIDO (29 agosto), tras medir que se podía. Lo escribe el webhook de
  -- Stripe con la clave secreta, nunca una sesión de usuario.
  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.suscripcion_activa_hasta IS DISTINCT FROM OLD.suscripcion_activa_hasta THEN
    RAISE EXCEPTION
      'El plan no se puede cambiar desde la app: lo escribe el pago.';
  END IF;

  RETURN NEW;
END;
$$;

-- El disparador ya existe desde la fase 0 y apunta a esta misma función, así
-- que con reemplazarla basta. Se vuelve a crear por si esto se ejecuta en un
-- proyecto donde la fase 0 no llegó a pasar.
DROP TRIGGER IF EXISTS proteger_el_rol ON public.profiles;
CREATE TRIGGER proteger_el_rol
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.solo_service_role_toca_el_rol();

-- ─── COMPROBARLO ────────────────────────────────────────────────────────────
--
-- Desde el SQL Editor NO se puede: allí eres service_role y el disparador te
-- deja pasar a propósito. Se comprueba con:
--
--     node scripts/probar-seguridad.mjs
--
-- Las once tienen que salir en verde. Antes de esto salían dos abiertas.
