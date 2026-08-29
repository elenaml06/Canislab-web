#!/usr/bin/env node
// ─── EL BCS, CONTRA LA BASE DE VERDAD ────────────────────────────────────────
//
// La columna `bcs` no existe hasta que alguien ejecuta la migración en el SQL
// Editor, y ése es justo el fallo que hay que cazar aquí: si no está,
// PostgREST responde 400 con "column perros.bcs does not exist" y la app se
// come el error -- el veterinario vería su BCS en pantalla y la ficha se
// guardaría sin él, en silencio. Es la misma familia que la fecha de
// nacimiento que se perdía (ver CLAUDE.md).
//
// Comprueba, con la cuenta de pruebas acreditada:
//   · que la columna existe y acepta un BCS 6 (que no es ninguno de los cinco
//     escalones del dueño, así que no puede colarse por casualidad);
//   · que vuelve tal cual al releer la fila;
//   · que el check de la base rechaza un valor imposible;
//   · y que el peso objetivo guardado es el que sale de ESE BCS.
//
// Necesita RAWKU_PRUEBA_EMAIL_A / RAWKU_PRUEBA_PASSWORD_A.
// No deja nada: borra el perro que crea, pase lo que pase.
import { createClient } from '@supabase/supabase-js'
import { filaDePerro } from '../src/supabase.js'
import { pesoIdealDesdeBcs } from '../src/bcs.js'

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

const cli = createClient(URL, ANON)
const aBorrar = []
async function limpiar() { for (const id of aBorrar) await cli.from('perros').delete().eq('id', id) }

try {
  const email = process.env.RAWKU_PRUEBA_EMAIL_A
  const password = process.env.RAWKU_PRUEBA_PASSWORD_A
  if (!email || !password) throw new Error('Faltan RAWKU_PRUEBA_EMAIL_A / _PASSWORD_A')
  const { data: sesion, error: errLogin } = await cli.auth.signInWithPassword({ email, password })
  if (errLogin) throw errLogin
  const userId = sesion.user.id
  console.log(`${G}Contra ${URL}${F}\n`)

  const ficha = {
    nombre: 'BCS de prueba', pesoActual: '30', condicionIdx: 3, bcs: 6,
    sexo: 'macho', esterilizado: 'no', actividadIdx: 1, dia: 1, mesIdx: 0, anio: 2021,
    pesoObjetivoKg: pesoIdealDesdeBcs(30, 6),
    alergiaSi: 'no', alergias: [], otrosEvitarSi: 'no', otrosEvitar: [],
    categoriasExcluidasSi: 'no', categoriasExcluidas: [],
    patologiaSi: 'no', patologias: [],
  }

  console.log('── LA COLUMNA EXISTE Y GUARDA ──')
  const { data: creado, error: errCrear } =
    await cli.from('perros').insert(filaDePerro(userId, ficha)).select().single()
  if (errCrear) {
    comprobar(false, 'se puede guardar un perro con BCS',
      `${errCrear.code}: ${errCrear.message} -- ¿falta ejecutar supabase/migracion-bcs.sql?`)
  } else {
    aBorrar.push(creado.id)
    comprobar(creado.bcs === 6, 'el BCS 6 se guarda tal cual', `bcs=${creado.bcs}`)
    comprobar(creado.condicion_idx === 3,
      'y el escalón del dueño queda derivado, no en blanco', `condicion_idx=${creado.condicion_idx}`)
    comprobar(Number(creado.peso_objetivo_kg) === 27.27,
      'el peso objetivo es el del BCS 6, no el del escalón redondeado',
      `guardado ${creado.peso_objetivo_kg} kg (con un 7 habrían sido 25)`)

    console.log('\n── Y VUELVE AL RELEER ──')
    const { data: leido } = await cli.from('perros').select('*').eq('id', creado.id).single()
    comprobar(leido?.bcs === 6, 'al releer la ficha sigue siendo un 6', `bcs=${leido?.bcs}`)

    console.log('\n── LA BASE RECHAZA LO IMPOSIBLE ──')
    const { error: errMal } = await cli.from('perros').update({ bcs: 12 }).eq('id', creado.id)
    comprobar(Boolean(errMal), 'un BCS 12 no entra (la escala llega a 9)',
      errMal ? `${errMal.code}: ${String(errMal.message).slice(0, 60)}` : 'SE GUARDÓ, y no debería')
    const { data: trasIntento } = await cli.from('perros').select('bcs').eq('id', creado.id).single()
    comprobar(trasIntento?.bcs === 6, 'y el valor bueno sigue ahí', `bcs=${trasIntento?.bcs}`)
  }
} catch (err) {
  comprobar(false, 'el recorrido ha reventado', String(err?.message || err))
} finally {
  await limpiar()
}

console.log(fallos === 0 ? `\n${V}El BCS llega a la base de verdad.${F}`
                         : `\n${R}${fallos} fallo(s).${F}`)
process.exit(fallos === 0 ? 0 : 1)
