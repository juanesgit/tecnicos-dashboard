import { useState, useEffect, useCallback } from 'react'
import useAuthStore from '../store/authStore'

const API = '/api'

const NIVEL_CFG = {
  leve:     { label: 'Leve',     bg: 'bg-yellow-50',  border: 'border-yellow-400', badge: 'bg-yellow-100 text-yellow-800', icon: '⚠️' },
  moderada: { label: 'Moderada', bg: 'bg-orange-50',  border: 'border-orange-400', badge: 'bg-orange-100 text-orange-800', icon: '🔶' },
  critica:  { label: 'Crítica',  bg: 'bg-red-50',     border: 'border-red-500',    badge: 'bg-red-100 text-red-800',       icon: '🚨' },
}
const SLA_MIN = { leve: 45, moderada: 20, critica: 10 }
const ORDEN   = { critica: 0, moderada: 1, leve: 2 }

function useTiempo(fechaCreacion) {
  const [min, setMin] = useState(0)
  useEffect(() => {
    if (!fechaCreacion) return
    const calc = () => setMin(Math.max(0, Math.floor((Date.now() - new Date(fechaCreacion + 'Z').getTime()) / 60000)))
    calc()
    const id = setInterval(calc, 30000)
    return () => clearInterval(id)
  }, [fechaCreacion])
  return min
}

function fmtMin(m) {
  if (!m && m !== 0) return '—'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

function SlaBar({ nivel, fechaCreacion, estado }) {
  const transcurrido = useTiempo(fechaCreacion)
  if (estado === 'cerrada') return null
  const sla = SLA_MIN[nivel] || 45
  const pct = Math.min(100, Math.round((transcurrido / sla) * 100))
  const vencido = pct >= 100
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[11px] text-gray-500 mb-1">
        <span>SLA: {fmtMin(sla)}</span>
        <span className={vencido ? 'text-red-600 font-bold' : ''}>
          {vencido ? `⏰ Vencido (+${fmtMin(transcurrido - sla)})` : `${fmtMin(transcurrido)} transcurrido`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${vencido ? 'bg-red-500' : pct > 75 ? 'bg-orange-400' : 'bg-green-400'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function AlarmaCard({ alarma, onNota, onCerrar }) {
  const [abierto, setAbierto]       = useState(false)
  const [editNota, setEditNota]     = useState(false)
  const [notaTxt, setNotaTxt]       = useState(alarma.notas || '')
  const cfg = NIVEL_CFG[alarma.nivel] || NIVEL_CFG.leve
  const transcurrido = useTiempo(alarma.fecha_creacion)

  const guardar = async () => { await onNota(alarma.id, notaTxt); setEditNota(false) }

  return (
    <div className={`rounded-xl border-l-4 ${cfg.border} ${cfg.bg} p-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{cfg.icon}</span>
            <span className="font-semibold text-gray-900 text-sm truncate">{alarma.tecnico}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label.toUpperCase()}</span>
            {alarma.estado === 'cerrada' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">CERRADA</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{alarma.celula} › {alarma.microcelda}</div>
          {alarma.estado === 'abierta' && (
            <div className="text-xs text-gray-500 mt-0.5">
              Hace {fmtMin(transcurrido)} · Asig: <strong>{alarma.asignado_nombre}</strong>
            </div>
          )}
          {alarma.estado === 'cerrada' && (
            <div className="text-xs text-gray-400 mt-0.5">
              Resuelta en {fmtMin(alarma.tiempo_resolucion_min)} ·{' '}
              {alarma.sla_cumplido
                ? <span className="text-green-600 font-medium">✓ SLA ok</span>
                : <span className="text-red-500 font-medium">✗ SLA vencido</span>}
            </div>
          )}
        </div>
        <button onClick={() => setAbierto(e => !e)} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg shrink-0">
          <svg className={`w-4 h-4 transition-transform ${abierto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <SlaBar nivel={alarma.nivel} fechaCreacion={alarma.fecha_creacion} estado={alarma.estado} />

      {abierto && (
        <div className="mt-3 pt-3 border-t border-black/10 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">Documentación</span>
              {alarma.estado === 'abierta' && !editNota && (
                <button onClick={() => setEditNota(true)} className="text-xs text-indigo-600 hover:underline">
                  {alarma.notas ? 'Editar' : '+ Agregar nota'}
                </button>
              )}
            </div>
            {editNota ? (
              <div className="space-y-2">
                <textarea className="w-full text-xs border border-gray-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" rows={3}
                  value={notaTxt} onChange={e => setNotaTxt(e.target.value)} placeholder="Motivo del retraso y acciones tomadas..." />
                <div className="flex gap-2">
                  <button onClick={guardar} className="flex-1 text-xs bg-indigo-600 text-white rounded-lg py-1.5 font-medium hover:bg-indigo-700">Guardar</button>
                  <button onClick={() => { setEditNota(false); setNotaTxt(alarma.notas || '') }} className="flex-1 text-xs bg-gray-200 text-gray-700 rounded-lg py-1.5">Cancelar</button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-600 italic">{alarma.notas || 'Sin documentación aún.'}</p>
            )}
          </div>
          {alarma.estado === 'abierta' && (
            <button onClick={() => onCerrar(alarma.id, alarma.notas)} className="w-full text-xs bg-gray-800 text-white rounded-lg py-2 font-medium hover:bg-gray-900">
              Cerrar alarma manualmente
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function Alarmas() {
  const token   = useAuthStore(s => s.token)
  const user    = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'

  const [alarmas, setAlarmas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [filtro,  setFiltro]  = useState('abiertas')

  const cargar = useCallback(async () => {
    try {
      setError(null)
      const ep = isAdmin && filtro === 'todas' ? '/alarmas/todas' : '/alarmas/mis'
      const res = await fetch(`${API}${ep}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Error cargando alarmas')
      setAlarmas(await res.json())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [token, isAdmin, filtro])

  useEffect(() => { cargar(); const id = setInterval(cargar, 30000); return () => clearInterval(id) }, [cargar])

  const handleNota = async (id, notas) => {
    await fetch(`${API}/alarmas/${id}/nota`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notas }),
    }); await cargar()
  }
  const handleCerrar = async (id, notas) => {
    if (!window.confirm('¿Cerrar esta alarma manualmente?')) return
    await fetch(`${API}/alarmas/${id}/cerrar`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notas: notas || null }),
    }); await cargar()
  }

  const abiertas  = alarmas.filter(a => a.estado === 'abierta')
  const mostrar   = filtro === 'todas' ? alarmas : abiertas
  const ordenadas = [...mostrar].sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'abierta' ? -1 : 1
    return (ORDEN[a.nivel] ?? 9) - (ORDEN[b.nivel] ?? 9)
  })

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-white border-b border-slate-200 px-4 pt-4 pb-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Alarmas</h1>
              <p className="text-xs text-gray-500">
                {abiertas.length} abiertas
                {abiertas.filter(a => a.nivel === 'critica').length > 0 && ` · ${abiertas.filter(a => a.nivel === 'critica').length} críticas`}
              </p>
            </div>
            <button onClick={cargar} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            {[{ id: 'abiertas', label: `Abiertas (${abiertas.length})` }, { id: 'todas', label: `Todas (${alarmas.length})` }].map(f => (
              <button key={f.id} onClick={() => setFiltro(f.id)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${filtro === f.id ? 'bg-red-600 text-white' : 'bg-slate-100 text-gray-600 hover:bg-slate-200'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        {loading && <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" /></div>}
        {error   && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}
        {!loading && !error && ordenadas.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-gray-500 text-sm font-medium">Sin alarmas abiertas</p>
            <p className="text-gray-400 text-xs mt-1">Todo está en orden.</p>
          </div>
        )}
        {ordenadas.map(a => <AlarmaCard key={a.id} alarma={a} onNota={handleNota} onCerrar={handleCerrar} isAdmin={isAdmin} />)}
      </div>
    </div>
  )
}
