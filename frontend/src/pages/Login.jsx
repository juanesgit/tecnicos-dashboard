import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAuth from '../hooks/useAuth'

export default function Login() {
  const navigate = useNavigate()
  const { setAuth } = useAuth()
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.username || !form.password) {
      toast.error('Ingresa usuario y contraseña')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', form)
      setAuth(data.access_token, data.user)
      toast.success(`Bienvenido, ${data.user.full_name || data.user.username}`)
      navigate('/', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.detail || 'Credenciales incorrectas'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0b0b0b' }}
    >
      <div className="w-full max-w-md">

        {/* Logo — imagen original */}
        <div className="flex justify-center mb-10">
          <img
            src="/own360-logo.png"
            alt="OWN360"
            style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
          />
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{
            background: '#111111',
            border: '1px solid rgba(204,39,53,0.22)',
          }}
        >
          <h2 className="font-semibold text-lg mb-6 text-white text-center">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#FFFFFF' }}>
                Usuario
              </label>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                autoComplete="username"
                placeholder="tu_usuario"
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none transition-all"
                style={{
                  background: 'rgba(204,39,53,0.1)',
                  border: '1px solid rgba(204,39,53,0.3)',
                }}
                onFocus={e => e.target.style.borderColor = '#E03040'}
                onBlur={e  => e.target.style.borderColor = 'rgba(204,39,53,0.3)'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#FFFFFF' }}>
                Contraseña
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none transition-all"
                style={{
                  background: 'rgba(204,39,53,0.1)',
                  border: '1px solid rgba(204,39,53,0.3)',
                }}
                onFocus={e => e.target.style.borderColor = '#E03040'}
                onBlur={e  => e.target.style.borderColor = 'rgba(204,39,53,0.3)'}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-white mt-2"
              style={{ background: loading ? '#8C1A22' : '#CC2735', opacity: loading ? 0.7 : 1 }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#E03040' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#CC2735' }}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ingresando…
                </>
              ) : 'Ingresar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(160,150,198,0.4)' }}>
          Acceso restringido al personal autorizado
        </p>
      </div>
    </div>
  )
}
