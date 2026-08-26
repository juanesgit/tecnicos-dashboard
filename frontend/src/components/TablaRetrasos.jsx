const MINUSCULAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'a', 'con', 'por', 'sin'])
function toTitleCase(str) {
  if (!str) return str
  return str.toLowerCase().split(' ').map((w, i) =>
    i === 0 || !MINUSCULAS.has(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(' ')
}

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

function hhmm_to_min(str) {
  if (!str) return 0
  const [h, m] = str.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export default function TablaRetrasos({ datos, onDetalle }) {
  if (!datos) return <Skeleton />

  if (datos.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">
        <div className="text-3xl mb-2">✅</div>
        No hay técnicos con retraso ahora mismo.
      </div>
    )
  }

  const retrasoVal = (row) =>
    row.estado_actual === 'Retraso en siguiente' ? row.retraso_siguiente_hhmm : row.retraso_hhmm

  const sorted = [...datos].sort(
    (a, b) => hhmm_to_min(retrasoVal(b)) - hhmm_to_min(retrasoVal(a))
  )

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <h3 className="font-semibold text-slate-800 text-sm">Técnicos con Retraso</h3>
        <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{datos.length}</span>
      </div>

      {/* ── MOBILE: cards tapeables ─────────────────────── */}
      <div className="sm:hidden divide-y divide-slate-100">
        {sorted.map((row, i) => (
          <button
            key={i}
            onClick={() => onDetalle && onDetalle(row)}
            className="w-full text-left p-3 hover:bg-red-50/40 active:bg-red-50/60 transition-colors"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{toTitleCase(row['Técnico']) ?? '—'}</p>
                <p className="text-xs text-slate-500 truncate">{toTitleCase(row.ciudad_actual) || '—'}</p>
              </div>
              <EstadoBadge estado={row.estado_actual} />
            </div>
            <p className="text-xs text-slate-600 truncate mb-2" title={toTitleCase(row.actividad_actual)}>
              {toTitleCase(row.actividad_actual) || '—'}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 tabular-nums whitespace-nowrap">
                  ⏱ {retrasoVal(row) || '—'}
                </span>
                {(row.pendientes_post_siguiente ?? 0) > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 whitespace-nowrap">
                    {row.pendientes_post_siguiente} pend.
                  </span>
                )}
              </div>
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-500 shrink-0">
                Ver detalles
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* ── DESKTOP: tabla compacta (sin scroll horizontal) ── */}
      <div className="hidden sm:block">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[24%]" />
            <col className="w-[26%]" />
            <col className="w-[20%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-medium">Técnico</th>
              <th className="px-4 py-2.5 text-left font-medium">Actividad</th>
              <th className="px-4 py-2.5 text-left font-medium">Estado</th>
              <th className="px-4 py-2.5 text-left font-medium">Retraso</th>
              <th className="px-4 py-2.5 text-center font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row, i) => (
              <tr key={i} className="hover:bg-red-50/30 transition-colors">
                {/* Técnico + Ciudad */}
                <td className="px-4 py-2.5">
                  <p className="font-medium text-slate-800 truncate">{toTitleCase(row['Técnico']) ?? '—'}</p>
                  <p className="text-xs text-slate-400 truncate">{toTitleCase(row.ciudad_actual) || '—'}</p>
                </td>
                {/* Actividad */}
                <td className="px-4 py-2.5">
                  <p className="text-slate-600 truncate text-xs" title={toTitleCase(row.actividad_actual)}>
                    {toTitleCase(row.actividad_actual) || '—'}
                  </p>
                </td>
                {/* Estado + Fin norma */}
                <td className="px-4 py-2.5">
                  <EstadoBadge estado={row.estado_actual} />
                  {(row.fin_norma || row.ventana_fin) && (
                    <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                      fin {row.fin_norma || row.ventana_fin}
                    </p>
                  )}
                </td>
                {/* Retraso + Pendientes */}
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 tabular-nums whitespace-nowrap">
                      ⏱ {retrasoVal(row) || '—'}
                    </span>
                    {(row.pendientes_post_siguiente ?? 0) > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 whitespace-nowrap whitespace-nowrap">
                        {row.pendientes_post_siguiente} pend.
                      </span>
                    )}
                  </div>
                </td>
                {/* Acción */}
                <td className="px-4 py-2.5 text-center">
                  <button
                    onClick={() => onDetalle && onDetalle(row)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                  >
                    Ver detalles
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
