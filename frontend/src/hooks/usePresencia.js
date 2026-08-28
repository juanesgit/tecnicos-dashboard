/**
 * usePresencia — abre una conexión WebSocket persistente con el backend.
 * El servidor registra al usuario como "en línea" mientras la conexión vive.
 * Reconecta automáticamente si se pierde la conexión.
 */
import { useEffect, useRef } from 'react'
import useAuth from './useAuth'

const PING_MS = 30_000  // ping cada 30 s para mantener viva la conexión

function wsUrl(token) {
  // En desarrollo Vite (puerto 5173) conecta directo al backend (8003).
  // En producción usa el mismo host que el navegador.
  if (import.meta.env.DEV) {
    return `ws://127.0.0.1:8003/ws/presencia?token=${token}`
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws/presencia?token=${token}`
}

export function usePresencia() {
  const { token } = useAuth()
  const wsRef   = useRef(null)
  const pingRef = useRef(null)
  const alive   = useRef(true)

  useEffect(() => {
    if (!token) return
    alive.current = true

    const connect = () => {
      if (!alive.current) return

      const ws = new WebSocket(wsUrl(token))
      wsRef.current = ws

      ws.onopen = () => {
        // Ping periódico para que el servidor no cierre la conexión inactiva
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping')
        }, PING_MS)
      }

      ws.onclose = () => {
        clearInterval(pingRef.current)
        if (alive.current) {
          // Reconectar tras 5 s (red caída, reinicio del servidor, etc.)
          setTimeout(connect, 5_000)
        }
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      alive.current = false
      clearInterval(pingRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null  // evita reconexión al desmontar
        wsRef.current.close()
      }
    }
  }, [token])
}
