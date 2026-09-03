import { useState } from 'react'

/* ── Escala de color por porcentaje ── */
function cellColor(pct) {
  if (pct === null || pct === undefined)
    return { bg: 'bg-slate-100', text: 'text-slate-300' }
  if (pct >= 90) return { bg: 'bg-emerald-100', text: 'text-emerald-700' }
  if (pct >= 60) return { bg: 'bg-yellow-200',  text: 'text-yellow-800'  }
  if (pct >= 40) return { bg: 'bg-amber-400',   text: 'text-white'       }
  if (pct >= 20) return { bg: 'bg-red-500',     text: 'text-white'       }
  if (pct >   0) return { bg: 'bg-red-700',     text: 'text-white'       }
  return { bg: 'bg-slate-50', text: 'text-slate-300' }
}

function computeScore(row, w) {
  const total = w.avance + w.efectividad + w.velocidad + w.cumplimiento
  if (total === 0) return 0
  const a = row.avance       ?? 0
  const e = row.efectividad  ?? 0
  const v = row.velocidad    ?? 0
  const c = row.cumplimiento ?? 0
  return Math.round((w.avance * a + w.efectividad * e + w.velocidad * v + w.cumplimiento * c) / total)
}

/* ── Celda de métrica ── */
function MetricCell({ val, className = '' }) {
  const { bg, text } = cellColor(val)
  return (
    <div className={`flex items-center justify-center rounded-lg px-1.5 py-1.5 min-w-[3rem] ${bg} ${className}`}>
      <span className={`text-xs font-bold tabular-nums ${text}`}>
        {val !== null && val !== undefined ? `${val}%` : '—'}
      </span>
    </div>
  )
}

/* ── Leyenda ── */
function Leyenda() {
  const NIVELES = [
    { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '≥90%' },
    { bg: 'bg-yellow-200',  text: 'text-yellow-800',  label: '≥60%' },
    { bg: 'bg-amber-400',   text: 'text-white',        label: '≥40%' },
    { bg: 'bg-red-500',     text: 'text-white',        label: '≥20%' },
    { bg: 'bg-red-700',     text: 'text-white',        label: '<20%' },
    { bg: 'bg-slate-100',   text: 'text-slate-400',    label: 'Sin datos' },
  ]
  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {NIVELES.map(({ bg, text, label }) => (
        <div key={label} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${bg} ${text}`}>
          {label}
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function MapaCalorProductividad({ porMicrocelda = [], weights, loading }) {

  const [expandida, setExpandida] = useState(null)

  if (loading) {
    return (
      <div className="space-y-1.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!porMicrocelda.length) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-6 text-xs text-slate-400 text-center">
        Sin datos de microceldas para hoy.
      </div>
    )
  }

  const sorted = [...porMicrocelda]
    .map(mc => ({ ...mc, score: computeScore(mc, weights) }))
    .sort((a, b) => a.score - b.score)

  return (
    <div className="space-y-2">

      {/* Encabezado columnas */}
      <div className="flex items-center gap-1 px-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
        <span className="flex-1 min-w-0">Microcelda</span>
        <span className="w-12 text-center">Avance</span>
        <span className="w-12 text-center">Efect.</span>
        <span className="w-12 text-center">Veloc.</span>
        <span className="w-12 text-center">Cumpl.</span>
        <span className="w-12 text-center font-bold text-indigo-500">Score</span>
      </div>

      {/* Filas */}
      {sorted.map((mc) => {
        const isOpen = expandida === `${mc.celula}::${mc.microcelda}`
        const scoreColor = cellColor(mc.score)
        return (
          <div key={`${mc.celula}::${mc.microcelda}`} className="rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setExpandida(isOpen ? null : `${mc.celula}::${mc.microcelda}`)}
              className="w-full flex items-center gap-1 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{mc.microcelda}</p>
                <p className="text-[10px] text-slate-400">{mc.celula} · {mc.n_tecnicos} técnico{mc.n_tecnicos !== 1 ? 's' : ''}</p>
              </div>

              <MetricCell val={mc.avance} />
              <MetricCell val={mc.efectividad} />
              <MetricCell val={mc.velocidad} />
              <MetricCell val={mc.cumplimiento} />

              {/* Score compuesto */}
              <div className={`flex items-center justify-center rounded-lg px-1.5 py-1.5 min-w-[3rem] ${scoreColor.bg} ring-1 ring-indigo-200`}>
                <span className={`text-xs font-bold tabular-nums ${scoreColor.text}`}>{mc.score}%</span>
              </div>

              <svg
                className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Detalle expandido */}
            {isOpen && (
              <div className="border-t border-slate-100 bg-slate-50 px-3 py-3 space-y-2">
                {[
                  { label: 'Avance',       val: mc.avance,       sub: `${mc.cerradas} cerradas / ${mc.ejecutable} ejecutables (ponderado por cuota)` },
                  { label: 'Efectividad',  val: mc.efectividad,  sub: `${mc.completado} completadas / ${mc.cerradas} cerradas (completado + no completado)` },
                  { label: 'Velocidad',    val: mc.velocidad,    sub: 'Proyección avance ponderado a las 18:00' },
                  { label: 'Cumplimiento', val: mc.cumplimiento, sub: 'OTs con duración real ≤ cuota del time slot (excluye OTs sin fin registrado)' },
                ].map(({ label, val, sub }) => {
                  const c = cellColor(val)
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-semibold text-slate-500">{label}</span>
                        <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                          {val !== null && val !== undefined ? `${val}%` : '—'}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        {val !== null && val !== undefined && val > 0 && (
                          <div
                            className={`h-full rounded-full transition-all ${c.bg.replace('100', '400').replace('200', '500').replace('50', '300')}`}
                            style={{ width: `${Math.min(100, val)}%` }}
                          />
                        )}
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>
                    </div>
                  )
                })}

                {/* Score compuesto */}
                <div className="pt-1 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-600">Score compuesto</span>
                    <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full ${scoreColor.bg} ${scoreColor.text} ring-1 ring-indigo-200`}>
                      {mc.score}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${mc.score}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Leyenda */}
      <div className="pt-1">
        <Leyenda />
      </div>
    </div>
  )
}
