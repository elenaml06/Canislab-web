import { useState } from 'react'

const VIOLETA = '#5A4088'
const ROSA = '#FF6F91'
const PAPEL = '#FBF7FC'
const TINTA = '#231539'
const MALVA = '#9A8CB8'
const fontDisplay = '"Georgia", serif'
const fontBody = '"DM Sans", sans-serif'

const API_BASE = 'https://canislab-api.onrender.com'

export default function Suscripcion({ usuario, onVolver }) {
  const [planSeleccionado, setPlanSeleccionado] = useState('mensual')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  const iniciarCheckout = async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/stripe/checkout`, {
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
      } else {
        setError('No se pudo iniciar el pago. Inténtalo de nuevo.')
      }
    } catch (e) {
      setError('Error de conexión. Inténtalo de nuevo.')
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
        7 días gratis, luego elige tu plan
      </p>
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
          {cargando ? 'Un momento...' : 'Empezar prueba gratis de 7 días'}
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
        Pago seguro con Stripe. Puedes cancelar en cualquier momento desde tu cuenta.
      </p>
    </div>
  )
}
