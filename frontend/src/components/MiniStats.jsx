function MiniCard({ label, value, color = 'slate' }) {
  const colors = {
    slate:  'bg-white border-slate-200 text-slate-800',
    red:    'bg-red-50 border-red-200 text-red-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
  }
  const labelColors = {
    slate:  'text-slate-400',
    red:    'text-red-400',
    orange: 'text-orange-400',
    amber:  'text-amber-400',
    green:  'text-green-400',
    blue:   'text-blue-400',
    purple: 'text-purple-400',
    violet: 'text-violet-400',
  }
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${colors[color] ?? colors.slate}`}>
      <p className="text-xl sm:text-2xl font-bold leading-none tabular-nums">{value ?? '—'}</p>
      <p className={`text-xs sm:text-[11px] font-medium mt-1 leading-snug ${labelColors[color] ?? labelColors.slate}`}>{label}</p>
    </div>
  )
}

function fmtMin(minutes) {
  const m = Math.round(minutes || 0)
  if (m === 0) return '0 min'
  const h = Math.floor(m / 60); const mm = m % 60
  return h === 0 ? `${mm} min` : `${h}h ${mm}m`
}

export function MiniStatsRetrasos({ datos, stats }) {
  const actual    = datos.filter(r => r.estado_actual === 'Retraso actual').length
  const siguiente = datos.filter(r => r.estado_actual === 'Retraso en siguiente').length
  const pendientes = datos.reduce((s, r) => s + (r.pendientes_post_siguiente ?? 0), 0)
  const promRetraso = stats?.promedio_retraso ?? 0
  const maxRetraso  = stats?.max_retraso ?? 0

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <MiniCard
        label="Retraso actual"
        value={actual}
        color={actual > 0 ? 'red' : 'green'}
      />
      <MiniCard
        label="Retraso en sig."
        value={siguiente}
        color={siguiente > 0 ? 'orange' : 'slate'}
      />
      <MiniCard
        label="Prom. retraso"
        value={fmtMin(promRetraso)}
        color={promRetraso > 60 ? 'red' : promRetraso > 30 ? 'amber' : 'slate'}
      />
      <MiniCard
        label="Pendientes"
        value={pendientes}
        color={pendientes > 0 ? 'purple' : 'slate'}
      />
    </div>
  )
}

export function MiniStatsParadas({ datos }) {
  const total      = datos.length
  const pendientes = datos.reduce((s, r) => s + (r.pendientes_post_siguiente ?? 0), 0)

  // Promedio de parada en minutos (desde hhmm string "01:23")
  const toMin = (hhmm) => {
    if (!hhmm) return null
    const [h, m] = hhmm.split(':').map(Number)
    return isNaN(h) || isNaN(m) ? null : h * 60 + m
  }
  const duraciones = datos
    .map(r => toMin(r.parada_ajustada_hhmm || r.parada_hhmm))
    .filter(v => v !== null)
  const promPar = duraciones.length
    ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length)
    : 0
  const maxPar = duraciones.length ? Math.max(...duraciones) : 0

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <MiniCard
        label="Con parada futura"
        value={total}
        color={total > 0 ? 'amber' : 'slate'}
      />
      <MiniCard
        label="Prom. parada"
        value={fmtMin(promPar)}
        color={promPar > 60 ? 'red' : promPar > 30 ? 'amber' : 'slate'}
      />
      <MiniCard
        label="Máx. parada"
        value={fmtMin(maxPar)}
        color={maxPar > 120 ? 'red' : maxPar > 60 ? 'amber' : 'slate'}
      />
      <MiniCard
        label="Pendientes"
        value={pendientes}
        color={pendientes > 0 ? 'purple' : 'slate'}
      />
    </div>
  )
}

export function MiniStatsTecnicos({ datos }) {
  const total      = datos.length
  const enEjecucion = datos.filter(r => r.estado_actual === 'En ejecución').length
  const conRetraso  = datos.filter(r =>
    r.estado_actual === 'Retraso actual' || r.estado_actual === 'Retraso en siguiente'
  ).length
  const finalizados = datos.filter(r => r.estado_actual === 'Finalizado').length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <MiniCard label="Total" value={total} color="blue" />
      <MiniCard
        label="En ejecución"
        value={enEjecucion}
        color="blue"
      />
      <MiniCard
        label="Con retraso"
        value={conRetraso}
        color={conRetraso > 0 ? 'red' : 'green'}
      />
      <MiniCard
        label="Finalizados"
        value={finalizados}
        color={finalizados > 0 ? 'green' : 'slate'}
      />
    </div>
  )
}
