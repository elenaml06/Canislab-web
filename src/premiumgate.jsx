const VIOLETA = '#5A4088'
const ROSA = '#FF6F91'
const TINTA = '#231539'
const MALVA = '#9A8CB8'
const fontDisplay = '"Georgia", serif'
const fontBody = '"DM Sans", sans-serif'

export default function PremiumGate({ premium, onSuscribir, onCerrar, titulo, descripcion, esDemo = false, children }) {
  if (premium) return children;

  return (
    <div style={{ position: 'relative', width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Contenido borroso detrás */}
      <div style={{
        filter: 'blur(4px)',
        opacity: 0.4,
        pointerEvents: 'none',
        userSelect: 'none',
        flex: 1,
      }}>
        {children}
      </div>

      {/* Overlay con candado — fixed para cubrir siempre toda la pantalla */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(251,247,252,0.92)',
        backdropFilter: 'blur(4px)',
        padding: '24px',
        textAlign: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: '#F0EBF8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
        }}>
          🔒
        </div>

        <p style={{ fontFamily: fontDisplay, fontSize: 19, color: TINTA, margin: 0 }}>
          {titulo}
        </p>

        <p style={{ fontFamily: fontBody, fontSize: 14, color: MALVA, margin: 0, maxWidth: 280 }}>
          {descripcion}
        </p>

        {/* Precios */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4, width: '100%', maxWidth: 300 }}>
          <div style={{
            flex: 1, padding: '12px 8px', borderRadius: 14,
            background: '#FFFFFF', border: '1.5px solid #E3DAF0',
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: fontBody, fontSize: 11, color: MALVA, marginBottom: 2 }}>Mensual</p>
            <p style={{ fontFamily: fontDisplay, fontSize: 17, color: VIOLETA, fontWeight: 700, margin: 0 }}>4,99€</p>
            <p style={{ fontFamily: fontBody, fontSize: 11, color: MALVA }}>al mes</p>
          </div>
          <div style={{
            flex: 1, padding: '12px 8px', borderRadius: 14,
            background: '#F0EBF8', border: '2px solid ' + VIOLETA,
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: fontBody, fontSize: 11, color: ROSA, fontWeight: 700, marginBottom: 2 }}>MEJOR PRECIO</p>
            <p style={{ fontFamily: fontDisplay, fontSize: 17, color: VIOLETA, fontWeight: 700, margin: 0 }}>39€</p>
            <p style={{ fontFamily: fontBody, fontSize: 11, color: MALVA }}>al año · 3,25€/mes</p>
          </div>
        </div>

        <button
          onClick={onSuscribir}
          style={{
            background: ROSA,
            color: '#FFFFFF',
            fontFamily: fontBody,
            fontWeight: 700,
            fontSize: 15,
            padding: '13px 28px',
            borderRadius: 14,
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            maxWidth: 300,
            marginTop: 4,
          }}
        >
          {esDemo ? '✨ Activar Premium (sin pago)' : '✨ Prueba gratis 7 días'}
        </button>

        <p style={{ fontFamily: fontBody, fontSize: 12, color: '#C0B8D0', margin: 0 }}>
          {esDemo ? 'Rawku está en pruebas: todavía no se cobra nada' : 'Sin permanencia · Cancela cuando quieras'}
        </p>

        {/* ⚠️ AÑADIDO — CASO REAL: este overlay es `fixed inset-0` con
            z-index 100, así que tapaba TODA la pantalla, incluido el
            botón de "volver" de la sección que hay debajo. Quien entraba
            sin ser Premium se quedaba encerrado: o pagaba o recargaba la
            página. Un muro de pago puede bloquear el contenido, pero
            nunca la salida. */}
        {onCerrar && (
          <button
            onClick={onCerrar}
            style={{
              background: 'none',
              border: 'none',
              color: MALVA,
              fontFamily: fontBody,
              fontSize: 14,
              cursor: 'pointer',
              marginTop: 6,
              padding: '8px 16px',
            }}
          >
            ← Ahora no, volver
          </button>
        )}
      </div>
    </div>
  );
}
