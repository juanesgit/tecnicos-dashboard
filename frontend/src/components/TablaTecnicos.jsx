function EstadoBadge({ estado }) {
  const map = {
    'Retraso actual':       'bg-red-100 text-red-700',
    'Retraso en siguiente': 'bg-orange-100 text-orange-700',
    'En ejecución':         'bg-blue-100 text-blue-700',
    'Finalizado':           'bg-green-100 text-green-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${map[estado] ?? 'bg-slate-100 text-slate-500'}`}>
      {estado ?? '—'}
    </span>
  )
}

function Skeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )
}

export default function TablaTecnicos({ datos, onDetalle }) {
  if (!datos) return <Skeleton />

  if (datos.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">
        <div className="text-3xl mb-2">📋</div>
        No hay datos de técnicos disponibles.
      </div>
    )
  }

  const enRetraso = (row) =>
    row.estado_actual === 'Retraso actual' || row.estado_actual === 'Retraso en siguiente'

  const retrasoVal = (row) =>
    row.estado_actual === 'Retraso en siguiente' ? row.retraso_siguiente_hhmm : row.retraso_hhmm

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
        <h3 className="font-semibold text-slate-800 text-sm">Estado General de Técnicos</h3>
        <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{datos.length}</span>
      </div>

      {/* ── MOBILE: cards tapeables ─────────────────────── */}
      <div className="sm:hidden divide-y divide-slate-100">
        {datos.map((row, i) => {
          const retraso = enRetraso(row)
          return (
            <button
              key={i}
              onClick={() => onDetalle && onDetalle(row)}
              className={`w-full text-left p-3 transition-colors active:opacity-70 ${retraso ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-slate-50'}`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-slate-800 text-sm truncate">{row['Técnico'] ?? '—'}</p>
                    {retraso && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{row.ciudad_actual || '—'}</p>
                </div>
                <EstadoBadge estado={row.estado_actual} />
              </div>
              <p className="text-xs text-slate-600 truncate mb-2" title={row.actividad_actual}>
                {row.actividad_actual || '—'}
                {row.inicio_actual ? ` · ${row.inicio_actual}–${row.ventana_fin || '?'}` : ''}
              </p>
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1.5 flex-wrap">
                  {retraso && retrasoVal(row) && retrasoVal(row) !== '00:00' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 tabular-nums whitespace-nowrap">
                      ⏱ {retrasoVal(row)}
                    </span>
                  )}
                  {row.estado_siguiente === 'Parada futura' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 tabular-nums whitespace-nowrap">
                      ⏸ {row.parada_ajustada_hhmm || row.parada_hhmm || '—'}
                    </span>
                  )}
                  {(row.pendientes_post_siguiente ?? 0) > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 whitespace-nowrap">
                      {row.pendientes_post_siguiente} pend.
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400 shrink-0">›</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── DESKTOP: tabla compacta (sin scroll horizontal) ── */}
      <div className="hidden sm:block">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[22%]" />
            <col className="w-[26%]" />
            <col className="w-[22%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-medium">Técnico</th>
              <th className="px-4 py-2.5 text-left font-medium">Actividad</th>
              <th className="px-4 py-2.5 text-left font-medium">Estado</th>
              <th className="px-4 py-2.5 text-left font-medium">Alertas</th>
              <th className="px-4 py-2.5 text-center font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {datos.map((row, i) => {
              const retraso = enRetraso(row)
              return (
                <tr key={i} className={`transition-colors ${retraso ? 'bg-red-50/20 hover:bg-red-50/40' : 'hover:bg-slate-50'}`}>
                  {/* Técnico + Ciudad */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{row['Técnico'] ?? '—'}</p>
                        <p className="text-xs text-slate-400 truncate">{row.ciudad_actual || '—'}</p>
                      </div>
                      {retraso && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                    </div>
                  </td>
                  {/* Actividad + Ventana horaria */}
                  <td className="px-4 py-2.5">
                    <p className="text-xs text-slate-600 truncate" title={row.actividad_actual}>
                      {row.actividad_actual || '—'}
                    </p>
                    {row.inicio_actual && (
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {row.inicio_actual}–{row.ventana_fin || '?'}
                      </p>
                    )}
                  </td>
                  {/* Estado */}
                  <td className="px-4 py-2.5">
                    <EstadoBadge estado={row.estado_actual} />
                  </td>
                  {/* Alertas: retraso + parada + pendientes */}
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {retraso && retrasoVal(row) && retrasoVal(row) !== '00:00' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 tabular-nums whitespace-nowrap">
                          ⏱ {retrasoVal(row)}
                        </span>
                      )}
                      {row.estado_siguiente === 'Parada futura' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 tabular-nums whitespace-nowrap">
                          ⏸ {row.parada_ajustada_hhmm || row.parada_hhmm || '—'}
                        </span>
                      )}
                      {(row.pendientes_post_siguiente ?? 0) > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 whitespace-nowrap">
                          {row.pendientes_post_siguiente} pend.
                        </span>
                      )}
                      {!retraso && row.estado_siguiente !== 'Parada futura' && (row.pendientes_post_siguiente ?? 0) === 0 && (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </div>
                  </td>
                  {/* Acción */}
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => onDetalle && onDetalle(row)}
                      className="text-slate-600 hover:text-slate-900 underline text-xs min-h-0 min-w-0 px-2 py-1"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
