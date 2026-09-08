// ─── QUÉ LE CAMBIA AL MOTOR CADA PATOLOGÍA ───────────────────────────────────
//
// ⚠️ PEDIDO EXPRESO (7 septiembre): «cuando pones una patología, ¿te debería
// dar algo cuando estás como veterinario? ¿Te debería salir algo sobre esa
// patología? Qué cambia, qué no, qué puedes modificar y qué no, de qué
// margen puede salir».
//
// Hasta hoy, marcar «Insuficiencia renal crónica» pintaba una casilla y nada
// más. Por dentro el solver le mete un tope de 1200 mg de fósforo por 1000
// kcal, y ese número —con su fuente, su motivo y lo cerca que queda del
// mínimo de FEDIAF (1160)— es lo que decide si el menú sale o no sale. Quien
// FIRMA una pauta con su número de colegiado tiene derecho a leerlo antes de
// firmarla. Es la fase 1 de VETERINARIOS.md: ver más, no poder más.
//
// ⚠️ LOS NÚMEROS NO ESTÁN ESCRITOS AQUÍ, y es a propósito. Vienen de
// `GET /patologias`, que los lee de `patologias.json` —el mismo archivo que
// aplica el solver—. Copiarlos a la app sería la tercera copia de la misma
// tabla, y de esas ya sabemos cómo acaban: es la duplicación del DER, y es
// la tabla desincronizada que arrastraba el `POST /menu` borrado el 26 de
// agosto (fósforo renal a 1.400 en vez de 1.200, durante semanas, sin que
// saltara nada).
//
// ⚠️ Y SI LA API NO CONTESTA, NO PASA NADA. Esto es información de más: si
// falla, no se pinta y el resto de la ficha sigue funcionando igual. Un
// bloque informativo no puede tirar la pantalla donde se da de alta a un
// paciente.
import { useEffect, useState } from 'react'
import { API_BASE, fetchConTimeout } from './api.js'

const VIOLETA = '#5A4088'
const ROSA = '#FF6F91'
const TINTA = '#231539'
const MALVA = '#9A8CB8'
const VERDE = '#2F6B4F'

const fontDisplay = '"Georgia", serif'
const fontBody = '"DM Sans", sans-serif'
const fontMono = 'monospace'

// La tabla entera son ~40 filas y no cambia entre pantallas: se pide UNA vez
// por sesión y se queda aquí. Sin esto, abrir y cerrar la ficha volvería a
// pedirla cada vez.
let cache = null
let enVuelo = null

export function cargarTopesDePatologias() {
  if (cache) return Promise.resolve(cache)
  if (enVuelo) return enVuelo
  enVuelo = fetchConTimeout(`${API_BASE}/patologias`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      // Una API vieja (todavía sin este endpoint) devuelve 404: eso no es un
      // error que haya que enseñar, es una versión anterior desplegada.
      cache = d && d.patologias ? d : { unidad: '', patologias: {} }
      return cache
    })
    .catch(() => ({ unidad: '', patologias: {} }))
    .finally(() => { enVuelo = null })
  return enVuelo
}

// Para las pruebas: dejar la caché como estaba.
export function olvidarTopesDePatologias() { cache = null; enVuelo = null }

const NOMBRE_NUTRIENTE = {
  proteina: 'Proteína', grasa: 'Grasa', calcio: 'Calcio', fosforo: 'Fósforo',
  potasio: 'Potasio', sodio: 'Sodio', cloruro: 'Cloruro', magnesio: 'Magnesio',
  cobre: 'Cobre', yodo: 'Yodo', hierro: 'Hierro', manganeso: 'Manganeso',
  selenio: 'Selenio', zinc: 'Zinc', vitA: 'Vitamina A', vitD: 'Vitamina D',
  vitE: 'Vitamina E', tiamina: 'Tiamina', riboflavina: 'Riboflavina',
  acidoPantotenico: 'Ácido pantoténico', vitB6: 'Vitamina B6', vitB12: 'Vitamina B12',
  niacina: 'Niacina', folato: 'Folato', colina: 'Colina', linoleico: 'Linoleico (ω-6)',
  linolenico: 'Linolénico (ω-3)', araquidonico: 'Araquidónico', epa_dha: 'EPA + DHA',
  fibra: 'Fibra', purinas: 'Purinas',
}

const nombreDe = (clave) => NOMBRE_NUTRIENTE[clave] || clave

// Los números se enseñan con los decimales que hagan falta y no más: 1200 y
// no 1200,00; 14,19 y no 14,1875. Un tope con seis decimales en pantalla se
// lee como ruido, no como precisión.
function cifra(v) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

function Limite({ l, esTope }) {
  const referencia = esTope ? l.minimo_fediaf_adulto : l.maximo_fediaf_adulto
  // ⚠️ EL MARGEN ES LA PREGUNTA DE VERDAD («de qué margen puede salir»).
  // Un tope de 1200 con el mínimo de FEDIAF en 1160 deja un 3,4 % de sitio:
  // ahí el menú casi no se puede mover, y saberlo ANTES de formular es la
  // diferencia entre entender por qué no sale menú y creer que está roto.
  const estrecho = l.margen_pct !== null && l.margen_pct !== undefined && l.margen_pct < 10
  return (
    <div className="rounded-xl px-3 py-2.5 mb-1.5"
         style={{ background: '#FFFFFF', border: '1.5px solid #E3DAF0' }}>
      <p style={{ color: TINTA, fontFamily: fontBody, fontSize: 14, fontWeight: 600 }}>
        {nombreDe(l.nutriente)} {esTope ? '≤' : '≥'} {cifra(l.valor)} {l.unidad}/1000 kcal
      </p>
      {referencia !== null && referencia !== undefined && (
        <p className="text-[11px] mt-0.5" style={{ color: estrecho ? ROSA : MALVA, fontFamily: fontBody }}>
          FEDIAF {esTope ? 'pide un mínimo de' : 'pone el máximo en'} {cifra(referencia)} {l.unidad}
          {l.margen_pct !== null && l.margen_pct !== undefined && (
            <> · queda un {cifra(Math.abs(l.margen_pct))} % de margen
              {l.margen_pct < 0 && ' POR DEBAJO del mínimo: es una dieta de prescripción'}</>
          )}
        </p>
      )}
      {l.fuente && (
        <p className="text-[10px] mt-1 leading-snug" style={{ color: MALVA, fontFamily: fontMono }}>
          {l.fuente}
        </p>
      )}
      {l.por_que && (
        <details className="mt-1">
          <summary className="text-[11px] cursor-pointer" style={{ color: VIOLETA, fontFamily: fontBody }}>
            Por qué este número
          </summary>
          <p className="text-[11px] mt-1 leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
            {l.por_que}
          </p>
        </details>
      )}
    </div>
  )
}

/**
 * `claves` son las patologías tal como viajan al backend (ya resueltas a su
 * subtipo: `renal_avanzada`, `cardiopatia_b2`...), no las cabeceras de
 * familia que se pintan en la casilla. Ver `FAMILIAS_PATOLOGIA` en App.jsx.
 */
export default function QueCambiaLaPatologia({ claves = [], titulo = 'Lo que le cambia al motor' }) {
  const [tabla, setTabla] = useState(null)
  const cuantas = (claves || []).length

  useEffect(() => {
    if (cuantas === 0) return
    let vivo = true
    cargarTopesDePatologias().then((d) => { if (vivo) setTabla(d) })
    return () => { vivo = false }
  }, [cuantas])

  if (cuantas === 0 || !tabla) return null

  const fichas = claves.map((k) => [k, tabla.patologias[k]]).filter(([, p]) => p)
  if (fichas.length === 0) return null

  return (
    <div className="rounded-2xl px-4 py-4 mt-3"
         style={{ background: '#F4F0FB', border: '1px solid #DCD2F0' }}>
      <p className="text-[11px] tracking-[0.14em] uppercase mb-2"
         style={{ color: VIOLETA, fontFamily: fontMono }}>{titulo}</p>

      {fichas.map(([clave, p]) => {
        // Techos y suelos juntos: al veterinario le da igual por dentro cuál
        // es cuál, lo que lee es qué puede mover y hasta dónde. Solo entran
        // los que traen margen escrito -- si algún día se añade un tope y se
        // olvida el margen, aquí no aparece en vez de salir un texto vacío,
        // y el BLOQUE 51 de la batería de la API lo caza antes.
        const margenes = [...p.topes, ...p.suelos]
          .map((l) => ({ l, m: l.margen_del_profesional }))
          .filter(({ m }) => m && (m.criterio || '').trim())
        return (
        <div key={clave} className="mb-3 last:mb-0">
          <p className="mb-1.5" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
            {p.nombre}
          </p>

          {p.topes.length === 0 && p.suelos.length === 0 && (
            // Hay patologías sin ningún tope numérico: lo que cambian es qué
            // alimentos entran, o nada en absoluto. Decirlo es más honesto
            // que no pintar nada y dejar creer que sí ajusta algo.
            <p className="text-xs leading-snug mb-1.5" style={{ color: MALVA, fontFamily: fontBody }}>
              No mueve ningún límite numérico del menú
              {p.excluye_fruta && ', pero deja fuera la fruta'}
              {p.nota ? `. ${p.nota}` : '.'}
            </p>
          )}
          {/* Los márgenes de los dos lados juntos: al veterinario le da igual
              si por dentro es un techo o un suelo, lo que lee es qué puede
              mover y hasta dónde. */}
          {p.topes.map((l) => <Limite key={`t-${l.nutriente}`} l={l} esTope />)}
          {p.suelos.map((l) => <Limite key={`s-${l.nutriente}`} l={l} esTope={false} />)}

          {/* ─── QUÉ ES INAMOVIBLE Y QUÉ DECIDE ÉL ────────────────────────
              ⚠️ PEDIDO EXPRESO (8 septiembre): «que le diga las
              recomendaciones, lo que puede tocar y lo que no; o sea, lo
              inamovible y lo que puede tocar, y él tiene que tener
              visibilidad de todo eso».
              Estaba en una sola frase corrida al final del bloque, que es
              como no estar: lo que hay que poder leer de un vistazo antes
              de firmar son DOS listas, y por eso se pintan como dos. */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="rounded-xl px-3 py-2.5" style={{ background: '#FFF4F6' }}>
              <p className="text-[10px] tracking-[0.1em] uppercase mb-1"
                 style={{ color: ROSA, fontFamily: fontMono }}>No se toca</p>
              <ul className="text-[11px] leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                {(p.topes.length > 0 || p.suelos.length > 0) && (
                  <li className="mb-1">
                    {[...p.topes.map((l) => `${nombreDe(l.nutriente)} ≤ ${cifra(l.valor)}`),
                      ...p.suelos.map((l) => `${nombreDe(l.nutriente)} ≥ ${cifra(l.valor)}`)].join(' · ')}
                  </li>
                )}
                <li className="mb-1">Los 43 requisitos de FEDIAF y el ratio Ca:P</li>
                <li>Los topes de seguridad crónica (vit. D, yodo, selenio, mercurio, tiaminasa)</li>
              </ul>
            </div>
            <div className="rounded-xl px-3 py-2.5" style={{ background: '#F0F7F3' }}>
              <p className="text-[10px] tracking-[0.1em] uppercase mb-1"
                 style={{ color: VERDE, fontFamily: fontMono }}>Lo decides tú</p>
              {/* ⚠️ ESTO ERAN TRES LÍNEAS FIJAS, IGUALES EN LAS 40 PATOLOGÍAS
                  (8 septiembre). CASO REAL, de la usuaria: «en qué puede tocar
                  y qué no siempre pones lo mismo... y las proporciones BARF
                  eso lo puede hacer siempre en cada menú, es redundante que
                  pongas eso». Tenía razón por partida doble: era genérico Y
                  repetía cosas que no dependen de la patología.

                  Y es falso que sea lo mismo en todas. En pancreatitis el
                  techo de grasa lo mueve la condición corporal y los
                  triglicéridos; en EPI el valor de partida es el extremo ALTO
                  del rango porque el tratamiento son las enzimas y no la
                  dieta; en renal no se puede mover NADA, porque 1200 ya choca
                  con el mínimo de FEDIAF. Tres respuestas distintas a la
                  misma pregunta, y quien firma necesita la suya, con la
                  fuente al lado. */}
              {margenes.length === 0 ? (
                <p className="text-[11px] leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                  Esta condición no fija ningún límite numérico, así que no hay
                  ningún número suyo que ajustar.
                </p>
              ) : (
                <ul className="text-[11px] leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                  {margenes.map(({ l, m }) => (
                    <li key={`m-${l.nutriente}`} className="mb-1.5 last:mb-0">
                      <b>{nombreDe(l.nutriente)}</b>
                      {m.hasta == null ? (
                        <span style={{ color: ROSA }}> · no se mueve</span>
                      ) : (
                        <span style={{ color: VERDE }}>
                          {' '}· {m.direccion === 'subir' ? 'hasta' : 'hasta'} {cifra(m.hasta)}
                          {l.unidad ? ` ${l.unidad}` : ''}
                        </span>
                      )}
                      <br />
                      <span style={{ color: MALVA }}>{m.criterio}</span>
                      {m.donde_para && (
                        <>
                          <br />
                          <span style={{ color: MALVA }}>Y ahí para: {m.donde_para}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="text-[11px] leading-snug mt-1.5" style={{ color: MALVA, fontFamily: fontBody }}>
            {(p.topes.length > 0 || p.suelos.length > 0) &&
              <>El tope se aplica como restricción dentro del cálculo y se vuelve a comprobar
                sobre las kcal reales del menú, no sobre las pedidas. </>}
            {p.solo_en_adulto && 'Solo se aplica en adulto. '}
            {p.en_crecimiento === 'bloquear' && 'En crecimiento o gestación no se formula. '}
            {p.en_crecimiento === 'soltar' && 'En crecimiento se suelta, y el menú lo dice. '}
            {p.excluye_fruta && 'Deja la fruta fuera de la ración. '}
          </p>

          {/* ─── LO QUE HAY QUE SABER, Y NO ES UN LÍMITE ───────────────────
              El objetivo terapéutico de la literatura (que suele estar POR
              DEBAJO de lo que el motor puede hacer), lo que la fuente dice
              y las notas. Es la parte de «recomendaciones»: no la aplica
              nadie automáticamente, la pauta él. */}
          {(p.necesita_bajo_fediaf || p.objetivo_terapeutico_por_1000kcal || p.aviso_profesional || p.nota) && (
            <div className="rounded-xl px-3 py-2.5 mt-2" style={{ background: '#FFFFFF', border: '1px solid #E3DAF0' }}>
              <p className="text-[10px] tracking-[0.1em] uppercase mb-1"
                 style={{ color: VIOLETA, fontFamily: fontMono }}>Recomendación clínica</p>
              {p.objetivo_terapeutico_por_1000kcal && p.nutriente_frontera && (
                <p className="text-[11px] leading-snug mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
                  Objetivo terapéutico de la literatura para {nombreDe(p.nutriente_frontera)}:{' '}
                  <b>{cifra(p.objetivo_terapeutico_por_1000kcal)}</b> por 1000 kcal
                  {p.topes.find((l) => l.nutriente === p.nutriente_frontera)
                    ? <> — el motor llega a {cifra(p.topes.find((l) => l.nutriente === p.nutriente_frontera).valor)}, que es
                        lo más estricto que puede sin romper el mínimo de FEDIAF.</>
                    : '.'}
                </p>
              )}
              {p.necesita_bajo_fediaf && (
                <p className="text-[11px] leading-snug mb-1" style={{ color: ROSA, fontFamily: fontBody }}>
                  La dieta terapéutica de referencia va POR DEBAJO de algún mínimo de FEDIAF.
                  Esto no llega ahí: es un apoyo, y ese tramo lo pautas tú.
                </p>
              )}
              {p.aviso_profesional && (
                <p className="text-[11px] leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                  {p.aviso_profesional}
                </p>
              )}
              {p.nota && (
                <p className="text-[11px] leading-snug mt-1" style={{ color: MALVA, fontFamily: fontBody }}>
                  {p.nota}
                </p>
              )}
            </div>
          )}
        </div>
        )
      })}
    </div>
  )
}
