import { useState, useEffect } from 'react'
import useAuth from '../hooks/useAuth'
import useTabStore from '../hooks/useTabStore'
import api from '../services/api'
import toast from 'react-hot-toast'

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

const ROLE_LABEL = {
  admin:                 'Administrador',
  lider_celula:          'Líder de célula',
  supervisor_microcelda: 'Supervisor',
  supervisor_ccot:       'Supervisor CCOT',
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const { setActiveTab } = useTabStore()
  const [menuOpen, setMenuOpen]     = useState(false)
  const [pushStatus, setPushStatus] = useState('idle')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported'); return
    }
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => setPushStatus(sub ? 'subscribed' : 'idle'))
    )
  }, [])

  const handlePushToggle = async () => {
    if (pushStatus === 'loading' || pushStatus === 'unsupported') return
    setPushStatus('loading')
    try {
      if (pushStatus === 'subscribed') {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await sub.unsubscribe()
          await api.delete('/push/unsubscribe', { data: { endpoint: sub.endpoint } })
        }
        setPushStatus('idle')
        toast.success('Notificaciones desactivadas')
      } else {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') { toast.error('Permiso denegado'); setPushStatus('idle'); return }
        const { data: { vapid_public_key } } = await api.get('/push/vapid-public-key')
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(vapid_public_key),
        })
        const j = sub.toJSON()
        await api.post('/push/subscribe/auth', { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } })
        setPushStatus('subscribed')
        toast.success('Notificaciones activadas')
      }
    } catch {
      toast.error('Error con las notificaciones')
      setPushStatus('idle')
    }
  }

  const handleLogout = () => {
    logout()
    toast.success('Sesión cerrada')
  }

  return (
    <header
      className="h-14 sticky top-0 z-40 flex items-center px-4 shadow-lg"
      style={{ background: '#0b0a18', borderBottom: '1px solid rgba(123,62,244,0.2)' }}
    >
      {/* Logo — imagen original, recortada al alto del navbar */}
      <div className="flex-1" style={{ height: 44, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
        <img
          src="/own360-logo.png"
          alt="OWN360"
          style={{ height: 80, width: 'auto', transform: 'scale(1.05)', transformOrigin: 'left center', flexShrink: 0 }}
        />
      </div>

      {/* Menú usuario */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-colors text-sm text-white/80 hover:bg-white/5"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold uppercase text-white"
            style={{ background: '#5C14D4' }}
          >
            {user?.username?.[0] ?? 'U'}
          </div>
          <span className="hidden sm:block max-w-[120px] truncate">
            {user?.full_name || user?.username}
          </span>
          <svg
            className={`w-4 h-4 text-white/40 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-100 z-20 overflow-hidden">

              {/* Cabecera */}
              <div className="px-4 py-3 border-b border-slate-100" style={{ background: '#0b0a18' }}>
                <p className="text-xs" style={{ color: 'rgba(160,150,198,0.7)' }}>Conectado como</p>
                <p className="text-sm font-semibold truncate text-white">{user?.full_name || user?.username}</p>
                <p className="text-xs" style={{ color: '#A096C6' }}>{ROLE_LABEL[user?.role] || user?.role}</p>
                {user?.celula && (
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(160,150,198,0.5)' }}>
                    {user.celula}{user.microcelda ? ` · ${user.microcelda}` : ''}
                  </p>
                )}
              </div>

              <div className="py-1">
                {pushStatus !== 'unsupported' && (
                  <button
                    onClick={handlePushToggle}
                    disabled={pushStatus === 'loading'}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    <svg
                      className={`w-4 h-4 shrink-0 ${pushStatus === 'subscribed' ? 'text-emerald-500' : 'text-slate-400'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {pushStatus === 'loading'    ? 'Configurando…'     :
                     pushStatus === 'subscribed' ? 'Notificaciones ON' : 'Activar notificaciones'}
                    {pushStatus === 'subscribed' && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                  </button>
                )}
              </div>

              <div className="border-t border-slate-100 py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Cerrar sesión
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
