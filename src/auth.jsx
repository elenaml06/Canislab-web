import { useState } from 'react'
import { login, registrar, recuperarPassword } from './supabase'

const VIOLETA = '#5A4088'
const ROSA = '#FF6F91'
const PAPEL = '#FBF7FC'
const TINTA = '#231539'
const MALVA = '#9A8CB8'

const fontDisplay = '"Georgia", serif'
const fontBody = '"DM Sans", sans-serif'

export default function Auth({ onAutenticado }) {
  const [modo, setModo] = useState('login') // login | registro | recuperar
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [mensajeOk, setMensajeOk] = useState(null)

  const limpiar = () => { setError(null); setMensajeOk(null) }

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
      setMensajeOk('¡Cuenta creada! Revisa tu email para confirmarla y luego inicia sesión.')
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
      </div>
    </div>
  )
}
