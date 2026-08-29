#!/usr/bin/env node
// ─── EL RECORRIDO DE UN VETERINARIO, CONTRA LA BASE DE VERDAD ────────────────
//
// El hermano de `probar-recorrido.mjs`, para el otro modo. Comprueba lo que
// solo se puede comprobar contra Supabase de producción, porque depende de
// permisos de tabla, políticas y disparadores -- y el servidor de mentira no
// tiene nada de eso:
//
//   · Que la cuenta acreditada la lea como profesional la MISMA función que
//     usa la app (`rol.js`), y no una copia de la comprobación.
//   · Que se pueda dar de alta un paciente y marcarlo como tal.
//   · Que los datos del tutor se guarden (columnas de la fase 2).
//   · Que las dos listas NO SE MEZCLEN: en modo veterinario sus pacientes, en
//     modo tutor sus perros. Los dos llevan `user_id` = él, así que esa
//     columna no los distingue -- lo hace `accesos`, y si eso falla no da
//     ningún error: simplemente sale el perro donde no toca.
//   · Y que revocar un acceso deje de contarlo como paciente PERO no haga
//     desaparecer al perro ni borre la fila. Quién tuvo acceso y hasta cuándo
//     es justo el dato que hará falta el día que alguien pregunte.
//
// CÓMO SE EJECUTA, desde la carpeta del repo:
//
//     node scripts/probar-recorrido-veterinario.mjs
//
// Necesita RAWKU_PRUEBA_EMAIL_A / RAWKU_PRUEBA_PASSWORD_A en el entorno, y que
// ESA cuenta esté acreditada como profesional. Se acredita una sola vez desde
// el SQL Editor de Supabase:
//
//     update public.profiles set rol = 'profesional', rol_verificado_en = now()
//      where id = (select id from auth.users where email = '<el correo>');
//
// QUÉ DEJA DETRÁS: nada. Crea dos perros y un acceso y los borra al terminar,
// también si algo falla por el camino.
import { createClient } from '@supabase/supabase-js'
import { filaDePerro } from '../src/supabase.js'
import { repartirPerros, perrosDelModo } from '../src/pacientes.js'
import { esProfesional } from '../src/rol.js'

if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici')
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy))
  } catch { /* sin undici: si hay proxy, fallará al conectar y se dirá */ }
}

const URL = process.env.SUPABASE_URL || 'https://kvtkdpgpmrvwmvymyqof.supabase.co'
const ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2dGtkcGdwbXJ2d212eW15cW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNTY4OTEsImV4cCI6MjEwMjczMjg5MX0.-I339koFHO6TE2bf0ty9hNji-9CeH57AE0C4a2ZccYE'

const V = '\x1b[32m', R = '\x1b[31m', G = '\x1b[90m', F = '\x1b[0m'
let fallos = 0
const comprobar = (ok, que, detalle = '') => {
  console.log(`${ok ? V + '  OK  ' : R + ' FALLA '}${F} ${que}${detalle ? `\n${G}        ${detalle}${F}` : ''}`)
  if (!ok) fallos++
}
const nombres = (lista) => lista.map((p) => p.nombre).sort()

const fichaDe = (nombre, extra = {}) => ({
  nombre, pesoActual: '12', condicionIdx: 2, sexo: 'macho', esterilizado: 'no',
  actividadIdx: 1, dia: 1, mesIdx: 0, anio: 2021,
  alergiaSi: 'no', alergias: [], otrosEvitarSi: 'no', otrosEvitar: [],
  categoriasExcluidasSi: 'no', categoriasExcluidas: [],
  patologiaSi: 'no', patologias: [], ...extra,
})

const cli = createClient(URL, ANON)
const aBorrar = []
let userId = null

async function limpiar() {
  if (userId) await cli.from('accesos').delete().eq('profesional', userId)
  for (const id of aBorrar) await cli.from('perros').delete().eq('id', id)
}

try {
  const email = process.env.RAWKU_PRUEBA_EMAIL_A
  const password = process.env.RAWKU_PRUEBA_PASSWORD_A
  if (!email || !password) {
    console.error(`\n${R}Faltan RAWKU_PRUEBA_EMAIL_A y RAWKU_PRUEBA_PASSWORD_A en el entorno.${F}\n`)
    process.exit(2)
  }
  const { data: sesion, error: errLogin } = await cli.auth.signInWithPassword({ email, password })
  if (errLogin) throw new Error(`no se ha podido entrar: ${errLogin.message}`)
  userId = sesion.user.id
  console.log(`\n${G}Contra ${URL}${F}`)

  // ─── 1. LA ACREDITACIÓN, LEÍDA POR LA MISMA FUNCIÓN QUE USA LA APP ────────
  console.log('\n── LA ACREDITACIÓN ──')
  const { data: perfil } = await cli.from('profiles').select('*').eq('id', userId).single()
  const acreditado = esProfesional(perfil)
  comprobar(acreditado, 'la cuenta sale como profesional',
    `rol=${JSON.stringify(perfil?.rol)} verificado=${JSON.stringify(perfil?.rol_verificado_en)}`)
  if (!acreditado) {
    console.error(`\n${R}Sin acreditar no se puede seguir. Ver la cabecera de este archivo.${F}\n`)
    await limpiar(); process.exit(2)
  }

  // ─── 2. DAR DE ALTA UN PACIENTE ──────────────────────────────────────────
  console.log('\n── DAR DE ALTA UN PACIENTE ──')
  const filaPaciente = filaDePerro(userId, fichaDe('PacientePrueba'),
    { etapa: 'adulto', pesoAdultoEsperado: 12 })
  filaPaciente.tutor_nombre = 'María López'
  filaPaciente.tutor_contacto = '600 000 000'
  const { data: pac, error: errPac } =
    await cli.from('perros').insert(filaPaciente).select().single()
  comprobar(!errPac, 'se crea la ficha del paciente', errPac?.message || '')
  if (!pac) throw new Error('sin paciente no se puede seguir')
  aBorrar.push(pac.id)

  comprobar(pac.tutor_nombre === 'María López' && pac.tutor_contacto === '600 000 000',
    'los datos del tutor se guardan',
    `nombre=${JSON.stringify(pac.tutor_nombre)} contacto=${JSON.stringify(pac.tutor_contacto)}`)

  const { error: errAcc } = await cli.from('accesos').insert({
    perro_id: pac.id, profesional: userId,
    origen: 'creado_por_el_profesional', estado: 'activo',
  })
  // ⚠️ Esto falló en producción el 29 de agosto por FALTA DE GRANT sobre la
  // tabla, no por las políticas. Y fallaba en silencio: el alta seguía
  // adelante y el paciente acababa entre los perros del veterinario.
  comprobar(!errAcc, 'queda marcado como paciente', errAcc?.message || '')

  // ─── 3. LAS DOS LISTAS NO SE MEZCLAN ─────────────────────────────────────
  console.log('\n── LAS DOS LISTAS ──')
  const { data: propio } = await cli.from('perros').insert(
    filaDePerro(userId, fichaDe('PerroDelVeterinario', { sexo: 'hembra', esterilizado: 'si' }),
      { etapa: 'adulto', pesoAdultoEsperado: 20 })).select().single()
  if (propio) aBorrar.push(propio.id)

  const { data: perros } = await cli.from('perros').select('*').eq('user_id', userId)
  const { data: accesos } = await cli.from('accesos')
    .select('perro_id, estado, origen').eq('profesional', userId)
  const { mios, pacientes } = repartirPerros(perros, accesos)

  comprobar(nombres(pacientes).includes('PacientePrueba')
    && !nombres(pacientes).includes('PerroDelVeterinario'),
    'en modo veterinario salen sus pacientes', `pacientes: ${nombres(pacientes).join(', ')}`)
  comprobar(nombres(mios).includes('PerroDelVeterinario')
    && !nombres(mios).includes('PacientePrueba'),
    'en modo tutor salen sus perros', `propios: ${nombres(mios).join(', ')}`)
  comprobar(perrosDelModo(perros, accesos, true).length === pacientes.length,
    'perrosDelModo cuadra con el reparto')

  // ─── 4. REVOCAR ──────────────────────────────────────────────────────────
  console.log('\n── REVOCAR EL ACCESO ──')
  await cli.from('accesos')
    .update({ estado: 'revocado', revocado_en: new Date().toISOString() })
    .eq('perro_id', pac.id).eq('profesional', userId)
  const { data: tras } = await cli.from('accesos')
    .select('perro_id, estado').eq('profesional', userId)
  const reparto = repartirPerros(perros, tras)

  comprobar(!nombres(reparto.pacientes).includes('PacientePrueba'),
    'revocado deja de contar como paciente')
  // ⚠️ Y NO DESAPARECE. Un perro que se cae de las dos listas es un perro que
  // el veterinario ya no puede abrir, sin que nada se lo diga.
  comprobar(nombres(reparto.mios).includes('PacientePrueba'),
    'pero el perro NO desaparece de la app')
  comprobar((tras || []).some((a) => a.perro_id === pac.id),
    'la fila del acceso se conserva, no se borra')
} catch (err) {
  console.error(`\n${R}No se ha podido terminar:${F} ${err.message}\n`)
  await limpiar()
  process.exit(2)
}

await limpiar()
console.log(fallos === 0
  ? `\n${V}Recorrido de veterinario sin fallos.${F}\n`
  : `\n${R}${fallos} FALLOS.${F}\n`)
process.exit(fallos ? 1 : 0)
