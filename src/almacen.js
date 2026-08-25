// ─── EL ALMACÉN ───────────────────────────────────────────────────────────────
//
// Pedido expreso: "necesito poder entrar a la aplicación sin que me pidan
// iniciar sesión".
//
// La app entera funciona sin cuenta. Lo que decide dónde vive cada cosa es
// esto: si quien la usa tiene sesión de Supabase, todo va a Supabase como
// siempre; si no, va al navegador. Desde App.jsx no se nota la diferencia —
// las funciones se llaman igual, reciben lo mismo y devuelven filas con la
// MISMA forma.
//
// Que la forma sea la misma no es cosmético: es lo que hace que, el día que
// se cree la cuenta, migrar sea copiar filas. Si lo local y lo de Supabase
// tuvieran formas distintas, la migración perdería campos sin dar error —
// exactamente la familia de fallos de CLAUDE.md ("no se guardaban los datos
// del perro"): no se ve en pantalla y aparece días después.
//
// CUÁNDO SE DA DE ALTA EL USUARIO
// ──────────────────────────────
// Nunca por obligación, y nunca antes de que haya algo que perder. El orden
// es: usas la app → ves tu menú → y sólo entonces se ofrece la cuenta, para
// que lo que ya tienes no se quede en este móvil. Se puede ignorar.
//
// La cuenta hace falta de verdad para dos cosas, y las dos son de servidor:
// abrir la app desde otro móvil, y que los menús guardados sobrevivan a
// borrar los datos del navegador.
//
// Y al crearla NO se empieza de cero: lo que hay en el navegador sube a la
// cuenta (migrarLocalACuenta) y se borra de aquí. Sin eso, registrarse
// después de una semana de uso borraría esa semana.

import {
  filaDePerro,
  getPerros as getPerrosRemotos,
  guardarPerro as guardarPerroRemoto,
  eliminarPerro as eliminarPerroRemoto,
  getMenus as getMenusRemotos,
  guardarMenu as guardarMenuRemoto,
  eliminarMenu as eliminarMenuRemoto,
  esPremium as esPremiumRemoto,
} from './supabase'

// El usuario de mentira que representa "estoy usando la app sin cuenta".
// Tiene `id` porque media app hace `usuario.id` sin preguntar, y `local`
// para que quien necesite distinguirlo pueda.
export const ID_LOCAL = 'local'
export const USUARIO_LOCAL = { id: ID_LOCAL, local: true, email: null }

const CLAVE_PERROS = 'rawku.local.perros'
const CLAVE_MENUS = 'rawku.local.menus'
const CLAVE_SIN_CUENTA = 'rawku.local.sinCuenta'

// Las filas locales llevan el prefijo en el id. Así, funciones como
// eliminarPerro(perroId) o getMenus(perroId) — que no reciben el usuario —
// pueden saber a dónde tienen que ir mirando sólo el id.
const PREFIJO = 'local-'
export const esIdLocal = (id) => typeof id === 'string' && id.startsWith(PREFIJO)
export const esUsuarioLocal = (userId) => userId === ID_LOCAL || esIdLocal(userId)

// localStorage puede lanzar: modo privado de Safari, cuota llena, o un
// navegador con el almacenamiento bloqueado. Que falle no puede tumbar la
// app — como mucho, no se recuerda nada.
function leer(clave, porDefecto) {
  try {
    const bruto = window.localStorage.getItem(clave)
    if (!bruto) return porDefecto
    const valor = JSON.parse(bruto)
    return valor ?? porDefecto
  } catch {
    return porDefecto
  }
}

function escribir(clave, valor) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor))
    return true
  } catch {
    return false
  }
}

function nuevoId() {
  return `${PREFIJO}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── SIN CUENTA: ENTRAR Y SALIR ───────────────────────────────────────────────
// Se recuerda para que recargar la página no devuelva a la pantalla de
// login. Sin esto, cerrar y volver a abrir la app pediría cuenta otra vez y
// el "entrar sin cuenta" no serviría de nada.
export const estaSinCuenta = () => leer(CLAVE_SIN_CUENTA, false) === true
export const entrarSinCuenta = () => escribir(CLAVE_SIN_CUENTA, true)
export const salirDeSinCuenta = () => escribir(CLAVE_SIN_CUENTA, false)

export const perrosLocales = () => leer(CLAVE_PERROS, [])
export const menusLocales = () => leer(CLAVE_MENUS, [])
export const hayDatosLocales = () => perrosLocales().length > 0 || menusLocales().length > 0

// Se vacía SOLO después de haber subido todo (ver migrarLocalACuenta). Nunca
// antes: si la subida falla a mitad, lo que queda aquí es lo único que hay.
export function vaciarLocal() {
  try {
    window.localStorage.removeItem(CLAVE_PERROS)
    window.localStorage.removeItem(CLAVE_MENUS)
  } catch {
    /* si no se puede borrar, peor es dejar de funcionar */
  }
}

// ─── PERROS ───────────────────────────────────────────────────────────────────

export async function getPerros(userId) {
  if (!esUsuarioLocal(userId)) return getPerrosRemotos(userId)
  return perrosLocales()
}

export async function guardarPerro(userId, perfil, extras = {}) {
  if (!esUsuarioLocal(userId)) return guardarPerroRemoto(userId, perfil, extras)

  // Misma fila que iría a Supabase, con el user_id local.
  const fila = filaDePerro(ID_LOCAL, perfil, extras)
  const lista = perrosLocales()

  if (perfil.id && esIdLocal(perfil.id)) {
    const i = lista.findIndex((p) => p.id === perfil.id)
    // Si el perro que dicen editar ya no está (se borró en otra pestaña),
    // se crea en vez de perder la ficha recién rellenada.
    if (i === -1) {
      const creado = { ...fila, id: perfil.id, created_at: new Date().toISOString() }
      escribir(CLAVE_PERROS, [...lista, creado])
      return creado
    }
    const actualizado = { ...lista[i], ...fila, id: perfil.id }
    lista[i] = actualizado
    escribir(CLAVE_PERROS, lista)
    return actualizado
  }

  const creado = { ...fila, id: nuevoId(), created_at: new Date().toISOString() }
  escribir(CLAVE_PERROS, [...lista, creado])
  return creado
}

export async function eliminarPerro(perroId) {
  if (!esIdLocal(perroId)) return eliminarPerroRemoto(perroId)
  // Mismo orden que en Supabase: primero sus menús, luego el perro. Al
  // revés quedarían menús huérfanos, invisibles y para siempre.
  escribir(CLAVE_MENUS, menusLocales().filter((m) => m.perro_id !== perroId))
  escribir(CLAVE_PERROS, perrosLocales().filter((p) => p.id !== perroId))
}

// ─── MENÚS ────────────────────────────────────────────────────────────────────

export async function getMenus(perroId) {
  if (!esIdLocal(perroId)) return getMenusRemotos(perroId)
  return menusLocales()
    .filter((m) => m.perro_id === perroId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 20)
}

export async function guardarMenu(userId, perroId, datos) {
  if (!esUsuarioLocal(userId) && !esIdLocal(perroId)) {
    return guardarMenuRemoto(userId, perroId, datos)
  }
  const { modo, derReal, etapaLabel, menusData, numMenus, nombre } = datos
  const fila = {
    id: nuevoId(),
    user_id: ID_LOCAL,
    perro_id: perroId ?? null,
    modo,
    der_real: derReal,
    etapa_label: etapaLabel,
    menus_data: menusData,
    num_menus: numMenus ?? 1,
    nombre: nombre ?? null,
    created_at: new Date().toISOString(),
  }
  escribir(CLAVE_MENUS, [...menusLocales(), fila])
  return fila
}

export async function eliminarMenu(menuId) {
  if (!esIdLocal(menuId)) return eliminarMenuRemoto(menuId)
  escribir(CLAVE_MENUS, menusLocales().filter((m) => m.id !== menuId))
}

// ─── PREMIUM ──────────────────────────────────────────────────────────────────
// Sin cuenta no hay suscripción que consultar. Se responde que no, no que
// sí: el día que el muro de pago se vuelva a encender, "sin cuenta" no
// puede ser un agujero por el que colarse a lo de pago.
export async function esPremium(userId) {
  if (esUsuarioLocal(userId)) return false
  return esPremiumRemoto(userId)
}

// ─── MIGRAR AL CREAR LA CUENTA ────────────────────────────────────────────────
//
// Se llama al entrar con una cuenta de verdad teniendo cosas guardadas aquí.
// Sube perros y menús, y sólo entonces vacía lo local.
//
// Los menús se suben DESPUÉS de su perro y con el id nuevo que devuelve
// Supabase: el `perro_id` local (local-xxx) no existe allí, así que
// copiarlo tal cual dejaría los menús huérfanos — guardados, sin dar
// error, e invisibles para siempre porque getMenus filtra por perro.
//
// ⚠️ AÑADIDO (24 agosto) — NO SE DUPLICAN LOS QUE YA ESTÁN. CASO REAL:
// "estaba sin perfil creando a Cairo y eso, y luego he iniciado sesión, y
// tenía dos Cairo y un Rufo... porque en mi perfil ya tenía creado Cairo y
// Rufo".
//
// Esto subía TODOS los perros del navegador sin mirar si ya estaban en la
// cuenta, y el caso normal es justo ése: pruebas la app sin cuenta, haces
// tu perro, y entras en la cuenta que YA lo tiene. A partir de ahí tienes
// dos fichas del mismo animal, cada una con sus menús y sus pesos, y
// ninguna es "la buena".
//
// POR QUÉ SE QUEDA EL DE LA CUENTA Y NO EL DEL MÓVIL: el de la cuenta
// tiene historia -- menús guardados, pesos apuntados, una fecha de alta.
// El del móvil casi siempre es el de la prueba de esa tarde. Pisar el
// primero con el segundo sería cambiar datos buenos por datos de prueba.
//
// Y SE DICE. Lo del móvil NO sube, así que quien lo hizo tiene derecho a
// enterarse en el momento, no días después al no encontrar su ficha. Por
// eso se devuelve `noSubidos`, y quien llama lo enseña.
//
// Se compara por NOMBRE, normalizado (sin mayúsculas, sin acentos, sin
// espacios de sobra): es lo único que hay en común -- el id local no
// existe en Supabase. Dos perros distintos con el mismo nombre en la misma
// casa es raro; dos fichas del mismo perro, no.
const mismoNombre = (a, b) =>
  String(a || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') ===
  String(b || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export async function migrarLocalACuenta(userId) {
  if (!userId || esUsuarioLocal(userId)) return { perros: 0, menus: 0, noSubidos: [] }

  const perros = perrosLocales()
  const menus = menusLocales()
  if (perros.length === 0 && menus.length === 0) return { perros: 0, menus: 0, noSubidos: [] }

  // Los que ya hay en la cuenta. Si esto falla, se prefiere NO migrar a
  // migrar a ciegas: duplicar es peor que reintentar entrando otra vez, y
  // lo local no se borra hasta que todo ha subido.
  const yaEnLaCuenta = await getPerrosRemotos(userId)

  const equivalencias = new Map()
  const noSubidos = []
  let subidos = 0

  for (const p of perros) {
    const gemelo = (yaEnLaCuenta || []).find((q) => mismoNombre(q.nombre, p.nombre))
    if (gemelo) {
      // Sus menús locales van al perro de la cuenta: son del mismo animal.
      equivalencias.set(p.id, gemelo.id)
      noSubidos.push(p.nombre)
      continue
    }
    // Se pasa la FILA, no un perfil: guardarPerroRemoto vuelve a construirla
    // con filaDePerro, y esa función acepta tanto la forma de la app
    // (dia/mesIdx/anio, esterilizado, actividadIdx) como la ya guardada
    // (fecha_nacimiento, castrado, actividad) -- por eso se le pasan las dos
    // versiones de los campos que cambian de nombre.
    const creado = await guardarPerroRemoto(userId, {
      nombre: p.nombre,
      pesoActual: p.peso_actual,
      condicionIdx: p.condicion_idx,
      // ⚠️ Sin esta línea, al crear cuenta el perro subiría sin su peso
      // objetivo y la app se lo recalcularía desde el peso de ese día: el
      // perro que llevaba dos meses adelgazando volvería a empezar la
      // dieta desde cero. Es la misma familia de fallo que la fecha de
      // nacimiento que se perdía en silencio (ver CLAUDE.md).
      pesoObjetivoKg: p.peso_objetivo_kg,
      sexo: p.sexo,
      castrado: p.castrado,
      actividad: p.actividad,
      raza: p.raza,
      tamano: p.tamano,
      fechaNacimiento: p.fecha_nacimiento,
      alergiaSi: p.alergia_si,
      alergias: p.alergias,
      otrosEvitarSi: p.otros_evitar_si,
      otrosEvitar: p.otros_evitar,
      categoriasExcluidasSi: p.categorias_excluidas_si,
      categoriasExcluidas: p.categorias_excluidas,
      patologiaSi: p.patologia_si,
      patologias: p.patologias,
    }, {
      etapa: p.etapa,
      pesoAdultoEsperado: p.peso_adulto_esperado,
      dietaActual: p.dieta_actual,
    })
    equivalencias.set(p.id, creado.id)
    subidos += 1
  }

  let menusSubidos = 0
  for (const m of menus) {
    const perroNuevo = equivalencias.get(m.perro_id)
    if (!perroNuevo) continue   // menú de un perro ya borrado: no se sube
    await guardarMenuRemoto(userId, perroNuevo, {
      modo: m.modo,
      derReal: m.der_real,
      etapaLabel: m.etapa_label,
      menusData: m.menus_data,
      numMenus: m.num_menus,
      nombre: m.nombre,
    })
    menusSubidos += 1
  }

  vaciarLocal()
  salirDeSinCuenta()
  return { perros: subidos, menus: menusSubidos, noSubidos }
}
