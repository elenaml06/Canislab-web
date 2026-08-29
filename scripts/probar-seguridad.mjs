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

async function crearCuenta(etiqueta) {
  const cliente = createClient(URL, ANON)
  const email = `prueba-rls-${sello()}@rawku.test`
  const password = `pr-${sello()}`
  const { data, error } = await cliente.auth.signUp({
    email, password, options: { data: { nombre: `Prueba RLS ${etiqueta}` } },
  })
  if (error) throw new Error(`no se ha podido registrar la cuenta ${etiqueta}: ${error.message}`)
  if (!data.session) {
    throw new Error(
      `el registro de ${etiqueta} no ha devuelto sesión: el proyecto pide confirmar el correo.\n` +
      `        Para poder ejecutar esto hay que apagar temporalmente "Confirm email" en\n` +
      `        Authentication -> Providers -> Email, y volver a encenderlo al terminar.`)
  }
  return { cliente, userId: data.user.id, email }
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

async function main() {
  console.log(`\n${G}Contra: ${URL}${F}`)
  console.log(`${G}Con la clave pública, o sea con los mismos permisos que cualquiera${F}\n`)
  await comprobarQueSeLlega()

  const a = await crearCuenta('A')
  const b = await crearCuenta('B')

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

  const abiertos = resultados.filter((r) => !r.ok)
  console.log('')
  if (abiertos.length === 0) {
    console.log(`${V}Todo cerrado: ${resultados.length} comprobaciones, ninguna abierta.${F}`)
  } else {
    console.log(`${R}${abiertos.length} de ${resultados.length} ABIERTAS:${F}`)
    for (const r of abiertos) console.log(`${R}  · ${r.titulo}${F}\n    ${r.detalle}`)
  }
  console.log(`\n${A}Han quedado 2 cuentas de usar y tirar que la clave pública no puede borrar.`)
  console.log(`Bórralas en Authentication -> Users filtrando por 'prueba-rls-':`)
  console.log(`  ${a.email}\n  ${b.email}${F}\n`)

  process.exit(abiertos.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(`\n${R}No se ha podido terminar:${F} ${err.message}\n`)
  process.exit(2)
})
