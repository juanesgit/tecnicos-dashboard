/**
 * HistoricoInicio — Tendencia de hora de inicio diaria de técnicos.
 *
 * Sección 1 – Agregado por microcelda:
 *   LineChart de % A tiempo (≤ 07:00) por día, una línea por microcelda.
 *
 * Sección 2 – Detalle por técnico:
 *   Tabla/heatmap: filas = técnicos, columnas = días.
 *   Celda = hora_inicio coloreada según puntualidad.
 */
import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAuth from '../hooks/useAuth'

const DIAS_OPTS = [
  { label: '7d',  value: 7  },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
]

const COLORES_MC = [
  '#7c3aed','#0891b2','#dc2626','#d97706',
  '#16a34a','#db2777','#ea580c','#4f46e5',
  '#0d9488','#92400e','#1d4ed8','#be123c',
]

function HoraBadge({ hora, aTiempo }) {
  if (!hora) return <span className="text-slate-300 text-xs">—</span>
  return (
    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
      aTiempo
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-red-100 text-red-700'
    }`}>
      {hora}
    </span>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[120, 160].map((h, i) => (
        <div key={i} style={{ height: h }} className="rounded-xl bg-slate-100 animate-pulse" />
      ))}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-slate-600">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}%</span>
        </p>
      ))}
    </div>
  )
}

/**
 * microceldas: string[] — lista completa de microceldas del supervisor.
 * Cuando tiene más de un elemento NO se pasa el param ?microcelda= al backend;
 * el servidor ya filtra usando current_user.microcelda_list vía JWT.
 */
export default function HistoricoInicio({ celulaFiltro = '', microceldaFiltro = '', microceldas = [] }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [dias,         setDias]         = useState(7)
  const [mcSeries,     setMcSeries]     = useState(null)
  const [tecData,      setTecData]      = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [subTab,       setSubTab]       = useState('microceldas')
  const [filtroTec,    setFiltroTec]    = useState('')
  const [regenerando,  setRegenerando]  = useState(false)
  const [refreshKey,   setRefreshKey]   = useState(0)

  useEffect(() => {
    let cancelled = false
    const fetch = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ dias })
        if (celulaFiltro) params.set('celula', celulaFiltro)
        // Si el supervisor tiene MÚLTIPLES microceldas no enviamos el param:
        // el backend filtra por todas usando current_user.microcelda_list.
        // Solo lo enviamos cuando es exactamente una (o cuando viene de un filtro manual).
        const microParam = microceldas.length > 1 ? '' : microceldaFiltro
        if (microParam) params.set('microcelda', microParam)

        const [mcRes, tecRes] = await Promise.all([
          api.get(`/historico/inicio/microceldas?${params}`),
          api.get(`/historico/inicio/tecnicos?${params}`),
        ])
        if (!cancelled) {
          setMcSeries(mcRes.data.series ?? {})
          setTecData(tecRes.data)
        }
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.detail || 'Error al cargar histórico inicio')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [dias, celulaFiltro, microceldaFiltro, microceldas.join(','), refreshKey]) // eslint-disable-line

  // ── Preparar datos gráfica microcelda ─────────────────────────────────────
  const mcNames = mcSeries ? Object.keys(mcSeries) : []

  const allFechas = mcSeries
    ? [...new Set(Object.values(mcSeries).flat().map(p => p.fecha))].sort()
    : []

  const mcLineData = allFechas.map(fecha => {
    const punto = { fecha: fecha.slice(5) }  // MM-DD
    mcNames.forEach(mc => {
      const p = (mcSeries[mc] || []).find(x => x.fecha === fecha)
      punto[mc] = p ? p.pct_a_tiempo : null
    })
    return punto
  })

  // KPIs de resumen (promedio últimos N días)
  const kpis = (() => {
    if (!mcSeries) return null
    const todos = Object.values(mcSeries).flat()
    if (!todos.length) return null
    const pct = todos.map(p => p.pct_a_tiempo)
    const avg = pct.reduce((a, b) => a + b, 0) / pct.length
    const total = todos.reduce((a, p) => a + p.total, 0)
    const aTiempo = todos.reduce((a, p) => a + p.a_tiempo, 0)
    return { avg: avg.toFixed(1), total, aTiempo }
  })()

  // ── Regenerar inicio diario (solo admin) ──────────────────────────────────
  const handleRegenerar = async () => {
    if (!window.confirm('¿Regenerar los datos de inicio de hoy? Esto borrará los registros actuales y los recalculará con las reglas nuevas (sin Almacén, umbral 07:00).')) return
    setRegenerando(true)
    try {
      const res = await api.get('/historico/admin/regenerar-inicio')
      const { insertados, msg } = res.data
      toast.success(`✅ ${msg || `${insertados} técnicos regenerados`}`)
      setRefreshKey(k => k + 1)  // fuerza recarga del useEffect
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al regenerar')
    } finally {
      setRegenerando(false)
    }
  }

  // ── Tabla técnicos ─────────────────────────────────────────────────────────
  const fechasCols = tecData?.fechas ?? []
  const tecEntries = tecData
    ? Object.entries(tecData.tecnicos).filter(([tec]) =>
        !filtroTec || tec.toLowerCase().includes(filtroTec.toLowerCase())
      )
    : []

  // Ordenar: más tardío primero para ver problemas al tope
  const tecOrdenados = [...tecEntries].sort((a, b) => {
    // promedio hora inicio: convertir HH:MM a minutos
    const avg = (entries) => {
      const mins = entries.map(d => {
        const [h, m] = (d.hora_inicio || '').split(':').map(Number)
        return isNaN(h) ? 0 : h * 60 + (m || 0)
      })
      return mins.reduce((s, v) => s + v, 0) / (mins.length || 1)
    }
    return avg(b[1]) - avg(a[1])
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-slate-700 text-sm">⏰ Hora de inicio</h2>
          <p className="text-[11px] text-slate-400">Primera actividad iniciada · umbral 07:00</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleRegenerar}
              disabled={regenerando}
              title="Regenerar datos de inicio de hoy"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              {regenerando ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              ) : '🔄'}
              <span className="hidden sm:inline">Regenerar</span>
            </button>
          )}
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {DIAS_OPTS.map(o => (
              <button key={o.value} onClick={() => setDias(o.value)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  dias === o.value ? 'bg-cyan-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >{o.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex rounded-xl overflow-hidden border border-slate-200">
        {[
          { id: 'microceldas', label: '📊 Por microcelda' },
          { id: 'tecnicos',    label: '👷 Por técnico'    },
        ].map(o => (
          <button key={o.id} onClick={() => setSubTab(o.id)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              subTab === o.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >{o.label}</button>
        ))}
      </div>

      {loading ? <Skeleton /> : (
        <>
          {/* KPIs rápidos */}
          {kpis && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded-xl border border-slate-100 px-3 py-2.5 text-center">
                <p className="text-[10px] text-slate-400">% a tiempo promedio</p>
                <p className={`text-lg font-bold ${parseFloat(kpis.avg) >= 80 ? 'text-emerald-600' : parseFloat(kpis.avg) >= 60 ? 'text-amber-500' : 'text-red-600'}`}>
                  {kpis.avg}%
                </p>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 px-3 py-2.5 text-center">
                <p className="text-[10px] text-slate-400">A tiempo</p>
                <p className="text-lg font-bold text-emerald-600">{kpis.aTiempo}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 px-3 py-2.5 text-center">
                <p className="text-[10px] text-slate-400">Tardíos</p>
                <p className="text-lg font-bold text-red-600">{kpis.total - kpis.aTiempo}</p>
              </div>
            </div>
          )}

          {/* ── Vista: MICROCELDAS ─────────────────────────────────────────── */}
          {subTab === 'microceldas' && (
            <>
              {mcLineData.length > 0 && mcNames.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-600">
                    % A tiempo (≤ 07:00) por microcelda — últimos {dias} días
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={mcLineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {/* Línea de referencia 07:00 = 100% benchmark */}
                      {mcNames.map((mc, i) => (
                        <Line
                          key={mc}
                          type="monotone"
                          dataKey={mc}
                          name={mc}
                          stroke={COLORES_MC[i % COLORES_MC.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
                  Sin datos de inicio en el rango seleccionado. Los registros se generan cuando el sistema
                  captura técnicos con actividades iniciadas.
                </div>
              )}

              {/* Tabla resumen por microcelda × día */}
              {mcNames.length > 0 && allFechas.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-600">Detalle por microcelda y día</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-3 py-2 text-slate-500 font-medium sticky left-0 bg-slate-50">Microcelda</th>
                          {allFechas.map(f => (
                            <th key={f} className="px-2 py-2 text-slate-500 font-medium text-center whitespace-nowrap">{f.slice(5)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {mcNames.map(mc => (
                          <tr key={mc} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-700 font-medium sticky left-0 bg-white max-w-[120px] truncate">{mc}</td>
                            {allFechas.map(fecha => {
                              const punto = (mcSeries[mc] || []).find(p => p.fecha === fecha)
                              if (!punto) return <td key={fecha} className="px-2 py-2 text-center text-slate-200">—</td>
                              const color = punto.pct_a_tiempo >= 80
                                ? 'bg-emerald-100 text-emerald-700'
                                : punto.pct_a_tiempo >= 60
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-700'
                              return (
                                <td key={fecha} className="px-2 py-2 text-center">
                                  <span className={`px-1.5 py-0.5 rounded-md font-semibold ${color}`}>
                                    {punto.pct_a_tiempo}%
                                  </span>
                                  {punto.hora_promedio && (
                                    <div className="text-[9px] text-slate-400 mt-0.5">{punto.hora_promedio}</div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Vista: TÉCNICOS ────────────────────────────────────────────── */}
          {subTab === 'tecnicos' && (
            <>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={filtroTec}
                  onChange={e => setFiltroTec(e.target.value)}
                  placeholder="Buscar técnico…"
                  className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-300"
                />
                {filtroTec && (
                  <button onClick={() => setFiltroTec('')}
                    className="text-xs text-slate-400 hover:text-slate-600 px-2">✕</button>
                )}
              </div>

              {tecOrdenados.length === 0 ? (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
                  Sin datos de técnicos en el rango seleccionado.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600">
                      Técnicos — hora de inicio diaria
                    </p>
                    <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                      {tecOrdenados.length} técnicos
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-3 py-2 text-slate-500 font-medium sticky left-0 bg-slate-50 min-w-[140px]">Técnico</th>
                          <th className="px-2 py-2 text-slate-500 font-medium text-center">Microcelda</th>
                          {fechasCols.map(f => (
                            <th key={f} className="px-2 py-2 text-slate-500 font-medium text-center whitespace-nowrap">{f.slice(5)}</th>
                          ))}
                          <th className="px-2 py-2 text-slate-500 font-medium text-center">% A tiempo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {tecOrdenados.map(([tec, registros]) => {
                          const aTiempoCount = registros.filter(r => r.a_tiempo).length
                          const pctAT = registros.length ? Math.round(aTiempoCount / registros.length * 100) : 0
                          const microcelda = registros[0]?.microcelda || '—'
                          return (
                            <tr key={tec} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-slate-700 font-medium sticky left-0 bg-white">
                                <span className="block max-w-[140px] truncate" title={tec}>{tec}</span>
                              </td>
                              <td className="px-2 py-2 text-center text-slate-500 whitespace-nowrap">{microcelda}</td>
                              {fechasCols.map(fecha => {
                                const reg = registros.find(r => r.fecha === fecha)
                                return (
                                  <td key={fecha} className="px-2 py-2 text-center">
                                    <HoraBadge hora={reg?.hora_inicio} aTiempo={reg?.a_tiempo} />
                                  </td>
                                )
                              })}
                              <td className="px-2 py-2 text-center">
                                <span className={`font-bold ${pctAT >= 80 ? 'text-emerald-600' : pctAT >= 60 ? 'text-amber-500' : 'text-red-600'}`}>
                                  {pctAT}%
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
