import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'

const MINUSCULAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'a'])
function toTitleCase(str) {
  if (!str) return str
  return str.toLowerCase().split(' ').map((w, i) =>
    i === 0 || !MINUSCULAS.has(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(' ')
}

const HORAS_OPTS = [
  { label: '4h',  value: 4  },
  { label: '8h',  value: 8  },
  { label: '12h', value: 12 },
  { label: '24h', value: 24 },
]

function cellColor(pct) {
  if (pct === null || pct === undefined) return { bg: 'bg-slate-100', text: 'text-slate-300', raw: '#f1f5f9', level: null }
  if (pct >= 60) return { bg: 'bg-red-700',    text: 'text-white',      raw: '#b91c1c', level: 'grave'    }
  if (pct >= 40) return { bg: 'bg-red-500',    text: 'text-white',      raw: '#ef4444', level: 'critico'  }
  if (pct >= 20) return { bg: 'bg-amber-400',  text: 'text-white',      raw: '#fbbf24', level: 'alerta'   }
  if (pct >= 10) return { bg: 'bg-yellow-200', text: 'text-yellow-800', raw: '#fef08a', level: 'leve'     }
  return             { bg: 'bg-emerald-100', text: 'text-emerald-700', raw: '#d1fae5', level: 'normal'   }
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
        { label: 'Normal <10%',    bg: 'bg-emerald-100' },
        { label: 'Leve 10-20%',   bg: 'bg-yellow-200'  },
        { label: 'Alerta 20-40%', bg: 'bg-amber-400'   },
        { label: 'Crítico 40-60%', bg: 'bg-red-500'    },
        { label: 'Grave >60%',    bg: 'bg-red-700'     },
      ].map(({ label, bg }) => (
        <span key={label} className="flex items-center gap-1">
          <span className={`inline-block w-3 h-3 rounded-sm ${bg}`} />
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
        { label: '0',                         bg: 'bg-slate-50'    },
        { label: `1–${t(20)}`,                bg: 'bg-emerald-100' },
        { label: `${t(20)+1}–${t(40)}`,       bg: 'bg-yellow-200'  },
        { label: `${t(40)+1}–${t(60)}`,       bg: 'bg-amber-400'   },
        { label: `${t(60)+1}–${t(80)}`,       bg: 'bg-red-500'     },
        { label: `>${t(80)}`,                 bg: 'bg-red-700'     },
      ].map(({ label, bg }) => (
        <span key={label} className="flex items-center gap-1">
          <span className={`inline-block w-3 h-3 rounded-sm ${bg}`} />
          {label}
        </span>
      ))}
    </div>
  )
}

/* ── Badge de estado ── */
function EstadoBadge({ estado }) {
  const map = {
    'Retraso actual':       'bg-red-100 text-red-700',
    'Retraso en siguiente': 'bg-orange-100 text-orange-700',
    'En ejecución':         'bg-blue-100 text-blue-700',
    'Finalizado':           'bg-green-100 text-green-700',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${map[estado] ?? 'bg-slate-100 text-slate-500'}`}>
      {estado ?? '—'}
    </span>
  )
}

/* ── Fila de técnico en el modal ── */
function TecnicoRow({ t, onDetalle }) {
  const esRetraso  = t.estado_actual === 'Retraso actual' || t.estado_actual === 'Retraso en siguiente'
  const retrasoVal = t.estado_actual === 'Retraso en siguiente' ? t.retraso_siguiente_hhmm : t.retraso_hhmm
  return (
    <div className={`px-3 py-2 border-b border-slate-100 last:border-0 ${esRetraso ? 'bg-red-50/40' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate">{t['Técnico'] ?? '—'}</p>
          <p className="text-[10px] text-slate-400 truncate">{t.ciudad_actual || '—'}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <EstadoBadge estado={t.estado_actual} />
          {onDetalle && (
            <button
              onClick={() => onDetalle(t)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 hover:bg-cyan-100 hover:text-cyan-700 font-medium transition-colors"
            >
              Ver detalles
            </button>
          )}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <span className="text-[10px] font-mono text-slate-500">
          OT <span className="font-semibold text-slate-700">{t.ot_actual || t['Orden de trabajo'] || '—'}</span>
        </span>
        <span className="text-[10px] text-cyan-700 truncate max-w-[200px]">
          {t.actividad_actual || t['Tipo de Actividad'] || '—'}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {(esRetraso && retrasoVal && retrasoVal !== '00:00') && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 tabular-nums">
            ⏱ {retrasoVal}
          </span>
        )}
        {(t.pendientes_post_siguiente > 0) && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 tabular-nums"
            title="OTs pendientes después de la siguiente actividad">
            📋 {t.pendientes_post_siguiente} pend.
          </span>
        )}
      </div>
    </div>
  )
}

/* ── CiudadesTag: muestra máx 2 ciudades + badge "+N" con tooltip ── */
const MAX_VISIBLE = 2

function CiudadesTag({ ciudades = [], className = '' }) {
  const fmt      = ciudades.map(toTitleCase)
  const visibles = fmt.slice(0, MAX_VISIBLE)
  const resto    = fmt.length - MAX_VISIBLE
  return (
    <span
      className={`flex items-center gap-1 flex-wrap ${className}`}
      title={fmt.join(', ')}
    >
      <span className="text-[9px] text-slate-400 truncate">
        {visibles.join(', ')}
      </span>
      {resto > 0 && (
        <span className="inline-flex items-center px-1 py-0 rounded-full text-[8px] font-semibold bg-slate-100 text-slate-500 shrink-0">
          +{resto}
        </span>
      )}
    </span>
  )
}

/* ── Modal de detalle de celda ── */
function CeldaModal({ celda, onClose, onDetalle }) {
  const overlayRef   = useRef(null)
  const [visible, setVisible]   = useState(false)
  const [tab,     setTab]       = useState('riesgo')

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

  const ESTADOS_RETRASO = new Set(['Retraso actual', 'Retraso en siguiente'])
  const filtrados  = (celda?.rows ?? []).filter(r => r.microcelda === celda?.mc)
  const en_riesgo  = filtrados.filter(r => ESTADOS_RETRASO.has(r.estado_actual))
  const con_parada = filtrados.filter(r => r.estado_siguiente === 'Parada futura')
  const drill = { total: filtrados.length, en_riesgo, con_parada }

  const cerrar = () => {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  if (!celda) return null
  const { mc, titulo, celula, t, punto } = celda
  const displayMc = titulo || mc   // título opcional para el header
  const rawPct = punto?.pct_retraso ?? null
  const c = cellColor(rawPct)

  const NIVEL_LABEL = {
    grave:   { label: 'Grave',    color: 'text-red-700'    },
    critico: { label: 'Crítico',  color: 'text-red-500'    },
    alerta:  { label: 'Alerta',   color: 'text-amber-600'  },
    leve:    { label: 'Leve',     color: 'text-yellow-700' },
    normal:  { label: 'Normal',   color: 'text-emerald-600'},
  }
  const nivel = NIVEL_LABEL[c.level] ?? { label: '—', color: 'text-slate-400' }

  const Body = () => (
    <div className="space-y-4 px-4 py-4 sm:px-0 sm:py-0">
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Snapshot · {t}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-xl p-3 ${c.bg}`}>
            <p className={`text-[10px] font-medium ${c.text} opacity-80`}>Severidad</p>
            <p className={`text-base font-bold ${c.text}`}>{nivel.label}</p>
            <p className={`text-xs font-semibold tabular-nums ${c.text}`}>
              {rawPct != null ? Math.round(rawPct) + '%' : '—'}
              <span className="font-normal opacity-70 ml-1">retraso</span>
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] text-slate-400 font-medium">En snapshot</p>
            <p className="text-base font-bold text-slate-800">{punto?.total ?? '—'}</p>
            <div className="flex gap-2 mt-0.5">
              <span className="text-[10px] text-red-600 font-semibold">{punto?.con_retraso ?? 0} retraso</span>
              <span className="text-[10px] text-amber-600 font-semibold">{punto?.con_parada ?? 0} parada</span>
            </div>
          </div>
        </div>
        {rawPct != null && (
          <div className="mt-2 rounded-full bg-slate-100 h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${c.bg}`}
              style={{ width: `${Math.min(100, Math.round(rawPct))}%` }}
            />
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Estado actual · técnicos en esta microcelda
        </p>
        {!drill ? null : (
          <>
            {(drill.en_riesgo?.length > 0 || drill.con_parada?.length > 0) && (
              <div className="flex rounded-xl overflow-hidden border border-slate-200 mb-3">
                <button
                  onClick={() => setTab('riesgo')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    tab === 'riesgo' ? 'bg-red-600 text-white' : 'bg-white text-slate-500'
                  }`}
                >
                  ⏱ Retraso ({drill.en_riesgo?.length ?? 0})
                </button>
                <button
                  onClick={() => setTab('parada')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    tab === 'parada' ? 'bg-amber-600 text-white' : 'bg-white text-slate-500'
                  }`}
                >
                  ⏸ Parada ({drill.con_parada?.length ?? 0})
                </button>
              </div>
            )}
            {tab === 'riesgo' && (
              drill.en_riesgo?.length > 0 ? (
                <div className="rounded-xl border border-red-100 overflow-hidden">
                  {[...drill.en_riesgo]
                    .sort((a, b) => (Number(b.minutos_retraso) || Number(b.minutos_retraso_siguiente) || 0)
                                  - (Number(a.minutos_retraso) || Number(a.minutos_retraso_siguiente) || 0))
                    .map((t, i) => <TecnicoRow key={i} t={t} onDetalle={onDetalle} />)}
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-xs text-emerald-700 text-center">
                  ✅ Ningún técnico con retraso ahora mismo
                </div>
              )
            )}
            {tab === 'parada' && (
              drill.con_parada?.length > 0 ? (
                <div className="rounded-xl border border-amber-100 overflow-hidden">
                  {[...drill.con_parada]
                    .sort((a, b) => (Number(b.minutos_parada_restante) || 0) - (Number(a.minutos_parada_restante) || 0))
                    .map((t, i) => <TecnicoRow key={i} t={t} onDetalle={onDetalle} />)}
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs text-slate-500 text-center">
                  Sin paradas futuras registradas
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
            <h2 className="font-bold text-slate-800 text-sm truncate">{displayMc}</h2>
            {(() => {
              const cs = [...new Set((celda?.rows ?? []).filter(r => r.microcelda === mc && r.ciudad_nodo).map(r => r.ciudad_nodo))].sort()
              return cs.length > 0
                ? <CiudadesTag ciudades={cs} className="mt-0.5" />
                : <p className="text-[10px] text-slate-400">{celula || '—'}</p>
            })()}
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
              <h2 className="font-bold text-slate-800 text-sm">{displayMc}</h2>
              {(() => {
                const cs = [...new Set((celda?.rows ?? []).filter(r => r.microcelda === mc && r.ciudad_nodo).map(r => r.ciudad_nodo))].sort()
                return cs.length > 0
                  ? <div className="flex items-center gap-1 mt-0.5 flex-wrap"><CiudadesTag ciudades={cs} /><span className="text-[10px] text-slate-400">· snapshot {t}</span></div>
                  : <p className="text-[10px] text-slate-400">{celula || '—'} · snapshot {t}</p>
              })()}
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
export default function MapaCalorMicroceldas({ celulaFiltro = '', microceldaFiltro = '', rows = [], onDetalle }) {
  const [horas,        setHoras]        = useState(4)
  const [modo,         setModo]         = useState('%')                // '%' | 'N'
  const [granularidad, setGranularidad] = useState('celula')            // 'celula' | 'microcelda' | 'ciudad'
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [ciudadData,   setCiudadData]   = useState(null)
  const [ciudadLoading,setCiudadLoading]= useState(false)
  const [celdaSel,     setCeldaSel]     = useState(null)
  const [expandidos,          setExpandidos]          = useState(new Set())
  const [expandedCiudades,    setExpandedCiudades]    = useState(new Set())
  const [expandedMicrosInCel, setExpandedMicrosInCel] = useState(new Set())

  const toggleCiudad = (mc, ciudad) => {
    const k = `${mc}::${ciudad}`
    setExpandedCiudades(prev => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }
  const toggleMicroInCel = (mc) => {
    setExpandedMicrosInCel(prev => {
      const next = new Set(prev)
      next.has(mc) ? next.delete(mc) : next.add(mc)
      return next
    })
  }
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

  useEffect(() => {
    let cancelled = false
    const fetch_ = async () => {
      setLoading(true)
      try {
        const cel = celulaFiltro ? `&celula=${encodeURIComponent(celulaFiltro)}` : ''
        const { data: resp } = await api.get(`/historico/microceldas?horas=${horas}${cel}`)
        if (!cancelled) setData(resp)
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.detail || 'Error al cargar mapa de calor')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch_()
    return () => { cancelled = true }
  }, [horas, celulaFiltro])

  // Fetch dedicado para ciudades desde /historico/ciudades
  useEffect(() => {
    if (granularidad !== 'ciudad') return
    let cancelled = false
    const fetch_ = async () => {
      setCiudadLoading(true)
      try {
        const cel = celulaFiltro ? `&celula=${encodeURIComponent(celulaFiltro)}` : ''
        const { data: resp } = await api.get(`/historico/ciudades?horas=${horas}${cel}`)
        if (!cancelled) setCiudadData(resp)
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.detail || 'Error al cargar ciudades')
      } finally {
        if (!cancelled) setCiudadLoading(false)
      }
    }
    fetch_()
    return () => { cancelled = true }
  }, [horas, celulaFiltro, granularidad])

  useEffect(() => {
    if (!data || !scrollRef.current) return
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    })
  }, [data, modo])

  const tiempos = data?.tiempos ?? []
  const series  = data?.series  ?? {}

  // ── Agregar por célula ──────────────────────────────────────
  const celulaSeries  = {}
  const celMicros     = {}
  const celulaTimeMap = {}

  for (const [mc, pts] of Object.entries(series)) {
    const cel = pts[0]?.celula ?? 'Sin célula'
    if (!celulaTimeMap[cel]) celulaTimeMap[cel] = {}
    if (!celMicros[cel]) celMicros[cel] = []
    celMicros[cel].push(mc)
    const dedupedPts = Object.values(
      pts.reduce((acc, p) => { acc[p.t] = p; return acc }, {})
    )
    for (const p of dedupedPts) {
      if (!celulaTimeMap[cel][p.t]) {
        celulaTimeMap[cel][p.t] = { t: p.t, con_retraso: 0, total: 0, con_parada: 0 }
      }
      celulaTimeMap[cel][p.t].con_retraso += p.con_retraso ?? 0
      celulaTimeMap[cel][p.t].total       += p.total       ?? 0
      celulaTimeMap[cel][p.t].con_parada  += p.con_parada  ?? 0
    }
  }
  for (const [cel, tMap] of Object.entries(celulaTimeMap)) {
    celulaSeries[cel] = Object.values(tMap)
      .map(p => ({ ...p, pct_retraso: p.total > 0 ? (p.con_retraso / p.total) * 100 : 0 }))
      .sort((a, b) => a.t.localeCompare(b.t))
  }

  // ── Ciudad: datos desde /historico/ciudades ─────────────────
  const ciudadSeries = ciudadData?.series ?? {}
  // ciudadMicros: ciudad → [microceldas]
  // Fuente 1: rows en vivo; Fuente 2: campo microcelda de la serie histórica (fallback)
  const ciudadMicros = {}
  for (const r of rows) {
    if (!r.microcelda || !r.ciudad_nodo) continue
    if (!ciudadMicros[r.ciudad_nodo]) ciudadMicros[r.ciudad_nodo] = []
    if (!ciudadMicros[r.ciudad_nodo].includes(r.microcelda)) ciudadMicros[r.ciudad_nodo].push(r.microcelda)
  }
  for (const [ciudad, pts] of Object.entries(ciudadSeries)) {
    if (!ciudadMicros[ciudad]) {
      const mc = pts[0]?.microcelda
      if (mc) ciudadMicros[ciudad] = [mc]
    }
  }
  // ────────────────────────────────────────────────────────────

  const esCelula = granularidad === 'celula'
  const esCiudad = granularidad === 'ciudad'

  const activeSeries = esCelula ? celulaSeries : esCiudad ? ciudadSeries : series

  const globalLastTime = (() => {
    let max = ''
    for (const pts of Object.values(activeSeries)) {
      if (pts?.length) {
        const t = pts[pts.length - 1].t
        if (t > max) max = t
      }
    }
    return max
  })()

  const allItems = Object.keys(activeSeries).sort((a, b) => {
    const lastVal = (key) => {
      const pts = activeSeries[key]
      if (!pts?.length) return 0
      const atGlobal = pts.find(p => p.t === globalLastTime)
      if (!atGlobal) return 0
      return modo === 'N' ? (atGlobal.con_retraso ?? 0) : (atGlobal.pct_retraso ?? 0)
    }
    return lastVal(b) - lastVal(a)
  })

  const displayList = (granularidad === 'microcelda' && microceldaFiltro)
    ? allItems.filter(m => m === microceldaFiltro)
    : allItems

  const lookup = {}
  for (const [key, pts] of Object.entries(activeSeries)) {
    lookup[key] = {}
    for (const p of pts) lookup[key][p.t] = p
  }

  const isEmpty = tiempos.length === 0 || displayList.length === 0

  const maxN = modo === 'N' && !isEmpty
    ? Math.max(0, ...displayList.flatMap(key => (activeSeries[key] ?? []).map(p => p.con_retraso ?? 0)))
    : 0

  const handleCeldaClick = (key, t, punto) => {
    if (esCelula || esCiudad) return
    const celula = (series[key]?.[0]?.celula) ?? ''
    setCeldaSel({ mc: key, celula, t, punto, rows })
  }

  const granLabel = esCelula ? 'célula' : esCiudad ? 'ciudad' : 'microcelda'
  const granHeader = esCelula ? 'Célula' : esCiudad ? 'Ciudad' : 'Microcelda'

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col gap-2">
        {/* Título */}
        <div>
          <p className="text-xs font-semibold text-slate-600">
            Mapa de calor — {granLabel} × tiempo
            {celulaFiltro ? ` · ${celulaFiltro}` : ''}
          </p>
          {!isEmpty && (
            <p className="text-[10px] text-slate-400">
              {displayList.length} {granLabel}{displayList.length !== 1 ? 's' : ''} · {tiempos.length} snapshots
              {!esCelula && !esCiudad && <span className="ml-2 text-cyan-500">Toca una celda para ver detalles</span>}
            </p>
          )}
        </div>
        {/* Controles: 1 fila compacta */}
        <div className="flex items-center gap-1.5">
          {/* Micro / Ciudad / Célula */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {[
              { val: 'celula',     label: 'Célula' },
              { val: 'microcelda', label: 'Micro'  },
              { val: 'ciudad',     label: 'Ciudad' },
            ].map(o => (
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
                  modo === m ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
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
                  horas === o.value ? 'bg-cyan-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >{o.label}</button>
            ))}
          </div>
        </div>
      </div>

      {(loading || (esCiudad && ciudadLoading)) ? (
        <div className="rounded-xl bg-slate-100 animate-pulse h-40" />
      ) : isEmpty ? (
        <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-8 text-center text-xs text-slate-400">
          Sin datos históricos por {granLabel} aún.
          <br />
          <span className="text-[10px]">El sistema captura snapshots cada 5 min.</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto" ref={scrollRef}>
            <table className="w-full text-[10px] border-collapse" style={{ minWidth: Math.max(400, tiempos.length * (modo === 'N' ? 52 : 36) + 120) }}>
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 bg-slate-50 z-10 px-2 py-1.5 text-left font-semibold text-slate-500 border-b border-r border-slate-100 w-28 min-w-28">
                    {granHeader}
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
                {displayList.map((key, idx) => {
                  const pts = activeSeries[key] ?? []

                  // celulaLabel only used when not esCelula and not esCiudad
                  const celulaLabel = (!esCelula && !esCiudad) ? (series[key]?.[0]?.celula ?? '') : ''
                  // Ciudades únicas de esta microcelda (desde rows live)
                  const ciudadesMC = (!esCelula && !esCiudad)
                    ? [...new Set(rows.filter(r => r.microcelda === key && r.ciudad_nodo).map(r => r.ciudad_nodo))].sort()
                    : []

                  const subMicros = esCelula
                    ? (celMicros[key] ?? [])
                    : esCiudad
                      ? (ciudadMicros[key] ?? [])
                      : []

                  const vals = pts.map(p => p.pct_retraso).filter(v => v != null)
                  const prom = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
                  const promCell = cellColor(prom)

                  const avgCon = pts.length ? pts.reduce((s, p) => s + (p.con_retraso ?? 0), 0) / pts.length : null
                  const avgTot = pts.length ? pts.reduce((s, p) => s + (p.total ?? 0), 0) / pts.length : null
                  const promCellN = cellColorN(avgCon != null ? Math.round(avgCon) : null, maxN)

                  let actList   = []
                  let maxActRet = 1
                  let mcBreakdown = []

                  if (!esCelula && !esCiudad) {
                    const tecsMC = rows.filter(r => r.microcelda === key)
                    const ciudadMap = {}
                    for (const r of tecsMC) {
                      const ciudad = r.ciudad_nodo || 'Sin ciudad'
                      if (!ciudadMap[ciudad]) ciudadMap[ciudad] = { total: 0, retraso: 0, actMap: {} }
                      ciudadMap[ciudad].total++
                      const esRet = r.estado_actual === 'Retraso actual' || r.estado_actual === 'Retraso en siguiente'
                      if (esRet) ciudadMap[ciudad].retraso++
                      const act = r.actividad_actual || 'Sin actividad'
                      if (!ciudadMap[ciudad].actMap[act]) ciudadMap[ciudad].actMap[act] = { total: 0, retraso: 0 }
                      ciudadMap[ciudad].actMap[act].total++
                      if (esRet) ciudadMap[ciudad].actMap[act].retraso++
                    }
                    actList = Object.entries(ciudadMap)
                      .map(([ciudad, { total, retraso, actMap }]) => ({
                        ciudad,
                        total,
                        retraso,
                        actList: Object.entries(actMap).sort((a, b) => b[1].retraso - a[1].retraso),
                        maxActRet: Math.max(1, ...Object.values(actMap).map(d => d.retraso || 0)),
                      }))
                      .sort((a, b) => b.retraso - a.retraso)
                    maxActRet = Math.max(1, ...actList.map(c => c.retraso || 0))
                  } else {
                    // Both célula and ciudad use mcBreakdown
                    const sourceMicros = esCiudad ? (ciudadMicros[key] ?? []) : (celMicros[key] ?? [])
                    mcBreakdown = sourceMicros
                      .map(mc => {
                        const mcPts = series[mc] ?? []
                        const last  = mcPts[mcPts.length - 1]
                        return { mc, last }
                      })
                      .sort((a, b) => {
                        const va = modo === 'N' ? (a.last?.con_retraso ?? 0) : (a.last?.pct_retraso ?? 0)
                        const vb = modo === 'N' ? (b.last?.con_retraso ?? 0) : (b.last?.pct_retraso ?? 0)
                        return vb - va
                      })
                    maxActRet = Math.max(1, ...mcBreakdown.map(({ last }) =>
                      modo === 'N' ? (last?.con_retraso ?? 0) : (last?.pct_retraso ?? 0)
                    ))
                  }

                  const isOpen = expandidos.has(key)
                  const rowBg  = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                  const tdBg   = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'

                  return [
                    <tr key={key} className={rowBg}>
                      <td
                        className={`sticky left-0 z-10 px-2 py-1 border-r border-slate-100 ${tdBg} cursor-pointer hover:bg-cyan-50 transition-colors select-none`}
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
                            <p className="font-medium text-slate-700 truncate" style={{ maxWidth: 84 }}>{esCiudad ? toTitleCase(key) : key}</p>
                            {!esCelula && !esCiudad
                              ? ciudadesMC.length > 0
                                ? <CiudadesTag ciudades={ciudadesMC} />
                                : celulaLabel && <p className="text-[9px] text-slate-400 truncate">{celulaLabel}</p>
                              : esCiudad
                                ? <p className="text-[9px] text-slate-400 truncate" title={subMicros.join(', ')}>
                                    {subMicros[0] ?? '—'}{subMicros.length > 1 ? ` +${subMicros.length - 1}` : ''}
                                  </p>
                                : <p className="text-[9px] text-slate-400 truncate">{subMicros.length} microceldas</p>
                            }
                          </div>
                        </div>
                      </td>

                      {tiempos.map(t => {
                        const p = lookup[key]?.[t]
                        if (modo === 'N') {
                          const con = p?.con_retraso ?? null
                          const tot = p?.total ?? null
                          const cN  = cellColorN(con, maxN)
                          return (
                            <td
                              key={t}
                              onClick={() => p && handleCeldaClick(key, t, p)}
                              className={`text-center py-1 border-slate-100 border-b ${cN.bg} ${cN.text} ${
                                p && !esCelula && !esCiudad ? 'cursor-pointer hover:opacity-75 active:opacity-50' : 'cursor-default'
                              }`}
                              style={{ WebkitTapHighlightColor: 'transparent' }}
                            >
                              {con != null ? `${con}/${tot ?? '?'}` : ''}
                            </td>
                          )
                        }
                        const rawPct = p?.pct_retraso ?? null
                        const c = cellColor(rawPct)
                        return (
                          <td
                            key={t}
                            onClick={() => p && handleCeldaClick(key, t, p)}
                            className={`text-center py-1 border-slate-100 border-b ${c.bg} ${c.text} ${
                              p && !esCelula && !esCiudad ? 'cursor-pointer hover:opacity-75 active:opacity-50' : 'cursor-default'
                            }`}
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                          >
                            {rawPct != null ? Math.round(rawPct) : ''}
                          </td>
                        )
                      })}

                      {modo === 'N' ? (
                        <td className={`text-center px-1 py-1 font-bold border-l border-slate-100 ${promCellN.bg} ${promCellN.text}`}>
                          {avgCon != null ? `${Math.round(avgCon)}/${Math.round(avgTot ?? 0)}` : '—'}
                        </td>
                      ) : (
                        <td className={`text-center px-1 py-1 font-bold border-l border-slate-100 ${promCell.bg} ${promCell.text}`}>
                          {prom != null ? Math.round(prom) + '%' : '—'}
                        </td>
                      )}
                    </tr>,

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
                            {!esCelula && !esCiudad ? (
                              <>
                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                  {key} · retraso en vivo
                                </p>
                                {actList.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic">Sin técnicos activos en esta microcelda ahora mismo</p>
                                ) : (
                                  <div className="space-y-1">
                                    {actList.map(({ ciudad, total, retraso: retCiudad, actList: acts, maxActRet: maxRet }) => {
                                      const ESTADOS_RET = new Set(['Retraso actual', 'Retraso en siguiente'])
                                      const cCiudad   = cellColorN(retCiudad, maxActRet)
                                      const pctCiudad = total > 0 ? Math.round((retCiudad / total) * 100) : 0
                                      const ciudadKey = `${key}::${ciudad}`
                                      const ciudadOpen = expandedCiudades.has(ciudadKey)

                                      const abrirModalCiudad = (e) => {
                                        e.stopPropagation()
                                        const rowsFiltrados = rows.filter(r =>
                                          r.microcelda === key &&
                                          r.ciudad_nodo === ciudad &&
                                          ESTADOS_RET.has(r.estado_actual)
                                        )
                                        const celula = (series[key]?.[0]?.celula) ?? ''
                                        setCeldaSel({
                                          mc: key,
                                          titulo: `${key} · ${toTitleCase(ciudad)}`,
                                          celula,
                                          t: globalLastTime,
                                          punto: { pct_retraso: pctCiudad, con_retraso: retCiudad, total },
                                          rows: rowsFiltrados,
                                        })
                                      }

                                      return (
                                        <div key={ciudad} className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                                          <div
                                            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none hover:bg-cyan-50/60 transition-colors"
                                            onClick={() => toggleCiudad(key, ciudad)}
                                            style={{ WebkitTapHighlightColor: 'transparent' }}
                                          >
                                            <svg
                                              className={`w-3 h-3 text-slate-400 shrink-0 transition-transform duration-150 ${ciudadOpen ? 'rotate-90' : ''}`}
                                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            >
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                            <span className="flex-1 text-[10px] font-bold text-slate-700 truncate">{toTitleCase(ciudad)}</span>
                                            <span className="text-[9px] text-slate-400 shrink-0">{acts.length} tipo{acts.length !== 1 ? 's' : ''}</span>
                                            {retCiudad > 0 ? (
                                              <span
                                                className={`ml-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${cCiudad.bg} ${cCiudad.text} cursor-pointer hover:opacity-75`}
                                                onClick={abrirModalCiudad}
                                                title="Ver técnicos retrasados en esta ciudad"
                                              >
                                                {retCiudad} ret · {pctCiudad}%
                                              </span>
                                            ) : (
                                              <span className="ml-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-emerald-100 text-emerald-700">
                                                sin retraso
                                              </span>
                                            )}
                                          </div>
                                          {ciudadOpen && (
                                            <div className="border-t border-slate-100 bg-slate-50/40 py-1.5 pl-6 pr-2 space-y-1.5 border-l-2 border-cyan-200">
                                              {acts.map(([act, { total: totAct, retraso: retAct }]) => {
                                                const c      = cellColorN(retAct, maxRet)
                                                const barPct = maxRet > 0 ? (retAct / maxRet) * 100 : 0
                                                const pct    = totAct > 0 ? Math.round((retAct / totAct) * 100) : 0
                                                return (
                                                  <div key={act} className="flex items-center gap-2">
                                                    <div className="w-28 shrink-0 truncate text-[10px] text-slate-600" title={toTitleCase(act)}>
                                                      {toTitleCase(act)}
                                                    </div>
                                                    <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                      <div className={`h-full rounded-full ${c.bg} transition-all`} style={{ width: `${Math.min(100, barPct)}%` }} />
                                                    </div>
                                                    <span className="text-[10px] tabular-nums text-slate-500 shrink-0 w-20 text-right">
                                                      {retAct}/{totAct} · {pct}%
                                                    </span>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </>
                            ) : esCiudad ? (
                              /* Ciudad → tipos de trabajo en vivo */
                              (() => {
                                const ESTADOS_RET = new Set(['Retraso actual', 'Retraso en siguiente'])
                                const tecsCiudad  = rows.filter(r => r.ciudad_nodo === key)
                                const actMap = {}
                                for (const r of tecsCiudad) {
                                  const act = r.actividad_actual || 'Sin actividad'
                                  if (!actMap[act]) actMap[act] = { total: 0, retraso: 0 }
                                  actMap[act].total++
                                  if (ESTADOS_RET.has(r.estado_actual)) actMap[act].retraso++
                                }
                                const acts   = Object.entries(actMap).sort((a, b) => b[1].retraso - a[1].retraso)
                                const maxRet = Math.max(1, ...acts.map(([, d]) => d.retraso))
                                return (
                                  <>
                                    <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                      {toTitleCase(key)} · retraso en vivo
                                    </p>
                                    {acts.length === 0 ? (
                                      <p className="text-[10px] text-slate-400 italic">Sin técnicos activos en esta ciudad</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {acts.map(([act, { total: totAct, retraso: retAct }]) => {
                                          const c      = cellColorN(retAct, maxRet)
                                          const barPct = maxRet > 0 ? (retAct / maxRet) * 100 : 0
                                          const pct    = totAct > 0 ? Math.round((retAct / totAct) * 100) : 0
                                          return (
                                            <div key={act} className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-cyan-50/40 transition-colors">
                                              <div className="flex items-center gap-2 mb-1">
                                                <span className="flex-1 truncate text-[10px] font-semibold text-slate-700" title={toTitleCase(act)}>
                                                  {toTitleCase(act)}
                                                </span>
                                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${c.bg} ${c.text}`}>
                                                  {retAct}/{totAct} · {pct}%
                                                </span>
                                              </div>
                                              <div className="bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                <div className={`h-full rounded-full ${c.bg} transition-all`} style={{ width: `${Math.min(100, barPct)}%` }} />
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </>
                                )
                              })()
                            ) : (
                              /* Célula → Microcelda → tipos de trabajo en vivo */
                              (() => {
                                const ESTADOS_RET = new Set(['Retraso actual', 'Retraso en siguiente'])
                                const micros = (celMicros[key] ?? []).map(mc => {
                                  const tecsMC = rows.filter(r => r.microcelda === mc)
                                  const actMap = {}
                                  let totalRet = 0
                                  for (const r of tecsMC) {
                                    const act = r.actividad_actual || 'Sin actividad'
                                    if (!actMap[act]) actMap[act] = { total: 0, retraso: 0 }
                                    actMap[act].total++
                                    const esRet = ESTADOS_RET.has(r.estado_actual)
                                    if (esRet) { actMap[act].retraso++; totalRet++ }
                                  }
                                  return {
                                    mc,
                                    total: tecsMC.length,
                                    retraso: totalRet,
                                    acts: Object.entries(actMap).sort((a, b) => b[1].retraso - a[1].retraso),
                                    maxRet: Math.max(1, ...Object.values(actMap).map(d => d.retraso)),
                                  }
                                }).sort((a, b) => b.retraso - a.retraso)
                                const maxMCRet = Math.max(1, ...micros.map(m => m.retraso))
                                return (
                                  <>
                                    <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                      {key} · retraso en vivo ({micros.length} microcelda{micros.length !== 1 ? 's' : ''})
                                    </p>
                                    {micros.length === 0 ? (
                                      <p className="text-[10px] text-slate-400 italic">Sin microceldas activas en esta célula</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {micros.map(({ mc, total, retraso: retMC, acts, maxRet }) => {
                                          const cMC  = cellColorN(retMC, maxMCRet)
                                          const pctMC = total > 0 ? Math.round((retMC / total) * 100) : 0
                                          const mcOpen = expandedMicrosInCel.has(mc)
                                          return (
                                            <div key={mc} className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                                              <div
                                                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none hover:bg-cyan-50/60 transition-colors"
                                                onClick={() => toggleMicroInCel(mc)}
                                                style={{ WebkitTapHighlightColor: 'transparent' }}
                                              >
                                                <svg
                                                  className={`w-3 h-3 text-slate-400 shrink-0 transition-transform duration-150 ${mcOpen ? 'rotate-90' : ''}`}
                                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                >
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                                <span className="flex-1 text-[10px] font-bold text-slate-700 truncate">{mc}</span>
                                                <span className="text-[9px] text-slate-400 shrink-0">{acts.length} tipo{acts.length !== 1 ? 's' : ''}</span>
                                                {retMC > 0 ? (
                                                  <span className={`ml-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${cMC.bg} ${cMC.text}`}>
                                                    {retMC} ret · {pctMC}%
                                                  </span>
                                                ) : (
                                                  <span className="ml-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-emerald-100 text-emerald-700">
                                                    sin retraso
                                                  </span>
                                                )}
                                              </div>
                                              {mcOpen && (
                                                <div className="border-t border-slate-100 bg-slate-50/40 py-1.5 px-2 space-y-1 border-l-2 border-cyan-200">
                                                  {acts.length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic pl-4">Sin técnicos activos</p>
                                                  ) : acts.map(([act, { total: totAct, retraso: retAct }]) => {
                                                    const c      = cellColorN(retAct, maxRet)
                                                    const barPct = maxRet > 0 ? (retAct / maxRet) * 100 : 0
                                                    const pct    = totAct > 0 ? Math.round((retAct / totAct) * 100) : 0
                                                    return (
                                                      <div key={act} className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-cyan-50/40 transition-colors">
                                                        <div className="flex items-center gap-2 mb-1">
                                                          <span className="flex-1 truncate text-[10px] font-semibold text-slate-700" title={toTitleCase(act)}>
                                                            {toTitleCase(act)}
                                                          </span>
                                                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${c.bg} ${c.text}`}>
                                                            {retAct}/{totAct} · {pct}%
                                                          </span>
                                                        </div>
                                                        <div className="bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                          <div className={`h-full rounded-full ${c.bg} transition-all`} style={{ width: `${Math.min(100, barPct)}%` }} />
                                                        </div>
                                                      </div>
                                                    )
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </>
                                )
                              })()
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

          {/* Leyenda */}
          <div className="px-3 py-2 border-t border-slate-100">
            {modo === 'N' ? <LeyendaN maxN={maxN} /> : <Leyenda />}
          </div>
        </div>
      )}

      {celdaSel && (
        <CeldaModal celda={celdaSel} onClose={() => setCeldaSel(null)} onDetalle={onDetalle} />
      )}
    </div>
  )
}
