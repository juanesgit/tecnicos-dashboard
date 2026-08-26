import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAuth from '../hooks/useAuth'
import MapaCalorMicroceldas from '../components/MapaCalorMicroceldas'
import HistoricoInicio from '../components/HistoricoInicio'
import AvanceOperacion from '../components/AvanceOperacion'
import ModalDetalle from '../components/ModalDetalle'

const HORAS_OPTS = [
  { label: '4 h',  value: 4  },
  { label: '8 h',  value: 8  },
  { label: '12 h', value: 12 },
  { label: '24 h', value: 24 },
]

const COLORES_CELULA = [
  '#7c3aed', '#0891b2', '#dc2626', '#d97706',
  '#16a34a', '#db2777', '#ea580c', '#4f46e5',
]

function Skeleton() {
  return (
    <div className="space-y-3">
      {[120, 180, 120].map((h, i) => (
        <div key={i} style={{ height: h }} className="rounded-xl bg-slate-100 animate-pulse" />
      ))}
    </div>
  )
}

// Flecha de tendencia: bad-up = subir es malo (retrasos), good-up = subir es bueno (cumplimiento)
function Tendencia({ dir, type = 'bad-up' }) {
  if (!dir || dir === 'flat') return null
  const isUp = dir === 'up'
  const isBad = (type === 'bad-up' && isUp) || (type === 'good-up' && !isUp)
  return (
    <span className={`text-xs font-bold ml-1 ${isBad ? 'text-red-500' : 'text-green-600'}`}>
      {isUp ? '↑' : '↓'}
    </span>
  )
}

function KpiCard({ label, value, sub, color = '#7c3aed', trend, trendType = 'bad-up' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex flex-col gap-0.5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-bold flex items-center" style={{ color }}>
        {value}
        <Tendencia dir={trend} type={trendType} />
      </p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
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
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

/**
 * microceldas: string[] — lista completa de microceldas del supervisor.
 *   Cuando tiene valores, las gráficas de línea/barra se calculan
 *   desde /historico/microceldas filtrando y agregando solo esas microceldas.
 */
export default function Historico({
  celulaFiltro = '',
  microceldaFiltro = '',
  microceldas = [],
  rows = [],
  onDetalle: onDetalleProp,
  showMapa = true,
}) {
  useAuth() // mantiene sesión activa
  const [detalleTecnico, setDetalleTecnico] = useState(null)
  const handleDetalle = onDetalleProp ?? setDetalleTecnico
  const [horas,    setHoras]    = useState(8)
  const [global,   setGlobal]   = useState(null)
  const [ultimo,   setUltimo]   = useState(null)
  const [celulas,  setCelulas]  = useState(null)
  const [mcSeries, setMcSeries] = useState(null)   // { microcelda: [{t, con_retraso, ...}] }
  const [loading,  setLoading]  = useState(false)

  // Determinar si estamos en scope de microcelda(s)
  const hasMicroScope = microceldas.length > 0

  useEffect(() => {
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      try {
        const celulaParam = celulaFiltro ? `&celula=${encodeURIComponent(celulaFiltro)}` : ''

        const promises = [
          api.get(`/historico/global?horas=${horas}`),
          api.get('/historico/ultimo'),
          api.get(`/historico/celulas?horas=${horas}${celulaParam}`),
        ]
        // Si hay scope de microcelda(s), también traer la serie por microcelda
        if (hasMicroScope) {
          promises.push(api.get(`/historico/microceldas?horas=${horas}${celulaParam}`))
        }

        const results = await Promise.all(promises)
        if (!cancelled) {
          setGlobal(results[0].data.puntos ?? [])
          setUltimo(results[1].data)
          setCelulas(results[2].data.series ?? {})
          setMcSeries(hasMicroScope ? (results[3].data.series ?? {}) : null)
        }
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.detail || 'Error al cargar histórico')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [horas, celulaFiltro, hasMicroScope]) // eslint-disable-line

  // ── Serie de línea principal ───────────────────────────────────────────────
  const serieLinea = (() => {
    // Scope de microcelda(s): agregar las series de las microceldas asignadas
    if (hasMicroScope && mcSeries) {
      const relevantes = Object.entries(mcSeries)
        .filter(([mc]) => microceldas.includes(mc))
      if (!relevantes.length) return []

      // Timestamps únicos ordenados
      const allT = [...new Set(relevantes.flatMap(([, pts]) => pts.map(p => p.t)))].sort()

      // Sumar con_retraso y con_parada; promediar cumplimiento_pct
      return allT.map((t) => {
        let total = 0, con_retraso = 0, con_parada = 0, cumplSum = 0, cumplCount = 0
        relevantes.forEach(([, pts]) => {
          const p = pts.find(x => x.t === t)
          if (p) {
            total       += p.total       ?? 0
            con_retraso += p.con_retraso ?? 0
            con_parada  += p.con_parada  ?? 0
            cumplSum    += p.cumplimiento_pct ?? 0
            cumplCount  += 1
          }
        })
        return {
          t,
          total,
          con_retraso,
          con_parada,
          cumplimiento_pct: cumplCount ? Math.round(cumplSum / cumplCount) : 0,
        }
      })
    }

    // Scope de célula (lider_celula o filtro manual)
    if (celulaFiltro) return celulas?.[celulaFiltro] ?? []

    // Sin scope → global
    return global ?? []
  })()

  // ── Datos barra (último snapshot) ─────────────────────────────────────────
  const barData = (() => {
    // Scope de microcelda(s): barras por microcelda usando el último punto de cada serie
    if (hasMicroScope && mcSeries) {
      return microceldas
        .filter(mc => mcSeries[mc]?.length)
        .map(mc => {
          const pts  = mcSeries[mc]
          const last = pts[pts.length - 1]
          return {
            celula:      mc,   // reutilizamos el campo "celula" como clave de eje X
            con_retraso: last?.con_retraso ?? 0,
            con_parada:  last?.con_parada  ?? 0,
          }
        })
        .sort((a, b) => b.con_retraso - a.con_retraso)
    }

    if (!ultimo?.celulas) return []
    let list = [...ultimo.celulas]
    if (celulaFiltro) list = list.filter(c => c.celula === celulaFiltro)
    return list.sort((a, b) => b.con_retraso - a.con_retraso)
  })()

  // KPI snapshot:
  // - microceldas scope → calculamos desde rows en vivo (ya filtradas)
  // - célula filtrada   → snapshot de esa célula desde la API
  // - sin filtro        → snapshot global de la API
  const snap = (() => {
    if (microceldaFiltro && rows?.length) {
      const total        = rows.length
      const con_retraso  = rows.filter(r => r.estado_actual === 'Retraso actual').length
      const con_parada   = rows.filter(r => r.estado_siguiente === 'Parada futura').length
      const cumplVals    = rows.map(r => Number(r.cumplimiento_time_slot_dia) || 0)
      const cumplimiento_pct = cumplVals.length
        ? Math.round(cumplVals.reduce((a, b) => a + b, 0) / cumplVals.length)
        : 0
      return {
        total,
        con_retraso,
        pct_retraso: total ? parseFloat((con_retraso / total * 100).toFixed(1)) : 0,
        con_parada,
        cumplimiento_pct,
        captured_at: null,
      }
    }
    if (celulaFiltro) return ultimo?.celulas?.find(c => c.celula === celulaFiltro) ?? null
    return ultimo?.snapshot
  })()

  // Etiqueta de scope para los títulos
  const scopeLabel = hasMicroScope
    ? (microceldas.length === 1 ? microceldas[0] : `${microceldas.length} microceldas`)
    : celulaFiltro || ''

  // ── Tendencias: comparar primer vs último punto de serieLinea ─────────────
  const calcTrend = (key) => {
    if (!serieLinea || serieLinea.length < 2) return undefined
    const first = serieLinea[0][key]
    const last  = serieLinea[serieLinea.length - 1][key]
    if (last > first) return 'up'
    if (last < first) return 'down'
    return 'flat'
  }
  const trendRetraso      = calcTrend('con_retraso')
  const trendParada       = calcTrend('con_parada')
  const trendCumplimiento = calcTrend('cumplimiento_pct')

  // Serie multi-célula (solo aplica sin scope de microcelda y sin filtro de célula)
  const celulaNames    = celulas ? Object.keys(celulas) : []
  const allTimes       = celulas
    ? [...new Set(Object.values(celulas).flat().map((p) => p.t))].sort()
    : []
  const celulaLineData = allTimes.map((t) => {
    const punto = { t }
    celulaNames.forEach((cel) => {
      const p = (celulas[cel] || []).find((x) => x.t === t)
      punto[cel] = p ? p.con_retraso : null
    })
    return punto
  })

  return (
    <>
    <div className="max-w-4xl mx-auto px-3 py-3 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-slate-800 text-base">Histórico del día</h1>
        <div className="flex gap-1">
          {HORAS_OPTS.map((o) => (
            <button
              key={o.value}
              onClick={() => setHoras(o.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                horas === o.value
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton />
      ) : (
        <>
          {/* KPIs del último snapshot */}
          {snap ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KpiCard label="Total técnicos"  value={snap.total}            color="#475569" />
              <KpiCard label="Con retraso"     value={snap.con_retraso}      color="#dc2626"
                sub={`${snap.pct_retraso}% del total`}
                trend={trendRetraso} trendType="bad-up" />
              <KpiCard label="Paradas futuras" value={snap.con_parada}       color="#d97706"
                trend={trendParada} trendType="bad-up" />
              <KpiCard label="Cumplimiento"    value={`${snap.cumplimiento_pct}%`} color="#16a34a"
                trend={trendCumplimiento} trendType="good-up" />
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
              Aún no hay snapshots. El sistema captura datos cada 5 minutos — vuelve en unos momentos.
            </div>
          )}

          {/* Línea: evolución de retrasos */}
          {serieLinea.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600">
                  {scopeLabel ? `${scopeLabel} — retrasos` : 'Técnicos con retraso'} — últimas {horas} h
                </p>
                <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                  {serieLinea.length} puntos
                </span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={serieLinea} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone" dataKey="con_retraso" name="Con retraso"
                    stroke="#dc2626" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone" dataKey="con_parada" name="Paradas futuras"
                    stroke="#d97706" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Línea: cumplimiento % */}
          {serieLinea.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-600">
                {scopeLabel ? `${scopeLabel} — cumplimiento` : 'Cumplimiento promedio'} — últimas {horas} h
              </p>
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={serieLinea} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone" dataKey="cumplimiento_pct" name="Cumplimiento"
                    stroke="#16a34a" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Barras: retrasos por microcelda (scope) o por célula (global/lider) */}
          {barData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-600">
                {hasMicroScope
                  ? `Retrasos por microcelda — último punto`
                  : celulaFiltro
                    ? `${celulaFiltro} — último snapshot`
                    : `Retrasos por célula — último snapshot`
                }
                {!hasMicroScope && snap?.captured_at ? ` (${snap.captured_at})` : ''}
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="celula" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="con_retraso" name="Con retraso" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="con_parada"  name="Paradas"     fill="#d97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Líneas multi-célula — solo sin scope de microcelda y sin filtro de célula */}
          {!hasMicroScope && !celulaFiltro && celulaLineData.length > 0 && celulaNames.length > 1 && (
            <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-600">
                Evolución de retrasos por célula — últimas {horas} h
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={celulaLineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {celulaNames.map((cel, i) => (
                    <Line
                      key={cel}
                      type="monotone"
                      dataKey={cel}
                      name={cel}
                      stroke={COLORES_CELULA[i % COLORES_CELULA.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {!snap && global?.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-8">
              Sin datos en el rango seleccionado.
            </p>
          )}

          {/* Avance de operación — estados de OT */}
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <AvanceOperacion celulaFiltro={celulaFiltro} />
          </div>

          {/* Mapa de calor microcelda × tiempo — solo si showMapa */}
          {showMapa && (
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <MapaCalorMicroceldas
                celulaFiltro={celulaFiltro}
                microceldaFiltro={microceldaFiltro}
                rows={rows}
                onDetalle={handleDetalle}
              />
            </div>
          )}

          {/* ── Hora de inicio ─────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <HistoricoInicio
              celulaFiltro={celulaFiltro}
              microceldaFiltro={microceldaFiltro}
              microceldas={microceldas}
            />
          </div>
        </>
      )}
    </div>

      {/* Modal detalle técnico — solo cuando Historico gestiona su propio estado */}
      {!onDetalleProp && detalleTecnico && (
        <ModalDetalle tecnico={detalleTecnico} onClose={() => setDetalleTecnico(null)} />
      )}
    </>
  )
}
