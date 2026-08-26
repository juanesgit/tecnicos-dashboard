import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

const MINUSCULAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'a'])
function toTitleCase(str) {
  if (!str) return str
  return str.toLowerCase().split(' ').map((w, i) =>
    i === 0 || !MINUSCULAS.has(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(' ')
}

// Color por % de "En riesgo" — mayor % = más rojo
function cellColor(pct) {
  if (pct === null || pct === undefined) return { bg: 'bg-slate-100', text: 'text-slate-300', level: null }
  if (pct >= 60) return { bg: 'bg-red-700',    text: 'text-white',       level: 'grave'   }
  if (pct >= 40) return { bg: 'bg-red-500',    text: 'text-white',       level: 'critico' }
  if (pct >= 20) return { bg: 'bg-amber-400',  text: 'text-white',       level: 'alerta'  }
  if (pct >= 10) return { bg: 'bg-yellow-200', text: 'text-yellow-800',  level: 'leve'    }
  if (pct >  0)  return { bg: 'bg-emerald-100',text: 'text-emerald-700', level: 'normal'  }
  return             { bg: 'bg-slate-50',    text: 'text-slate-300',   level: 'cero'    }
}

function cellColorN(n, maxN) {
  if (n === null || n === undefined || !maxN) return { bg: 'bg-slate-100', text: 'text-slate-300' }
  if (n === 0) return { bg: 'bg-slate-50', text: 'text-slate-300' }
  const pct = (n / maxN) * 100
  if (pct > 80) return { bg: 'bg-red-700',    text: 'text-white'       }
  if (pct > 60) return { bg: 'bg-red-500',    text: 'text-white'       }
  if (pct > 40) return { bg: 'bg-amber-400',  text: 'text-white'       }
  if (pct > 20) return { bg: 'bg-yellow-200', text: 'text-yellow-800'  }
  return             { bg: 'bg-emerald-100', text: 'text-emerald-700' }
}

function Leyenda() {
  return (
    <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
      {[
        { label: '0%',     bg: 'bg-slate-50'     },
        { label: '<10%',   bg: 'bg-emerald-100'  },
        { label: '10-20%', bg: 'bg-yellow-200'   },
        { label: '20-40%', bg: 'bg-amber-400'    },
        { label: '40-60%', bg: 'bg-red-500'      },
        { label: '>60%',   bg: 'bg-red-700'      },
      ].map(({ label, bg }) => (
        <span key={label} className="flex items-center gap-1">
          <span className={`inline-block w-3 h-3 rounded-sm ${bg} border border-slate-200`} />
          {label}
        </span>
      ))}
    </div>
  )
}

function LeyendaN({ maxN = 0 }) {
  const t = (pct) => Math.max(1, Math.round(maxN * pct / 100))
  return (
    <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
      {[
        { label: '0',                   bg: 'bg-slate-50'    },
        { label: `1–${t(20)}`,          bg: 'bg-emerald-100' },
        { label: `${t(20)+1}–${t(40)}`, bg: 'bg-yellow-200'  },
        { label: `${t(40)+1}–${t(60)}`, bg: 'bg-amber-400'   },
        { label: `${t(60)+1}–${t(80)}`, bg: 'bg-red-500'     },
        { label: `>${t(80)}`,           bg: 'bg-red-700'     },
      ].map(({ label, bg }) => (
        <span key={label} className="flex items-center gap-1">
          <span className={`inline-block w-3 h-3 rounded-sm ${bg} border border-slate-200`} />
          {label}
        </span>
      ))}
    </div>
  )
}

const HORAS_OPTS = [
  { label: '4h',  value: 4  },
  { label: '8h',  value: 8  },
  { label: '12h', value: 12 },
  { label: '24h', value: 24 },
]

function fmtMargen(min) {
  if (min == null) return '—'
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const signo = min < 0 ? '-' : '+'
  return h > 0 ? `${signo}${h}h ${m}m` : `${signo}${m}m`
}

/* ── Fila de técnico en modal predicción ── */
function TecnicoPredicRow({ t, onDetalle }) {
  const RIESGO_STYLE = {
    'En riesgo': { badge: 'bg-red-100 text-red-700',     dot: 'bg-red-500'     },
    'Ajustado':  { badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400'   },
    'A tiempo':  { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  }
  const s = RIESGO_STYLE[t.riesgo_6pm] ?? { badge: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' }
  const sinDatos = !t.hora_fin_estimada || t.minutos_trabajo_restante === 0
  return (
    <div className="px-3 py-2 border-b border-slate-100 last:border-0 flex items-start gap-2">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${s.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800 truncate">{t['Técnico'] ?? '—'}</p>
        <p className="text-[10px] text-slate-400 truncate">{t.ciudad_actual || '—'}</p>
        {onDetalle && (
          <button
            onClick={() => onDetalle(t)}
            className="mt-0.5 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 hover:bg-cyan-100 hover:text-cyan-700 font-medium transition-colors"
          >
            Ver detalles
          </button>
        )}
      </div>
      <div className="text-right shrink-0">
        {sinDatos ? (
          <p className="text-[10px] text-slate-300">Sin datos</p>
        ) : (
          <>
            <p className="text-xs font-bold text-slate-700">🏁 {t.hora_fin_estimada}</p>
            <p className={`text-[10px] font-semibold ${t.margen_6pm > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {fmtMargen(t.margen_6pm)} de 18:00
            </p>
            <p className="text-[10px] text-slate-400">×{t.factor_ritmo} ritmo</p>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Modal de detalle celda predicción ── */
function CeldaPrediccionModal({ celda, onClose, onDetalle }) {
  const overlayRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [drill,   setDrill]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [tab,     setTab]     = useState('riesgo')

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!celda) return
    setLoading(true)
    api.get(`/historico/microcelda-prediccion?microcelda=${encodeURIComponent(celda.mc)}`)
      .then(r => setDrill(r.data))
      .catch(() => toast.error('No se pudo cargar técnicos'))
      .finally(() => setLoading(false))
  }, [celda?.mc]) // eslint-disable-line

  const cerrar = () => {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  if (!celda) return null
  const { mc, celula, t, punto } = celda
  const pct = punto?.pct_en_riesgo ?? null
  const c   = cellColor(pct)

  const NIVEL_LABEL = {
    grave:   'Grave',   critico: 'Crítico',
    alerta:  'Alerta',  leve:    'Leve',
    normal:  'Normal',  cero:    'Sin riesgo',
  }

  const Body = () => (
    <div className="space-y-4 px-4 py-4 sm:px-0 sm:py-0">
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Snapshot predicción · {t}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-xl p-3 ${c.bg}`}>
            <p className={`text-[10px] font-medium ${c.text} opacity-80`}>Nivel de riesgo</p>
            <p className={`text-base font-bold ${c.text}`}>{NIVEL_LABEL[c.level] ?? '—'}</p>
            <p className={`text-xs font-semibold tabular-nums ${c.text}`}>
              {pct != null ? Math.round(pct) + '%' : '—'}
              <span className="font-normal opacity-70 ml-1">en riesgo 6pm</span>
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] text-slate-400 font-medium">En snapshot</p>
            <p className="text-base font-bold text-slate-800">{punto?.total ?? '—'}</p>
            <span className="text-[10px] text-red-600 font-semibold">
              {punto?.en_riesgo ?? 0} en riesgo
            </span>
          </div>
        </div>
        {pct != null && pct > 0 && (
          <div className="mt-2 rounded-full bg-slate-100 h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${c.bg}`}
              style={{ width: `${Math.min(100, Math.round(pct))}%` }}
            />
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Estado actual · técnicos en esta microcelda
        </p>
        {loading ? (
          <div className="rounded-xl bg-slate-100 animate-pulse h-24" />
        ) : !drill ? null : (
          <>
            <div className="flex rounded-xl overflow-hidden border border-slate-200 mb-3">
              {[
                { id: 'riesgo',   label: `🔴 En riesgo (${drill.en_riesgo?.length ?? 0})`  },
                { id: 'ajustado', label: `🟡 Ajustado (${drill.ajustado?.length ?? 0})`    },
                { id: 'tiempo',   label: `🟢 A tiempo (${drill.a_tiempo?.length ?? 0})`    },
              ].map(o => (
                <button key={o.id} onClick={() => setTab(o.id)}
                  className={`flex-1 px-1 py-2 text-[10px] font-medium transition-colors leading-tight ${
                    tab === o.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-500'
                  }`}
                >{o.label}</button>
              ))}
            </div>
            {tab === 'riesgo' && (
              drill.en_riesgo?.length > 0 ? (
                <div className="rounded-xl border border-red-100 overflow-hidden">
                  {[...drill.en_riesgo].sort((a, b) => (Number(b.margen_6pm) || 0) - (Number(a.margen_6pm) || 0))
                    .map((t, i) => <TecnicoPredicRow key={i} t={t} onDetalle={onDetalle} />)}
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-xs text-emerald-700 text-center">
                  ✅ Ningún técnico en riesgo de pasar las 18:00
                </div>
              )
            )}
            {tab === 'ajustado' && (
              drill.ajustado?.length > 0 ? (
                <div className="rounded-xl border border-amber-100 overflow-hidden">
                  {[...drill.ajustado].sort((a, b) => (Number(b.margen_6pm) || 0) - (Number(a.margen_6pm) || 0))
                    .map((t, i) => <TecnicoPredicRow key={i} t={t} onDetalle={onDetalle} />)}
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs text-slate-500 text-center">
                  Sin técnicos ajustados
                </div>
              )
            )}
            {tab === 'tiempo' && (
              drill.a_tiempo?.length > 0 ? (
                <div className="rounded-xl border border-emerald-100 overflow-hidden">
                  {[...drill.a_tiempo].sort((a, b) => (Number(b.margen_6pm) || 0) - (Number(a.margen_6pm) || 0))
                    .map((t, i) => <TecnicoPredicRow key={i} t={t} onDetalle={onDetalle} />)}
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs text-slate-500 text-center">
                  Sin datos de técnicos a tiempo
                </div>
              )
            )}
            <p className="text-[9px] text-slate-400 mt-2 text-center">
              Total en microcelda ahora: {drill.total} técnicos
            </p>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) cerrar() }}
      className={`fixed inset-0 z-50 transition-colors duration-280 ${visible ? 'bg-black/50' : 'bg-black/0'}`}
    >
      <div
        className={`sm:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl flex flex-col
          transition-transform duration-280 ease-out
          ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '88dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-slate-800 text-sm truncate">{mc}</h2>
            <p className="text-[10px] text-slate-400">{celula || '—'} · Predicción 6pm</p>
          </div>
          <button onClick={cerrar}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 shrink-0 ml-3">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <Body />
        </div>
      </div>

      <div
        className={`hidden sm:flex items-center justify-center h-full transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
            <div>
              <h2 className="font-bold text-slate-800 text-sm">{mc}</h2>
              <p className="text-[10px] text-slate-400">{celula || '—'} · Predicción 6pm · snapshot {t}</p>
            </div>
            <button onClick={cerrar}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <Body />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function MapaCalorPrediccion({ filtros = {}, rows = [], onDetalle }) {
  const [horas,        setHoras]        = useState(4)
  const [modo,         setModo]         = useState('%')           // '%' | 'N'
  const [granularidad, setGranularidad] = useState('microcelda')  // 'microcelda' | 'celula'
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [celdaSel,     setCeldaSel]     = useState(null)
  const [expandidos,   setExpandidos]   = useState(new Set())
  const scrollRef = useRef(null)

  const handleGranularidad = (g) => {
    setGranularidad(g)
    setExpandidos(new Set())
  }

  const toggleExpandido = (key) => {
    setExpandidos(prev => {
      const next = new Set(prev)
      const opening = !prev.has(key)
      next.has(key) ? next.delete(key) : next.add(key)
      requestAnimationFrame(() => {
        if (!scrollRef.current) return
        if (opening) {
          scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' })
        } else {
          scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' })
        }
      })
      return next
    })
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ horas })
      if (filtros.celula) params.set('celula', filtros.celula)
      const { data: resp } = await api.get(`/historico/prediccion?${params}`)
      setData(resp)
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al cargar tendencia')
    } finally {
      setLoading(false)
    }
  }, [horas, filtros.celula])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!data || !scrollRef.current) return
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    })
  }, [data, modo])

  // Series base (microcelda level) — aplicar filtro de microcelda sólo en modo microcelda
  let baseSeries = data?.series ?? {}
  if (filtros.microcelda && granularidad === 'microcelda') {
    baseSeries = Object.fromEntries(
      Object.entries(baseSeries).filter(([mc]) => mc === filtros.microcelda)
    )
  }

  const tiempos = data?.tiempos ?? []

  // ── Agregar por célula ──────────────────────────────────────
  const celulaSeries  = {}   // { [celula]: [{ t, en_riesgo, ajustado, a_tiempo, total, pct_en_riesgo }] }
  const celMicros     = {}   // { [celula]: [mc, ...] }
  const celulaTimeMap = {}   // auxiliar

  for (const [mc, pts] of Object.entries(baseSeries)) {
    const cel = pts[0]?.celula ?? 'Sin célula'
    if (!celulaTimeMap[cel]) celulaTimeMap[cel] = {}
    if (!celMicros[cel]) celMicros[cel] = []
    celMicros[cel].push(mc)
    for (const p of pts) {
      if (!celulaTimeMap[cel][p.t]) {
        celulaTimeMap[cel][p.t] = { t: p.t, en_riesgo: 0, ajustado: 0, a_tiempo: 0, total: 0 }
      }
      celulaTimeMap[cel][p.t].en_riesgo += p.en_riesgo ?? 0
      celulaTimeMap[cel][p.t].ajustado  += p.ajustado  ?? 0
      celulaTimeMap[cel][p.t].a_tiempo  += p.a_tiempo  ?? 0
      celulaTimeMap[cel][p.t].total     += p.total     ?? 0
    }
  }
  for (const [cel, tMap] of Object.entries(celulaTimeMap)) {
    celulaSeries[cel] = Object.values(tMap)
      .map(p => ({ ...p, pct_en_riesgo: p.total > 0 ? (p.en_riesgo / p.total) * 100 : 0 }))
      .sort((a, b) => a.t.localeCompare(b.t))
  }
  // ────────────────────────────────────────────────────────────

  const esCelula    = granularidad === 'celula'
  const activeSeries = esCelula ? celulaSeries : baseSeries

  // Items ordenados por último snapshot
  const displayItems = Object.entries(activeSeries)
    .map(([key, pts]) => {
      const suma    = pts.reduce((a, p) => a + (p.pct_en_riesgo ?? 0), 0)
      const prom    = pts.length ? suma / pts.length : 0
      const lastPct = pts.length
        ? (modo === 'N'
            ? (pts[pts.length - 1]?.en_riesgo ?? 0)
            : (pts[pts.length - 1]?.pct_en_riesgo ?? 0))
        : 0
      const celula  = !esCelula ? (pts[0]?.celula ?? '') : ''
      return { key, celula, prom, lastPct }
    })
    .sort((a, b) => b.lastPct - a.lastPct)

  // Lookup de puntos por key → t
  const lookup = {}
  for (const [key, pts] of Object.entries(activeSeries)) {
    lookup[key] = {}
    for (const p of pts) lookup[key][p.t] = p
  }

  const hasDatos = displayItems.length > 0 && tiempos.length > 0

  const maxN = modo === 'N' && hasDatos
    ? Math.max(0, ...displayItems.flatMap(({ key }) => (activeSeries[key] ?? []).map(p => p.en_riesgo ?? 0)))
    : 0

  const handleCeldaClick = (key, t, punto, celula) => {
    if (esCelula) return   // sin modal en vista célula
    if (!punto) return
    setCeldaSel({ mc: key, celula, t, punto })
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-600">
            Tendencia 🔴 En riesgo 6pm
          </p>
          <p className="text-[10px] text-slate-400">
            {hasDatos
              ? `${displayItems.length} ${esCelula ? 'célula' : 'microcelda'}${displayItems.length !== 1 ? 's' : ''} · ${tiempos.length} snapshots`
              : 'Sin datos'}
            {hasDatos && !esCelula && <span className="ml-2 text-cyan-500">· Toca una celda para ver detalles</span>}
          </p>
        </div>
        {/* Controles: 1 fila compacta */}
        <div className="flex items-center gap-1.5">
          {/* Micro / Célula */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {[{ val: 'microcelda', label: 'Micro' }, { val: 'celula', label: 'Célula' }].map(o => (
              <button key={o.val} onClick={() => handleGranularidad(o.val)}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  granularidad === o.val ? 'bg-cyan-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >{o.label}</button>
            ))}
          </div>
          {/* % / N */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {['%', 'N'].map(m => (
              <button key={m} onClick={() => setModo(m)}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  modo === m ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >{m}</button>
            ))}
          </div>
          {/* Horas — select en mobile, botones en desktop */}
          <div className="sm:hidden ml-auto">
            <select
              value={horas}
              onChange={e => setHoras(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              {HORAS_OPTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="hidden sm:flex rounded-lg overflow-hidden border border-slate-200 ml-auto">
            {HORAS_OPTS.map(o => (
              <button key={o.value} onClick={() => setHoras(o.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  horas === o.value ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >{o.label}</button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-5 text-center">
          <p className="text-xs text-slate-400 animate-pulse">Cargando tendencia…</p>
        </div>
      )}
      {error && !loading && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-xs text-red-500 text-center">
          {error}
        </div>
      )}
      {!loading && !error && !hasDatos && (
        <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-6 text-center text-xs text-slate-400">
          Sin snapshots de predicción en las últimas {horas}h. Los datos se acumulan cada 5 min.
        </div>
      )}

      {!loading && !error && hasDatos && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto" ref={scrollRef}>
            <table className="w-full text-[10px] border-collapse" style={{ minWidth: Math.max(320, 100 + tiempos.length * (modo === 'N' ? 52 : 36) + 56) }}>
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 bg-slate-50 z-10 px-2 py-1.5 text-left font-semibold text-slate-500 border-b border-r border-slate-100 w-28">
                    {esCelula ? 'Célula' : 'Microcelda'}
                  </th>
                  {tiempos.map(t => (
                    <th key={t} className="px-1 py-1.5 text-center font-medium text-slate-400 border-b border-slate-100" style={{ minWidth: modo === 'N' ? 52 : 32 }}>
                      {t}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-center font-semibold text-slate-500 border-b border-l border-slate-100 w-14">
                    Prom
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map(({ key, celula, prom: promVal }, idx) => {
                  const pts       = activeSeries[key] ?? []
                  const promCell  = cellColor(promVal)

                  const avgRiesgo = pts.length ? pts.reduce((s, p) => s + (p.en_riesgo ?? 0), 0) / pts.length : null
                  const avgTot    = pts.length ? pts.reduce((s, p) => s + (p.total ?? 0), 0) / pts.length : null
                  const promCellN = cellColorN(avgRiesgo != null ? Math.round(avgRiesgo) : null, maxN)

                  // ── Breakdown para sub-fila expandida ──
                  let actList    = []
                  let maxActRisk = 1
                  let mcBreakdown = []

                  if (!esCelula) {
                    // Vista microcelda → actividades en vivo
                    const tecsMC = rows.filter(r => r.microcelda === key)
                    const actMap = {}
                    for (const r of tecsMC) {
                      const act = r.actividad_actual || 'Sin actividad'
                      if (!actMap[act]) actMap[act] = { total: 0, riesgo: 0, ajustado: 0, aTiempo: 0 }
                      actMap[act].total++
                      if (r.riesgo_6pm === 'En riesgo') actMap[act].riesgo++
                      else if (r.riesgo_6pm === 'Ajustado') actMap[act].ajustado++
                      else if (r.riesgo_6pm === 'A tiempo') actMap[act].aTiempo++
                    }
                    actList    = Object.entries(actMap)
                      .filter(([, d]) => d.riesgo > 0)
                      .sort((a, b) => b[1].riesgo - a[1].riesgo)
                    maxActRisk = Math.max(1, ...actList.map(([, d]) => d.riesgo || 0))
                  } else {
                    // Vista célula → microceldas con último snapshot
                    mcBreakdown = (celMicros[key] ?? [])
                      .map(mc => {
                        const mcPts = baseSeries[mc] ?? []
                        const last  = mcPts[mcPts.length - 1]
                        return { mc, last }
                      })
                      .sort((a, b) => {
                        const va = modo === 'N' ? (a.last?.en_riesgo ?? 0) : (a.last?.pct_en_riesgo ?? 0)
                        const vb = modo === 'N' ? (b.last?.en_riesgo ?? 0) : (b.last?.pct_en_riesgo ?? 0)
                        return vb - va
                      })
                    maxActRisk = Math.max(1, ...mcBreakdown.map(({ last }) =>
                      modo === 'N' ? (last?.en_riesgo ?? 0) : (last?.pct_en_riesgo ?? 0)
                    ))
                  }

                  const isOpen  = expandidos.has(key)
                  const rowBg   = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                  const tdBg    = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'

                  return [
                    <tr key={key} className={rowBg}>
                      {/* Nombre — clickable para expandir */}
                      <td
                        className={`sticky left-0 z-10 px-2 py-1.5 border-r border-slate-100 ${tdBg} cursor-pointer hover:bg-cyan-50 transition-colors select-none`}
                        onClick={() => toggleExpandido(key)}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <div className="flex items-center gap-1">
                          <svg
                            className={`w-3 h-3 text-slate-400 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-700 truncate" style={{ maxWidth: 92 }}>{key}</p>
                            {!esCelula
                              ? celula && <p className="text-[8px] text-slate-400 truncate">{celula}</p>
                              : <p className="text-[8px] text-slate-400 truncate">{celMicros[key]?.length ?? 0} microceldas</p>
                            }
                          </div>
                        </div>
                      </td>

                      {/* Celdas por tiempo */}
                      {tiempos.map(t => {
                        const p = lookup[key]?.[t]
                        if (modo === 'N') {
                          const enR = p?.en_riesgo ?? null
                          const tot = p?.total ?? null
                          const cN  = cellColorN(enR, maxN)
                          return (
                            <td
                              key={t}
                              onClick={() => handleCeldaClick(key, t, p, celula)}
                              className={`text-center py-1 border-b border-slate-100 ${cN.bg} ${cN.text} ${
                                p && !esCelula ? 'cursor-pointer hover:opacity-75 active:opacity-50' : 'cursor-default'
                              }`}
                              style={{ WebkitTapHighlightColor: 'transparent' }}
                            >
                              {enR != null ? `${enR}/${tot ?? '?'}` : ''}
                            </td>
                          )
                        }
                        const pct = p?.pct_en_riesgo ?? null
                        const { bg, text } = cellColor(pct)
                        return (
                          <td
                            key={t}
                            onClick={() => handleCeldaClick(key, t, p, celula)}
                            className={`text-center py-1 border-b border-slate-100 ${bg} ${text} ${
                              p && !esCelula ? 'cursor-pointer hover:opacity-75 active:opacity-50' : 'cursor-default'
                            }`}
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                            title={p ? `${p.en_riesgo}/${p.total} en riesgo (${pct}%)` : 'Sin dato'}
                          >
                            {pct !== null ? (pct > 0 ? Math.round(pct) : '—') : ''}
                          </td>
                        )
                      })}

                      {/* Promedio */}
                      {modo === 'N' ? (
                        <td className={`text-center px-1 py-1 font-bold border-l border-slate-100 ${promCellN.bg} ${promCellN.text}`}>
                          {avgRiesgo != null ? `${Math.round(avgRiesgo)}/${Math.round(avgTot ?? 0)}` : '—'}
                        </td>
                      ) : (
                        <td className={`text-center px-1 py-1 font-bold border-l border-slate-100 ${promCell.bg} ${promCell.text}`}>
                          {promVal != null ? Math.round(promVal) + '%' : '—'}
                        </td>
                      )}
                    </tr>,

                    /* ── Fila expandida ── */
                    isOpen && (
                      <tr key={`${key}-exp`}>
                        <td colSpan={tiempos.length + 2} style={{ padding: 0 }}>
                          <div
                            className="px-3 py-2.5 bg-cyan-50/60 border-b border-cyan-100"
                            style={{
                              position: 'sticky',
                              left: 0,
                              width: scrollRef.current?.clientWidth ?? '100%',
                              boxSizing: 'border-box',
                            }}
                          >
                            {!esCelula ? (
                              /* Microcelda → actividades en vivo */
                              <>
                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                  Tipos de trabajo en {key} · predicción 6pm en vivo ({rows.filter(r => r.microcelda === key).length} técnicos)
                                </p>
                                {actList.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic">Sin técnicos con predicción en esta microcelda</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {actList.map(([act, { total, riesgo }]) => {
                                      const c      = cellColorN(riesgo, maxActRisk)
                                      const barPct = (riesgo / maxActRisk) * 100
                                      const pctR   = total > 0 ? Math.round((riesgo / total) * 100) : 0
                                      return (
                                        <div key={act} className="flex items-center gap-2">
                                          <div className="w-32 shrink-0 truncate text-[10px] font-medium text-slate-700" title={act}>
                                            {toTitleCase(act)}
                                          </div>
                                          <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                            <div className={`h-full rounded-full ${c.bg} transition-all`} style={{ width: `${Math.min(100, barPct)}%` }} />
                                          </div>
                                          <span className="text-[10px] font-semibold tabular-nums text-slate-600 shrink-0 w-12 text-right">
                                            {riesgo}/{total}
                                          </span>
                                          <span className="text-[9px] font-medium text-red-500 shrink-0 w-8 text-right">
                                            {pctR}%
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </>
                            ) : (
                              /* Célula → microceldas con último snapshot */
                              <>
                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                  Microceldas en {key} · último snapshot ({mcBreakdown.length})
                                </p>
                                {mcBreakdown.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic">Sin microceldas en esta célula</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {mcBreakdown.map(({ mc, last }) => {
                                      const val    = modo === 'N' ? (last?.en_riesgo ?? 0) : (last?.pct_en_riesgo ?? 0)
                                      const c      = modo === 'N' ? cellColorN(val, maxActRisk) : cellColor(val)
                                      const barPct = maxActRisk > 0 ? (val / maxActRisk) * 100 : 0
                                      return (
                                        <div key={mc} className="flex items-center gap-2">
                                          <div className="w-32 shrink-0 truncate text-[10px] font-medium text-slate-700" title={mc}>
                                            {mc}
                                          </div>
                                          <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                            <div className={`h-full rounded-full ${c.bg} transition-all`} style={{ width: `${Math.min(100, barPct)}%` }} />
                                          </div>
                                          <span className="text-[10px] font-semibold tabular-nums text-slate-600 shrink-0 w-16 text-right">
                                            {modo === 'N'
                                              ? `${last?.en_riesgo ?? 0}/${last?.total ?? 0}`
                                              : `${last?.pct_en_riesgo != null ? Math.round(last.pct_en_riesgo) : '—'}%`
                                            }
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ].filter(Boolean)
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 mb-1">
              {modo === 'N' ? 'Técnicos en riesgo 6pm / total por snapshot:' : '% técnicos "En riesgo" 6pm por snapshot:'}
            </p>
            {modo === 'N' ? <LeyendaN maxN={maxN} /> : <Leyenda />}
          </div>
        </div>
      )}

      {/* Modal drill-down (solo modo microcelda) */}
      {celdaSel && (
        <CeldaPrediccionModal celda={celdaSel} onClose={() => setCeldaSel(null)} onDetalle={onDetalle} />
      )}
    </div>
  )
}
