import { useState } from 'react'

const ESTADOS_RETRASO = new Set(['Retraso actual', 'Retraso en siguiente'])

const MINUSCULAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'a'])
function toTitleCase(str) {
  if (!str) return str
  return str.toLowerCase().split(' ').map((w, i) =>
    i === 0 || !MINUSCULAS.has(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(' ')
}

function semaforo(pct) {
  if (pct >= 40) return { color: '#dc2626', bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500',    label: 'Crítico' }
  if (pct >= 20) return { color: '#d97706', bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-400',  label: 'Alerta'  }
  return           { color: '#16a34a', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Normal'  }
}

function agrupar(rows, agrupado, metrica) {
  const grupos = {}
  for (const r of rows) {
    const ciudadNorm = toTitleCase(r.ciudad_actual) || 'Sin ciudad'
    const key = agrupado === 'ciudad' ? ciudadNorm : `${r.celula}|||${r.microcelda}`
    if (!grupos[key]) grupos[key] = {
      key,
      label: agrupado === 'ciudad' ? ciudadNorm : r.microcelda,
      badge: agrupado === 'ciudad' ? null : r.celula,
      total: 0, con_retraso: 0, con_parada: 0, cump: [],
    }
    grupos[key].total++
    if (ESTADOS_RETRASO.has(r.estado_actual))       grupos[key].con_retraso++
    if (r.estado_siguiente === 'Parada futura')      grupos[key].con_parada++
    if (r.cumplimiento_time_slot_dia != null)        grupos[key].cump.push(Number(r.cumplimiento_time_slot_dia))
  }

  return Object.values(grupos).map(g => {
    const val = metrica === 'paradas' ? g.con_parada : g.con_retraso
    return {
      ...g,
      pct:              g.total ? parseFloat((val / g.total * 100).toFixed(1)) : 0,
      cumplimiento_pct: g.cump.length ? parseFloat((g.cump.reduce((a,b)=>a+b,0)/g.cump.length).toFixed(1)) : 0,
    }
  }).sort((a, b) => b.pct - a.pct || b.con_retraso - a.con_retraso)
}

function TecnicoRow({ r, agrupado, metrica }) {
  const enRetraso = ESTADOS_RETRASO.has(r.estado_actual)
  const enParada  = r.estado_siguiente === 'Parada futura'
  const dotColor  = enRetraso ? 'bg-red-500' : enParada ? 'bg-amber-400' : 'bg-emerald-400'

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 text-xs">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${dotColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-slate-700 font-medium truncate">{r['Técnico']}</p>
        <p className="text-[10px] text-slate-400 truncate">
          {r.actividad_actual && <span className="mr-1">{r.actividad_actual}</span>}
          {r.ot_actual        && <span className="mr-1">· OT {r.ot_actual}</span>}
          {agrupado === 'ciudad'
            ? r.microcelda                           && <span>· {r.microcelda}</span>
            : r.ciudad_actual && <span>· {toTitleCase(r.ciudad_actual)}</span>
          }
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-slate-400 text-[10px]">{r.estado_actual}</p>
        {metrica === 'retraso' && r.retraso_hhmm && r.retraso_hhmm !== '0:00' && (
          <p className="text-red-500 font-medium">{r.retraso_hhmm}</p>
        )}
        {metrica === 'paradas' && r.parada_hhmm && r.parada_hhmm !== '00:00' && (
          <p className="text-amber-500 font-medium" title={`Planificada: ${r.parada_planificada_hhmm}`}>
            {r.parada_hhmm} restante
          </p>
        )}
      </div>
    </div>
  )
}

function GroupRow({ g, rows, agrupado, metrica }) {
  const [open,     setOpen]     = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const s = semaforo(g.pct)

  const isPropia = (r) => agrupado === 'ciudad'
    ? (toTitleCase(r.ciudad_actual) || 'Sin ciudad') === g.label
    : r.microcelda === g.label

  const todosLosTecnicos = rows
    .filter(isPropia)
    .sort((a, b) => (Number(b.minutos_retraso) || 0) - (Number(a.minutos_retraso) || 0))

  const relevantes = metrica === 'paradas'
    ? todosLosTecnicos.filter(r => r.estado_siguiente === 'Parada futura')
    : todosLosTecnicos.filter(r => ESTADOS_RETRASO.has(r.estado_actual))

  const tecnicos = verTodos ? todosLosTecnicos : relevantes

  const countLabel  = metrica === 'paradas' ? g.con_parada : g.con_retraso
  const metricLabel = metrica === 'paradas' ? 'paradas' : 'retraso'

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
        <span className="flex-1 text-sm font-semibold text-slate-700 truncate">{g.label}</span>

        {g.badge && (
          <span className="text-[10px] text-slate-400 bg-white px-1.5 py-0.5 rounded-full border border-slate-100 shrink-0">
            {g.badge}
          </span>
        )}

        <div className="flex gap-3 shrink-0 text-right">
          <div>
            <p className="text-xs font-bold" style={{ color: s.color }}>{g.pct}%</p>
            <p className="text-[9px] text-slate-400">{metricLabel}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600">{countLabel}/{g.total}</p>
            <p className="text-[9px] text-slate-400">técnicos</p>
          </div>
        </div>

        <svg
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-current border-opacity-10 bg-white bg-opacity-60">
          <div className="divide-y divide-slate-100">
            {tecnicos.length === 0
              ? <p className="px-3 py-2 text-xs text-slate-400">Sin técnicos en esta condición.</p>
              : tecnicos.map((r, i) => <TecnicoRow key={i} r={r} agrupado={agrupado} metrica={metrica} />)
            }
          </div>
          {todosLosTecnicos.length > relevantes.length && (
            <button
              onClick={e => { e.stopPropagation(); setVerTodos(v => !v) }}
              className="w-full py-1.5 text-[10px] font-medium text-slate-400 hover:text-slate-600 border-t border-slate-100 transition-colors"
            >
              {verTodos
                ? `Mostrar solo con ${metricLabel} (${relevantes.length})`
                : `Ver todos los técnicos (${todosLosTecnicos.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function SemaforoMicroceldas({ rows = [], filtros = {} }) {
  const [soloAlertas, setSoloAlertas] = useState(false)
  const [agrupado,    setAgrupado]    = useState('microcelda')  // 'microcelda' | 'ciudad'
  const [metrica,     setMetrica]     = useState('retraso')     // 'retraso' | 'paradas'

  const rowsFiltrados = rows.filter(r => {
    if (filtros.celula     && r.celula     !== filtros.celula)    return false
    if (filtros.microcelda && r.microcelda !== filtros.microcelda) return false
    if (filtros.tecnico    && !r['Técnico']?.toLowerCase().includes(filtros.tecnico.toLowerCase())) return false
    return true
  })

  let lista = agrupar(rowsFiltrados, agrupado, metrica)
  if (soloAlertas) lista = lista.filter(g => g.pct >= 20)

  const criticas = lista.filter(g => g.pct >= 40).length
  const alertas  = lista.filter(g => g.pct >= 20 && g.pct < 40).length
  const normales = lista.filter(g => g.pct < 20).length
  const unidad   = agrupado === 'ciudad' ? 'ciudad' : 'microcelda'

  if (!rows.length) return (
    <div className="text-center text-slate-400 text-sm py-8">Sin datos disponibles.</div>
  )

  return (
    <div className="space-y-3 pb-2">

      {/* Controles: agrupación + métrica */}
      <div className="flex flex-wrap gap-2">
        {/* Toggle agrupación */}
        <div className="flex rounded-xl overflow-hidden border border-slate-200">
          {[
            { id: 'microcelda', label: '⬡ Microcelda' },
            { id: 'ciudad',     label: '📍 Ciudad'     },
          ].map(o => (
            <button key={o.id} onClick={() => setAgrupado(o.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                agrupado === o.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >{o.label}</button>
          ))}
        </div>

        {/* Toggle métrica */}
        <div className="flex rounded-xl overflow-hidden border border-slate-200">
          {[
            { id: 'retraso',  label: '⏱ Retraso',       active: 'bg-red-600'   },
            { id: 'paradas',  label: '⏸ Paradas futuras', active: 'bg-amber-500' },
          ].map(o => (
            <button key={o.id} onClick={() => setMetrica(o.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                metrica === o.id ? `${o.active} text-white` : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >{o.label}</button>
          ))}
        </div>
      </div>

      {/* Resumen global */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Críticas',  val: criticas, color: 'text-red-600',     bg: 'bg-red-50 border-red-100'         },
          { label: 'En alerta', val: alertas,  color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-100'     },
          { label: 'Normales',  val: normales, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
        ].map(({ label, val, color, bg }) => (
          <div key={label} className={`rounded-xl border ${bg} px-3 py-2 text-center`}>
            <p className={`text-2xl font-bold ${color}`}>{val}</p>
            <p className="text-[10px] text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Filtro solo alertas */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">
          {lista.length} {unidad}{lista.length !== 1 ? 'es' : ''}
          {' · '}
          <span className={metrica === 'paradas' ? 'text-amber-600' : 'text-red-600'}>
            {metrica === 'paradas' ? 'paradas futuras' : 'retrasos activos'}
          </span>
        </p>
        <button
          onClick={() => setSoloAlertas(v => !v)}
          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
            soloAlertas ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {soloAlertas ? '⚠️ Solo alertas' : 'Todas'}
        </button>
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-4">
          Sin {unidad}es con alerta.
        </p>
      ) : (
        <div className="space-y-2">
          {lista.map(g => (
            <GroupRow key={g.key} g={g} rows={rowsFiltrados} agrupado={agrupado} metrica={metrica} />
          ))}
        </div>
      )}
    </div>
  )
}
