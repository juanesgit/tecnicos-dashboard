function fmtMin(minutes) {
  const m = Math.round(minutes || 0)
  if (m === 0) return '0 min'
  const h = Math.floor(m / 60); const mm = m % 60
  return h === 0 ? `${mm} min` : `${h}h ${mm}m`
}

/* Mismo estilo compacto que el KpiBanner del Dashboard */
function KpiCard({ label, value, sub, color = 'slate' }) {
  const colors = {
    slate:  'bg-white border-slate-200 text-slate-800',
    red:    'bg-red-50 border-red-200 text-red-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
  }
  const labelColors = {
    slate: 'text-slate-400', red: 'text-red-400', amber: 'text-amber-400',
    green: 'text-green-400', blue: 'text-blue-400',
    purple: 'text-purple-400', violet: 'text-violet-400',
  }
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${colors[color] ?? colors.slate}`}>
      <p className="text-xl sm:text-2xl font-bold leading-none tabular-nums">{value ?? '—'}</p>
      <p className={`text-[11px] font-medium mt-1 leading-snug ${labelColors[color] ?? labelColors.slate}`}>{label}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${labelColors[color] ?? labelColors.slate} opacity-70`}>{sub}</p>}
    </div>
  )
}

export default function ResumenPanel({ stats, loading }) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    )
  }

  const {
    total_tecnicos             = 0,
    tecnicos_retrasados        = 0,
    tecnicos_retraso_siguiente = 0,
    tecnicos_con_parada_futura = 0,
    promedio_retraso           = 0,
    max_retraso                = 0,
    total_pendientes           = 0,
    promedio_completados       = 0,
    promedio_no_completados    = 0,
    porcentaje_retrasados      = 0,
    cumplimiento_norma         = 0,
  } = stats

  const sin_retraso = total_tecnicos - tecnicos_retrasados

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">

      {/* Fila 1 — cobertura adicional */}
      <KpiCard
        label="Sin retraso"
        value={sin_retraso}
        sub={`${(100 - porcentaje_retrasados).toFixed(1)}% del total`}
        color={sin_retraso === total_tecnicos ? 'green' : 'slate'}
      />
      <KpiCard
        label="Retraso en siguiente"
        value={tecnicos_retraso_siguiente}
        sub="próxima actividad"
        color={tecnicos_retraso_siguiente > 0 ? 'amber' : 'slate'}
      />

      {/* Fila 2 — magnitud del retraso */}
      <KpiCard
        label="Prom. retraso"
        value={fmtMin(promedio_retraso)}
        color={promedio_retraso > 60 ? 'red' : promedio_retraso > 30 ? 'amber' : 'slate'}
      />
      <KpiCard
        label="Máx. retraso"
        value={fmtMin(max_retraso)}
        color={max_retraso > 120 ? 'red' : max_retraso > 60 ? 'amber' : 'slate'}
      />

      {/* Fila 3 — pendientes y norma */}
      <KpiCard
        label="Pendientes post-sig."
        value={total_pendientes}
        color={total_pendientes > 0 ? 'purple' : 'slate'}
      />
      <KpiCard
        label="Cumpl. norma"
        value={`${cumplimiento_norma?.toFixed(1)}%`}
        color={cumplimiento_norma >= 80 ? 'green' : cumplimiento_norma >= 50 ? 'amber' : 'red'}
      />

      {/* Fila 4 — tiempos promedio */}
      <KpiCard label="Prom. completado"     value={fmtMin(promedio_completados)}    color="blue"   />
      <KpiCard label="Prom. no completado"  value={fmtMin(promedio_no_completados)} color="violet" />

    </div>
  )
}
