-- ─── LA CLÍNICA QUE FIRMA: NOMBRE, CONTACTO Y LOGO ───────────────────────────
--
-- ⚠️ PEDIDO EXPRESO (8 de septiembre): la pauta tiene que poder imprimirse
-- «con el logo de la clínica», como hacen Nutrimenta, VetMenu o MyVetDiet.
-- En todos ellos el informe sale con la marca de quien lo firma, y no es
-- decoración: es lo que hace que el papel que se lleva el dueño a casa se
-- lea como un documento de esa clínica y no como la impresión de una app.
--
-- QUÉ SE GUARDA Y POR QUÉ AQUÍ. Van en `profiles`, junto al nombre y el
-- número de colegiado, porque son lo mismo: los datos de quien firma. No en
-- una tabla nueva -- una fila por persona, siempre -- y no en el navegador,
-- porque entonces se perderían al cambiar de ordenador, que es justo cuando
-- más falta hace que la pauta salga igual.
--
-- ⚠️ EL LOGO VA COMO data: URI EN UNA COLUMNA DE TEXTO, y no en Supabase
-- Storage. Es una decisión y tiene precio, así que va escrita:
--
--   A FAVOR. No hace falta bucket, ni políticas de acceso, ni URLs
--   firmadas, ni un segundo sitio del que el documento dependa. Y sobre
--   todo: la pauta firmada se congela ENTERA (ver migracion-pautas-firmadas
--   .sql). Un logo que viviera en Storage podría borrarse, y un documento
--   firmado tiene que seguir diciendo lo mismo dentro de un año -- también
--   cuando lo que cambia es de quién era la clínica.
--
--   EN CONTRA. Ocupa un 33 % más que el binario y viaja en cada `select *`
--   de `profiles`. Por eso la app lo redimensiona a 320 px de ancho antes de
--   guardarlo y rechaza lo que pase de 200 KB: un logo de cabecera a ese
--   tamaño son unos 20-40 KB, y eso cabe de sobra.
--
-- ⚠️ ESTAS TRES SÍ LAS EDITA SU DUEÑO, al revés que `rol` y
-- `rol_verificado_en`. El disparador `solo_service_role_toca_el_rol`
-- (migracion-rol-profesional.sql) nombra las columnas que protege una a una,
-- así que añadir columnas nuevas no lo toca: siguen protegidas las dos de
-- siempre y estas tres quedan libres, que es lo que se quiere. El nombre de
-- una clínica no acredita nada.
--
-- Se ejecuta en el SQL Editor de Supabase. Es idempotente: se puede volver a
-- lanzar sin romper nada.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clinica_nombre   TEXT,
  ADD COLUMN IF NOT EXISTS clinica_contacto TEXT,
  ADD COLUMN IF NOT EXISTS clinica_logo     TEXT;

COMMENT ON COLUMN public.profiles.clinica_nombre IS
  'Nombre de la clínica tal como sale impreso en la pauta firmada.';
COMMENT ON COLUMN public.profiles.clinica_contacto IS
  'Dirección, teléfono o correo: una línea, la que la clínica quiera en el pie.';
COMMENT ON COLUMN public.profiles.clinica_logo IS
  'El logo como data: URI (data:image/png;base64,...). La app lo redimensiona '
  'a 320 px de ancho y rechaza más de 200 KB. Va aquí y no en Storage para que '
  'un documento firmado no dependa de un archivo que alguien puede borrar.';

COMMIT;

-- ─── COMPROBAR QUE HA IDO BIEN ──────────────────────────────────────────────
--
-- 1. Las columnas están:
--      select column_name from information_schema.columns
--       where table_name = 'profiles' and column_name like 'clinica_%';
--
-- 2. Y su dueño puede escribirlas (esto SÍ tiene que funcionar; lo que no
--    puede funcionar es lo mismo con `rol`). Desde la consola del navegador,
--    con una sesión de verdad:
--
--      await supabase.from('profiles')
--        .update({ clinica_nombre: 'Prueba' })
--        .eq('id', (await supabase.auth.getUser()).data.user.id)
--
--    Si devuelve error, revisa que la política de UPDATE de `profiles`
--    existe (la trajo migracion-arreglar-permisos.sql).
