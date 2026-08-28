// ─── LA FICHA CLÍNICA ────────────────────────────────────────────────────────
//
// Lo que ve un veterinario del mismo menú que ve un tutor. No es otro
// cálculo: es la MISMA respuesta del motor, pintada entera en vez de
// resumida en «cumple 30 de 30».
//
// ⚠️ NO HAY NINGÚN NÚMERO DE NUTRIENTES ESCRITO AQUÍ, y es a propósito.
// Hoy el motor verifica 29 requisitos; la rama de los aminoácidos los sube
// a 43. Si esta pantalla dijera «29» en algún sitio, el día que eso entre
// diría una cifra y el motor comprobaría otra, sin dar ningún error --
// que es la familia de fallos que describe CLAUDE.md. Aquí se pinta lo que
// venga en la ficha, sea lo que sea.
//
// ⚠️ LO QUE FALTA, Y NO ES DE ESTA PANTALLA. `verificar()` devuelve los
// nutrientes que FALLAN con todo el detalle (tiene, necesita, % que cubre)
// pero los que CUMPLEN solo los cuenta: `"correctos": 29`, un número. Así
// que aquí se puede enseñar todo lo que va mal y con cuánto margen, pero
// no «calcio 1,8 con el mínimo en 1,2», que es justo lo que un profesional
// quiere ver del resto. Arreglarlo es que `verificar()` devuelva la lista
// en vez del recuento; en cuanto lo haga, esta pantalla la pinta sola
// (ver `LOS QUE CUMPLEN`, abajo).

const VIOLETA = '#5A4088'
const ROSA = '#FF6F91'
const TINTA = '#231539'
const MALVA = '#9A8CB8'
const VERDE = '#2F6B4F'

const fontDisplay = '"Georgia", serif'
const fontBody = '"DM Sans", sans-serif'
const fontMono = 'monospace'

const COLOR_SEMAFORO = {
  verde: { fondo: '#E8F5EE', texto: VERDE, etiqueta: 'Cumple' },
  ambar: { fondo: '#FFF4E0', texto: '#8A6100', etiqueta: 'Al límite' },
  rojo: { fondo: '#FFE8EC', texto: ROSA, etiqueta: 'No cumple' },
}

const num = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v)

function Titulo({ children }) {
  return (
    <p className="text-[11px] tracking-[0.14em] uppercase mb-2"
       style={{ color: MALVA, fontFamily: fontMono }}>
      {children}
    </p>
  )
}

function Dato({ etiqueta, valor, unidad }) {
  return (
    <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: '#FFFFFF', border: '1.5px solid #E3DAF0' }}>
      <p className="text-[10px] tracking-[0.1em] uppercase" style={{ color: MALVA, fontFamily: fontMono }}>
        {etiqueta}
      </p>
      <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>
        {num(valor)}<span className="text-xs" style={{ color: MALVA }}> {unidad}</span>
      </p>
    </div>
  )
}

// Una fila de la tabla de los que no cumplen. Se enseña SIEMPRE el número
// que tiene y el límite contra el que se compara, nunca solo el nombre:
// «le falta calcio» no le sirve a nadie que vaya a firmar.
function Fila({ nutriente, tiene, limite, etiquetaLimite, extra, color }) {
  return (
    <div className="flex items-baseline gap-2 px-3 py-2" style={{ borderBottom: '1px solid #F0EBF8' }}>
      <span className="flex-1 truncate" style={{ color: TINTA, fontFamily: fontBody, fontSize: 13 }}>
        {nutriente}
      </span>
      <span style={{ color, fontFamily: fontMono, fontSize: 13, fontWeight: 700 }}>
        {num(tiene)}
      </span>
      <span className="whitespace-nowrap" style={{ color: MALVA, fontFamily: fontMono, fontSize: 11 }}>
        {etiquetaLimite} {num(limite)}
      </span>
      {extra !== undefined && extra !== null && (
        <span className="whitespace-nowrap text-right" style={{ color, fontFamily: fontMono, fontSize: 11, minWidth: 44 }}>
          {extra}
        </span>
      )}
    </div>
  )
}

export default function FichaClinica({ ficha }) {
  if (!ficha) {
    return (
      <p className="px-5 py-6 text-sm" style={{ color: MALVA, fontFamily: fontBody }}>
        Este menú no trae ficha de verificación. Pásalo por «revisar» antes de usarlo.
      </p>
    )
  }

  const sem = COLOR_SEMAFORO[ficha.semaforo] || COLOR_SEMAFORO.verde
  const faltan = ficha.faltan || []
  const sePasa = ficha.se_pasa || []
  const huecos = ficha.datos_incompletos || {}
  const dudosos = ficha.datos_dudosos || {}
  const total = ficha.total
  const correctos = ficha.correctos

  return (
    <div className="px-5 pt-5 pb-10 flex flex-col gap-6">

      {/* ── EL VEREDICTO, con las cifras y no con una etiqueta ── */}
      <div className="rounded-2xl px-4 py-3" style={{ background: sem.fondo }}>
        <p style={{ color: sem.texto, fontFamily: fontDisplay, fontSize: 20 }}>
          {sem.etiqueta}: {num(correctos)} de {num(total)} requisitos
        </p>
        <p className="text-xs mt-0.5" style={{ color: sem.texto, fontFamily: fontBody, opacity: 0.85 }}>
          Verificado de cero contra la tabla de FEDIAF para la etapa de este perro.
        </p>
      </div>

      <div className="flex gap-2">
        <Dato etiqueta="Ración" valor={ficha.gramos} unidad="g" />
        <Dato etiqueta="Energía" valor={ficha.kcal} unidad="kcal" />
        <Dato etiqueta="Densidad" valor={ficha.densidad_kcal_g} unidad="kcal/g" />
      </div>

      {/* ── Ca:P ── */}
      <div>
        <Titulo>Relación calcio : fósforo</Titulo>
        <div className="rounded-xl px-4 py-3 flex items-baseline justify-between"
             style={{ background: '#FFFFFF', border: '1.5px solid #E3DAF0' }}>
          <span style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 22 }}>
            {num(ficha.ratio_ca_p)}<span className="text-sm" style={{ color: MALVA }}> : 1</span>
          </span>
          <span style={{ color: MALVA, fontFamily: fontMono, fontSize: 11 }}>
            referencia 1,0 – 1,8
          </span>
        </div>
      </div>

      {/* ── LO QUE NO LLEGA ── */}
      {faltan.length > 0 && (
        <div>
          <Titulo>Por debajo del mínimo ({faltan.length})</Titulo>
          <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1.5px solid #E3DAF0' }}>
            {faltan.map((f) => (
              <Fila key={f.clave || f.nutriente} nutriente={f.nutriente} tiene={f.tiene}
                    limite={f.necesita} etiquetaLimite="mín." color={ROSA}
                    extra={f.cubre_pct !== undefined ? `${f.cubre_pct}%` : null} />
            ))}
          </div>
        </div>
      )}

      {/* ── LO QUE SE PASA ── */}
      {sePasa.length > 0 && (
        <div>
          <Titulo>Por encima del máximo ({sePasa.length})</Titulo>
          <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1.5px solid #E3DAF0' }}>
            {sePasa.map((s) => (
              <Fila key={s.clave || s.nutriente} nutriente={s.nutriente} tiene={s.tiene}
                    limite={s.maximo} etiquetaLimite="máx." color={ROSA}
                    extra={s.veces !== undefined ? `×${s.veces}` : null} />
            ))}
          </div>
        </div>
      )}

      {/* ── LOS QUE CUMPLEN ──
          Hoy el motor manda el RECUENTO, no la lista. Se dice en pantalla en
          vez de callarlo: un profesional tiene que saber qué le estamos
          enseñando y qué no. En cuanto `verificar()` devuelva `correctos`
          como lista, esto pasa a ser la tabla y se quita el aviso. */}
      <div>
        <Titulo>Dentro de rango ({num(correctos)})</Titulo>
        <div className="rounded-xl px-4 py-3" style={{ background: '#FFFFFF', border: '1.5px dashed #E3DAF0' }}>
          <p className="text-xs leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
            El motor confirma que {num(correctos)} requisitos quedan dentro de rango, pero
            todavía no manda su valor ni su margen: solo cuántos son. Aquí saldrá cada uno
            con su cifra y su distancia al límite en cuanto lo haga.
          </p>
        </div>
      </div>

      {/* ── SOBRE QUÉ DATOS SE HA CALCULADO ──
          Esto no es un detalle: quien firma tiene derecho a saber que uno de
          los alimentos del menú no traía el dato de un nutriente. */}
      {Object.keys(huecos).length > 0 && (
        <div>
          <Titulo>Huecos del catálogo ({Object.keys(huecos).length})</Titulo>
          <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: `1.5px solid ${ROSA}33` }}>
            {Object.entries(huecos).map(([clave, alimentos]) => (
              <div key={clave} className="px-3 py-2" style={{ borderBottom: '1px solid #F0EBF8' }}>
                <p style={{ color: TINTA, fontFamily: fontMono, fontSize: 12 }}>{clave}</p>
                <p style={{ color: MALVA, fontFamily: fontBody, fontSize: 11 }}>
                  sin dato en: {(alimentos || []).join(', ')}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-1.5 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
            Un hueco no es un cero: es que no lo sabemos. Estos nutrientes se han
            verificado sin contar lo que aporten esos alimentos.
          </p>
        </div>
      )}

      {Object.keys(dudosos).length > 0 && (
        <div>
          <Titulo>Datos que no nos creemos ({Object.keys(dudosos).length})</Titulo>
          <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: `1.5px solid ${ROSA}33` }}>
            {Object.entries(dudosos).map(([clave, alimentos]) => (
              <div key={clave} className="px-3 py-2" style={{ borderBottom: '1px solid #F0EBF8' }}>
                <p style={{ color: TINTA, fontFamily: fontMono, fontSize: 12 }}>{clave}</p>
                <p style={{ color: MALVA, fontFamily: fontBody, fontSize: 11 }}>
                  valor declarado dudoso en: {(alimentos || []).join(', ')}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-1.5 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
            Son valores de etiqueta que no cuadran con la química o con la literatura.
            El menú se ha verificado sustituyéndolos por su valor plausible.
          </p>
        </div>
      )}
    </div>
  )
}
