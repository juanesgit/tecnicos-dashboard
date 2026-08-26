import { useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend
} from 'recharts'
import toast from 'react-hot-toast'
import api from '../services/api'

/* ── Paleta de estados ─────────────────────────────────────── */
const ESTADO_CFG = {
  completado:    { label: 'Completadas',    color: '#16a34a', bg: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-500'   },
  no_completado: { label: 'Inefectivas',   color: '#dc2626', bg: 'bg-red-50',     border: 'border-red-200',    text: 'text-red-700',    dot: 'bg-red-400'     },
  iniciado:      { label: 'En ejecución',  color: '#2563eb', bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500'    },
  pendiente:     { label: 'Pendientes',    color: '#64748b', bg: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-700',  dot: 'bg-slate-400'   },
  suspendido:    { label: 'Suspendidas',   color: '#d97706', bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-400'   },
  cancelado:     { label: 'Canceladas',    color: '#94a3b8', bg: 'bg-slate-100',  border: 'border-slate-200',  text: 'text-slate-400',  dot: 'bg-slate-300'   },
}

/* ── Gauge semicircular genérico ──────────────────────────── */
function Gauge({ pct, label, colorFn }) {
  const v = Math.min(100, Math.max(0, pct ?? 0))
  const r = 48
  const circ = Math.PI * r
  const dash  = (v / 100) * circ
  const color = colorFn ? colorFn(v) : (v >= 80 ? '#16a34a' : v >= 60 ? '#d97706' : '#dc2626')
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="116" height="66" viewBox="0 0 116 66">
        <path d={`M 10 60 A ${r} ${r} 0 0 1 106 60`}
          fill="none" stroke="#e2e8f0" strokeWidth="9" strokeLinecap="round" />
        <path d={`M 10 60 A ${r} ${r} 0 0 1 106 60`}
          fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <p className="text-xl font-bold tabular-nums -mt-3" style={{ color }}>{Math.round(v)}%</p>
      <p className="text-[10px] text-slate-400 mt-0.5 text-center px-1 leading-tight">{label}</p>
    </div>
  )
}

/* ── Tooltip personalizado ───────────────────────────────── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

/* ── Componente principal ───────────────────────────────────── */
export default function AvanceOperacion({ celulaFiltro = '' }) {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [showTipos,  setShowTipos]  = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const cel = celulaFiltro ? `?celula=${encodeURIComponent(celulaFiltro)}` : ''
        const res = await api.get(`/avance-ot${cel}`)
        if (!cancelled) setData(res.data)
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.detail || 'Error al cargar avance de OT')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [celulaFiltro])

  if (loading) return (
    <div className="space-y-3">
      <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
      <div className="h-36 rounded-xl bg-slate-100 animate-pulse" />
    </div>
  )

  if (!data?.resumen || !Object.keys(data.resumen).length) return (
    <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-8 text-center text-xs text-slate-400">
      Sin datos de avance de OT aún.
    </div>
  )

  const { resumen, curva_s, por_celula } = data

  // Filtrar por célula si aplica
  const celulaList = por_celula

  // Datos stacked bar por célula
  const barCelula = [...celulaList].sort((a, b) => b.total - a.total).slice(0, 12)

  const estadosOrden = ['completado', 'no_completado', 'iniciado', 'suspendido', 'pendiente', 'cancelado']

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-600">
            Avance de operación{celulaFiltro ? ` · ${celulaFiltro}` : ''}
          </p>
          <p className="text-[10px] text-slate-400">
            {resumen.total} OTs en total · {resumen.efectivo} operacionales
          </p>
        </div>
      </div>

      {/* KPI tiles + gauge */}
      <div className="grid grid-cols-2 gap-3">
        {/* Gauges */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-100 px-4 py-3 grid grid-cols-2 gap-2">
          <div className="flex flex-col items-center justify-center border-r border-slate-100 pr-2">
            <Gauge
              pct={resumen.tasa_avance}
              label="Avance de operación"
              colorFn={v => v >= 80 ? '#16a34a' : v >= 60 ? '#d97706' : '#dc2626'}
            />
            <p className="text-[9px] text-slate-400 text-center mt-1 leading-tight px-1">
              (Complet. + Inefect.) / carga ejecutable
            </p>
          </div>
          <div className="flex flex-col items-center justify-center pl-2">
            <Gauge
              pct={resumen.tasa_cumplimiento}
              label="Cumplimiento efectivo"
              colorFn={v => v >= 80 ? '#16a34a' : v >= 60 ? '#d97706' : '#dc2626'}
            />
            <p className="text-[9px] text-slate-400 text-center mt-1 leading-tight px-1">
              Completadas / (Total − Canceladas)
            </p>
          </div>
        </div>

        {/* Tiles */}
        <div className="col-span-2 grid gap-2" style={{gridTemplateColumns: 'repeat(3, 1fr)'}}>
          {['completado', 'no_completado', 'iniciado', 'pendiente', 'suspendido', 'cancelado'].map(key => {
            const cfg = ESTADO_CFG[key]
            const val = resumen[key] ?? 0
            const pct = resumen.total > 0 ? Math.round(val / resumen.total * 100) : 0
            return (
              <div key={key} className={`rounded-xl border px-2.5 py-2.5 ${cfg.bg} ${cfg.border}`}>
                <div className="flex items-center gap-1 mb-1">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  <span className={`text-[9px] font-semibold uppercase tracking-wide ${cfg.text}`}>
                    {cfg.label}
                  </span>
                </div>
                <p className={`text-xl font-bold tabular-nums leading-none ${cfg.text}`}>{val}</p>
                <p className={`text-[10px] mt-0.5 ${cfg.text} opacity-70`}>{pct}%</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Curva S — completadas acumuladas por hora */}
      {curva_s.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-600">Completadas acumuladas en el día</p>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={curva_s} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="hora" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone" dataKey="acumulado" name="Acumulado"
                stroke="#16a34a" strokeWidth={2} fill="#dcfce7" dot={false}
              />
              <Area
                type="monotone" dataKey="completadas" name="En la hora"
                stroke="#2563eb" strokeWidth={1.5} fill="#dbeafe" dot={false}
                fillOpacity={0.4}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stacked bar por célula */}
      {barCelula.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-600">
            Distribución de estados por célula
          </p>
          <ResponsiveContainer width="100%" height={Math.max(140, barCelula.length * 28)}>
            <BarChart
              data={barCelula}
              layout="vertical"
              margin={{ top: 4, right: 8, left: 4, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis
                type="category" dataKey="celula"
                tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} width={80}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {estadosOrden.map(key => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={ESTADO_CFG[key].label}
                  stackId="a"
                  fill={ESTADO_CFG[key].color}
                  radius={key === 'cancelado' ? [0, 4, 4, 0] : key === 'completado' ? [4, 0, 0, 4] : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Derrotero por tipo de actividad */}
      {data?.por_tipo?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <button
            onClick={() => setShowTipos(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <span>Derrotero por tipo de actividad <span className="text-slate-400 font-normal">({data.por_tipo.length} tipos)</span></span>
            <span className="text-slate-400">{showTipos ? '▲' : '▼'}</span>
          </button>
          {showTipos && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-t border-slate-100">
                    <th className="text-left px-3 py-2 font-semibold border-b border-slate-100">Tipo de actividad</th>
                    <th className="text-center px-2 py-2 font-semibold border-b border-slate-100">Total</th>
                    <th className="text-center px-2 py-2 font-semibold border-b border-slate-100 text-green-600">Complet.</th>
                    <th className="text-center px-2 py-2 font-semibold border-b border-slate-100 text-red-500">Inefect.</th>
                    <th className="text-center px-2 py-2 font-semibold border-b border-slate-100 text-blue-600">Inic.</th>
                    <th className="text-center px-2 py-2 font-semibold border-b border-slate-100 text-slate-400">Pend.</th>
                    <th className="text-center px-2 py-2 font-semibold border-b border-slate-100">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_tipo.map((row, idx) => (
                    <tr
                      key={row.tipo}
                      className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} ${row.excluida ? 'opacity-50' : ''}`}
                    >
                      <td className="px-3 py-1.5 font-medium text-slate-700 max-w-[180px]">
                        <div className="flex items-center gap-1.5 truncate">
                          {row.excluida
                            ? <span className="flex-shrink-0 text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">excluida</span>
                            : <span className="flex-shrink-0 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">operativa</span>
                          }
                          <span className="truncate">{row.tipo}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center font-semibold text-slate-600">{row.total}</td>
                      <td className="px-2 py-1.5 text-center text-green-600">{row.estados['Completado'] ?? 0}</td>
                      <td className="px-2 py-1.5 text-center text-red-500">{row.estados['No completado'] ?? 0}</td>
                      <td className="px-2 py-1.5 text-center text-blue-600">{row.estados['Iniciado'] ?? 0}</td>
                      <td className="px-2 py-1.5 text-center text-slate-400">{row.estados['Pendiente'] ?? 0}</td>
                      <td className="px-2 py-1.5 text-center">
                        {row.excluida
                          ? <span className="text-slate-400">—</span>
                          : <div className="flex h-2 rounded-full overflow-hidden w-16 mx-auto bg-slate-100">
                              <div style={{ width: `${row.total > 0 ? ((row.estados['Completado'] ?? 0) / row.total * 100) : 0}%`, background: '#16a34a' }} />
                              <div style={{ width: `${row.total > 0 ? ((row.estados['Iniciado'] ?? 0) / row.total * 100) : 0}%`, background: '#2563eb' }} />
                              <div style={{ width: `${row.total > 0 ? ((row.estados['No completado'] ?? 0) / row.total * 100) : 0}%`, background: '#dc2626' }} />
                            </div>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[9px] text-slate-400 px-3 py-2 border-t border-slate-100">
                Las filas marcadas como <span className="font-semibold">excluida</span> no se cuentan en el avance operacional.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tabla resumen por célula */}
      {celulaList.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="text-left px-3 py-2 font-semibold border-b border-slate-100">Célula</th>
                <th className="text-center px-2 py-2 font-semibold border-b border-slate-100">Total</th>
                <th className="text-center px-2 py-2 font-semibold border-b border-slate-100 text-green-600">✓</th>
                <th className="text-center px-2 py-2 font-semibold border-b border-slate-100 text-red-500">✗</th>
                <th className="text-center px-2 py-2 font-semibold border-b border-slate-100 text-blue-600">▶</th>
                <th className="text-center px-2 py-2 font-semibold border-b border-slate-100 text-slate-500">⏳</th>
                <th className="text-center px-2 py-2 font-semibold border-b border-slate-100 text-amber-600">⚠</th>
                <th className="text-center px-2 py-2 font-semibold border-b border-slate-100">%</th>
              </tr>
            </thead>
            <tbody>
              {[...celulaList]
                .sort((a, b) => b.tasa - a.tasa)
                .map((cel, idx) => {
                  const tasaColor = cel.tasa >= 80 ? 'text-green-600 font-bold'
                    : cel.tasa >= 60 ? 'text-amber-600 font-semibold'
                    : 'text-red-600 font-bold'
                  return (
                    <tr key={cel.celula} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="px-3 py-1.5 font-medium text-slate-700 truncate max-w-[120px]">{cel.celula}</td>
                      <td className="px-2 py-1.5 text-center text-slate-500">{cel.total}</td>
                      <td className="px-2 py-1.5 text-center text-green-600">{cel.completado}</td>
                      <td className="px-2 py-1.5 text-center text-red-500">{cel.no_completado ?? 0}</td>
                      <td className="px-2 py-1.5 text-center text-blue-600">{cel.iniciado}</td>
                      <td className="px-2 py-1.5 text-center text-slate-400">{cel.pendiente}</td>
                      <td className="px-2 py-1.5 text-center text-amber-600">{cel.suspendido}</td>
                      <td className={`px-2 py-1.5 text-center ${tasaColor}`}>{cel.tasa}%</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
