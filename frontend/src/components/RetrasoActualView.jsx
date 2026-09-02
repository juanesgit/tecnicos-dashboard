import { useState } from 'react'
import MapaCalorMicroceldas from './MapaCalorMicroceldas'

/* ── Badge de estado ── */
function EstadoBadge({ estado }) {
  const map = {
    'Retraso actual':       'bg-red-100 text-red-700',
    'Retraso en siguiente': 'bg-orange-100 text-orange-700',
    'En ejecución':         'bg-blue-100 text-blue-700',
    'Finalizado':           'bg-green-100 text-green-700',
    'Parada futura':        'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${map[estado] ?? 'bg-slate-100 text-slate-500'}`}>
      {estado ?? '—'}
    </span>
  )
}

/* ── Fila de técnico ── */
function TecnicoRow({ t, onDetalle }) {
  const esRetraso  = t.estado_actual === 'Retraso actual' || t.estado_actual === 'Retraso en siguiente'
  const retrasoVal = t.estado_actual === 'Retraso en siguiente' ? t.retraso_siguiente_hhmm : t.retraso_hhmm
  const esParada   = t.estado_siguiente === 'Parada futura'

  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate">{t['Técnico'] ?? '—'}</p>
          {onDetalle && (
            <button
              onClick={() => onDetalle(t)}
              className="text-[10px] text-cyan-600 font-medium hover:text-cyan-800 transition-colors shrink-0"
            >
              Ver →
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-400 truncate">
          {t.microcelda && (
            <span title={t.zona_fallback ? 'Ubicación estimada (última visita conocida)' : undefined}>
              {t.zona_fallback && <span className="text-slate-300 mr-0.5">~</span>}
              {t.microcelda}
            </span>
          )}
          {t.actividad_actual && <span className="ml-1">· {t.actividad_actual}</span>}
        </p>
      </div>
      <div className="text-right shrink-0 space-y-0.5">
        {esRetraso && retrasoVal && retrasoVal !== '00:00' ? (
          <p className="text-xs font-bold text-red-600 tabular-nums">⏱ {retrasoVal}</p>
        ) : esParada ? (
          <p className="text-xs font-semibold text-amber-600">⏸ Parada</p>
        ) : null}
        <p className="text-[10px] font-mono text-slate-400">{t.ot_actual || '—'}</p>
      </div>
    </div>
  )
}

/* ── Grupo colapsable por estado ── */
const GRUPO_META = {
  'retraso_actual': {
    label: 'Retraso actual',
    icon: '🔴',
    border: 'border-red-200',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
    defaultOpen: false,
  },
  'retraso_siguiente': {
    label: 'Retraso en siguiente',
    icon: '🟠',
    border: 'border-orange-200',
    bg: 'bg-orange-50',
    badge: 'bg-orange-100 text-orange-700',
    dot: 'bg-orange-400',
    defaultOpen: false,
  },
  'parada_futura': {
    label: 'Parada futura',
    icon: '⏸',
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-400',
    defaultOpen: false,
  },
}

function GrupoEstado({ tipo, tecnicos, onDetalle }) {
  const meta = GRUPO_META[tipo]
  const [open, setOpen] = useState(meta.defaultOpen)
  if (!tecnicos.length) return null

  // Ordenar por minutos de retraso desc
  const sorted = [...tecnicos].sort((a, b) => {
    const rA = Number(a.minutos_retraso) || Number(a.minutos_retraso_siguiente) || 0
    const rB = Number(b.minutos_retraso) || Number(b.minutos_retraso_siguiente) || 0
    return rB - rA
  })

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
          {tecnicos.length} técnico{tecnicos.length !== 1 ? 's' : ''}
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
          {sorted.map((t, i) => (
            <TecnicoRow key={i} t={t} onDetalle={onDetalle} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function RetrasoActualView({ rows = [], filtros = {}, loading = false, onDetalle }) {

  // Filtrar rows por filtros activos
  const rowsFiltrados = rows.filter(r => {
    if (filtros.celula     && r.celula     !== filtros.celula)    return false
    if (filtros.microcelda && r.microcelda !== filtros.microcelda) return false
    if (filtros.tecnico    && !r['Técnico']?.toLowerCase().includes(filtros.tecnico.toLowerCase())) return false
    return true
  })

  // KPIs
  const total         = rowsFiltrados.length
  const retrasados    = rowsFiltrados.filter(r => r.estado_actual === 'Retraso actual')
  const retrasadosSig = rowsFiltrados.filter(r => r.estado_actual === 'Retraso en siguiente')
  const conParada     = rowsFiltrados.filter(r => r.estado_siguiente === 'Parada futura')

  // Retraso promedio (técnicos con retraso actual)
  const minutosRet = retrasados.map(r => Number(r.minutos_retraso) || 0).filter(v => v > 0)
  const promRet = minutosRet.length
    ? Math.round(minutosRet.reduce((a, b) => a + b, 0) / minutosRet.length)
    : null

  const grupoRetrasoActual   = rowsFiltrados.filter(r => r.estado_actual === 'Retraso actual')
  const grupoRetrasoSig      = rowsFiltrados.filter(r => r.estado_actual === 'Retraso en siguiente')
  const grupoParada          = rowsFiltrados.filter(r => r.estado_siguiente === 'Parada futura' && r.estado_actual !== 'Retraso actual' && r.estado_actual !== 'Retraso en siguiente')

  const hayGrupos = grupoRetrasoActual.length + grupoRetrasoSig.length + grupoParada.length > 0

  return (
    <div className="space-y-3 pb-2">

      {/* KPI Banner */}
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
              label: 'Total técnicos',
              val: total,
              color: 'text-slate-800',
              bg: 'bg-white border-slate-200',
              sub: null,
            },
            {
              label: 'Retraso actual',
              val: retrasados.length,
              color: retrasados.length > 0 ? 'text-red-600' : 'text-slate-400',
              bg: retrasados.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200',
              sub: promRet ? `~${promRet} min prom.` : null,
            },
            {
              label: 'Retraso siguiente',
              val: retrasadosSig.length,
              color: retrasadosSig.length > 0 ? 'text-orange-600' : 'text-slate-400',
              bg: retrasadosSig.length > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200',
              sub: null,
            },
            {
              label: 'Parada futura',
              val: conParada.length,
              color: conParada.length > 0 ? 'text-amber-600' : 'text-slate-400',
              bg: conParada.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200',
              sub: null,
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

      {/* Mapa de calor */}
      <div className="bg-white rounded-xl border border-slate-100 p-3">
        <MapaCalorMicroceldas
          celulaFiltro={filtros.celula}
          microceldaFiltro={filtros.microcelda}
          rows={loading ? [] : rows}
          onDetalle={onDetalle}
        />
      </div>

      {/* Separador */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
          {hayGrupos ? `${grupoRetrasoActual.length + grupoRetrasoSig.length + grupoParada.length} técnicos` : 'Sin alertas activas'}
        </span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* Grupos colapsables */}
      {!loading && hayGrupos ? (
        <div className="space-y-2">
          <GrupoEstado tipo="retraso_actual"   tecnicos={grupoRetrasoActual} onDetalle={onDetalle} />
          <GrupoEstado tipo="retraso_siguiente" tecnicos={grupoRetrasoSig}   onDetalle={onDetalle} />
          <GrupoEstado tipo="parada_futura"    tecnicos={grupoParada}        onDetalle={onDetalle} />
        </div>
      ) : !loading ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-4 text-xs text-emerald-700 text-center">
          ✅ Sin técnicos en retraso ni paradas registradas
        </div>
      ) : null}

    </div>
  )
}
