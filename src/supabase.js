import { createClient } from '@supabase/supabase-js'

// Se pueden sobreescribir por variable de entorno (VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY). Si no existen, se usan los valores de
// siempre, así el deploy de Vercel sigue funcionando sin tocar nada.
// Los tests automáticos las usan para apuntar a un Supabase de mentira
// levantado en local, sin rozar la base de datos real.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kvtkdpgpmrvwmvymyqof.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2dGtkcGdwbXJ2d212eW15cW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNTY4OTEsImV4cCI6MjEwMjczMjg5MX0.-I339koFHO6TE2bf0ty9hNji-9CeH57AE0C4a2ZccYE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

// ─── AUTH ────────────────────────────────────────────────────────────────────

export async function registrar(email, password, nombre) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre } },
  })
  if (error) throw error
  return data
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function recuperarPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/?reset=true',
  })
  if (error) throw error
}

// ⚠️ AÑADIDO (24 agosto) — AJUSTES DE CUENTA. Hasta ahora la única forma
// de cambiar la contraseña era el enlace de "olvidé mi contraseña", que
// obliga a salir de la app y abrir el correo. Estando ya dentro no tiene
// sentido: se cambia y ya.
export async function cambiarPassword(nueva) {
  const { error } = await supabase.auth.updateUser({ password: nueva })
  if (error) throw error
}

// Cambiar el correo NO es inmediato: Supabase manda un enlace de
// confirmación al correo NUEVO y hasta que se pulsa, la sesión sigue con
// el viejo. Quien llame a esto tiene que decirlo, o parecerá que no ha
// funcionado.
export async function cambiarCorreo(nuevo) {
  const { error } = await supabase.auth.updateUser({ email: nuevo })
  if (error) throw error
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
}

export async function getUsuarioActual() {
  const { data } = await supabase.auth.getUser()
  return data?.user ?? null
}

// ─── PERFIL ───────────────────────────────────────────────────────────────────

export async function getPerfil(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function esPremium(userId) {
  const perfil = await getPerfil(userId)
  if (!perfil) return false
  if (perfil.plan !== 'premium') return false
  if (!perfil.suscripcion_activa_hasta) return false
  return new Date(perfil.suscripcion_activa_hasta) > new Date()
}

// ─── PERROS ───────────────────────────────────────────────────────────────────

export async function getPerros(userId) {
  const { data, error } = await supabase
    .from('perros')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ⚠️ CORREGIDO (21 agosto) — FALLO GRAVE: LA FICHA DEL PERRO NO SE
// GUARDABA ENTERA.
//
// CASO REAL: "añadí a Ruffo y le puse diez años y seis meses; después de
// hacer el menú me coge la fecha de nacimiento de Cairo otra vez".
//
// No copiaba la fecha de nadie: es que NO GUARDABA NINGUNA. Este payload
// leía SIETE campos que en la app no existen con ese nombre --
// `perfil.fechaNacimiento`, `perfil.castrado`, `perfil.actividad`,
// `perfil.etapa`, `perfil.tamano`, `perfil.dietaActual`,
// `perfil.pesoAdultoEsperado`. La app los llama `dia`/`mesIdx`/`anio`,
// `esterilizado`, `actividadIdx`... Comprobado: cero apariciones de los
// siete en App.jsx. Así que se guardaban vacíos, en silencio, sin error.
//
// Al releer la ficha, sin fecha de nacimiento, se usaba el valor por
// defecto (15 de febrero del año en curso) — el MISMO para todos los
// perros de la cuenta, que es lo que parece "me ha copiado la fecha del
// otro".
//
// POR QUÉ ES GRAVE Y NO SOLO FEO: de la fecha de nacimiento sale la
// ETAPA, y de la etapa salen los 30 requisitos de FEDIAF. Un perro de
// diez años volvía como cachorro de seis meses, y se le calculaba el
// menú con los requisitos de un cachorro en crecimiento. Lo mismo con
// la esterilización y el nivel de actividad, que entran en las kcal.
//
// No tiene nada que ver con tener varios perros: pasaba con uno solo,
// en cada recarga. Con dos se nota porque los ves seguidos y se parecen.
//
// A partir de aquí esta función recibe la ficha TAL Y COMO LA TIENE LA
// APP y hace ella las conversiones. Sigue aceptando la forma antigua
// (fechaNacimiento, castrado, actividad) por si algún sitio la usa.
const ACTIVIDAD_POR_INDICE = ['baja', 'media', 'alta']

function fechaNacimientoISO(perfil) {
  if (perfil.fechaNacimiento) return perfil.fechaNacimiento   // forma antigua
  const { anio, mesIdx, dia } = perfil
  if (anio == null || mesIdx == null || dia == null) return null
  // En UTC a propósito: con la hora local, un 1 de mes en zonas al oeste
  // de Greenwich se guardaba como el último día del mes anterior.
  const d = new Date(Date.UTC(Number(anio), Number(mesIdx), Number(dia)))
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// ⚠️ SACADO A FUNCIÓN APARTE (23 agosto) — la construye también el
// almacén local (almacen.js), para que una ficha guardada SIN cuenta
// tenga exactamente la misma forma que una guardada con cuenta. Si las
// dos formas se separan, al crear la cuenta la migración perdería
// campos en silencio: justo la familia de fallos que no da error, no se
// ve en pantalla y aparece días después (ver CLAUDE.md).
export function filaDePerro(userId, perfil, extras = {}) {
  return {
    user_id: userId,
    nombre: perfil.nombre,
    peso_actual: perfil.pesoActual ? Number(perfil.pesoActual) : null,
    // etapa y peso adulto los calcula la app (necesitan la curva de
    // crecimiento), así que los pasa quien llama. Ninguno de los dos se
    // vuelve a leer para pintar la ficha -- se recalculan al cargar --
    // pero se guardan bien igualmente, que para eso está la columna.
    peso_adulto_esperado: extras.pesoAdultoEsperado ?? (perfil.pesoAdultoEsperado ? Number(perfil.pesoAdultoEsperado) : null),
    condicion_idx: perfil.condicionIdx ?? 2,
    etapa: extras.etapa ?? perfil.etapa ?? null,
    tamano: perfil.raza?.tamano || perfil.tamanoManual || perfil.tamano || null,
    sexo: perfil.sexo,
    castrado: perfil.castrado ?? (perfil.esterilizado === 'si'),
    actividad: perfil.actividad ?? ACTIVIDAD_POR_INDICE[perfil.actividadIdx ?? 1] ?? 'media',
    // ⚠️ CORREGIDO — aquí se guardaba el OBJETO entero de la raza
    // ({nombre, tamano, pesoMin, pesoMax, pesoMedio}) en una columna que
    // sólo debería llevar el nombre. Al releerlo salía texto ilegible en
    // la ficha del perro. Se acepta cualquiera de las dos formas para no
    // depender de cómo llame quien use esta función.
    raza: typeof perfil.raza === 'string' ? perfil.raza : (perfil.raza?.nombre ?? null),
    fecha_nacimiento: fechaNacimientoISO(perfil),
    dieta_actual: extras.dietaActual ?? perfil.dietaActual ?? null,
    alergia_si: perfil.alergiaSi,
    alergias: perfil.alergias ?? [],
    otros_evitar_si: perfil.otrosEvitarSi,
    otros_evitar: perfil.otrosEvitar ?? [],
    categorias_excluidas_si: perfil.categoriasExcluidasSi,
    categorias_excluidas: perfil.categoriasExcluidas ?? [],
    patologia_si: perfil.patologiaSi,
    patologias: perfil.patologias ?? [],
    updated_at: new Date().toISOString(),
  }
}

export async function guardarPerro(userId, perfil, extras = {}) {
  const payload = filaDePerro(userId, perfil, extras)

  if (perfil.id) {
    // actualizar perro existente
    const { data, error } = await supabase
      .from('perros')
      .update(payload)
      .eq('id', perfil.id)
      .select()
      .single()
    if (error) throw error
    return data
  } else {
    // crear perro nuevo
    const { data, error } = await supabase
      .from('perros')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  }
}

export async function eliminarPerro(perroId) {
  // ⚠️ Los menús NO se borran solos al borrar su perro: la tabla `menus`
  // no tiene borrado en cascada sobre `perros`. Cuando esto se hacía a
  // secas quedaban menús huérfanos, con un `perro_id` que ya no apunta a
  // nadie — invisibles para la app (getMenus filtra por perro) pero
  // ocupando sitio para siempre. Lo documentó la propia migración
  // supabase/migracion-menus-perro-id.sql: "son menús de cuentas que no
  // tienen ningún perro guardado (se borró el perro pero quedaron sus
  // menús). Esos no se pueden adoptar automáticamente".
  //
  // Se borran ANTES que el perro a propósito: si falla el borrado del
  // perro, los menús ya no están pero el perro sigue, que es un estado
  // raro pero recuperable. Al revés sería la basura silenciosa de antes.
  const { error: errorMenus } = await supabase
    .from('menus')
    .delete()
    .eq('perro_id', perroId)
  if (errorMenus) throw errorMenus

  const { error } = await supabase
    .from('perros')
    .delete()
    .eq('id', perroId)
  if (error) throw error
}

// ─── MENÚS ────────────────────────────────────────────────────────────────────

export async function getMenus(perroId) {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('perro_id', perroId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data ?? []
}

export async function guardarMenu(userId, perroId, { modo, derReal, etapaLabel, menusData, numMenus, nombre }) {
  const { data, error } = await supabase
    .from('menus')
    .insert({
      user_id: userId,
      perro_id: perroId,
      modo,
      der_real: derReal,
      etapa_label: etapaLabel,
      menus_data: menusData,
      num_menus: numMenus ?? 1,
      nombre: nombre ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function eliminarMenu(menuId) {
  const { error } = await supabase
    .from('menus')
    .delete()
    .eq('id', menuId)
  if (error) throw error
}
