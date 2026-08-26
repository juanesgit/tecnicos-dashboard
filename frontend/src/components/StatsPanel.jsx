function fmtMin(minutes) {
  const m = Math.round(minutes || 0)
  if (m === 0) return '0 min'
  const h = Math.floor(m / 60); const mm = m % 60
  return h === 0 ? `${mm} min` : `${h}h ${mm}m`
}

function StatCard({ label, value, sub, color = 'slate' }) {
  const colorMap = {
    slate:  'bg-white border-slate-200 text-slate-800',
    red:    'bg-red-50 border-red-200 text-red-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color]}`}>
      <p className="text-[11px] font-medium opacity-60 truncate leading-tight">{label}</p>
      <p className="text-xl sm:text-2xl font-bold mt-0.5 leading-tight">{value ?? '—'}</p>
      {sub && <p className="text-[11px] opacity-50 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

export default function StatsPanel({ stats }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-slate-100 p-3 animate-pulse h-16 sm:h-20" />
        ))}
      </div>
    )
  }

  const {
    total_tecnicos          = 0,
    tecnicos_retrasados     = 0,
    tecnicos_retraso_siguiente = 0,
    tecnicos_con_parada_futura = 0,
    promedio_retraso        = 0,
    max_retraso             = 0,
    total_pendientes        = 0,
    promedio_completados    = 0,
    promedio_no_completados = 0,
    porcentaje_retrasados   = 0,
    cumplimiento_norma      = 0,
    cumplimiento_time_slot_dia = 0,
  } = stats

  const sin_retraso = total_tecnicos - tecnicos_retrasados

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-3">
      <StatCard label="Total técnicos" value={total_tecnicos} color="slate" />
      <StatCard
        label="Con retraso"
        value={tecnicos_retrasados}
        sub={`${porcentaje_retrasados?.toFixed(1)}% del total`}
        color={tecnicos_retrasados > 0 ? 'red' : 'green'}
      />
      <StatCard label="Sin retraso" value={sin_retraso} color="green" />
      <StatCard
        label="Retraso en sig."
        value={tecnicos_retraso_siguiente}
        sub="próxima actividad"
        color={tecnicos_retraso_siguiente > 0 ? 'amber' : 'slate'}
      />
      <StatCard
        label="Paradas futuras"
        value={tecnicos_con_parada_futura}
        sub="> 30 min"
        color={tecnicos_con_parada_futura > 0 ? 'amber' : 'slate'}
      />
      <StatCard
        label="Pend. post-sig."
        value={total_pendientes}
        color={total_pendientes > 0 ? 'purple' : 'slate'}
      />
      <StatCard
        label="Prom. retraso"
        value={fmtMin(promedio_retraso)}
        color={promedio_retraso > 60 ? 'red' : promedio_retraso > 30 ? 'amber' : 'slate'}
      />
      <StatCard
        label="Máx. retraso"
        value={fmtMin(max_retraso)}
        color={max_retraso > 120 ? 'red' : max_retraso > 60 ? 'amber' : 'slate'}
      />
      <StatCard
        label="Tasa retraso"
        value={`${porcentaje_retrasados?.toFixed(1)}%`}
        color={porcentaje_retrasados > 50 ? 'red' : porcentaje_retrasados > 25 ? 'amber' : 'green'}
      />
      <StatCard
        label="Cumpl. norma"
        value={`${cumplimiento_norma?.toFixed(1)}%`}
        color={cumplimiento_norma >= 80 ? 'green' : cumplimiento_norma >= 50 ? 'amber' : 'red'}
      />
      <StatCard
        label="Cumpl. time slot"
        value={`${cumplimiento_time_slot_dia?.toFixed(1)}%`}
        color={cumplimiento_time_slot_dia >= 80 ? 'green' : cumplimiento_time_slot_dia >= 50 ? 'amber' : 'red'}
      />
      <StatCard
        label="Prom. completado"
        value={fmtMin(promedio_completados)}
        sub={`no-comp: ${fmtMin(promedio_no_completados)}`}
        color="blue"
      />
    </div>
  )
}
