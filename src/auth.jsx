import { useState, useEffect } from 'react'
import { login, registrar, recuperarPassword, entrarConGoogle } from './supabase'

const VIOLETA = '#5A4088'
const ROSA = '#FF6F91'
const PAPEL = '#FBF7FC'
const TINTA = '#231539'
const MALVA = '#9A8CB8'

const fontDisplay = '"Georgia", serif'
const fontBody = '"DM Sans", sans-serif'

export default function Auth({ onAutenticado, onSinCuenta = null, hayDatosSinCuenta = false }) {
  const [modo, setModo] = useState('login') // login | registro | recuperar
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [mensajeOk, setMensajeOk] = useState(null)

  const limpiar = () => { setError(null); setMensajeOk(null) }

  // ⚠️ AÑADIDO (24 agosto) — SI VUELVES DE GOOGLE CON UN ERROR, SE DICE.
  //
  // Cuando el proveedor no está bien configurado (falta activarlo en el
  // panel de Supabase, o el ID de cliente está mal), Google/Supabase NO
  // fallan aquí: te mandan de vuelta a la app con el motivo en la URL. Sin
  // esto, vuelves a la pantalla de entrar exactamente igual que estaba y
  // parece que el botón no hace nada -- el peor error posible, el que no
  // se ve. Se mira en la query Y en el hash porque según el flujo va en
  // uno o en otro.
  useEffect(() => {
    const enQuery = new URLSearchParams(window.location.search)
    const enHash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const motivo = enQuery.get('error_description') || enHash.get('error_description')
    if (!motivo) return
    setError(`No se ha podido entrar con Google: ${motivo}`)
    // Se limpia la URL para que recargar no repita el error para siempre.
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  // ⚠️ AÑADIDO (24 agosto) — ENTRAR CON GOOGLE.
  //
  // No hay `onAutenticado` que llamar: esto SE VA de la página (redirect a
  // Google) y vuelve con la sesión puesta, que recoge onAuthChange. Por eso
  // `cargando` se queda en true a propósito -- si se apagara, se vería el
  // botón "listo" un instante justo antes de irse.
  //
  // El error se enseña TAL CUAL. Si el proveedor no está activado en el
  // panel de Supabase, dice "Unsupported provider", y eso es exactamente lo
  // que hay que leer para saber qué falta: un "algo ha fallado" costaría
  // media hora de buscar dónde.
  const handleGoogle = async () => {
    limpiar()
    setCargando(true)
    try {
      await entrarConGoogle()
    } catch (err) {
      setError(`No se ha podido entrar con Google: ${err.message}`)
      setCargando(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    limpiar()
    setCargando(true)
    try {
      const { user } = await login(email, password)
      onAutenticado(user)
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Email o contraseña incorrectos.'
        : err.message)
    } finally {
      setCargando(false)
    }
  }

  const handleRegistro = async (e) => {
    e.preventDefault()
    limpiar()
    if (!nombre.trim()) { setError('Pon tu nombre para continuar.'); return }
    if (password.length < 6) { setError('La contraseña tiene que tener al menos 6 caracteres.'); return }
    setCargando(true)
    try {
      await registrar(email, password, nombre)
      setMensajeOk('Si el email es nuevo, te hemos mandado un enlace de confirmación. Si ya tenías cuenta, inicia sesión directamente.')
      setModo('login')
    } catch (err) {
      setError(err.message.includes('already registered')
        ? 'Ya existe una cuenta con ese email.'
        : err.message)
    } finally {
      setCargando(false)
    }
  }

  const handleRecuperar = async (e) => {
    e.preventDefault()
    limpiar()
    setCargando(true)
    try {
      await recuperarPassword(email)
      setMensajeOk('Te hemos mandado un email con el enlace para recuperar la contraseña.')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 12,
    border: `1.5px solid #E3DAF0`,
    background: '#FFFFFF',
    color: TINTA,
    fontFamily: fontBody,
    fontSize: 16,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: PAPEL,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
    }}>
      {/* Logo */}
      <p style={{ fontFamily: fontDisplay, fontSize: 32, color: VIOLETA, fontWeight: 700, marginBottom: 4 }}>
        Rawku
      </p>
      <p style={{ fontFamily: fontBody, fontSize: 14, color: MALVA, marginBottom: 40 }}>
        {modo === 'login' ? 'Bienvenida de nuevo' : modo === 'registro' ? 'Crea tu cuenta' : 'Recuperar contraseña'}
      </p>

      {/* Formulario */}
      <div style={{ width: '100%', maxWidth: 380 }}>
        <form onSubmit={modo === 'login' ? handleLogin : modo === 'registro' ? handleRegistro : handleRecuperar}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {modo === 'registro' && (
              <input
                type="text"
                placeholder="Tu nombre"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                style={inputStyle}
                required
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
              required
            />

            {modo !== 'recuperar' && (
              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={inputStyle}
                required
              />
            )}

            {error && (
              <p style={{ color: ROSA, fontFamily: fontBody, fontSize: 13, textAlign: 'center' }}>
                {error}
              </p>
            )}

            {mensajeOk && (
              <p style={{ color: '#2E7D32', fontFamily: fontBody, fontSize: 13, textAlign: 'center' }}>
                {mensajeOk}
              </p>
            )}

            <button
              type="submit"
              disabled={cargando}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 14,
                background: cargando ? MALVA : VIOLETA,
                color: '#FFFFFF',
                fontFamily: fontBody,
                fontWeight: 700,
                fontSize: 16,
                border: 'none',
                cursor: cargando ? 'default' : 'pointer',
                marginTop: 4,
              }}
            >
              {cargando
                ? 'Un momento...'
                : modo === 'login' ? 'Entrar'
                : modo === 'registro' ? 'Crear cuenta'
                : 'Enviar enlace'}
            </button>
          </div>
        </form>

        {/* ⚠️ AÑADIDO (24 agosto) — ENTRAR CON GOOGLE.
            Va DEBAJO del formulario y no encima: quien ya tiene cuenta de
            correo aquí entra por costumbre, y moverle el botón de sitio es
            peor que ahorrarle un toque a quien empieza.
            En "recuperar contraseña" no se pinta: ahí no pega nada. */}
        {modo !== 'recuperar' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: '#E3DAF0' }} />
              <span style={{ color: MALVA, fontFamily: fontBody, fontSize: 12 }}>o</span>
              <div style={{ flex: 1, height: 1, background: '#E3DAF0' }} />
            </div>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={cargando}
              style={{
                width: '100%', padding: '14px', borderRadius: 14,
                background: '#FFFFFF', color: TINTA,
                border: '1.5px solid #E3DAF0',
                fontFamily: fontBody, fontWeight: 700, fontSize: 15,
                cursor: cargando ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              {/* El logo de Google, en SVG y con sus colores oficiales.
                  Va inline porque el archivo no puede depender de una
                  imagen externa que un día deje de cargar. */}
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.7-.4-3.9H24v7.1h12.1c-.2 1.8-1.6 4.6-4.5 6.5l-.04.3 6.5 5 .5.1c4.1-3.8 6.5-9.4 6.5-15.1z"/>
                <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3 0-6.7 5.2-.1.3C8 40.6 15.4 46 24 46z"/>
                <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l0-.3-6.8-5.3-.2.1C2.9 17 2 20.4 2 24s.9 7 2.5 9.9l7-5.5z"/>
                <path fill="#EB4335" d="M24 9.9c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.7 29.9 1.5 24 1.5 15.4 1.5 8 7 4.5 14.1l7 5.5c1.8-5.3 6.7-9.7 12.5-9.7z"/>
              </svg>
              Continuar con Google
            </button>
          </div>
        )}

        {/* Links de cambio de modo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 24 }}>
          {modo === 'login' && (
            <>
              <button onClick={() => { setModo('registro'); limpiar() }}
                style={{ background: 'none', border: 'none', color: VIOLETA, fontFamily: fontBody, fontSize: 14, cursor: 'pointer' }}>
                ¿No tienes cuenta? Créala gratis
              </button>
              <button onClick={() => { setModo('recuperar'); limpiar() }}
                style={{ background: 'none', border: 'none', color: MALVA, fontFamily: fontBody, fontSize: 13, cursor: 'pointer' }}>
                Olvidé mi contraseña
              </button>
            </>
          )}
          {(modo === 'registro' || modo === 'recuperar') && (
            <button onClick={() => { setModo('login'); limpiar() }}
              style={{ background: 'none', border: 'none', color: VIOLETA, fontFamily: fontBody, fontSize: 14, cursor: 'pointer' }}>
              ← Volver al inicio de sesión
            </button>
          )}
        </div>

        {/* ⚠️ AÑADIDO — ENTRAR SIN CUENTA. Pedido expreso: "necesito poder
            entrar a la aplicación sin que me pidan iniciar sesión".

            Va debajo y separado por una línea, no como un tercer botón
            más: quien ya tiene cuenta no debería tropezarse con esto. Y
            dice lo que va a pasar de verdad -- que los datos se quedan
            en este móvil -- porque descubrirlo después, al cambiar de
            teléfono y no encontrar nada, es la peor forma de enterarse. */}
        {onSinCuenta && (
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid #E3DAF0`, textAlign: 'center' }}>
            <button
              onClick={onSinCuenta}
              style={{
                width: '100%', padding: '14px', borderRadius: 14,
                background: 'transparent', color: VIOLETA,
                border: `1.5px solid ${VIOLETA}`,
                fontFamily: fontBody, fontWeight: 700, fontSize: 15, cursor: 'pointer',
              }}
            >
              {hayDatosSinCuenta ? 'Seguir sin cuenta' : 'Probar sin crear cuenta'}
            </button>
            <p style={{ margin: '10px 4px 0', color: MALVA, fontFamily: fontBody, fontSize: 12, lineHeight: 1.5 }}>
              {hayDatosSinCuenta
                ? 'Lo que ya tienes sigue aquí, no se ha borrado. Si creas la cuenta con este mismo móvil, sube solo.'
                : 'Funciona todo igual. Los datos se guardan en este móvil, así que no los verás desde otro — cuando quieras, creas la cuenta y se suben solos.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
