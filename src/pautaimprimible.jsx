// ─── LA PAUTA, EN PAPEL ──────────────────────────────────────────────────────
//
// ⚠️ PEDIDO EXPRESO (8 de septiembre): «el informe imprimible/PDF con el logo
// de la clínica». Es lo que hacen Nutrimenta, VetMenu y MyVetDiet, y en los
// tres es el final del trabajo: se formula en pantalla y lo que se entrega es
// un papel con la marca de quien lo firma. Sin esto, un veterinario formula
// aquí y luego copia los gramos a mano en su propia plantilla — o sea que la
// parte que se lleva el dueño a casa no la hace Rawku.
//
// ⚠️ SE IMPRIME EL DOCUMENTO FIRMADO, NO LA PANTALLA. Esto no vuelve a
// calcular nada ni lee la ficha del perro: pinta `documento`, que es lo que
// selló la API y se guardó congelado (ver la cabecera de LA PAUTA FIRMADA en
// main.py). La ficha del perro cambia, el catálogo cambia y el motor cambia;
// un papel firmado tiene que seguir diciendo lo mismo dentro de un año. Si
// esta pantalla leyera el estado de la app en vez del documento, imprimiría
// hoy una cosa y en marzo otra, las dos con la misma firma debajo.
//
// ⚠️ SIN LIBRERÍA DE PDF, y es a propósito. El PDF lo hace el navegador con
// `window.print()` → «Guardar como PDF», que es lo que todo el mundo tiene y
// además imprime de verdad en la impresora de la consulta. Meter jsPDF o
// html2canvas serían 300 KB para hacer peor lo que el navegador ya hace bien,
// y encima con sus propios fallos de fuentes y saltos de página.
//
// LO QUE SÍ SE IMPRIME Y PODRÍA PARECER QUE SOBRA: los huecos del catálogo y
// los avisos de seguridad. Es incómodo y es exactamente por eso. Lo contrario
// es firmar sobre datos incompletos sin que conste en ninguna parte.
import { X, Printer } from 'lucide-react'

const VIOLETA = '#5A4088'
const TINTA = '#231539'
const MALVA = '#9A8CB8'
const ROSA = '#FF6F91'

const fontDisplay = '"Georgia", serif'
const fontBody = '"DM Sans", sans-serif'
const fontMono = 'monospace'

// ⚠️ EL CSS DE IMPRESIÓN VA AQUÍ Y NO EN index.css: es de esta pantalla y de
// ninguna más. `@page` fija los márgenes del papel (Tailwind no llega ahí), y
// `.cnl-no-imprimir` saca de la hoja lo que solo tiene sentido tocando —
// botones, la X de cerrar—, que si no salen impresos como rectángulos vacíos.
const CSS_IMPRESION = `
@media print {
  @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
  html, body { background: #FFFFFF !important; }
  .cnl-no-imprimir { display: none !important; }
  .cnl-hoja { position: static !important; overflow: visible !important;
              inset: auto !important; padding: 0 !important; }
  .cnl-papel { box-shadow: none !important; border: none !important;
               max-width: none !important; margin: 0 !important; padding: 0 !important; }
  /* Ni la tabla de la ración ni un bloque de avisos se parten por la mitad:
     media ración en una hoja y media en otra se lee como dos raciones. */
  .cnl-no-partir { break-inside: avoid; page-break-inside: avoid; }
  /* El pie con el sello se repite en cada hoja: si alguien separa las
     páginas, cada una sigue diciendo de qué documento es. */
  .cnl-pie { position: fixed; bottom: 0; left: 0; right: 0; }
}
`

const fechaLarga = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('es-ES',
      { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return String(iso) }
}

const cifra = (v, decimales = 1) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  const r = Number(n.toFixed(decimales))
  return String(Number.isInteger(r) ? r : r).replace('.', ',')
}

function Seccion({ titulo, children, className = '' }) {
  return (
    <section className={`cnl-no-partir mb-5 ${className}`}>
      <p className="text-[10px] tracking-[0.16em] uppercase mb-1.5 pb-1"
         style={{ color: VIOLETA, fontFamily: fontMono, borderBottom: '1px solid #E3DAF0' }}>
        {titulo}
      </p>
      {children}
    </section>
  )
}

/**
 * `documento` es lo que devolvió `POST /pauta/firmar` y se guardó en
 * `pautas_firmadas.documento`. `clinica` son los datos de quien imprime —
 * NO viajan dentro del documento a propósito: el logo de la clínica no es
 * parte de lo que se verificó, así que puede cambiar sin invalidar el sello.
 */
export default function PautaImprimible({ documento, clinica = null, onCerrar = () => {} }) {
  if (!documento) return null
  const ctx = documento.contexto || {}
  const ficha = documento.ficha_verificada || {}
  const paciente = documento.paciente || {}
  const racion = Object.entries(documento.menu || {})
  const totalGramos = racion.reduce((s, [, g]) => s + Number(g || 0), 0)
  const huecos = documento.huecos || {}
  const enCristiano = huecos.en_cristiano || []
  const seguridad = documento.seguridad || []

  return (
    <div className="cnl-hoja fixed inset-0 z-[90] overflow-y-auto"
         style={{ background: '#EFEAF6' }}>
      <style>{CSS_IMPRESION}</style>

      <div className="cnl-no-imprimir sticky top-0 z-10 flex items-center justify-between px-4 py-3"
           style={{ background: VIOLETA }}>
        <button onClick={onCerrar} aria-label="Cerrar la vista de impresión"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={20} style={{ color: '#FFFFFF' }} />
        </button>
        <button onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl"
                style={{ background: '#FFFFFF', color: VIOLETA, border: 'none',
                         fontFamily: fontBody, fontWeight: 700, cursor: 'pointer' }}>
          <Printer size={16} /> Imprimir o guardar en PDF
        </button>
      </div>
      <p className="cnl-no-imprimir text-xs text-center px-6 py-2"
         style={{ color: MALVA, fontFamily: fontBody }}>
        En el diálogo de impresión, elige «Guardar como PDF» como destino.
      </p>

      <div className="cnl-papel mx-auto my-4 px-8 py-8"
           style={{ background: '#FFFFFF', maxWidth: 820, boxShadow: '0 2px 16px rgba(35,21,57,0.12)' }}>

        {/* ─── LA CABECERA DE LA CLÍNICA ────────────────────────────────
            Si no hay logo ni nombre, no se pinta un hueco: se pinta el
            firmante, que es lo que de verdad no puede faltar. */}
        <header className="cnl-no-partir flex items-start justify-between gap-6 pb-4 mb-5"
                style={{ borderBottom: `2px solid ${VIOLETA}` }}>
          <div className="flex items-center gap-4 min-w-0">
            {clinica?.logo && (
              <img src={clinica.logo} alt=""
                   style={{ maxHeight: 64, maxWidth: 180, objectFit: 'contain' }} />
            )}
            <div className="min-w-0">
              {clinica?.nombre && (
                <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 20 }}>
                  {clinica.nombre}
                </p>
              )}
              {clinica?.contacto && (
                <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                  {clinica.contacto}
                </p>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] tracking-[0.16em] uppercase"
               style={{ color: MALVA, fontFamily: fontMono }}>Pauta nutricional</p>
            <p className="text-sm" style={{ color: TINTA, fontFamily: fontBody }}>
              {fechaLarga(documento.firmada_en)}
            </p>
          </div>
        </header>

        <Seccion titulo="Paciente">
          <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 22 }}>
            {paciente.nombre || 'Sin nombre'}
          </p>
          <p className="text-sm" style={{ color: TINTA, fontFamily: fontBody }}>
            {[paciente.raza, paciente.sexo,
              ctx.peso_perro_kg ? `${cifra(ctx.peso_perro_kg)} kg` : null,
              ctx.bcs ? `BCS ${cifra(ctx.bcs, 0)}/9` : null,
             ].filter(Boolean).join(' · ')}
          </p>
          {paciente.tutor_nombre && (
            <p className="text-sm mt-0.5" style={{ color: MALVA, fontFamily: fontBody }}>
              Tutor: {paciente.tutor_nombre}
              {paciente.tutor_contacto ? ` · ${paciente.tutor_contacto}` : ''}
            </p>
          )}
          {(ctx.patologias || []).length > 0 && (
            <p className="text-sm mt-1" style={{ color: ROSA, fontFamily: fontBody }}>
              {ctx.patologias.join(' · ')}
            </p>
          )}
        </Seccion>

        <Seccion titulo="Cálculo">
          <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm"
               style={{ color: TINTA, fontFamily: fontBody }}>
            <span>Energía: <b>{cifra(ctx.der_objetivo, 0)} kcal/día</b></span>
            <span>Ración: <b>{cifra(ctx.kcal_reales, 0)} kcal</b> · {cifra(ctx.gramos_total)} g</span>
            <span>Etapa: <b>{ctx.etapa_requisitos}</b></span>
            {ctx.peso_objetivo_kg && <span>Peso objetivo: <b>{cifra(ctx.peso_objetivo_kg)} kg</b></span>}
          </div>
          {/* De qué peso salen las kcal. En un perro con sobrepeso no es el
              que marca la báscula, y quien lea esto dentro de un año tiene
              que poder saber cuál se usó sin deducirlo. */}
          {ctx.de_donde_sale_el_peso && (
            <p className="text-xs mt-1" style={{ color: MALVA, fontFamily: fontBody }}>
              Peso de referencia: {cifra(ctx.peso_de_referencia_kg)} kg ({ctx.de_donde_sale_el_peso}).
            </p>
          )}
          {[['Alergias / excluidos', ctx.nombres_excluidos],
            ['Especies excluidas', ctx.especies_excluidas],
            ['Categorías excluidas', ctx.categorias_excluidas]].map(([etq, lista]) =>
            (lista || []).length > 0 ? (
              <p key={etq} className="text-xs mt-0.5" style={{ color: MALVA, fontFamily: fontBody }}>
                {etq}: {lista.join(', ')}
              </p>
            ) : null)}
        </Seccion>

        <Seccion titulo="Ración diaria">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {racion.map(([nombre, g]) => (
                <tr key={nombre} style={{ borderBottom: '1px solid #F0EAF8' }}>
                  <td className="py-1.5 text-sm" style={{ color: TINTA, fontFamily: fontBody }}>
                    {nombre}
                  </td>
                  <td className="py-1.5 text-sm text-right"
                      style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700, width: 90 }}>
                    {cifra(g)} g
                  </td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 text-sm" style={{ color: MALVA, fontFamily: fontBody }}>Total</td>
                <td className="pt-2 text-sm text-right"
                    style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 700 }}>
                  {cifra(totalGramos)} g
                </td>
              </tr>
            </tbody>
          </table>
        </Seccion>

        {documento.indicaciones && (
          <Seccion titulo="Cómo darlo">
            <p className="text-sm leading-relaxed whitespace-pre-wrap"
               style={{ color: TINTA, fontFamily: fontBody }}>
              {documento.indicaciones}
            </p>
          </Seccion>
        )}

        <Seccion titulo="Verificación">
          <p className="text-sm" style={{ color: TINTA, fontFamily: fontBody }}>
            Cumple <b>{ficha.correctos}</b> de <b>{ficha.total}</b> requisitos de FEDIAF
            {ficha.ratio_ca_p ? <> · ratio Ca:P <b>{cifra(ficha.ratio_ca_p, 2)}</b></> : null}
            {ficha.densidad_kcal_g ? <> · <b>{cifra(ficha.densidad_kcal_g, 2)}</b> kcal/g</> : null}
          </p>
          <p className="text-xs mt-1 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
            Verificado contra la Tabla III-3b de FEDIAF para la etapa indicada, más el ratio
            calcio:fósforo, el calcio de raza grande cuando aplica y los límites de seguridad
            crónica (vitamina D, yodo, selenio, mercurio y tiaminasa).
          </p>
        </Seccion>

        {(enCristiano.length > 0 || seguridad.length > 0) && (
          <Seccion titulo="Sobre qué datos se ha calculado">
            {enCristiano.length > 0 && (
              <ul className="mb-2">
                {enCristiano.map((h, i) => (
                  <li key={i} className="text-xs leading-snug"
                      style={{ color: TINTA, fontFamily: fontBody }}>· {h}</li>
                ))}
              </ul>
            )}
            {seguridad.map((a, i) => (
              <p key={i} className="text-xs leading-snug"
                 style={{ color: TINTA, fontFamily: fontBody }}>· {a}</p>
            ))}
          </Seccion>
        )}

        {/* ─── LA FIRMA ──────────────────────────────────────────────────
            El nombre y el número van COPIADOS dentro del documento, no
            leídos del perfil: si mañana cambia de número, lo firmado sigue
            diciendo con cuál se firmó. */}
        <section className="cnl-no-partir mt-8 pt-4" style={{ borderTop: '1px solid #E3DAF0' }}>
          <div className="flex items-end justify-between gap-6">
            <div>
              <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
                {documento.firmante?.nombre}
              </p>
              <p className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>
                Nº de colegiado {documento.firmante?.num_colegiado}
              </p>
            </div>
            <div className="text-right" style={{ minWidth: 200 }}>
              <div style={{ borderBottom: '1px solid #C9BEDD', height: 40 }} />
              <p className="text-[10px] mt-1" style={{ color: MALVA, fontFamily: fontMono }}>
                FIRMA Y SELLO
              </p>
            </div>
          </div>
        </section>

        <footer className="cnl-pie mt-6 pt-3" style={{ borderTop: '1px solid #F0EAF8' }}>
          <p className="text-[9px] leading-snug" style={{ color: MALVA, fontFamily: fontMono }}>
            Documento sellado {documento.sello} · motor {documento.sellos?.['main.py'] || '—'} ·
            {' '}generado con Rawku. Comprobable en rawku.app: el sello cambia si se altera
            cualquier cifra de este papel.
          </p>
        </footer>
      </div>
    </div>
  )
}
