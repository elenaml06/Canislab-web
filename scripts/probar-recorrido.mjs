#!/usr/bin/env node
// ─── EL RECORRIDO DE UNA USUARIA, CONTRA LA BASE Y LA API DE VERDAD ──────────
//
// POR QUÉ EXISTE, Y QUÉ NO CUBRE LA BATERÍA.
//
// `tests/ficha-ida-y-vuelta.spec.js` ya comprueba que la ficha del perro
// sobrevive a guardar y volver a cargar -- pero contra `fake-supabase.js`, que
// devuelve lo que le decimos. Si una COLUMNA de verdad tiene otro tipo, otro
// nombre, o directamente no existe, el fake no se entera y la prueba pasa.
//
// Esto hace el mismo recorrido contra Supabase de producción y contra la API
// en Render: guarda un perro con TODOS los campos que afectan a la comida
// puestos a valores distintos del defecto, lo relee, y compara columna por
// columna. Luego pide un menú de verdad con esos mismos datos y comprueba que
// se respetan las alergias, la categoría excluida y la patología.
//
// Es la familia de fallos de `guardarPerro`: siete campos que se guardaban
// vacíos en silencio, y de la fecha de nacimiento sale la etapa, y de la etapa
// los requisitos. Un perro de diez años volvía como cachorro.
//
// CÓMO SE EJECUTA, desde la carpeta del repo:
//
//     node scripts/probar-recorrido.mjs
//
// Necesita las credenciales de la cuenta de prueba en el entorno:
//     RAWKU_PRUEBA_EMAIL_A / RAWKU_PRUEBA_PASSWORD_A
// Ver `scripts/probar-seguridad.mjs` para cómo se crean, una sola vez.
//
// QUÉ DEJA DETRÁS: nada. Crea un perro y un menú y los borra al terminar,
// también si algo falla por el camino.
import { createClient } from '@supabase/supabase-js'
import { filaDePerro } from '../src/supabase.js'

// El fetch de Node no usa HTTPS_PROXY; ver el mismo aviso en probar-seguridad.
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici')
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy))
  } catch { /* sin undici: si hay proxy, fallará al conectar y se dirá */ }
}

const URL = process.env.SUPABASE_URL || 'https://kvtkdpgpmrvwmvymyqof.supabase.co'
const ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2dGtkcGdwbXJ2d212eW15cW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNTY4OTEsImV4cCI6MjEwMjczMjg5MX0.-I339koFHO6TE2bf0ty9hNji-9CeH57AE0C4a2ZccYE'
const API = process.env.API_BASE || 'https://canislab-api.onrender.com'

const V = '\x1b[32m', R = '\x1b[31m', G = '\x1b[90m', F = '\x1b[0m'
let fallos = 0
const comprobar = (ok, que, detalle = '') => {
  console.log(`${ok ? V + '  OK  ' : R + ' FALLA '}${F} ${que}${detalle ? `\n${G}        ${detalle}${F}` : ''}`)
  if (!ok) fallos++
}

// ⚠️ TODOS DISTINTOS DEL VALOR POR DEFECTO, a propósito. Si un campo se
// perdiera y la app cayera a su defecto, con valores por defecto no se notaría
// -- que es exactamente como el fallo de guardarPerro pasó desapercibido.
const PERFIL = {
  nombre: 'PruebaRecorrido', pesoActual: '18.4', condicionIdx: 3, pesoObjetivoKg: 15.5,
  sexo: 'hembra', esterilizado: 'si', actividadIdx: 2,
  raza: { nombre: 'Border Collie', tamano: 'Mediano' },
  dia: 14, mesIdx: 4, anio: 2019,
  dietaActual: 'pienso',
  alergiaSi: 'si', alergias: ['Pollo'],
  otrosEvitarSi: 'si', otrosEvitar: ['Cerdo'],
  categoriasExcluidasSi: 'si', categoriasExcluidas: ['Hueso carnoso'],
  patologiaSi: 'si', patologias: ['renal'],
}

const cli = createClient(URL, ANON)
let perroId = null, menuId = null

async function limpiar() {
  if (menuId) await cli.from('menus').delete().eq('id', menuId)
  if (perroId) await cli.from('perros').delete().eq('id', perroId)
}

try {
  const email = process.env.RAWKU_PRUEBA_EMAIL_A
  const password = process.env.RAWKU_PRUEBA_PASSWORD_A
  if (!email || !password) {
    console.error(`\n${R}Faltan RAWKU_PRUEBA_EMAIL_A y RAWKU_PRUEBA_PASSWORD_A en el entorno.${F}\n`)
    process.exit(2)
  }
  const { data: sesion, error: errLogin } = await cli.auth.signInWithPassword({ email, password })
  if (errLogin) throw new Error(`no se ha podido entrar con la cuenta de prueba: ${errLogin.message}`)
  const userId = sesion.user.id
  console.log(`\n${G}Contra ${URL}\n        y ${API}${F}`)

  // ─── 1. LA FICHA, IDA Y VUELTA ────────────────────────────────────────────
  console.log('\n── LA FICHA DEL PERRO, COLUMNA POR COLUMNA ──')
  const fila = filaDePerro(userId, PERFIL,
    { etapa: 'adulto', pesoAdultoEsperado: 20, dietaActual: 'pienso' })
  const { data: guardado, error: errGuardar } =
    await cli.from('perros').insert(fila).select().single()
  if (errGuardar) throw new Error(`no se ha podido guardar el perro: ${errGuardar.message}`)
  perroId = guardado.id

  const { data: leido } = await cli.from('perros').select('*').eq('id', perroId).single()
  for (const [columna, esperado] of Object.entries(fila)) {
    if (columna === 'updated_at') continue   // lo pone la propia escritura
    const igual = JSON.stringify(leido[columna]) === JSON.stringify(esperado)
    comprobar(igual, columna,
      igual ? '' : `guardado ${JSON.stringify(esperado)} → leído ${JSON.stringify(leido[columna])}`)
  }

  // ─── 2. EL MENÚ, CON LOS DATOS DE ESE PERRO ───────────────────────────────
  console.log('\n── EL MENÚ, CON LAS RESTRICCIONES DE ESE PERRO ──')
  const r = await fetch(`${API}/menu/v2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modo: 'automatico', nombres_alimentos: [], der_objetivo: 900,
      etapa_requisitos: 'Adulto', peso_perro_kg: 18.4, peso_adulto_esperado_kg: 20,
      especies_excluidas: ['Pollo', 'Cerdo'],
      categorias_excluidas: ['Hueso carnoso'],
      patologias: ['renal'],
    }),
  })
  const menu = await r.json()
  comprobar(menu.factible === true,
    'sale menú con alergia + exclusión + categoría fuera + renal', menu.motivo || '')

  if (menu.factible) {
    const f = menu.ficha || {}
    comprobar(f.semaforo === 'verde', `semáforo verde (${f.correctos}/${f.total})`)
    const nombres = Object.keys(menu.menu || {})
    // ⚠️ Se comprueba por NOMBRE y no por categoría a propósito: la exclusión
    // por especie tiene que arrastrar a la familia entera (excluir "pollo"
    // quita también "gallina"), y eso solo se ve mirando lo que hay en el plato.
    const pega = (re) => nombres.filter((n) => re.test(n))
    const conPollo = pega(/pollo|gallina/i)
    const conCerdo = pega(/cerdo|porcino/i)
    const conHueso = pega(/hueso carnoso|cuello|carcasa|ala de/i)
    comprobar(conPollo.length === 0, 'la alergia al pollo se respeta', conPollo.join(', '))
    comprobar(conCerdo.length === 0, 'la exclusión del cerdo se respeta', conCerdo.join(', '))
    comprobar(conHueso.length === 0, 'la categoría excluida se respeta', conHueso.join(', '))
    console.log(`${G}        ${nombres.join(', ')}${F}`)
    console.log(`${G}        ${f.kcal} kcal reales de 900 pedidas, ${f.gramos} g${F}`)
  }

  // ─── 3. EL MENÚ GUARDADO ──────────────────────────────────────────────────
  console.log('\n── GUARDAR Y RELEER EL MENÚ ──')
  const { data: menuGuardado, error: errMenu } = await cli.from('menus').insert({
    user_id: userId, perro_id: perroId, creado_por: userId,
    menus_data: [{ nombre: 'Menú 1', gramos: menu.menu || {} }], num_menus: 1,
  }).select().single()
  comprobar(!errMenu, 'se guarda el menú', errMenu?.message || '')
  if (menuGuardado) {
    menuId = menuGuardado.id
    const { data: releidos } = await cli.from('menus').select('*').eq('perro_id', perroId)
    comprobar((releidos || []).length === 1, 'se relee filtrando por perro_id')
    // ⚠️ Esta columna estuvo creada y SIN RELLENAR: existía valiendo NULL
    // siempre, que es la peor forma de tener algo -- parece hecho.
    comprobar(menuGuardado.creado_por === userId, 'creado_por lleva quién lo generó',
      menuGuardado.creado_por === userId ? '' : `vale ${JSON.stringify(menuGuardado.creado_por)}`)
  }
} catch (err) {
  console.error(`\n${R}No se ha podido terminar:${F} ${err.message}\n`)
  await limpiar()
  process.exit(2)
}

await limpiar()
console.log(fallos === 0
  ? `\n${V}Recorrido completo sin fallos.${F}\n`
  : `\n${R}${fallos} FALLOS.${F}\n`)
process.exit(fallos ? 1 : 0)
