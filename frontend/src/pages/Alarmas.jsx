import { useState, useEffect, useCallback } from 'react'
import useAuthStore from '../hooks/useAuth'

const API = '/api'

const NIVEL_CFG = {
  leve:     { label: 'Leve',     border: 'border-l-yellow-400', bg: 'bg-yellow-50',  badge: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-400', icon: '⚠️' },
  moderada: { label: 'Moderada', border: 'border-l-orange-400', bg: 'bg-orange-50',  badge: 'bg-orange-100 text-orange-800', dot: 'bg-orange-400', icon: '🔶' },
  critica:  { label: 'Crítica',  border: 'border-l-red-500',    bg: 'bg-red-50',     badge: 'bg-red-100 text-red-800',       dot: 'bg-red-500',    icon: '🚨' },
}
const SLA_MIN = { leve: 45, moderada: 20, critica: 10 }

function useTiempo(fechaCreacion) {
  const [min, setMin] = useState(0)
  useEffect(() => {
    if (!fechaCreacion) return
    const calc = () => setMin(Math.max(0, Math.floor((Date.now() - new Date(fechaCreacion).getTime()) / 60000)))
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

// ── Barra SLA compacta ────────────────────────────────────────────────────────
function SlaInline({ nivel, fechaCreacion, estado }) {
  const transcurrido = useTiempo(fechaCreacion)
  if (estado === 'cerrada') return null
  const sla     = SLA_MIN[nivel] || 45
  const pct     = Math.min(100, Math.round((transcurrido / sla) * 100))
  const vencido = pct >= 100
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full ${vencido ? 'bg-red-500' : pct > 75 ? 'bg-orange-400' : 'bg-green-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[11px] font-medium tabular-nums ${vencido ? 'text-red-600' : 'text-gray-500'}`}>
        {vencido ? `+${fmtMin(transcurrido - sla)}` : fmtMin(transcurrido)}
      </span>
    </div>
  )
}

// ── Fila de alarma ────────────────────────────────────────────────────────────
function AlarmaRow({ alarma, expandido, onToggle, onNota, onCerrar, onGestionar }) {
  const [editNota, setEditNota] = useState(false)
  const [notaTxt, setNotaTxt]   = useState(alarma.notas || '')
  const cfg = NIVEL_CFG[alarma.nivel] || NIVEL_CFG.leve
  const transcurrido = useTiempo(alarma.fecha_creacion)
  const esCerrada    = ['cerrada', 'cerrada_gestionada', 'cerrada_sin_gestion'].includes(alarma.estado)
  const enGestion    = alarma.estado === 'en_gestion'

  const guardar = async () => { await onNota(alarma.id, notaTxt); setEditNota(false) }

  return (
    <div className={`border-b border-gray-100 last:border-0 ${expandido ? cfg.bg : 'bg-white hover:bg-slate-50'} transition-colors`}>
      <button
        type="button"
        onClick={onToggle}
        style={{ WebkitTapHighlightColor: 'transparent' }}
        className={`w-full flex items-center gap-3 px-4 py-3 border-l-4 ${cfg.border} text-left`}
      >
        <span className="text-base shrink-0">{cfg.icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 truncate">{alarma.tecnico}</span>
            {enGestion && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 animate-pulse">📋 EN GESTIÓN</span>
            )}
            {alarma.estado === 'cerrada_gestionada' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">✅ GESTIONADA</span>
            )}
            {alarma.estado === 'cerrada_sin_gestion' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">⚠️ SIN GESTIÓN</span>
            )}
            {alarma.estado === 'cerrada' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">CERRADA</span>
            )}
          </div>
          <div className="text-xs text-gray-400 truncate">
            {alarma.celula} › {alarma.microcelda}
            {alarma.ciudad && alarma.ciudad !== 'Sin clasificar' && ` · ${alarma.ciudad}`}
          </div>
        </div>

        {/* Info extra desktop */}
        <div className="hidden md:flex flex-col items-end shrink-0 min-w-[160px]">
          {alarma.actividad && (
            <span className="text-[11px] text-gray-400 truncate max-w-[160px]" title={alarma.actividad}>📋 {alarma.actividad}</span>
          )}
          {alarma.ot && (
            <span className="text-[11px] font-mono text-gray-400">OT: {alarma.ot}</span>
          )}
          {!esCerrada && alarma.asignado_nombre && (
            <span className="text-[11px] text-gray-400 truncate max-w-[160px]">👤 {alarma.asignado_nombre}</span>
          )}
        </div>

        {!esCerrada && !enGestion
          ? <SlaInline nivel={alarma.nivel} fechaCreacion={alarma.fecha_creacion} estado={alarma.estado} />
          : esCerrada
            ? <span className="text-[11px] shrink-0">
                {alarma.sla_cumplido
                  ? <span className="text-green-600 font-medium">✓ SLA</span>
                  : <span className="text-red-500 font-medium">✗ SLA</span>}
              </span>
            : null
        }

        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expandido ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expandido && (
        <div className="px-4 pb-4 space-y-3 border-l-4 border-l-transparent">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 pt-1">
            <>
              <span className="text-gray-400">Creada</span>
              <span>{new Date(alarma.fecha_creacion).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </>
            {alarma.tipo_retraso && (
              <>
                <span className="text-gray-400">Tipo retraso</span>
                <span>{alarma.tipo_retraso}{alarma.minutos_retraso_inicio > 0 && ` · ${fmtMin(alarma.minutos_retraso_inicio)} al crear`}</span>
              </>
            )}
            {alarma.actividad && (
              <>
                <span className="text-gray-400">Actividad</span>
                <span className="truncate" title={alarma.actividad}>{alarma.actividad}</span>
              </>
            )}
            {alarma.ot && (
              <>
                <span className="text-gray-400">OT</span>
                <span className="font-mono">{alarma.ot}</span>
              </>
            )}
            {!esCerrada && (
              <>
                <span className="text-gray-400">Asignado a</span>
                <span className="font-medium">{alarma.asignado_nombre}</span>
              </>
            )}
            {!esCerrada && (
              <>
                <span className="text-gray-400">Abierta hace</span>
                <span>{fmtMin(transcurrido)}</span>
              </>
            )}
            {esCerrada && alarma.fecha_cierre && (
              <>
                <span className="text-gray-400">Cerrada</span>
                <span>{new Date(alarma.fecha_cierre).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </>
            )}
            {esCerrada && (
              <>
                <span className="text-gray-400">Resolución</span>
                <span>{fmtMin(alarma.tiempo_resolucion_min)}</span>
              </>
            )}
            <span className="text-gray-400">SLA</span>
            <span>{fmtMin(SLA_MIN[alarma.nivel])}</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">Documentación</span>
              {!esCerrada && !editNota && (
                <button type="button" onClick={() => setEditNota(true)} className="text-xs text-indigo-600 hover:underline">
                  {alarma.notas ? 'Editar' : '+ Agregar nota'}
                </button>
              )}
            </div>
            {editNota ? (
              <div className="space-y-2">
                <textarea
                  className="w-full text-xs border border-gray-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  rows={3} value={notaTxt} onChange={e => setNotaTxt(e.target.value)}
                  placeholder="Motivo del retraso y acciones tomadas..."
                />
                <div className="flex gap-2">
                  <button type="button" onClick={guardar} className="flex-1 text-xs bg-indigo-600 text-white rounded-lg py-1.5 font-medium hover:bg-indigo-700">Guardar</button>
                  <button type="button" onClick={() => { setEditNota(false); setNotaTxt(alarma.notas || '') }} className="flex-1 text-xs bg-gray-200 text-gray-700 rounded-lg py-1.5">Cancelar</button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">{alarma.notas || 'Sin documentación aún.'}</p>
            )}
          </div>

          {!esCerrada && onGestionar && (
            <button
              type="button"
              onClick={() => onGestionar(alarma)}
              className="w-full text-xs bg-amber-600 text-white rounded-lg py-2 font-medium hover:bg-amber-700"
            >
              📋 Documentar gestión y cerrar
            </button>
          )}
          {!esCerrada && !enGestion && (
            <button
              type="button"
              onClick={() => onCerrar(alarma.id, alarma.notas)}
              className="w-full text-xs bg-gray-800 text-white rounded-lg py-2 font-medium hover:bg-gray-900"
            >
              Cerrar sin documentar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal de gestión ─────────────────────────────────────────────────────────
function ModalGestion({ alarma, causas, onClose, onConfirm }) {
  const [causaId,  setCausaId]  = useState('')
  const [notas,    setNotas]    = useState('')
  const [saving,   setSaving]   = useState(false)

  if (!alarma) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!causaId) return
    setSaving(true)
    try { await onConfirm(alarma.id, parseInt(causaId), notas) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Documentar gestión</h2>
            <p className="text-xs text-gray-500 mt-0.5">{alarma.tecnico} · {alarma.celula}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Causa del retraso *</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={causaId}
              onChange={e => setCausaId(e.target.value)}
              required
            >
              <option value="">Selecciona una causa…</option>
              {causas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notas adicionales</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
              rows={3}
              placeholder="Acciones tomadas, observaciones…"
              value={notas}
              onChange={e => setNotas(e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm bg-gray-100 text-gray-700 rounded-lg py-2.5 font-medium hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !causaId}
              className="flex-1 text-sm bg-amber-600 text-white rounded-lg py-2.5 font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Confirmar y cerrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Tab button ────────────────────────────────────────────────────────────────
function Tab({ active, onClick, color, children }) {
  const activeColors = {
    todas:    'bg-gray-800 text-white',
    critica:  'bg-red-600 text-white',
    moderada: 'bg-orange-500 text-white',
    leve:     'bg-yellow-500 text-white',
    cerradas: 'bg-gray-500 text-white',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap select-none ${
        active ? (activeColors[color] || 'bg-gray-800 text-white') : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

// ── Panel de filtros inline ───────────────────────────────────────────────────
function PanelFiltros({ filtros, setFiltros, celulaOpts, microceldaOpts, onClose }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Filtros</span>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-sm leading-none"
        >✕</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Célula */}
        <select
          value={filtros.celula || ''}
          onChange={e => setFiltros(f => ({ ...f, celula: e.target.value, microcelda: '' }))}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">Todas las células</option>
          {celulaOpts.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Microcelda */}
        <select
          value={filtros.microcelda || ''}
          onChange={e => setFiltros(f => ({ ...f, microcelda: e.target.value }))}
          disabled={!filtros.celula}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-40"
        >
          <option value="">Todas las microceldas</option>
          {microceldaOpts.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* Técnico */}
        <input
          type="text"
          value={filtros.tecnico || ''}
          onChange={e => setFiltros(f => ({ ...f, tecnico: e.target.value }))}
          placeholder="Buscar técnico..."
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 min-w-[130px] focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        {/* Limpiar */}
        <button
          type="button"
          onClick={() => { setFiltros(f => ({ ...f, celula: '', microcelda: '', tecnico: '' })); onClose() }}
          className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1.5"
        >
          Limpiar
        </button>
      </div>
    </div>
  )
}

// ── Panel de distribución por supervisor (admin) ───────────────────────────────
function DistribucionSupervisores({ abiertas, supFiltro, onSelect }) {
  const grupos = {}
  for (const a of abiertas) {
    const nombre = a.asignado_nombre || 'Sin asignar'
    if (!grupos[nombre]) grupos[nombre] = { critica: 0, moderada: 0, leve: 0, total: 0 }
    grupos[nombre][a.nivel] = (grupos[nombre][a.nivel] || 0) + 1
    grupos[nombre].total++
  }
  const supervisores = Object.entries(grupos).sort((a, b) => b[1].total - a[1].total)
  if (supervisores.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Distribución por supervisor</span>
        {supFiltro && (
          <button type="button" onClick={() => onSelect(null)} className="text-xs text-indigo-600 hover:underline">Ver todos</button>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {supervisores.map(([nombre, cnt]) => {
          const activo = supFiltro === nombre
          return (
            <button
              key={nombre}
              type="button"
              onClick={() => onSelect(activo ? null : nombre)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${activo ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
            >
              <span className="text-sm text-gray-700 flex-1 font-medium truncate">
                {activo ? '▶ ' : ''}{nombre}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {cnt.critica > 0 && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                    🚨 {cnt.critica}
                  </span>
                )}
                {cnt.moderada > 0 && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                    🔶 {cnt.moderada}
                  </span>
                )}
                {cnt.leve > 0 && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                    ⚠️ {cnt.leve}
                  </span>
                )}
                <span className="text-xs font-bold text-gray-500 w-6 text-right">{cnt.total}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Alarmas({ filtros = {}, setFiltros, hasScopedRole = false }) {
  const token   = useAuthStore(s => s.token)
  const user    = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'
  const isSup   = user?.role === 'supervisor_ccot'

  const [alarmas,     setAlarmas]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [nivelTab,    setNivelTab]    = useState('todas')
  const [supFiltro,   setSupFiltro]   = useState(null)
  const [expandidoId, setExpandidoId] = useState(null)
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  const [disponible,  setDisponible]  = useState(false)
  const [toggling,    setToggling]    = useState(false)
  const [causas,      setCausas]      = useState([])
  const [modalGestion, setModalGestion] = useState(null) // alarma seleccionada para gestionar

  // Cargar estado disponible al montar
  useEffect(() => {
    if (!isSup && !isAdmin) return
    fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(u => setDisponible(!!u.disponible)).catch(() => {})
  }, [token, isSup, isAdmin])

  const toggleDisponible = async () => {
    setToggling(true)
    try {
      const r = await fetch(`${API}/users/me/disponible`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.ok) { const d = await r.json(); setDisponible(d.disponible) }
    } finally { setToggling(false) }
  }

  const cargar = useCallback(async () => {
    try {
      setError(null)
      const ep = isAdmin ? '/alarmas/todas' : '/alarmas/mis'
      const res = await fetch(`${API}${ep}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Error cargando alarmas')
      setAlarmas(await res.json())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [token, isAdmin])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, 30000)
    return () => clearInterval(id)
  }, [cargar])

  const handleNota = async (id, notas) => {
    await fetch(`${API}/alarmas/${id}/nota`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notas }),
    })
    await cargar()
  }

  // Cargar causas de retraso configurables
  useEffect(() => {
    fetch(`${API}/causas`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setCausas(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [token])

  const handleGestionar = async (alarmaId, causaId, notasGestion) => {
    await fetch(`${API}/alarmas/${alarmaId}/gestionar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ causa_id: causaId, notas_gestion: notasGestion || null }),
    })
    setModalGestion(null)
    setExpandidoId(null)
    await cargar()
  }

  const handleCerrar = async (id, notas) => {
    if (!window.confirm('¿Cerrar esta alarma manualmente?')) return
    await fetch(`${API}/alarmas/${id}/cerrar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notas: notas || null }),
    })
    setExpandidoId(null)
    await cargar()
  }

  // ── Opciones de filtro derivadas de los datos cargados ───────────────────
  const celulaOpts = [...new Set(alarmas.map(a => a.celula).filter(Boolean))].sort()
  const microceldaOpts = filtros.celula
    ? [...new Set(alarmas.filter(a => a.celula === filtros.celula).map(a => a.microcelda).filter(Boolean))].sort()
    : [...new Set(alarmas.map(a => a.microcelda).filter(Boolean))].sort()

  // ── Filtros globales aplicados (célula / microcelda / técnico) ────────────
  const hayFiltros = !!(filtros.celula || filtros.microcelda || filtros.tecnico)

  const alarmasFiltradas = hayFiltros ? alarmas.filter(a => {
    if (filtros.celula     && a.celula     !== filtros.celula)                                   return false
    if (filtros.microcelda && a.microcelda !== filtros.microcelda)                               return false
    if (filtros.tecnico    && !a.tecnico?.toLowerCase().includes(filtros.tecnico.toLowerCase())) return false
    return true
  }) : alarmas

  // ── Clasificación base ────────────────────────────────────────────────────
  const abiertas   = alarmasFiltradas.filter(a => a.estado === 'abierta')
  const enGestion  = alarmasFiltradas.filter(a => a.estado === 'en_gestion')
  const cerradas   = alarmasFiltradas.filter(a => ['cerrada', 'cerrada_gestionada', 'cerrada_sin_gestion'].includes(a.estado))

  // Conteos globales para los tabs (sin filtro de supervisor)
  const nCriticas  = abiertas.filter(a => a.nivel === 'critica').length
  const nModeradas = abiertas.filter(a => a.nivel === 'moderada').length
  const nLeves     = abiertas.filter(a => a.nivel === 'leve').length

  // Pool filtrado por supervisor (cuando está activo)
  const abiertasFiltradas  = supFiltro ? abiertas.filter(a => a.asignado_nombre === supFiltro)  : abiertas
  const enGestionFiltradas = supFiltro ? enGestion.filter(a => a.asignado_nombre === supFiltro) : enGestion
  const cerradasFiltradas  = supFiltro ? cerradas.filter(a => a.asignado_nombre === supFiltro)  : cerradas

  // Ordenar por fecha
  const sorted     = (arr) => [...arr].sort((a, b) => new Date(a.fecha_creacion) - new Date(b.fecha_creacion))
  const sortedDesc = (arr) => [...arr].sort((a, b) => new Date(b.fecha_cierre)   - new Date(a.fecha_cierre))

  // Aplicar filtro de nivel / tab
  const visibles = (() => {
    if (nivelTab === 'critica')    return sorted(abiertasFiltradas.filter(a => a.nivel === 'critica'))
    if (nivelTab === 'moderada')   return sorted(abiertasFiltradas.filter(a => a.nivel === 'moderada'))
    if (nivelTab === 'leve')       return sorted(abiertasFiltradas.filter(a => a.nivel === 'leve'))
    if (nivelTab === 'en_gestion') return sorted(enGestionFiltradas)
    if (nivelTab === 'cerradas')   return sortedDesc(cerradasFiltradas)
    return [
      ...sorted(abiertasFiltradas.filter(a => a.nivel === 'critica')),
      ...sorted(abiertasFiltradas.filter(a => a.nivel === 'moderada')),
      ...sorted(abiertasFiltradas.filter(a => a.nivel === 'leve')),
    ]
  })()

  const sinAlarmas = abiertas.length === 0 && !['cerradas', 'en_gestion'].includes(nivelTab)

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <ModalGestion
        alarma={modalGestion}
        causas={causas}
        onClose={() => setModalGestion(null)}
        onConfirm={handleGestionar}
      />
      {/* Header sticky */}
      <div className="bg-white border-b border-slate-200 px-4 pt-4 pb-3 sticky top-0 z-20">
        <div className="max-w-2xl md:max-w-4xl mx-auto space-y-3">

          {/* Fila título + botones */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900">Alarmas</h1>
              <p className="text-xs text-gray-500 truncate">
                {abiertas.length} abiertas
                {nCriticas > 0 && ` · ${nCriticas} críticas`}
                {supFiltro && <span className="text-indigo-600"> · {supFiltro}</span>}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Toggle disponible — solo supervisor_ccot */}
              {isSup && (
                <button
                  type="button"
                  onClick={toggleDisponible}
                  disabled={toggling}
                  title={disponible ? 'Estás disponible para recibir alarmas. Clic para desactivar.' : 'No disponible. Clic para activar.'}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-sm font-medium transition-colors ${
                    disponible
                      ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                      : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
                  } ${toggling ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className={`w-2 h-2 rounded-full ${disponible ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                  <span className="hidden sm:inline text-xs">{disponible ? 'Disponible' : 'No disponible'}</span>
                </button>
              )}
              {/* Botón filtros — visible solo si se pueden cambiar */}
              {!hasScopedRole && setFiltros && (
                <button
                  type="button"
                  onClick={() => setFiltrosOpen(v => !v)}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  className={`relative flex items-center gap-1 px-2.5 py-2 rounded-xl border text-slate-600 transition-colors ${
                    filtrosOpen ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                  </svg>
                  <span className="hidden sm:inline text-xs font-medium">Filtros</span>
                  {hayFiltros && !filtrosOpen && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
                  )}
                </button>
              )}
              {/* Recargar */}
              <button
                type="button"
                onClick={cargar}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Chips de filtros activos */}
          {hayFiltros && (
            <div className="flex flex-wrap gap-1.5">
              {filtros.celula && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                  📍 {filtros.celula}
                  {setFiltros && (
                    <button type="button"
                      onClick={() => setFiltros(f => ({ ...f, celula: '', microcelda: '' }))}
                      className="ml-0.5 text-indigo-400 hover:text-indigo-700">✕</button>
                  )}
                </span>
              )}
              {filtros.microcelda && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                  🔹 {filtros.microcelda}
                  {setFiltros && (
                    <button type="button"
                      onClick={() => setFiltros(f => ({ ...f, microcelda: '' }))}
                      className="ml-0.5 text-indigo-400 hover:text-indigo-700">✕</button>
                  )}
                </span>
              )}
              {filtros.tecnico && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                  👤 {filtros.tecnico}
                  {setFiltros && (
                    <button type="button"
                      onClick={() => setFiltros(f => ({ ...f, tecnico: '' }))}
                      className="ml-0.5 text-indigo-400 hover:text-indigo-700">✕</button>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Tabs de nivel */}
          {!loading && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              <Tab active={nivelTab === 'todas'}    color="todas"    onClick={() => setNivelTab('todas')}>
                Abiertas ({abiertas.length})
              </Tab>
              <Tab active={nivelTab === 'critica'}  color="critica"  onClick={() => setNivelTab('critica')}>
                🚨 Crítica ({nCriticas})
              </Tab>
              <Tab active={nivelTab === 'moderada'} color="moderada" onClick={() => setNivelTab('moderada')}>
                🔶 Moderada ({nModeradas})
              </Tab>
              <Tab active={nivelTab === 'leve'}     color="leve"     onClick={() => setNivelTab('leve')}>
                ⚠️ Leve ({nLeves})
              </Tab>
              {enGestion.length > 0 && (
                <Tab active={nivelTab === 'en_gestion'} color="cerradas" onClick={() => setNivelTab('en_gestion')}>
                  📋 En gestión ({enGestion.length})
                </Tab>
              )}
              <Tab active={nivelTab === 'cerradas'} color="cerradas" onClick={() => setNivelTab('cerradas')}>
                ✅ Cerradas ({cerradas.length})
              </Tab>
            </div>
          )}
        </div>
      </div>

      {/* Panel de filtros inline — debajo del header sticky */}
      {filtrosOpen && setFiltros && (
        <div className="bg-white border-b border-slate-200 px-4 py-3">
          <div className="max-w-2xl md:max-w-4xl mx-auto">
            <PanelFiltros
              filtros={filtros}
              setFiltros={setFiltros}
              celulaOpts={celulaOpts}
              microceldaOpts={microceldaOpts}
              onClose={() => setFiltrosOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Contenido */}
      <div className="max-w-2xl md:max-w-4xl mx-auto px-4 py-4">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && (
          <>
            {/* Panel de distribución — solo admin, solo cuando hay abiertas */}
            {isAdmin && abiertas.length > 0 && nivelTab !== 'cerradas' && (
              <DistribucionSupervisores
                abiertas={abiertas}
                supFiltro={supFiltro}
                onSelect={(nombre) => { setSupFiltro(nombre); setExpandidoId(null) }}
              />
            )}

            {sinAlarmas ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">✅</div>
                <p className="text-gray-500 text-sm font-medium">Sin alarmas abiertas</p>
                <p className="text-gray-400 text-xs mt-1">
                  {hayFiltros ? 'Prueba cambiando los filtros.' : 'Todo está en orden.'}
                </p>
              </div>
            ) : visibles.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                Sin alarmas en esta categoría{supFiltro ? ` para ${supFiltro}` : ''}.
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                {visibles.map(a => (
                  <AlarmaRow
                    key={a.id}
                    alarma={a}
                    expandido={expandidoId === a.id}
                    onToggle={() => setExpandidoId(expandidoId === a.id ? null : a.id)}
                    onNota={handleNota}
                    onCerrar={handleCerrar}
                    onGestionar={setModalGestion}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
