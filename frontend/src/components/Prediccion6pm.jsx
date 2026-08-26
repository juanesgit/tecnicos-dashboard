import { useState } from 'react'
import MapaCalorPrediccion from './MapaCalorPrediccion'

const RIESGO_META = {
  'En riesgo': {
    icon: '🔴',
    label: 'En riesgo',
    border: 'border-red-200',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
    defaultOpen: false,
  },
  'Ajustado': {
    icon: '🟡',
    label: 'Ajustado',
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-400',
    defaultOpen: false,
  },
  'A tiempo': {
    icon: '🟢',
    label: 'A tiempo',
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
    defaultOpen: false,
  },
}

const ORDEN_RIESGO = ['En riesgo', 'Ajustado', 'A tiempo']

function fmt_margen(minutos) {
  const abs = Math.abs(minutos)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const signo = minutos < 0 ? '-' : '+'
  if (h > 0) return `${signo}${h}h ${m}m`
  return `${signo}${m}m`
}

/* ── Fila de técnico ── */
function TecnicoPrediccion({ r, onDetalle }) {
  const meta = RIESGO_META[r.riesgo_6pm] || RIESGO_META['A tiempo']
  const sinDatos = !r.hora_fin_estimada || r.minutos_trabajo_restante === 0

  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b border-slate-100 last:border-0">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${meta.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate">{r['Técnico']}</p>
          {onDetalle && (
            <button
              onClick={() => onDetalle(r)}
              className="text-[10px] text-cyan-600 font-medium hover:text-cyan-800 transition-colors shrink-0"
            >
              Ver →
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-400 truncate">
          {r.microcelda && <span>{r.microcelda}</span>}
          {r.actividad_actual && <span className="ml-1">· {r.actividad_actual}</span>}
          {r.pendientes_con_cuota > 0 && (
            <span className="ml-1">· {r.pendientes_con_cuota} pend.</span>
          )}
        </p>
      </div>
      <div className="text-right shrink-0 space-y-0.5">
        {sinDatos ? (
          <p className="text-slate-300 text-[10px]">Sin datos</p>
        ) : (
          <>
            <p className="text-xs font-bold text-slate-700 tabular-nums">
              🏁 {r.hora_fin_estimada}
            </p>
            <p
              className="text-[10px] font-medium tabular-nums"
              style={{ color: r.margen_6pm > 0 ? '#dc2626' : '#16a34a' }}
            >
              {fmt_margen(r.margen_6pm)} de 18:00
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Grupo colapsable por nivel de riesgo ── */
function RiesgoGroup({ riesgo, tecnicos, onDetalle }) {
  const meta = RIESGO_META[riesgo]
  const [open, setOpen] = useState(meta.defaultOpen)
  if (!tecnicos.length) return null

  const sorted = [...tecnicos].sort((a, b) => (b.margen_6pm ?? 0) - (a.margen_6pm ?? 0))

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
          {sorted.map((r, i) => (
            <TecnicoPrediccion key={i} r={r} onDetalle={onDetalle} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function Prediccion6pm({ rows = [], filtros = {}, onDetalle }) {
  const rowsFiltrados = rows.filter(r => {
    if (filtros.celula     && r.celula     !== filtros.celula)    return false
    if (filtros.microcelda && r.microcelda !== filtros.microcelda) return false
    if (filtros.tecnico    && !r['Técnico']?.toLowerCase().includes(filtros.tecnico.toLowerCase())) return false
    return true
  })

  const conPrediccion = rowsFiltrados.filter(r => r.riesgo_6pm)

  const porRiesgo = {}
  for (const nivel of ORDEN_RIESGO) {
    porRiesgo[nivel] = conPrediccion.filter(r => r.riesgo_6pm === nivel)
  }

  const enRiesgo = porRiesgo['En riesgo'].length
  const ajustado = porRiesgo['Ajustado'].length
  const aTiempo  = porRiesgo['A tiempo'].length

  const factores = conPrediccion.map(r => r.factor_ritmo).filter(f => f != null && f > 0)
  const factorProm = factores.length
    ? (factores.reduce((a, b) => a + b, 0) / factores.length).toFixed(2)
    : '—'

  const totalGrupos = conPrediccion.length

  if (!rows.length) return (
    <div className="text-center text-slate-400 text-sm py-8">Sin datos disponibles.</div>
  )

  return (
    <div className="space-y-3 pb-2">

      {/* KPI Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          {
            label: 'En riesgo',
            val: enRiesgo,
            color: enRiesgo > 0 ? 'text-red-600' : 'text-slate-400',
            bg: enRiesgo > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200',
            sub: 'Termina después 18:00',
          },
          {
            label: 'Ajustado',
            val: ajustado,
            color: ajustado > 0 ? 'text-amber-600' : 'text-slate-400',
            bg: ajustado > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200',
            sub: '17:00 – 18:00',
          },
          {
            label: 'A tiempo',
            val: aTiempo,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50 border-emerald-200',
            sub: 'Termina antes 17:00',
          },
          {
            label: 'Ritmo ×',
            val: factorProm,
            color: 'text-slate-700',
            bg: 'bg-white border-slate-200',
            sub: 'Factor promedio',
          },
        ].map(({ label, val, color, bg, sub }) => (
          <div key={label} className={`rounded-xl border ${bg} px-3 py-2.5`}>
            <p className={`text-xl font-bold leading-none tabular-nums ${color}`}>{val}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1 leading-snug">{label}</p>
            {sub && <p className="text-[10px] text-slate-400 opacity-70 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Mapa de calor predicción */}
      <div className="bg-white rounded-xl border border-slate-100 p-3">
        <MapaCalorPrediccion filtros={filtros} rows={rows} onDetalle={onDetalle} />
      </div>

      {/* Separador */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
          {totalGrupos > 0 ? `${totalGrupos} técnicos con predicción` : 'Sin predicciones disponibles'}
        </span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* Grupos colapsables */}
      {totalGrupos === 0 ? (
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-4 text-xs text-slate-400 text-center">
          Sin técnicos con datos de predicción disponibles.
        </div>
      ) : (
        <div className="space-y-2">
          {ORDEN_RIESGO.map(nivel => (
            <RiesgoGroup
              key={nivel}
              riesgo={nivel}
              tecnicos={porRiesgo[nivel]}
              onDetalle={onDetalle}
            />
          ))}
        </div>
      )}

    </div>
  )
}
