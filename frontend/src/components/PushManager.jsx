import { useState, useEffect } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function PushManager() {
  const [status, setStatus] = useState('idle') // idle | subscribed | unsupported | loading
  const [permission, setPermission] = useState(Notification.permission)

  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    setStatus(sub ? 'subscribed' : 'idle')
    setPermission(Notification.permission)
  }

  const handleSubscribe = async () => {
    if (status === 'loading') return
    setStatus('loading')
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        toast.error('Permiso de notificaciones denegado')
        setStatus('idle')
        return
      }

      // Obtener clave VAPID pública
      const { data: { vapid_public_key } } = await api.get('/push/vapid-public-key')

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapid_public_key),
      })

      const subJson = sub.toJSON()
      await api.post('/push/subscribe/auth', {
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
      })

      setStatus('subscribed')
      toast.success('Notificaciones activadas')
    } catch (err) {
      console.error('Push subscribe error:', err)
      toast.error('No se pudo activar las notificaciones')
      setStatus('idle')
    }
  }

  const handleUnsubscribe = async () => {
    setStatus('loading')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        await api.delete('/push/unsubscribe', {
          data: { endpoint: sub.endpoint },
        })
      }
      setStatus('idle')
      toast.success('Notificaciones desactivadas')
    } catch {
      toast.error('Error al desactivar notificaciones')
      setStatus('idle')
    }
  }

  if (status === 'unsupported') {
    return (
      <span className="text-xs text-slate-400 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Push no soportado
      </span>
    )
  }

  if (status === 'subscribed') {
    return (
      <button
        onClick={handleUnsubscribe}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors min-h-0 font-medium"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
        Notificaciones ON
      </button>
    )
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={status === 'loading'}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:bg-slate-500 text-white transition-colors min-h-0 font-medium"
    >
      {status === 'loading' ? (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      )}
      {status === 'loading' ? 'Activando…' : 'Activar notificaciones'}
    </button>
  )
}
