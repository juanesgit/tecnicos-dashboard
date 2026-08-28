/**
 * useActividad — hook silencioso para tracking de eventos de uso.
 * Llama POST /api/actividad cada vez que el usuario cambia de pestaña.
 * Los errores se ignoran (no interrumpen la UX).
 */
import { useEffect, useRef } from 'react'
import api from '../services/api'

export function useActividad(evento) {
  const lastEvento = useRef(null)

  useEffect(() => {
    if (!evento || evento === lastEvento.current) return
    lastEvento.current = evento

    // Fire-and-forget: no await, no toast
    api.post('/actividad', { evento }).catch(() => {})
  }, [evento])
}
