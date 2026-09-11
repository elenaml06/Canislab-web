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
export const ACTIVIDAD_API = ["sedentario", "normal", "activo", "muy_activo", "trabajo"]

export function claveDeActividad(perfil) {
  const i = perfil?.actividadIdx
  return Number.isInteger(i) && ACTIVIDAD_API[i] ? ACTIVIDAD_API[i] : null
}
