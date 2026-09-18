import { useState } from 'react'
import { API_BASE, fetchConTimeout } from './api.js'
import { getTokenDeSesion } from './supabase.js'

const VIOLETA = '#5A4088'
const ROSA = '#FF6F91'
const PAPEL = '#FBF7FC'
const TINTA = '#231539'
const MALVA = '#9A8CB8'
const fontDisplay = '"Georgia", serif'
const fontBody = '"DM Sans", sans-serif'

export default function Suscripcion({ usuario, onVolver, esDemo = false, onActivarDemo }) {
  const [planSeleccionado, setPlanSeleccionado] = useState('mensual')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  // ⚠️ QUIEN YA PAGÓ NO ESTÁ VIENDO UN ERROR (18 de septiembre de 2026).
  //
  // El motor contesta `{ya_suscrito: true, url: null, motivo: "..."}` desde el
  // 11 de septiembre, y esta pantalla solo miraba `data.url`: a quien ya tiene
  // suscripción le decía **«No se pudo iniciar el pago. Inténtalo de nuevo»**.
  // O sea que al único que NO hay que cobrar se le estaba invitando a
  // reintentar, que es como se cobra dos veces -- justo lo que el endpoint
  // comprueba antes de crear nada.
  //
  // Se guarda aparte del `error` a propósito: no es un fallo, es la respuesta
  // correcta, y pintarlo en rojo con «inténtalo de nuevo» sería el mismo daño
  // con otras palabras.
  const [yaSuscrito, setYaSuscrito] = useState(null)

  const iniciarCheckout = async () => {
    // ⚠️ Modo prueba: Premium se enciende al momento, sin pasar por
    // Stripe. Sirve para ver cómo queda la app siendo Premium mientras el
    // cobro de verdad todavía no está montado.
    if (esDemo) {
      onActivarDemo?.()
      return
    }
    setCargando(true)
    setError(null)
    try {
      // ⚠️ CORREGIDO — CASO REAL: "le doy a prueba gratuita y se queda
      // pillado". Este fetch no tenía límite de tiempo, así que si la API
      // no contestaba (el plan gratuito de Render se duerme), el botón se
      // quedaba en "Un momento..." para siempre, sin error ni forma de
      // salir. Mismo fallo que en la generación de menús.
      const res = await fetchConTimeout(`${API_BASE}/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: usuario.id,
          email: usuario.email,
          plan: planSeleccionado,
        }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else if (data.ya_suscrito) {
        setYaSuscrito(data.motivo
          || 'Ya tienes una suscripción activa, así que no hace falta pagar otra vez.')
      } else {
        setError('No se pudo iniciar el pago. Inténtalo de nuevo.')
      }
    } catch (e) {
      setError(e?.esTimeout
        ? 'El servidor está tardando demasiado en responder. Vuelve a intentarlo en un momento.'
        : 'Error de conexión. Inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  // Y para gestionarla, el portal de Stripe. ⚠️ Va con el TOKEN de sesión y no
  // con el id de cliente: un identificador no es una credencial, y mandar el de
  // otro abría SU facturación (tapado en el motor el 11 de septiembre). Desde
  // entonces `/stripe/checkout` ya no devuelve la URL del portal, así que este
  // es el único camino.
  const abrirGestion = async () => {
    setCargando(true)
    setError(null)
    try {
      const token = await getTokenDeSesion()
      if (!token) {
        setError('Vuelve a entrar en tu cuenta para gestionar la suscripción.')
        return
      }
      const res = await fetchConTimeout(`${API_BASE}/stripe/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_usuario: token }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setError('No hemos podido abrir la gestión de la suscripción. Inténtalo en un momento.')
    } catch (e) {
      setError(e?.esTimeout
        ? 'El servidor está tardando demasiado en responder. Vuelve a intentarlo en un momento.'
        : 'Error de conexión. Inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: PAPEL,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '48px 24px 32px',
    }}>
      {/* Cabecera */}
      <p style={{ fontFamily: fontDisplay, fontSize: 28, color: VIOLETA, fontWeight: 700, marginBottom: 4 }}>
        Rawku Premium
      </p>
      <p style={{ fontFamily: fontBody, fontSize: 15, color: MALVA, marginBottom: 8, textAlign: 'center' }}>
        {esDemo ? 'Modo prueba — todavía no se cobra nada' : '7 días gratis, luego elige tu plan'}
      </p>

      {/* Que quede clarísimo que aquí no se paga: un botón que diga
          "prueba gratis" y active una suscripción sin avisar de que es
          de mentira se lee como que va a haber un cargo más adelante. */}
      {esDemo && (
        <div style={{
          width: '100%', maxWidth: 380, marginBottom: 20, padding: '12px 14px',
          borderRadius: 14, background: '#FFF7E8', border: '1px solid #F5DFA8',
        }}>
          <p style={{ fontFamily: fontBody, fontSize: 13, color: '#7A5C00', margin: 0, textAlign: 'center' }}>
            Rawku está en pruebas: el pago todavía no está activo. Puedes
            encender Premium para verlo por dentro, sin ningún cargo.
          </p>
        </div>
      )}
      <p style={{ fontFamily: fontBody, fontSize: 13, color: MALVA, marginBottom: 32, textAlign: 'center' }}>
        Sin permanencia. Cancela cuando quieras.
      </p>

      {/* Selector de plan */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32, width: '100%', maxWidth: 380 }}>
        {[
          { key: 'mensual', label: 'Mensual', precio: '4,99€/mes', detalle: null },
          { key: 'anual', label: 'Anual', precio: '39€/año', detalle: '3,25€/mes · ahorras 21€' },
        ].map((plan) => (
          <button
            key={plan.key}
            onClick={() => setPlanSeleccionado(plan.key)}
            style={{
              flex: 1,
              padding: '16px 12px',
              borderRadius: 16,
              border: `2px solid ${planSeleccionado === plan.key ? VIOLETA : '#E3DAF0'}`,
              background: planSeleccionado === plan.key ? '#F0EBF8' : '#FFFFFF',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            {plan.key === 'anual' && (
              <p style={{ fontFamily: fontBody, fontSize: 11, color: ROSA, fontWeight: 700, marginBottom: 4 }}>
                MÁS POPULAR
              </p>
            )}
            <p style={{ fontFamily: fontDisplay, fontSize: 15, color: TINTA, fontWeight: 600, marginBottom: 4 }}>
              {plan.label}
            </p>
            <p style={{ fontFamily: fontBody, fontSize: 17, color: VIOLETA, fontWeight: 700, marginBottom: plan.detalle ? 4 : 0 }}>
              {plan.precio}
            </p>
            {plan.detalle && (
              <p style={{ fontFamily: fontBody, fontSize: 12, color: MALVA }}>
                {plan.detalle}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Features */}
      <div style={{ width: '100%', maxWidth: 380, marginBottom: 32 }}>
        {[
          '✓ Guarda el perfil de tu perro',
          '✓ Historial de menús',
          '✓ Varios menús en rotación',
          '✓ Varios perros',
          '✓ Analizador nutricional',
          '✓ Carrito de la compra',
        ].map((f, i) => (
          <p key={i} style={{ fontFamily: fontBody, fontSize: 14, color: TINTA, marginBottom: 10 }}>
            {f}
          </p>
        ))}
      </div>

      {error && (
        <p style={{ color: ROSA, fontFamily: fontBody, fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
          {error}
        </p>
      )}

      {/* Ya tiene suscripción: NO es un error, así que no va en rojo ni dice
          «inténtalo de nuevo». Lo que hace falta aquí es la puerta para
          gestionarla, que es lo que esta persona venía buscando. */}
      {yaSuscrito && (
        <div style={{
          width: '100%', maxWidth: 380, marginBottom: 16, padding: '14px 16px',
          borderRadius: 14, background: '#fff', border: `1px solid ${MALVA}33`,
        }}>
          <p style={{ color: TINTA, fontFamily: fontBody, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            {yaSuscrito}
          </p>
          <button
            onClick={abrirGestion}
            disabled={cargando}
            style={{
              marginTop: 12, width: '100%', padding: '12px', borderRadius: 12,
              border: `1px solid ${VIOLETA}`, background: 'transparent', color: VIOLETA,
              fontFamily: fontBody, fontSize: 14, fontWeight: 600,
              cursor: cargando ? 'default' : 'pointer', opacity: cargando ? 0.6 : 1,
            }}
          >
            {cargando ? 'Un momento…' : 'Gestionar mi suscripción'}
          </button>
        </div>
      )}

      {/* Botón */}
      <div style={{ width: '100%', maxWidth: 380 }}>
        <button
          onClick={iniciarCheckout}
          disabled={cargando}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 16,
            background: cargando ? MALVA : ROSA,
            color: '#FFFFFF',
            fontFamily: fontBody,
            fontWeight: 700,
            fontSize: 16,
            border: 'none',
            cursor: cargando ? 'default' : 'pointer',
            marginBottom: 12,
          }}
        >
          {cargando
            ? 'Un momento...'
            : esDemo ? 'Activar Premium (sin pago)' : 'Empezar prueba gratis de 7 días'}
        </button>

        <button
          onClick={onVolver}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 16,
            background: 'none',
            border: 'none',
            color: MALVA,
            fontFamily: fontBody,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Ahora no, volver a la app
        </button>
      </div>

      <p style={{ fontFamily: fontBody, fontSize: 12, color: '#C0B8D0', marginTop: 24, textAlign: 'center', maxWidth: 300 }}>
        {esDemo
          ? 'Se guarda sólo en este dispositivo. Puedes apagarlo cuando quieras desde el menú.'
          : 'Pago seguro con Stripe. Puedes cancelar en cualquier momento desde tu cuenta.'}
      </p>
    </div>
  )
}
