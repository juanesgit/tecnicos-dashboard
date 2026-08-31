import { useState, useEffect, useCallback, useRef } from 'react'
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

// ── Gráfica distribución de retrasos por minutos de retraso ─────────────────
const DIST_BUCKETS = [
  { label: '0–30 m',  max: 30,       color: '#64748b', light: '#f1f5f9' },
  { label: '30–60 m', max: 60,       color: '#ca8a04', light: '#fefce8' },
  { label: '1–1½ h',  max: 90,       color: '#ea580c', light: '#fff7ed' },
  { label: '1½–2 h',  max: 120,      color: '#dc2626', light: '#fef2f2' },
  { label: '>2 h',    max: Infinity, color: '#7f1d1d', light: '#fef2f2' },
]

function fmtMinDist(m) {
  if (!m && m !== 0) return '—'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

function ModalDistribucion({ bucketIdx, tecnicos, total, onClose }) {
  const overlayRef            = useRef(null)
  const [visible, setVisible] = useState(false)
  const b                     = DIST_BUCKETS[bucketIdx]
  const pct                   = total > 0 ? Math.round(tecnicos.length / total * 100) : 0

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const cerrar = () => { setVisible(false); setTimeout(onClose, 300) }

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleOverlayClick = e => { if (e.target === overlayRef.current) cerrar() }

  const titulo = (
    <>
      <h2 className="font-bold text-slate-800 text-base">
        {b.label}
        <span className="ml-2 text-sm font-semibold" style={{ color: b.color }}>
          {tecnicos.length} técnico{tecnicos.length !== 1 ? 's' : ''}
        </span>
      </h2>
      <p className="text-xs text-slate-500 mt-0.5">{pct}% del total de retrasos activos</p>
    </>
  )

  const lista = (
    <div className="space-y-2">
      {[...tecnicos].sort((a, x) => x.edadMin - a.edadMin).map((t, i) => (
        <div key={i} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-semibold text-slate-800 text-sm truncate">{t.tecnico}</span>
            <span className="font-bold tabular-nums shrink-0 text-sm" style={{ color: b.color }}>
              {fmtMinDist(t.edadMin)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
            {t.ot       && <span><span className="text-slate-400">OT </span><span className="font-medium text-slate-700">{t.ot}</span></span>}
            {t.microcelda && <span><span className="text-slate-400">MC </span><span className="font-medium text-slate-700">{t.microcelda}</span></span>}
            {t.ciudad   && <span><span className="text-slate-400">Ciudad </span><span className="font-medium text-slate-700">{t.ciudad}</span></span>}
            {t.actividad && (
              <span className="col-span-2 truncate" title={t.actividad}>
                <span className="text-slate-400">Trabajo </span><span className="font-medium text-slate-700">{t.actividad}</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className={`fixed inset-0 z-50 transition-colors duration-300 ${visible ? 'bg-black/50' : 'bg-black/0'}`}
    >
      {/* ── MOBILE: bottom sheet ──────────────────────────────────── */}
      <div
        className={`sm:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl flex flex-col
          transition-transform duration-300 ease-out
          ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '92dvh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="min-w-0">{titulo}</div>
          <button onClick={cerrar}
            className="ml-3 shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <div className="px-4 py-3">{lista}</div>
        </div>
      </div>

      {/* ── DESKTOP: modal centrado ───────────────────────────────── */}
      <div className={`hidden sm:flex items-center justify-center h-full transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <div>{titulo}</div>
            <button onClick={cerrar}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">{lista}</div>
        </div>
      </div>
    </div>
  )
}

function GraficaDistribucion({ alarmas }) {
  const [tooltip,     setTooltip]     = useState(null)
  const [modalBucket, setModalBucket] = useState(null)

  const abiertas = (alarmas || []).filter(a => a.estado === 'abierta')
  if (abiertas.length === 0) return null

  const grupos = DIST_BUCKETS.map(() => [])
  abiertas.forEach(a => {
    const retraso = Math.max(0, a.minutos_retraso_inicio ?? 0)
    let idx = DIST_BUCKETS.length - 1
    for (let i = 0; i < DIST_BUCKETS.length; i++) {
      if (retraso < DIST_BUCKETS[i].max) { idx = i; break }
    }
    grupos[idx].push({ ...a, edadMin: retraso })
  })

  const total  = abiertas.length
  const maxCnt = Math.max(1, ...grupos.map(g => g.length))
  const W = 320, H = 112, PAD_L = 28, PAD_R = 8, PAD_T = 22, PAD_B = 28
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const barW  = Math.floor(plotW / DIST_BUCKETS.length)
  const gap   = Math.max(4, Math.floor(barW * 0.18))

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-100 px-4 pt-3 pb-2">
        <p className="text-xs font-semibold text-slate-600 mb-2">
          Distribución por tiempo de retraso — {abiertas.length} técnico{abiertas.length !== 1 ? 's' : ''} · <span className="text-slate-400 font-normal">clic en barra para ver detalle</span>
        </p>
        <div className="relative overflow-visible" style={{ userSelect: 'none' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ maxHeight: 120 }}
            onMouseLeave={() => setTooltip(null)}
          >
            {[0.25, 0.5, 0.75, 1].map(pct => {
              const y   = PAD_T + plotH * (1 - pct)
              const cnt = Math.round(maxCnt * pct)
              return (
                <g key={pct}>
                  <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="0.5" />
                  <text x={PAD_L - 3} y={y + 3.5} textAnchor="end" fontSize="7" fill="#94a3b8">{cnt}</text>
                </g>
              )
            })}
            {DIST_BUCKETS.map((b, i) => {
              const cnt  = grupos[i].length
              const pct  = total > 0 ? Math.round(cnt / total * 100) : 0
              const barH = cnt === 0 ? 2 : Math.max(4, Math.round((cnt / maxCnt) * plotH))
              const x    = PAD_L + i * barW + gap / 2
              const y    = PAD_T + plotH - barH
              const w    = barW - gap
              return (
                <g key={i}
                  onMouseEnter={() => setTooltip({ idx: i, svgX: x + w / 2 })}
                  onClick={() => cnt > 0 && setModalBucket(i)}
                  style={{ cursor: cnt > 0 ? 'pointer' : 'default' }}
                >
                  <rect x={x} y={PAD_T} width={w} height={plotH} fill="transparent" />
                  <rect x={x} y={y} width={w} height={barH} fill={b.color} rx="2"
                    opacity={tooltip?.idx === i ? 1 : 0.82} />
                  {cnt > 0 && (
                    <>
                      <text x={x + w / 2} y={y - 10} textAnchor="middle"
                        fontSize="8" fontWeight="700" fill={b.color}>{cnt}</text>
                      <text x={x + w / 2} y={y - 2} textAnchor="middle"
                        fontSize="6.5" fill={b.color} opacity="0.75">{pct}%</text>
                    </>
                  )}
                  <text x={x + w / 2} y={H - 2} textAnchor="middle"
                    fontSize="6.5" fill="#94a3b8">{b.label}</text>
                </g>
              )
            })}
          </svg>
          {tooltip !== null && grupos[tooltip.idx].length > 0 && (() => {
            const b    = DIST_BUCKETS[tooltip.idx]
            const tecs = grupos[tooltip.idx]
            const pct  = total > 0 ? Math.round(tecs.length / total * 100) : 0
            return (
              <div
                className="absolute z-30 rounded-lg shadow-lg border border-slate-200 p-2.5 min-w-[140px] pointer-events-none"
                style={{ background: b.light, left: `${(tooltip.svgX / W) * 100}%`, top: 0, transform: 'translate(-50%, 8px)' }}
              >
                <p className="text-[10px] font-bold mb-0.5" style={{ color: b.color }}>{b.label}</p>
                <p className="text-[10px] text-slate-500">
                  {tecs.length} técnico{tecs.length !== 1 ? 's' : ''} · <span style={{ color: b.color }} className="font-semibold">{pct}%</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Clic para ver detalle</p>
              </div>
            )
          })()}
        </div>
      </div>

      {modalBucket !== null && (
        <ModalDistribucion
          bucketIdx={modalBucket}
          tecnicos={grupos[modalBucket]}
          total={total}
          onClose={() => setModalBucket(null)}
        />
      )}
    </>
  )
}

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
  const { user } = useAuth()
  const [detalleTecnico, setDetalleTecnico] = useState(null)
  const handleDetalle = onDetalleProp ?? setDetalleTecnico
  const [horas,    setHoras]    = useState(8)
  const [global,   setGlobal]   = useState(null)
  const [ultimo,   setUltimo]   = useState(null)
  const [celulas,  setCelulas]  = useState(null)
  const [mcSeries, setMcSeries] = useState(null)   // { microcelda: [{t, con_retraso, ...}] }
  const [loading,  setLoading]  = useState(false)
  const [alarmas,  setAlarmas]  = useState([])

  // Fetch de técnicos retrasados en tiempo real (MySQL vía caché) para gráfica distribución
  const fetchAlarmas = useCallback(async () => {
    try {
      const res = await api.get('/alarmas/distribucion-retrasos')
      setAlarmas(res.data ?? [])
    } catch { /* silencioso — la gráfica no aparece si falla */ }
  }, [])

  useEffect(() => {
    fetchAlarmas()
    const id = setInterval(fetchAlarmas, 30000)
    return () => clearInterval(id)
  }, [fetchAlarmas])

  // Determinar si estamos en scope de microcelda(s)
  const hasMicroScope = microceldas.length > 0
  // needsMcData: true si el rol asigna microceldas O si el filtro global seleccionó una
  const needsMcData = hasMicroScope || !!microceldaFiltro

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
        // Traer serie por microcelda si hay scope de rol O filtro global de microcelda
        if (needsMcData) {
          promises.push(api.get(`/historico/microceldas?horas=${horas}${celulaParam}`))
        }

        const results = await Promise.all(promises)
        if (!cancelled) {
          setGlobal(results[0].data.puntos ?? [])
          setUltimo(results[1].data)
          setCelulas(results[2].data.series ?? {})
          setMcSeries(needsMcData ? (results[3].data.series ?? {}) : null)
        }
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.detail || 'Error al cargar histórico')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [horas, celulaFiltro, hasMicroScope, microceldaFiltro]) // eslint-disable-line

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

    // Filtro global de microcelda (admin selecciona desde el selector)
    if (microceldaFiltro && mcSeries?.[microceldaFiltro]) {
      return mcSeries[microceldaFiltro]
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

    // Filtro global de microcelda: barra del último punto de esa microcelda
    if (microceldaFiltro && mcSeries?.[microceldaFiltro]?.length) {
      const pts  = mcSeries[microceldaFiltro]
      const last = pts[pts.length - 1]
      return [{ celula: microceldaFiltro, con_retraso: last?.con_retraso ?? 0, con_parada: last?.con_parada ?? 0 }]
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
    // Filtro global de microcelda: KPI desde el último punto de la serie
    if (microceldaFiltro && mcSeries?.[microceldaFiltro]?.length) {
      const pts  = mcSeries[microceldaFiltro]
      const last = pts[pts.length - 1]
      return {
        total:            last?.total            ?? 0,
        con_retraso:      last?.con_retraso      ?? 0,
        pct_retraso:      last?.total ? parseFloat(((last.con_retraso / last.total) * 100).toFixed(1)) : 0,
        con_parada:       last?.con_parada       ?? 0,
        cumplimiento_pct: last?.cumplimiento_pct ?? 0,
        captured_at:      last?.t ?? null,
      }
    }
    if (celulaFiltro) return ultimo?.celulas?.find(c => c.celula === celulaFiltro) ?? null
    return ultimo?.snapshot
  })()

  // Etiqueta de scope para los títulos
  const scopeLabel = hasMicroScope
    ? (microceldas.length === 1 ? microceldas[0] : `${microceldas.length} microceldas`)
    : microceldaFiltro || celulaFiltro || ''

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

          {/* Distribución de alarmas por tiempo abierto — filtrada por filtros globales */}
          <GraficaDistribucion alarmas={alarmas.filter(a => {
            if (celulaFiltro     && a.celula     !== celulaFiltro)     return false
            if (microceldaFiltro && a.microcelda !== microceldaFiltro) return false
            return true
          })} />

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
