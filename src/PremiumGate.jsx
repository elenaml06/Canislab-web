const VIOLETA = '#5A4088'
const ROSA = '#FF6F91'
const TINTA = '#231539'
const MALVA = '#9A8CB8'
const fontDisplay = '"Georgia", serif'
const fontBody = '"DM Sans", sans-serif'

export default function PremiumGate({ premium, onSuscribir, titulo, descripcion, children }) {
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

      {/* Overlay con candado */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(251,247,252,0.6)',
        backdropFilter: 'blur(2px)',
        padding: '24px',
        textAlign: 'center',
        gap: 12,
      }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#F0EBF8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
        }}>
          🔒
        </div>
        <p style={{ fontFamily: fontDisplay, fontSize: 19, color: TINTA, margin: 0 }}>
          {titulo}
        </p>
        <p style={{ fontFamily: fontBody, fontSize: 14, color: MALVA, margin: 0, maxWidth: 260 }}>
          {descripcion}
        </p>
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
            marginTop: 4,
          }}
        >
          ✨ Prueba gratis 7 días
        </button>
        <p style={{ fontFamily: fontBody, fontSize: 12, color: '#C0B8D0', margin: 0 }}>
          Sin permanencia · Cancela cuando quieras
        </p>
      </div>
    </div>
  );
}
