/**
 * useActividad — tracking silencioso de eventos y tiempo activo.
 *
 * - Registra el evento de pestaña activa cuando cambia.
 * - Envía un heartbeat cada 5 min mientras el navegador está en primer plano.
 *   El backend usa los heartbeats para calcular tiempo_activo_min por usuario/día.
 */
import { useEffect, useRef } from 'react'
import api from '../services/api'

const HEARTBEAT_MS = 5 * 60 * 1000 // 5 minutos

export function useActividad(evento) {
  const lastEvento = useRef(null)
  const hbRef      = useRef(null)

  /* ── Evento de pestaña ─────────────────────────────────────────── */
  useEffect(() => {
    if (!evento || evento === lastEvento.current) return
    lastEvento.current = evento
    api.post('/actividad', { evento }).catch(() => {})
  }, [evento])

  /* ── Heartbeat mientras la pestaña del navegador está visible ───── */
  useEffect(() => {
    const sendHb = () => {
      if (document.visibilityState === 'visible') {
        api.post('/actividad', { evento: 'heartbeat' }).catch(() => {})
      }
    }

    const startHb = () => {
      if (hbRef.current) return
      hbRef.current = setInterval(sendHb, HEARTBEAT_MS)
    }

    const stopHb = () => {
      if (hbRef.current) {
        clearInterval(hbRef.current)
        hbRef.current = null
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        startHb()
      } else {
        stopHb()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    if (document.visibilityState === 'visible') startHb()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stopHb()
    }
  }, []) // solo al montar/desmontar
}
