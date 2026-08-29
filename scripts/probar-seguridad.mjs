#!/usr/bin/env node
// ─── ¿QUÉ PUEDE HACER UNA CUENTA CUALQUIERA CONTRA LA BASE DE VERDAD? ────────
//
// POR QUÉ EXISTE. La batería de la app corre contra `tests/fake-supabase.js`,
// y eso está bien: es rápido, reproducible y no toca datos de nadie. Pero hay
// una familia entera de fallos que ese servidor NO PUEDE encontrar, porque el
// fake contesta lo que le decimos que conteste:
//
//   · Las políticas de seguridad por fila (RLS). Viven SOLO en el panel de
//     Supabase: ninguna prueba del repo las ve y ningún cambio pasa por
//     revisión.
//   · Los disparadores, como `proteger_el_rol`.
//   · Y la pregunta que de verdad importa: ¿puede la cuenta A tocar los datos
//     de la cuenta B?
//
// Desde el SQL Editor tampoco se puede comprobar: allí eres `service_role` y
// las políticas y los disparadores se saltan A PROPÓSITO, así que todo parece
// estar cerrado aunque esté abierto de par en par.
//
// CÓMO SE EJECUTA, desde la carpeta del repo:
//
//     node scripts/probar-seguridad.mjs
//
// Usa la URL y la clave PÚBLICA (anon) que ya van en el bundle de la app, así
// que no hace falta ningún secreto. Se pueden cambiar con SUPABASE_URL y
// SUPABASE_ANON_KEY.
//
// QUÉ HACE Y QUÉ NO
//   · NO toca ningún dato que ya exista. Solo lee para comprobar que NO puede.
//   · Crea DOS cuentas de usar y tirar y algún perro suyo, y borra los perros
//     al terminar.
//   · Las cuentas no se pueden borrar con la clave pública: se avisa al final
//     para barrerlas a mano desde Authentication -> Users filtrando por
//     'prueba-rls-'.
import { createClient } from '@supabase/supabase-js'

// ⚠️ EL `fetch` DE NODE NO USA HTTPS_PROXY (medido, Node 22). Si hay un proxy
// por medio -- como en las sesiones de Claude Code en la nube, o en cualquier
// red corporativa --, `curl` pasa y `fetch` NO: se va por otro camino, le
// contestan un 403 de texto plano, y el cliente de Supabase intenta leerlo
// como JSON y revienta con "Unexpected token 'H'", que no dice nada de esto.
// Se perdió un buen rato con ese error antes de dar con la causa.
//
// Se arregla enrutando fetch por el proxy a mano. Sin proxy en el entorno
// esto no hace nada y el script funciona igual.
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici')
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy))
  } catch {
    console.warn('[aviso] hay HTTPS_PROXY pero no se ha podido cargar undici: ' +
                 'si falla la conexion, instalalo con `npm install undici`.')
  }
}

const URL = process.env.SUPABASE_URL || 'https://kvtkdpgpmrvwmvymyqof.supabase.co'
const ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2dGtkcGdwbXJ2d212eW15cW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNTY4OTEsImV4cCI6MjEwMjczMjg5MX0.-I339koFHO6TE2bf0ty9hNji-9CeH57AE0C4a2ZccYE'

const V = '\x1b[32m', R = '\x1b[31m', A = '\x1b[33m', G = '\x1b[90m', F = '\x1b[0m'
const resultados = []
const aBorrar = []

function apuntar(ok, titulo, detalle) {
  resultados.push({ ok, titulo, detalle })
  const marca = ok ? `${V}  OK  ${F}` : `${R} ABIERTO ${F}`
  console.log(`${marca} ${titulo}`)
  if (detalle) console.log(`${G}        ${detalle}${F}`)
}

const sello = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// ⚠️ DOS CUENTAS FIJAS Y REUTILIZABLES, Y NO DE USAR Y TIRAR (29 agosto).
//
// La primera versión creaba cuentas nuevas con contraseña al azar en cada
// ejecución, y eso tenía dos problemas que solo se ven al segundo intento:
//
//   · No se podía volver a entrar con ellas -- la contraseña no se guardaba
//     en ninguna parte --, así que con "Confirm email" encendido, que es como
//     tiene que estar, la mitad de las comprobaciones se saltaba SIEMPRE.
//   · Y dejaban basura: dos cuentas muertas por ejecución.
//
// Ahora son dos cuentas con credenciales FIJAS, que se leen del entorno. Se
// crean una sola vez -- con "Confirm email" apagado un minuto -- y a partir de
// ahí se entra con ellas para siempre, porque una cuenta creada sin
// confirmación queda ya confirmada y volver a encenderla no la toca.
//
//     RAWKU_PRUEBA_EMAIL_A / RAWKU_PRUEBA_PASSWORD_A
//     RAWKU_PRUEBA_EMAIL_B / RAWKU_PRUEBA_PASSWORD_B
//
// Sin ellas, se vuelve al comportamiento de antes (cuentas nuevas al azar),
// que sirve la primera vez y con la confirmación apagada.
//
// ⚠️ NO SON CUENTAS DE NADIE. No tienen perros, ni menús, ni datos reales:
// existen solo para preguntarle a la base qué deja hacer. Aun así, la
// contraseña de un entorno la puede leer quien use ese entorno, así que estas
// credenciales no valen para nada más y no se reutilizan en ningún otro sitio.
const CUENTAS = {
  A: { email: process.env.RAWKU_PRUEBA_EMAIL_A, password: process.env.RAWKU_PRUEBA_PASSWORD_A },
  B: { email: process.env.RAWKU_PRUEBA_EMAIL_B, password: process.env.RAWKU_PRUEBA_PASSWORD_B },
}

async function crearCuenta(etiqueta) {
  const cliente = createClient(URL, ANON)
  const fija = CUENTAS[etiqueta]

  // 1. Si hay cuenta fija, se intenta ENTRAR. Es el camino normal.
  if (fija?.email && fija?.password) {
    const { data, error } = await cliente.auth.signInWithPassword({
      email: fija.email, password: fija.password,
    })
    if (!error && data.session) return { cliente, userId: data.user.id, email: fija.email, reutilizada: true }

    // 2. No existe todavía: se crea con ESAS credenciales, para que la
    //    próxima vez baste con entrar.
    const alta = await cliente.auth.signUp({
      email: fija.email, password: fija.password,
      options: { data: { nombre: `Prueba RLS ${etiqueta}` } },
    })
    if (alta.error) {
      throw new Error(
        `no se ha podido entrar ni crear la cuenta fija ${etiqueta} (${fija.email}): ` +
        `${error?.message || alta.error.message}`)
    }
    if (!alta.data.session) {
      throw new Error(
        `la cuenta fija ${etiqueta} no existía y el proyecto pide confirmar el correo,\n` +
        `        así que no se ha podido crear con sesión. Apaga "Confirm email" un minuto en\n` +
        `        Authentication -> Sign In / Providers -> Email, ejecuta esto UNA vez, y vuelve\n` +
        `        a encenderlo: la cuenta queda ya confirmada y no habrá que repetirlo.`)
    }
    return { cliente, userId: alta.data.user.id, email: fija.email, reutilizada: false }
  }

  // 3. Sin credenciales en el entorno: como antes, de usar y tirar.
  const email = `prueba-rls-${sello()}@pruebas.rawku.app`
  const password = `pr-${sello()}`
  const { data, error } = await cliente.auth.signUp({
    email, password, options: { data: { nombre: `Prueba RLS ${etiqueta}` } },
  })
  if (error) throw new Error(`no se ha podido registrar la cuenta ${etiqueta}: ${error.message}`)
  if (!data.session) {
    throw new Error(
      `el registro de ${etiqueta} no ha devuelto sesión: el proyecto pide confirmar el correo.\n` +
      `        Lo estable es poner RAWKU_PRUEBA_EMAIL_A/PASSWORD_A y _B en el entorno y crear\n` +
      `        las dos cuentas una sola vez. Ver el comentario de CUENTAS, arriba.`)
  }
  return { cliente, userId: data.user.id, email, reutilizada: false }
}

// Comprobar que se LLEGA, antes de nada. Si hay un proxy o un cortafuegos por
// medio, Supabase no contesta JSON y el cliente revienta con un error de
// sintaxis que no dice nada -- pasó al escribir esto, desde un contenedor con
// la salida a internet filtrada.
async function comprobarQueSeLlega() {
  let respuesta
  try {
    respuesta = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON } })
  } catch (err) {
    throw new Error(
      `no se llega a ${URL} desde aquí (${err.message}).\n` +
      `        Si estás en un contenedor o detrás de un proxy, ejecútalo desde tu ordenador.`)
  }
  const texto = await respuesta.text()
  if (!respuesta.ok || texto.trim().startsWith('Host not')) {
    throw new Error(
      `${URL} ha contestado algo que no es Supabase (HTTP ${respuesta.status}: ${texto.slice(0, 60)}).\n` +
      `        Casi seguro hay un proxy por medio. Ejecútalo desde tu ordenador.`)
  }
}

// ─── LO QUE VE UN DESCONOCIDO ────────────────────────────────────────────────
//
// Estas NO necesitan cuenta: son las que se pueden ejecutar siempre, y las
// más graves si fallan. La clave `anon` va dentro del bundle de la app, así
// que cualquiera que abra rawku.app la tiene. La pregunta es qué puede hacer
// con ella SIN registrarse.
async function loQueVeUnDesconocido() {
  for (const tabla of ['profiles', 'perros', 'menus', 'accesos']) {
    let filas = null, estado = 0
    try {
      const r = await fetch(`${URL}/rest/v1/${tabla}?select=*&limit=3`, { headers: { apikey: ANON } })
      estado = r.status
      const cuerpo = await r.text()
      try { const j = JSON.parse(cuerpo); if (Array.isArray(j)) filas = j.length } catch { /* no era JSON */ }
    } catch (err) {
      apuntar(false, `Sin cuenta no se lee ${tabla}`, `no se ha podido comprobar: ${err.message}`)
      continue
    }
    const leyoAlgo = filas !== null && filas > 0
    apuntar(!leyoAlgo, `Sin cuenta no se lee la tabla ${tabla}`,
      leyoAlgo ? `UN DESCONOCIDO HA LEÍDO ${filas} FILAS de ${tabla} con la clave pública.`
               : `HTTP ${estado}, sin datos`)
  }
}

async function main() {
  console.log(`\n${G}Contra: ${URL}${F}`)
  console.log(`${G}Con la clave pública, o sea con los mismos permisos que cualquiera${F}\n`)
  await comprobarQueSeLlega()

  // Primero lo que no necesita cuenta: si esto falla, lo demás da igual.
  await loQueVeUnDesconocido()

  let a, b
  try {
    a = await crearCuenta('A')
    b = await crearCuenta('B')
  } catch (err) {
    // ⚠️ NO SE TIRA TODO POR ESTO. Lo de arriba ya se ha comprobado y vale;
    // lo de abajo necesita sesión y se queda sin comprobar. Decirlo y salir
    // con lo que hay es más útil que perder el informe entero.
    console.log(`\n${A}No se han podido crear las cuentas de prueba, así que las`)
    console.log(`comprobaciones que necesitan sesión se quedan sin hacer:${F}`)
    console.log(`${G}  ${err.message}${F}`)
    resumir([])
    return
  }

  // ── EL DISPARADOR proteger_el_rol ─────────────────────────────────────────
  {
    // ⚠️ EL CASO QUE JUSTIFICA TODO EL DISPARADOR: con la clave pública que va
    // en el bundle y su propia sesión, cualquiera puede intentar esto desde la
    // consola del navegador. Si sale bien, el rol no acredita nada -- y de él
    // cuelga poder pautar por debajo de los mínimos de FEDIAF y firmar una
    // pauta con un número de colegiado.
    await a.cliente.from('profiles')
      .update({ rol: 'profesional', rol_verificado_en: new Date().toISOString() })
      .eq('id', a.userId)
    const { data } = await a.cliente.from('profiles')
      .select('rol, rol_verificado_en').eq('id', a.userId).single()
    const seAscendio = data?.rol === 'profesional' || Boolean(data?.rol_verificado_en)
    apuntar(!seAscendio, 'Una cuenta no puede ascenderse a profesional',
      seAscendio ? 'SE HA ASCENDIDO SOLA. El disparador proteger_el_rol no está puesto o no funciona.'
                 : 'el disparador rechaza tocar rol y rol_verificado_en')
  }

  {
    // El otro lado: pedirlo tiene que funcionar. Si el disparador bloqueara
    // también esto, nadie podría solicitar el modo desde la app.
    const { error } = await a.cliente.from('profiles')
      .update({ num_colegiado: 'COLVET-PRUEBA' }).eq('id', a.userId)
    apuntar(!error, 'Pero sí puede dejar su número de colegiado',
      error ? `BLOQUEA DE MÁS: ${error.message}. Nadie podría pedir el modo desde la app.` : null)
  }

  // ── EL DINERO ─────────────────────────────────────────────────────────────
  {
    // `plan` vive en la misma tabla y lo escribe el webhook de Stripe con la
    // clave SECRETA. Si una sesión normal puede escribirlo, cualquiera se pone
    // premium sin pagar. Hoy no hay nada cobrando, así que no es una urgencia
    // -- pero tiene que estar cerrado ANTES de abrir al público.
    await a.cliente.from('profiles')
      .update({ plan: 'premium', suscripcion_activa_hasta: '2099-01-01T00:00:00Z' })
      .eq('id', a.userId)
    const { data } = await a.cliente.from('profiles').select('plan').eq('id', a.userId).single()
    const seRegaloElPremium = data?.plan === 'premium'
    apuntar(!seRegaloElPremium, 'Una cuenta no puede regalarse el premium',
      seRegaloElPremium ? 'SE LO HA REGALADO. Falta una política que impida escribir `plan` desde una sesión de usuario.'
                        : 'la escritura de `plan` está cerrada')
  }

  // ── LOS DATOS DE OTRO ─────────────────────────────────────────────────────
  let perroDeB = null
  {
    const { data, error } = await b.cliente.from('perros')
      .insert({ user_id: b.userId, nombre: 'Perro de B' }).select().single()
    if (error) throw new Error(`B no ha podido crear su propio perro: ${error.message}`)
    perroDeB = data
    aBorrar.push({ cliente: b.cliente, tabla: 'perros', id: data.id })

    const { data: vistos } = await a.cliente.from('perros').select('id').eq('id', data.id)
    const loVe = (vistos || []).length > 0
    apuntar(!loVe, 'Una cuenta no ve los perros de otra',
      loVe ? 'LA CUENTA A VE UN PERRO DE LA CUENTA B.' : null)
  }

  {
    // ⚠️ LA QUE CIERRA LA FASE 3. Si esto sale bien, cualquiera se apunta como
    // profesional de cualquier perro y el acceso compartido no vale nada.
    const { error } = await a.cliente.from('accesos')
      .insert({ perro_id: perroDeB.id, profesional: a.userId, origen: 'creado_por_el_profesional' })
    apuntar(Boolean(error), 'Una cuenta no puede darse acceso al perro de otra',
      error ? null : 'SE HA DADO ACCESO. La política accesos_crear no está haciendo su trabajo.')
  }

  {
    // El otro lado, otra vez: si la política bloqueara de más, dar de alta a un
    // paciente fallaría y el veterinario se quedaría sin lista.
    const { data: perro, error: errPerro } = await a.cliente.from('perros')
      .insert({ user_id: a.userId, nombre: 'Paciente de A' }).select().single()
    if (errPerro) throw new Error(`A no ha podido crear su perro: ${errPerro.message}`)
    aBorrar.push({ cliente: a.cliente, tabla: 'perros', id: perro.id })

    const { error } = await a.cliente.from('accesos')
      .insert({ perro_id: perro.id, profesional: a.userId, origen: 'creado_por_el_profesional' })
    apuntar(!error, 'Pero sí puede marcar como paciente un perro suyo',
      error ? `BLOQUEA DE MÁS: ${error.message}. Un veterinario no podría dar de alta pacientes.` : null)
  }

  {
    const { data: menus } = await a.cliente.from('menus').select('id').eq('user_id', b.userId)
    const losVe = (menus || []).length > 0
    apuntar(!losVe, 'Una cuenta no ve los menús de otra',
      losVe ? 'LA CUENTA A VE MENÚS DE LA CUENTA B.' : null)
  }

  // ── LIMPIEZA ──────────────────────────────────────────────────────────────
  for (const { cliente, tabla, id } of aBorrar) {
    await cliente.from(tabla).delete().eq('id', id)
  }

  resumir([a, b].filter((c) => !c.reutilizada).map((c) => c.email))
}

function resumir(correosQueLimpiar) {
  const abiertos = resultados.filter((r) => !r.ok)
  console.log('')
  if (abiertos.length === 0) {
    console.log(`${V}Todo cerrado: ${resultados.length} comprobaciones, ninguna abierta.${F}`)
  } else {
    console.log(`${R}${abiertos.length} de ${resultados.length} ABIERTAS:${F}`)
    for (const r of abiertos) console.log(`${R}  · ${r.titulo}${F}\n    ${r.detalle}`)
  }
  if (correosQueLimpiar.length) {
    console.log(`\n${A}Han quedado ${correosQueLimpiar.length} cuentas de usar y tirar que la clave`)
    console.log(`pública no puede borrar. Bórralas en Authentication -> Users:`)
    for (const c of correosQueLimpiar) console.log(`  ${c}`)
    console.log(F)
  }
  process.exit(abiertos.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(`\n${R}No se ha podido terminar:${F} ${err.message}\n`)
  process.exit(2)
})
