import { useState, useRef, useEffect } from 'react'
import useAuth from '../hooks/useAuth'
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
}

function initials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
}

export default function UserMenu({ activeTab, onTabChange }) {
  const { user, logout } = useAuth()
  const [open, setOpen]         = useState(false)
  const [pushStatus, setPushStatus] = useState('idle') // idle | subscribed | unsupported | loading
  const ref = useRef(null)

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Estado push al montar
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported')
      return
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
        if (perm !== 'granted') {
          toast.error('Permiso denegado')
          setPushStatus('idle')
          return
        }
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
    window.location.reload()
  }

  const isAdmin = user?.role === 'admin'
  const nombre  = user?.full_name || user?.username || '—'
  const rol     = ROLE_LABEL[user?.role] || user?.role || ''

  return (
    <div className="relative shrink-0" ref={ref}>
      {/* Trigger — avatar con iniciales */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-xl border transition-colors ${
          open
            ? 'bg-slate-800 border-slate-800 text-white'
            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
          open ? 'bg-slate-600 text-white' : 'bg-slate-100 text-slate-600'
        }`}>
          {initials(nombre)}
        </span>
        <span className="text-xs font-medium hidden sm:block max-w-[100px] truncate">{nombre.split(' ')[0]}</span>
        <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden">

          {/* Cabecera usuario */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800 truncate">{nombre}</p>
            <p className="text-xs text-slate-400 mt-0.5">{rol}</p>
            {user?.celula && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                {user.celula}{user.microcelda ? ` · ${user.microcelda}` : ''}
              </p>
            )}
          </div>

          <div className="py-1">
            {/* Usuarios — solo admin */}
            {isAdmin && (
              <button
                onClick={() => { onTabChange(activeTab === 'usuarios' ? 'resumen' : 'usuarios'); setOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  activeTab === 'usuarios'
                    ? 'bg-violet-50 text-violet-700 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Gestión de usuarios
                {activeTab === 'usuarios' && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500" />
                )}
              </button>
            )}

            {/* Notificaciones push */}
            {pushStatus !== 'unsupported' && (
              <button
                onClick={handlePushToggle}
                disabled={pushStatus === 'loading'}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <svg className={`w-4 h-4 shrink-0 ${pushStatus === 'subscribed' ? 'text-emerald-500' : 'text-slate-400'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span>
                  {pushStatus === 'loading'    ? 'Configurando…'      :
                   pushStatus === 'subscribed' ? 'Notificaciones ON'  :
                                                 'Activar notificaciones'}
                </span>
                {pushStatus === 'subscribed' && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            )}
          </div>

          {/* Cerrar sesión */}
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
      )}
    </div>
  )
}
