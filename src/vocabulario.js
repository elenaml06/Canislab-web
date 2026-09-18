// ─── EL VOCABULARIO DEL MOTOR ────────────────────────────────────────────────
//
// Lógica pura, sin React en la parte de red, como `rol.js`, `modo.js`,
// `bcs.js` y `der.js`.
//
// ⚠️ POR QUÉ EXISTE (11 de septiembre de 2026)
//
// Elena, dos veces el mismo día:
//
//   «no hay que hacer que el motor coincida con lo de la app. hay que hacer que
//    la app coincida con lo del motor [...] si el motor dice que hay dieciocho
//    niveles de actividad, la app tiene que tener 18 niveles de actividad
//    porque si no no sirve de nada, y así con todo»
//
//   «esto tiene que ser para TODO, razas, tamaño, etapa, actividad, preguntas
//    para las patologias de veterinarios, todo....»
//
// `GET /vocabulario` sirve todo lo que el motor ENUMERA: los niveles de
// actividad, las 255 razas, los seis tamaños, las etapas, los nueve puntos de
// BCS, las patologías con quién puede marcarlas y qué pregunta falta, las
// categorías y los peldaños. Cada cosa con SUS DOS REGISTROS -- `dueno` y
// `veterinario` --, porque eso también lo pidió: «el vocabulario que usa la app
// en modo usuario tiene que ser entendible para el usuario y el que se usa en
// modo veterinario tiene que ser mas tecnico».
//
// ⚠️ ESTÁ EN SU PROPIO ARCHIVO Y NO EN `App.jsx` porque lo necesitan los dos:
// `App.jsx` para las listas de la ficha y `topespatologia.jsx` para las
// preguntas de cada patología. Importarlo de `App.jsx` sería un ciclo.
//
// UNA SOLA PETICIÓN POR SESIÓN, cacheada en una promesa de módulo. La API de
// Render duerme tras 15 minutos: si cada pantalla pidiera lo suyo, la primera
// vez del día se le mandarían cuatro despertares en vez de uno. Y no se
// reintenta -- unas listas de etiquetas no justifican insistirle a un servidor
// dormido, y quien las use tiene su respaldo comprobado contra el motor por
// `tests/vocabulario.spec.js`.
import { useEffect, useState } from 'react'
import { API_BASE, fetchConTimeout } from './api.js'

let _pedido = null
const _alLlegar = []

/** Registrar algo que hacer cuando llegue. Si ya llegó, se ejecuta ya. */
export function alLlegarVocabulario(fn) {
  _alLlegar.push(fn)
  if (_pedido) _pedido.then((v) => { if (v) fn(v) })
}

export function pedirVocabulario() {
  if (!_pedido) {
    _pedido = fetchConTimeout(`${API_BASE}/vocabulario`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        // Cada suscriptor por separado: si uno revienta, los demás siguen.
        // Un fallo instalando las razas no puede dejar sin etiquetas a la
        // pantalla de actividad.
        if (v) for (const fn of _alLlegar) { try { fn(v) } catch { /* nada */ } }
        return v
      })
      .catch(() => null)
  }
  return _pedido
}

// ─── EL CATÁLOGO DE ALIMENTOS, POR LA MISMA PUERTA ───────────────────────────
//
// ⚠️ AÑADIDO EL 12 DE SEPTIEMBRE DE 2026, POR LA NOCHE, y es LA LEY dicha por
// Elena: «NADA VIVA SOLO EN LA APP, TIENE QUE LLAMAR A COSAS QUE VIVAN EN EL
// MOTOR PARA QUE CUANDO SE CAMBIE ALGO SE APLIQUE Y LA APP LO PILLE DIRECTO.
// PARA TODO».
//
// El catálogo no cabe en `/vocabulario` -- son 163 alimentos con sus kcal --,
// así que va por `GET /alimentos`, que desde hoy manda las tres alturas:
// pantalla -> grupo -> alimentos, con la especie ya resuelta por el motor (la
// misma que usa para las alergias) y los títulos en los dos registros.
//
// EL CASO QUE LO PROVOCÓ: el aceite de salmón Pets Purest entró al catálogo el
// 7 de septiembre y el motor lo usa en 23 de los 216 menús precalculados, pero
// en la app no salía, porque la app pintaba su propia lista.
let _pedidoAlimentos = null
const _alLlegarAlimentos = []

export function alLlegarAlimentos(fn) {
  _alLlegarAlimentos.push(fn)
  if (_pedidoAlimentos) _pedidoAlimentos.then((v) => { if (v) fn(v) })
}

export function pedirAlimentos() {
  if (!_pedidoAlimentos) {
    _pedidoAlimentos = fetchConTimeout(`${API_BASE}/alimentos`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (v) for (const fn of _alLlegarAlimentos) { try { fn(v) } catch { /* nada */ } }
        return v
      })
      .catch(() => null)
  }
  return _pedidoAlimentos
}

/** Para las pruebas: dejar la caché como estaba. */
export function olvidarAlimentos() { _pedidoAlimentos = null }

export function useVocabulario() {
  const [vocab, setVocab] = useState(null)
  useEffect(() => {
    let vivo = true
    pedirVocabulario().then((v) => { if (vivo) setVocab(v) })
    return () => { vivo = false }
  }, [])
  return vocab
}

/** Para las pruebas: dejar la caché como estaba. */
export function olvidarVocabulario() { _pedido = null }

// ─── LAS CLAVES QUE VIAJAN AL MOTOR ──────────────────────────────────────────
//
// ⚠️ MOVIDAS AQUÍ DESDE `App.jsx` EL 11 DE SEPTIEMBRE DE 2026, y el motivo es
// un fallo real: `formulador.jsx` -- la pantalla del VETERINARIO -- no mandaba
// `actividad` ni `premios_nivel` en ninguna de sus llamadas a `/formular/*`.
// El generador del tutor sí los mandaba, porque el conversor vivía dentro de
// App.jsx y allí lo tenía a mano; el formulador no puede importar de App.jsx
// sin hacer un ciclo (App importa el formulador), así que se quedó sin ellos.
//
// La salida NO podía ser copiar la lista en el formulador: dos copias de las
// claves que entiende el motor son dos copias que se desincronizan, y con una
// clave que el motor no reconoce la petición se cae con un 422. Así que viven
// aquí, que es el módulo de «lo que el motor enumera», y lo importan los dos.
//
// El ORDEN importa: lo que viaja es la clave en la posición del índice que
// guarda la ficha (`actividadIdx`). Lo compara con `der.BASE_ACTIVIDAD` del
// repo del motor `tests/vocabulario.spec.js`.
export const ACTIVIDAD_API_RESPALDO = ["sedentario", "normal", "activo", "muy_activo", "trabajo"]

// ⚠️ Y LA QUE SE USA LA MANDA EL MOTOR (13 de septiembre de 2026). Un nivel de
// actividad se llama de TRES formas -- el índice 0-4 que guarda la ficha, la
// clave que viaja al motor, y la clave con la que se escribe en la base de
// datos, que NO es la misma (`sedentario` se guarda como `baja`) --, y esa
// traducción vivía solo aquí y en `supabase.js`. Si el motor añade un nivel o
// cambia el orden, traducimos por el índice viejo y un perro vuelve de la base
// de datos con OTRA actividad, o sea con otras kcal, sin error y con el menú en
// verde. Es la familia de `guardarPerro`: se ve bien y está mal guardado.
export let ACTIVIDAD_API = ACTIVIDAD_API_RESPALDO
export const ACTIVIDAD_EN_LA_BASE_DE_DATOS_RESPALDO = ["baja", "media", "alta", "muy_alta", "trabajo"]
export let ACTIVIDAD_EN_LA_BASE_DE_DATOS = ACTIVIDAD_EN_LA_BASE_DE_DATOS_RESPALDO

alLlegarVocabulario((v) => {
  const tres = v?.niveles_de_actividad?.los_tres_nombres
  if (!Array.isArray(tres) || tres.length === 0) return
  const enOrden = [...tres].sort((a, b) => a.indice - b.indice)
  if (enOrden.every((x) => x.clave_motor)) ACTIVIDAD_API = enOrden.map((x) => x.clave_motor)
  if (enOrden.every((x) => x.clave_base_de_datos)) {
    ACTIVIDAD_EN_LA_BASE_DE_DATOS = enOrden.map((x) => x.clave_base_de_datos)
  }
})

export function claveDeActividad(perfil) {
  const i = perfil?.actividadIdx
  return Number.isInteger(i) && ACTIVIDAD_API[i] ? ACTIVIDAD_API[i] : null
}

// ─── MARCAR UNA PATOLOGÍA PIDE DIAGNÓSTICO, NO SOSPECHA ──────────────────────
//
// ⚠️ Elena, 14 de septiembre de 2026: «solo deberíamos dejar marcar patologías
// si están prescritas por un veterinario, o sea, si un veterinario eso lo ha
// dicho, porque si yo digo, ay, es que creo que mi perro tiene colon irritable,
// y no lo sé, no podría generar un menú, ¿entiendes?».
//
// Y funcionaba tal cual: la pantalla enseñaba 23 de las 47 casillas y no
// preguntaba en ningún momento si había diagnóstico. Marcar «colitis» por una
// corazonada movía la fibra y la grasa de la ración de un perro que quizá no
// tiene nada.
//
// ⚠️ NO ES UNA CASILLA DE «ACEPTO». Son dos respuestas, y el «no» tiene
// consecuencia: la patología NO se marca. Un «acepto» lo pulsa todo el mundo
// sin leerlo, y entonces esto no protegería de nada.
//
// ⚠️ EL TEXTO LO MANDA EL MOTOR (regla 6): `preguntas_por_patologia.
// confirmacion_de_diagnostico` de `/vocabulario`. Esto de aquí es el RESPALDO
// para cuando Render duerme, no la fuente. Y quién la pide tampoco se decide
// aquí: sale de `pide_confirmacion_de_diagnostico`, que el motor DERIVA de
// `quien_puede_marcarla`.
export const CONFIRMACION_DIAGNOSTICO_RESPALDO = {
  pregunta: "¿Se lo ha diagnosticado un veterinario?",
  respuestas: [
    { clave: "si", texto: "Sí, tiene diagnóstico", se_marca: true },
    { clave: "no", texto: "No, es una sospecha mía", se_marca: false },
  ],
  si_dice_que_no: "Entonces mejor no le tocamos el menú por esto. Un menú ajustado a algo que tu "
    + "perro puede no tener le puede hacer más mal que bien. Coméntaselo a tu veterinario y, si "
    + "te lo confirma, vuelves y lo marcas.",
}

export let CONFIRMACION_DIAGNOSTICO = CONFIRMACION_DIAGNOSTICO_RESPALDO

alLlegarVocabulario((v) => {
  const servida = v?.preguntas_por_patologia?.confirmacion_de_diagnostico?.dueno
  // Se exige la pregunta Y las dos respuestas: con media servida se pintaría
  // un diálogo sin salida, que es peor que el respaldo entero.
  if (servida?.pregunta && Array.isArray(servida.respuestas) && servida.respuestas.length === 2) {
    CONFIRMACION_DIAGNOSTICO = {
      pregunta: servida.pregunta,
      respuestas: servida.respuestas,
      si_dice_que_no: servida.si_dice_que_no || CONFIRMACION_DIAGNOSTICO_RESPALDO.si_dice_que_no,
    }
  }
})

/**
 * ¿Esta casilla le pide al dueño que confirme que hay diagnóstico?
 *
 * Lo decide el MOTOR, y por TRES caminos antes de mirar nada de la app:
 *
 *   1. `pide_confirmacion_de_diagnostico`, que es la respuesta directa.
 *   2. `quien_puede_marcarla` de `preguntas_por_patologia`, de donde el motor
 *      la deriva -- así un motor que todavía no sirva el campo nuevo sigue
 *      mandando él.
 *   3. El mismo campo en `patologias.lista`, que es la otra puerta por la que
 *      ya viaja.
 *
 * Y solo si no ha llegado nada, el respaldo. Ahí se pide para TODO lo que no
 * sea de las cinco que se saben sin analítica: con Render dormido, el lado
 * seguro es preguntar de más, nunca dejar marcar de más.
 */
const SIN_ANALITICA_RESPALDO = ["dermatosis_zinc", "obesidad", "otra",
                               "raza_predispuesta_cobre", "riesgo_gdv"]

export function pideConfirmacionDeDiagnostico(clave, vocab) {
  const servido = vocab?.preguntas_por_patologia?.por_patologia?.[clave]
  if (servido && typeof servido.pide_confirmacion_de_diagnostico === "boolean") {
    return servido.pide_confirmacion_de_diagnostico
  }
  const quien = servido?.quien_puede_marcarla
    || (vocab?.patologias?.lista || []).find((p) => p?.clave === clave)?.quien_puede_marcarla
  if (quien) return quien === "dueno_con_diagnostico"
  return !SIN_ANALITICA_RESPALDO.includes(clave)
}

// ─── «OTRA COSA» NO ES UNA PATOLOGÍA: ES LA SALIDA ───────────────────────────
//
// ⚠️ Elena, 14 de septiembre de 2026: «¿y tiene sentido meter otra como
// patología???».
//
// No lo tiene. `otra` no es una condición: es la forma de decir «tiene algo que
// no está en vuestra lista», y lo que hace es QUITAR el menú automático. Esa
// función hace falta --sin ella, quien tiene un perro con algo raro genera el
// menú como si estuviera sano-- pero vivía como una casilla más, con nombre de
// diagnóstico, entre 46 enfermedades de verdad y agrupada por aparato. Quien la
// leía no tenía forma de saber que marcarla le dejaba sin menú.
//
// Se pinta al final de la pantalla, como lo que es. En el motor no cambia nada:
// misma clave, mismo `formulable: false`, mismo efecto.
export const SALIDA_PATOLOGIAS_RESPALDO = {
  clave: "otra",
  pregunta: "¿Tiene algo que no está en esta lista?",
  respuesta: "Sí, tiene otra cosa",
  que_pasa: "Entonces no te generamos un menú automático. No sabemos ajustarlo a lo que tiene, y "
    + "darte uno pensado para un perro sano sería peor que no darte ninguno. Háblalo con tu "
    + "veterinario, que puede pautarle la dieta a tu perro en concreto.",
}

export let SALIDA_PATOLOGIAS = SALIDA_PATOLOGIAS_RESPALDO

alLlegarVocabulario((v) => {
  const s = v?.patologias?.salida
  if (s?.clave && s?.dueno?.pregunta && s?.dueno?.respuesta) {
    SALIDA_PATOLOGIAS = {
      clave: s.clave,
      pregunta: s.dueno.pregunta,
      respuesta: s.dueno.respuesta,
      que_pasa: s.dueno.que_pasa || SALIDA_PATOLOGIAS_RESPALDO.que_pasa,
    }
  }
})

// ─── CRUDO O COCINADO ──────────────────────────────────────────────
//
// ⚠️ LA PIDIÓ ELENA Y ES UNA DECISIÓN DE LO QUE SE VA A COCINAR, NO DE LO QUE
// COME AHORA (17 de septiembre de 2026): «cuando va a seleccionar el número de
// días y todo eso, también puedo seleccionar qué le quiere dar de comer, barf o
// comida cocinada. Entonces si le quiere dar comida cocinada solo se tienen que
// poder generar el menú con lo de la comida cocinada».
//
// ⚠️ Y HAY QUE NO CONFUNDIRLA CON «¿QUÉ COME AHORA MISMO?», que está en esta
// MISMA pantalla, dos preguntas más arriba y con una respuesta que se llama
// igual («Comida cocinada»). Aquella es de dónde VIENE el perro y solo decide si
// hace falta plan de transición; ésta es lo que se le va a dar a partir de
// ahora, y decide el CATÁLOGO entero: en cocinado el hueso carnoso no es
// candidato — cocido astilla — y las fichas animales son las cocidas.
//
// Los textos y la lista de modos los sirve el motor (`modo_de_preparacion` de
// `GET /vocabulario`), regla 6. El respaldo es para cuando Render duerme.
export const MODOS_DE_PREPARACION_RESPALDO = [
  { clave: "crudo", label: "Cruda (BARF)",
    detalle: "carne, hueso carnoso y víscera crudos" },
  { clave: "cocinado", label: "Cocinada",
    detalle: "la carne y el pescado hervidos o al vapor, sin sal; sin hueso, porque cocido se astilla" },
];

export function opcionesDeModoDePreparacion(vocab, registro) {
  const servidos = vocab?.modo_de_preparacion?.modos;
  if (!Array.isArray(servidos) || servidos.length === 0) return MODOS_DE_PREPARACION_RESPALDO;
  return servidos
    .filter((m) => m?.clave)
    .map((m) => ({
      clave: m.clave,
      label: m?.[registro]?.titulo ?? m.clave,
      detalle: m?.[registro]?.ejemplo ?? m?.[registro]?.detalle ?? "",
    }));
}

// ⚠️ EL CALENDARIO DE LA TRANSICIÓN, del motor. Su respaldo es el mismo que
// estaba escrito aquí a mano, y se queda SOLO para cuando Render duerme: los
// cuatro tramos son la Tabla 1-1 de SACN5 y viven en `transicion.py`.
const TRAMOS_TRANSICION_RESPALDO = [
  { dias: 0, hasta: 3, nuevo_pct: 25, anterior_pct: 75 },
  { dias: 3, hasta: 6, nuevo_pct: 50, anterior_pct: 50 },
  { dias: 6, hasta: 9, nuevo_pct: 75, anterior_pct: 25 },
  { dias: 9, hasta: null, nuevo_pct: 100, anterior_pct: 0 },
];

function tramosDeTransicion(vocab) {
  const servidos = vocab?.transicion?.tramos;
  const tramos = Array.isArray(servidos) && servidos.length ? servidos : TRAMOS_TRANSICION_RESPALDO;
  return tramos.map((t) => ({
    ...t,
    // «Días 1-3», «Día 10 en adelante». Los días del motor cuentan desde 0.
    etiqueta: t.hasta == null
      ? `Día ${t.dias + 1} en adelante`
      : `Días ${t.dias + 1}-${t.hasta}`,
  }));
}

function ojoDeLaTransicion(vocab) {
  return vocab?.transicion?.dueno?.ojo
    || "Dáselo en tomas separadas, no mezclado en el mismo plato — se digieren a ritmos distintos.";
}

// Cómo se llama esta forma de dar de comer, para escribirla en una frase. Sale
// de la MISMA lista que pinta el selector, así que no hay dos nombres.
export function nombreDelModo(vocab, clave) {
  const op = opcionesDeModoDePreparacion(vocab, "dueno").find((m) => m.clave === clave);
  return op?.label || (clave === "cocinado" ? "cocinada" : "BARF");
}

// El modo por omisión lo dice el motor y no se escribe aquí: el día que cambie,
// una copia en la app dejaría a la app generando crudo mientras el motor cree
// que está cocinando.
export function modoDePreparacionPorOmision(vocab) {
  return vocab?.modo_de_preparacion?.por_omision || "crudo";
}

export function avisoDeModoCocinado(vocab) {
  return vocab?.modo_de_preparacion?.ojo || "";
}
