import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'
import MapaCalorAvance from './MapaCalorAvance'

/* ── Configuración de grupos por estado ── */
const ESTADO_META = {
  pendiente: {
    icon: '🟠', label: 'Pendientes',
    border: 'border-orange-200', bg: 'bg-orange-50',
    badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400',
    defaultOpen: false,
  },
  iniciado: {
    icon: '🔵', label: 'En ejecución',
    border: 'border-blue-200', bg: 'bg-blue-50',
    badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400',
    defaultOpen: false,
  },
  suspendido: {
    icon: '⏸',  label: 'Suspendidas',
    border: 'border-slate-200', bg: 'bg-slate-50',
    badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400',
    defaultOpen: false,
  },
  no_completado: {
    icon: '🔴', label: 'Inefectivas',
    border: 'border-red-200', bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-700', dot: 'bg-red-500',
    defaultOpen: false,
  },
  completado: {
    icon: '🟢', label: 'Completadas',
    border: 'border-emerald-200', bg: 'bg-emerald-50',
    badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500',
    defaultOpen: false,
  },
  cancelado: {
    icon: '⛔', label: 'Canceladas',
    border: 'border-slate-200', bg: 'bg-slate-50',
    badge: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300',
    defaultOpen: false,
  },
}
const ORDEN_ESTADOS = ['pendiente', 'iniciado', 'suspendido', 'no_completado', 'completado', 'cancelado']

/* ── Fila de célula dentro de un acordeón ── */
function CelulaRow({ cel, estadoKey }) {
  const val = cel[estadoKey] ?? 0
  if (!val) return null
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-800 truncate">{cel.celula}</p>
        <p className="text-[10px] text-slate-400">
          {val} OT{val !== 1 ? 's' : ''} · avance total {cel.tasa ?? 0}%
        </p>
      </div>
      <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full ${ESTADO_META[estadoKey]?.badge ?? 'bg-slate-100 text-slate-600'}`}>
        {val}
      </span>
    </div>
  )
}

/* ── Grupo colapsable por estado ── */
function GrupoEstado({ estadoKey, porCelula }) {
  const meta = ESTADO_META[estadoKey]
  const [open, setOpen] = useState(meta.defaultOpen)
  const total = porCelula.reduce((s, c) => s + (c[estadoKey] ?? 0), 0)
  if (!total) return null

  const celsFiltradas = [...porCelula]
    .filter(c => (c[estadoKey] ?? 0) > 0)
    .sort((a, b) => (b[estadoKey] ?? 0) - (a[estadoKey] ?? 0))

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />
        <span className="flex-1 text-sm font-semibold text-slate-700">
          {meta.icon} {meta.label}
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>
          {total} OT{total !== 1 ? 's' : ''}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-current border-opacity-10 bg-white bg-opacity-70">
          {celsFiltradas.map((cel, i) => (
            <CelulaRow key={i} cel={cel} estadoKey={estadoKey} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function AvanceMapaView({ celulaFiltro = '' }) {
  const [avance,  setAvance]  = useState(null)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const params = celulaFiltro ? `?celula=${encodeURIComponent(celulaFiltro)}` : ''
      const { data } = await api.get(`/avance-ot${params}`)
      setAvance(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cargar avance')
    } finally {
      setLoading(false)
    }
  }, [celulaFiltro])

  useEffect(() => { cargar() }, [cargar])

  const resumen   = avance?.resumen    ?? {}
  const porCelula = avance?.por_celula ?? []

  const completadas  = resumen.completado    ?? 0
  const inefectivas  = resumen.no_completado ?? 0
  const iniciadas    = resumen.iniciado      ?? 0
  const pendientes   = resumen.pendiente     ?? 0
  const suspendidas  = resumen.suspendido    ?? 0
  const canceladas   = resumen.cancelado     ?? 0
  const tasa_avance  = resumen.tasa_avance   ?? 0
  const tasa_cumpl   = resumen.tasa_cumplimiento ?? 0
  const total        = resumen.total         ?? 0

  const hayGrupos = total > 0

  return (
    <div className="space-y-3 pb-2">

      {/* ── KPI Banner ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            {
              label: 'Avance operación',
              val: tasa_avance + '%',
              color: tasa_avance >= 70 ? 'text-emerald-600' : tasa_avance >= 40 ? 'text-amber-600' : 'text-red-600',
              bg:    tasa_avance >= 70 ? 'bg-emerald-50 border-emerald-200' : tasa_avance >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200',
              sub:   `${completadas + inefectivas} cerradas / ${total - canceladas} ejecutables`,
            },
            {
              label: 'Completadas',
              val: completadas,
              color: completadas > 0 ? 'text-emerald-600' : 'text-slate-400',
              bg: completadas > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200',
              sub: `Cumplimiento ${tasa_cumpl}%`,
            },
            {
              label: 'Pendientes / Iniciadas',
              val: pendientes + iniciadas,
              color: (pendientes + iniciadas) > 0 ? 'text-orange-600' : 'text-slate-400',
              bg: (pendientes + iniciadas) > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200',
              sub: `${iniciadas} en curso · ${pendientes} sin iniciar`,
            },
            {
              label: 'Inefectivas',
              val: inefectivas,
              color: inefectivas > 0 ? 'text-red-600' : 'text-slate-400',
              bg: inefectivas > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200',
              sub: suspendidas ? `+ ${suspendidas} suspendidas` : 'Visitas cerradas fallidas',
            },
          ].map(({ label, val, color, bg, sub }) => (
            <div key={label} className={`rounded-xl border ${bg} px-3 py-2.5`}>
              <p className={`text-xl font-bold leading-none tabular-nums ${color}`}>{val}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-1 leading-snug">{label}</p>
              {sub && <p className="text-[10px] text-slate-400 opacity-70 mt-0.5">{sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Mapa de calor de avance ── */}
      <div className="bg-white rounded-xl border border-slate-100 p-3">
        <MapaCalorAvance celulaFiltro={celulaFiltro} />
      </div>

      {/* ── Separador ── */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
          {hayGrupos ? `${total} OTs operativas del día` : 'Sin OTs registradas'}
        </span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* ── Grupos colapsables por estado ── */}
      {!loading && hayGrupos ? (
        <div className="space-y-2">
          {ORDEN_ESTADOS.map(est => (
            <GrupoEstado key={est} estadoKey={est} porCelula={porCelula} />
          ))}
        </div>
      ) : !loading ? (
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-4 text-xs text-slate-400 text-center">
          Sin OTs operativas registradas para hoy.
        </div>
      ) : (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      )}

    </div>
  )
}
