import { useState } from 'react'

/* ── Escala de color ── */
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

function computeScore(t, w) {
  const total = w.avance + w.calidad + w.velocidad
  if (total === 0) return 0
  return Math.round(
    (w.avance * (t.avance ?? 0) + w.calidad * (t.calidad ?? 0) + w.velocidad * (t.velocidad ?? 0)) / total
  )
}

/* ── Chip de métrica ── */
function Chip({ label, val }) {
  const { bg, text } = cellColor(val)
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] text-slate-400 font-medium">{label}</span>
      <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${bg} ${text}`}>
        {val !== null && val !== undefined ? `${val}%` : '—'}
      </span>
    </div>
  )
}

/* ── Fila de técnico ── */
function TecnicoRow({ t, score, rank }) {
  const scoreC = cellColor(score)
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 last:border-0">
      {/* Posición */}
      <span className="text-[10px] font-bold text-slate-300 tabular-nums w-4 text-right shrink-0">
        {rank}
      </span>

      {/* Nombre + OTs */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800 truncate">{t.tecnico}</p>
        <p className="text-[10px] text-slate-400">
          {t.cerradas}/{t.ejecutable} OTs · {t.completado} completas
        </p>
      </div>

      {/* Chips */}
      <div className="flex items-end gap-2 shrink-0">
        <Chip label="Av" val={t.avance} />
        <Chip label="Ca" val={t.calidad} />
        <Chip label="Ve" val={t.velocidad} />
      </div>

      {/* Score */}
      <div className={`flex items-center justify-center rounded-lg px-2 py-1 min-w-[3rem] shrink-0 ${scoreC.bg} ring-1 ring-indigo-200`}>
        <span className={`text-xs font-bold tabular-nums ${scoreC.text}`}>{score}%</span>
      </div>
    </div>
  )
}

/* ── Grupo por microcelda ── */
function GrupoMicrocelda({ microcelda, celula, tecnicos, weights }) {
  const [open, setOpen] = useState(false)

  const tecsConScore = tecnicos
    .filter(t => t.microcelda === microcelda && t.celula === celula)
    .map(t => ({ ...t, score: computeScore(t, weights) }))
    .sort((a, b) => b.score - a.score)

  if (!tecsConScore.length) return null

  const avgScore = Math.round(
    tecsConScore.reduce((s, t) => s + t.score, 0) / tecsConScore.length
  )
  const scoreC = cellColor(avgScore)

  // Color del borde según score promedio
  const borderColor = avgScore >= 90 ? 'border-emerald-200' :
                      avgScore >= 60 ? 'border-yellow-300'  :
                      avgScore >= 40 ? 'border-amber-300'   :
                      avgScore >= 20 ? 'border-red-300'     :
                      avgScore > 0   ? 'border-red-400'     : 'border-slate-200'

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left bg-white hover:bg-slate-50 transition-colors"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {/* Indicador de score */}
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${scoreC.bg.replace('100','400').replace('200','500').replace('50','300')}`} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-700 truncate">{microcelda}</p>
          <p className="text-[10px] text-slate-400">{celula} · {tecsConScore.length} técnico{tecsConScore.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Score promedio */}
        <div className={`flex items-center justify-center rounded-lg px-2 py-1 min-w-[3rem] ${scoreC.bg} ring-1 ring-indigo-200`}>
          <span className={`text-xs font-bold tabular-nums ${scoreC.text}`}>{avgScore}%</span>
        </div>

        <svg
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="bg-white border-t border-slate-100">
          {/* Cabecera columnas */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-100">
            <span className="w-4" />
            <span className="flex-1 text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Técnico</span>
            <div className="flex items-end gap-2 shrink-0">
              <span className="w-8 text-center text-[9px] font-semibold text-slate-400">Av</span>
              <span className="w-8 text-center text-[9px] font-semibold text-slate-400">Ca</span>
              <span className="w-8 text-center text-[9px] font-semibold text-slate-400">Ve</span>
            </div>
            <span className="w-12 text-center text-[9px] font-bold text-indigo-500 uppercase tracking-wide">Score</span>
          </div>

          {tecsConScore.map((t, i) => (
            <TecnicoRow key={t.tecnico} t={t} score={t.score} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function ProductividadTecnicos({ porTecnico = [], weights, loading }) {

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}
      </div>
    )
  }

  if (!porTecnico.length) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-6 text-xs text-slate-400 text-center">
        Sin técnicos con OTs operativas para hoy.
      </div>
    )
  }

  // Grupos únicos de microcelda
  const grupos = []
  const seen = new Set()
  for (const t of porTecnico) {
    const key = `${t.celula}::${t.microcelda}`
    if (!seen.has(key)) {
      seen.add(key)
      grupos.push({ microcelda: t.microcelda, celula: t.celula })
    }
  }

  // Ordenar grupos por score promedio descendente
  const gruposConScore = grupos.map(g => {
    const tecs = porTecnico.filter(t => t.microcelda === g.microcelda && t.celula === g.celula)
    const avg = tecs.length
      ? Math.round(tecs.reduce((s, t) => s + computeScore(t, weights), 0) / tecs.length)
      : 0
    return { ...g, avgScore: avg }
  }).sort((a, b) => b.avgScore - a.avgScore)

  const totalTecnicos = new Set(porTecnico.map(t => t.tecnico)).size

  return (
    <div className="space-y-2">
      {/* Resumen rápido */}
      <div className="flex items-center gap-2 px-1">
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
          {totalTecnicos} técnico{totalTecnicos !== 1 ? 's' : ''} · {gruposConScore.length} microceldas
        </span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* Grupos */}
      {gruposConScore.map(g => (
        <GrupoMicrocelda
          key={`${g.celula}::${g.microcelda}`}
          microcelda={g.microcelda}
          celula={g.celula}
          tecnicos={porTecnico}
          weights={weights}
        />
      ))}

      {/* Leyenda chips */}
      <div className="flex items-center gap-3 justify-center pt-1 text-[10px] text-slate-400 font-medium">
        <span>Av = Avance</span>
        <span>Ca = Calidad</span>
        <span>Ve = Velocidad</span>
      </div>
    </div>
  )
}
