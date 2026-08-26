function Skeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )
}

export default function TablaParadas({ datos }) {
  if (!datos) return <Skeleton />

  if (datos.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">
        <div className="text-3xl mb-2">✅</div>
        No hay técnicos con paradas futuras previstas.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
        <h3 className="font-semibold text-slate-800 text-sm">Paradas Futuras (&gt; 30 min)</h3>
        <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{datos.length}</span>
      </div>

      {/* ── MOBILE: cards ─────────────────────── */}
      <div className="sm:hidden divide-y divide-slate-100">
        {datos.map((row, i) => (
          <div key={i} className="p-3 hover:bg-amber-50/30 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{row['Técnico'] ?? '—'}</p>
                <p className="text-xs text-slate-500 truncate">{row.ciudad_actual || '—'}</p>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 tabular-nums whitespace-nowrap shrink-0">
                ⏸ {row.parada_ajustada_hhmm || row.parada_hhmm || '—'}
              </span>
            </div>
            <p className="text-xs text-slate-600 truncate mb-1" title={row.actividad_actual}>
              Actual: {row.actividad_actual || '—'}
              {row.ventana_fin ? ` · fin ${row.ventana_fin}` : ''}
            </p>
            {row.siguiente_actividad && (
              <p className="text-xs text-slate-500 truncate">
                Sig: {row.siguiente_actividad}
                {row.inicio_siguiente ? ` · ${row.inicio_siguiente}` : ''}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── DESKTOP: tabla compacta (sin scroll horizontal) ── */}
      <div className="hidden sm:block">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[42%]" />
            <col className="w-[18%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-medium">Técnico</th>
              <th className="px-4 py-2.5 text-left font-medium">Actividad actual → Siguiente</th>
              <th className="px-4 py-2.5 text-center font-medium">Inicio sig.</th>
              <th className="px-4 py-2.5 text-center font-medium">Parada estimada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {datos.map((row, i) => (
              <tr key={i} className="hover:bg-amber-50/30 transition-colors">
                {/* Técnico + Ciudad */}
                <td className="px-4 py-2.5">
                  <p className="font-medium text-slate-800 truncate">{row['Técnico'] ?? '—'}</p>
                  <p className="text-xs text-slate-400 truncate">{row.ciudad_actual || '—'}</p>
                </td>
                {/* Actual → Siguiente */}
                <td className="px-4 py-2.5">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-600 truncate" title={row.actividad_actual}>
                        {row.actividad_actual || '—'}
                      </p>
                      {row.ventana_fin && (
                        <p className="text-[11px] text-slate-400 tabular-nums">fin {row.ventana_fin}</p>
                      )}
                    </div>
                    <span className="text-slate-300 text-xs mt-0.5 shrink-0">→</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500 truncate italic" title={row.siguiente_actividad}>
                        {row.siguiente_actividad || <span className="not-italic text-slate-300">Sin actividad</span>}
                      </p>
                    </div>
                  </div>
                </td>
                {/* Inicio siguiente */}
                <td className="px-4 py-2.5 text-center text-xs text-slate-500 tabular-nums">
                  {row.inicio_siguiente || '—'}
                </td>
                {/* Parada + Ajustada */}
                <td className="px-4 py-2.5 text-center">
                  <div className="flex flex-col items-center gap-1">
                    {row.parada_ajustada_hhmm && row.parada_ajustada_hhmm !== row.parada_hhmm ? (
                      <>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 tabular-nums whitespace-nowrap">
                          {row.parada_hhmm || '—'}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 tabular-nums whitespace-nowrap">
                          aj. {row.parada_ajustada_hhmm}
                        </span>
                      </>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 tabular-nums whitespace-nowrap">
                        ⏸ {row.parada_ajustada_hhmm || row.parada_hhmm || '—'}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
