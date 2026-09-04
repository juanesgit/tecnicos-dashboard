import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

const HORAS_OPTS = [
  { label: '4h',  value: 4  },
  { label: '8h',  value: 8  },
  { label: '12h', value: 12 },
  { label: '24h', value: 24 },
]

const UMBRAL_CRITICO = 60

/* ── Escala de color por efectividad % ── */
function cellColor(pct) {
  if (pct === null || pct === undefined)
    return { bg: 'bg-slate-100', text: 'text-slate-300' }
  if (pct >= 90) return { bg: 'bg-emerald-100', text: 'text-emerald-700' }
  if (pct >= 60) return { bg: 'bg-yellow-200',  text: 'text-yellow-800'  }
  if (pct >= 40) return { bg: 'bg-amber-400',   text: 'text-white'       }
  if (pct >= 20) return { bg: 'bg-red-500',     text: 'text-white'       }
  if (pct >   0) return { bg: 'bg-red-700',     text: 'text-white'       }
  return              { bg: 'bg-slate-50',    text: 'text-slate-300'   }
}

const MINUSCULAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'a'])
function toTitleCase(str) {
  if (!str) return str
  return str.toLowerCase().split(' ').map((w, i) =>
    i === 0 || !MINUSCULAS.has(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(' ')
}

function round1(v) { return Math.round(v * 10) / 10 }

function Leyenda({ modoN }) {
  if (modoN) return (
    <div className="text-[10px] text-slate-400">
      Modo <strong>N</strong>: valor = OTs completadas en ese corte · color = efectividad del snapshot
    </div>
  )
  return (
    <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
      {[
        { label: '≥90%',         bg: 'bg-emerald-100' },
        { label: '60–90%',       bg: 'bg-yellow-200'  },
        { label: '40–60%',       bg: 'bg-amber-400'   },
        { label: '20–40%',       bg: 'bg-red-500'     },
        { label: '<20%',         bg: 'bg-red-700'     },
        { label: 'Sin cerradas', bg: 'bg-slate-50 border border-slate-200' },
      ].map(({ label, bg }) => (
        <span key={label} className="flex items-center gap-1">
          <span className={`inline-block w-3 h-3 rounded-sm ${bg}`} />
          {label}
        </span>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function MapaCalorEfectividad({ celulaFiltro = '' }) {
  const [horas,               setHoras]               = useState(4)
  const [granularidad,        setGranularidad]        = useState('celula')   // 'celula' | 'microcelda' | 'ciudad'
  const [modo,                setModo]                = useState('%')         // '%' | 'N'
  const [data,                setData]                = useState(null)
  const [liveResumen,         setLiveResumen]         = useState(null)
  const [loading,             setLoading]             = useState(true)
  const [error,               setError]               = useState(null)
  const [expandidos,          setExpandidos]          = useState(new Set())
  const [expandedMicrosInCel, setExpandedMicrosInCel] = useState(new Set())
  const [liveMcMap,           setLiveMcMap]           = useState({})
  const scrollRef = useRef(null)

  const handleGranularidad = (g) => {
    setGranularidad(g)
    setExpandidos(new Set())
    setExpandedMicrosInCel(new Set())
  }

  const toggleExpandido = (key) => {
    setExpandidos(prev => {
      const next = new Set(prev)
      const opening = !prev.has(key)
      next.has(key) ? next.delete(key) : next.add(key)
      requestAnimationFrame(() => {
        if (!scrollRef.current) return
        scrollRef.current.scrollTo({
          left: opening ? 0 : scrollRef.current.scrollWidth,
          behavior: 'smooth',
        })
      })
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

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params  = new URLSearchParams({ horas })
      if (celulaFiltro) params.set('celula', celulaFiltro)
      const liveUrl = `/avance-ot${celulaFiltro ? `?celula=${encodeURIComponent(celulaFiltro)}` : ''}`

      const [histResult, liveResult] = await Promise.allSettled([
        api.get(`/historico/efectividad?${params}`),
        api.get(liveUrl),
      ])

      if (histResult.status === 'fulfilled') {
        setData(histResult.value.data)
      } else {
        throw histResult.reason
      }

      if (liveResult.status === 'fulfilled') {
        const liveData = liveResult.value.data
        setLiveResumen(liveData?.resumen ?? null)
        const mcMap = {}
        for (const item of (liveData?.por_microcelda ?? [])) {
          mcMap[item.microcelda] = item
        }
        setLiveMcMap(mcMap)
      }
    } catch (e) {
      const msg = e.response?.data?.detail || 'Error al cargar efectividad'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [horas, celulaFiltro])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!data || !scrollRef.current) return
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    })
  }, [data, modo])

  /* ── Series por granularidad ── */
  const baseSeries   = data?.series         ?? {}   // microcelda → [{t, celula, completado, no_completado, pct_efectividad}]
  const ciudadSeries = data?.series_ciudad  ?? {}   // ciudad → [{t, celula, microcelda, completado, no_completado, pct_efectividad}]
  const tiempos      = data?.tiempos        ?? []

  /* Agregar por célula */
  const celulaSeries = {}
  const celMicros    = {}

  for (const [mc, pts] of Object.entries(baseSeries)) {
    const cel = pts[0]?.celula ?? 'Sin célula'
    if (!celMicros[cel]) celMicros[cel] = []
    celMicros[cel].push(mc)
    for (const p of pts) {
      if (!celulaSeries[cel]) celulaSeries[cel] = {}
      if (!celulaSeries[cel][p.t]) {
        celulaSeries[cel][p.t] = { t: p.t, completado: 0, no_completado: 0 }
      }
      celulaSeries[cel][p.t].completado    += p.completado    ?? 0
      celulaSeries[cel][p.t].no_completado += p.no_completado ?? 0
    }
  }
  const celulaSeriesFlat = {}
  for (const [cel, tMap] of Object.entries(celulaSeries)) {
    celulaSeriesFlat[cel] = Object.values(tMap)
      .map(p => {
        const cerradas = p.completado + p.no_completado
        return { ...p, pct_efectividad: cerradas > 0 ? round1(p.completado / cerradas * 100) : null }
      })
      .sort((a, b) => a.t.localeCompare(b.t))
  }

  /* Ciudad → microcelda map (para expandidos) */
  const ciudadMicros = {}
  for (const [ciudad, pts] of Object.entries(ciudadSeries)) {
    const mcs = [...new Set(pts.map(p => p.microcelda).filter(Boolean))]
    ciudadMicros[ciudad] = mcs
  }

  const esMicro  = granularidad === 'microcelda'
  const esCiudad = granularidad === 'ciudad'
  const esModoN  = modo === 'N'

  const activeSeries = esCiudad ? ciudadSeries : esMicro ? baseSeries : celulaSeriesFlat

  /* lookup key → t → punto */
  const lookup = {}
  for (const [key, pts] of Object.entries(activeSeries)) {
    lookup[key] = {}
    for (const p of pts) lookup[key][p.t] = p
  }

  /* Items ordenados: menor efectividad al frente */
  const displayItems = Object.entries(activeSeries)
    .map(([key, pts]) => {
      const last    = pts[pts.length - 1]
      const lastPct = last?.pct_efectividad ?? null
      const celula  = (!esMicro && !esCiudad) ? '' : (pts[0]?.celula ?? '')
      return { key, celula, lastPct }
    })
    .sort((a, b) => (a.lastPct ?? 200) - (b.lastPct ?? 200))

  const hasDatos  = displayItems.length > 0 && tiempos.length > 0
  const granLabel = esCiudad ? 'ciudad' : esMicro ? 'microcelda' : 'célula'
  const granLabelPl = esCiudad ? 'ciudades' : esMicro ? 'microceldas' : 'células'

  /* ══ KPI ════════════════════════════════════════════════════ */
  let gComp = 0, gNc = 0
  for (const pts of Object.values(baseSeries)) {
    const last = pts[pts.length - 1]
    if (last) { gComp += last.completado ?? 0; gNc += last.no_completado ?? 0 }
  }
  const efectividadGlobal = (gComp + gNc) > 0 ? round1(gComp / (gComp + gNc) * 100) : null

  const totalMicros = Object.keys(baseSeries).length
  let criticas = 0
  for (const pts of Object.values(baseSeries)) {
    const last = pts[pts.length - 1]
    if (last && last.pct_efectividad !== null && last.pct_efectividad < UMBRAL_CRITICO) criticas++
  }

  const liveComp     = liveResumen?.completado    ?? 0
  const liveNc       = liveResumen?.no_completado ?? 0
  const liveCerradas = liveComp + liveNc

  const tPrimero = tiempos[0]
  let firstComp = 0, firstNc = 0, lastComp2 = 0, lastNc2 = 0
  for (const pts of Object.values(baseSeries)) {
    const pFirst = pts.find(p => p.t === tPrimero)
    const pLast  = pts[pts.length - 1]
    if (pFirst) { firstComp += pFirst.completado ?? 0; firstNc += pFirst.no_completado ?? 0 }
    if (pLast)  { lastComp2 += pLast.completado  ?? 0; lastNc2 += pLast.no_completado  ?? 0 }
  }
  const efectFirst      = (firstComp + firstNc) > 0 ? round1(firstComp / (firstComp + firstNc) * 100) : null
  const efectLast       = (lastComp2 + lastNc2) > 0 ? round1(lastComp2 / (lastComp2 + lastNc2) * 100) : null
  const tendenciaDelta  = (efectFirst !== null && efectLast !== null) ? round1(efectLast - efectFirst) : null
  const tendenciaLabel  = tendenciaDelta === null ? '—'
    : tendenciaDelta > 0 ? `▲ +${tendenciaDelta} pp`
    : tendenciaDelta < 0 ? `▼ ${tendenciaDelta} pp`
    : '→ Sin cambio'
  const tendenciaColor = tendenciaDelta === null ? 'text-slate-400'
    : tendenciaDelta > 0 ? 'text-emerald-600'
    : tendenciaDelta < 0 ? 'text-red-600'
    : 'text-slate-500'
  const tendenciaBg = tendenciaDelta === null ? 'bg-white border-slate-200'
    : tendenciaDelta > 0 ? 'bg-emerald-50 border-emerald-200'
    : tendenciaDelta < 0 ? 'bg-red-50 border-red-200'
    : 'bg-slate-50 border-slate-200'

  const kpi1Color = efectividadGlobal === null ? 'text-slate-400'
    : efectividadGlobal >= 80 ? 'text-emerald-600'
    : efectividadGlobal >= 50 ? 'text-amber-600'
    : 'text-red-600'
  const kpi1Bg = efectividadGlobal === null ? 'bg-white border-slate-200'
    : efectividadGlobal >= 80 ? 'bg-emerald-50 border-emerald-200'
    : efectividadGlobal >= 50 ? 'bg-amber-50 border-amber-200'
    : 'bg-red-50 border-red-200'

  const kpi2C = criticas > 0
    ? { color: 'text-red-600', bg: 'bg-red-50 border-red-200' }
    : { color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' }

  /* ── Helper: tipos de trabajo por efectividad (liveMcMap) ── */
  function getTiposEfectividad(mcList) {
    const tipoAgg = {}
    for (const mc of mcList) {
      for (const t of (liveMcMap[mc]?.por_tipo ?? [])) {
        if (!tipoAgg[t.tipo]) tipoAgg[t.tipo] = { completado: 0, no_completado: 0 }
        tipoAgg[t.tipo].completado    += t.completado    ?? 0
        tipoAgg[t.tipo].no_completado += t.no_completado ?? 0
      }
    }
    return Object.entries(tipoAgg).map(([tipo, d]) => {
      const cerradas = d.completado + d.no_completado
      return { tipo, completado: d.completado, no_completado: d.no_completado, cerradas,
               pct: cerradas > 0 ? round1(d.completado / cerradas * 100) : null }
    }).sort((a, b) => (a.pct ?? 200) - (b.pct ?? 200))
  }

  function renderTipos(tipos) {
    if (!tipos.length) return (
      <p className="text-[10px] text-slate-400 italic pl-1">Sin OTs cerradas en vivo</p>
    )
    return tipos.map(({ tipo, completado, cerradas, pct }) => {
      const c = cellColor(pct)
      return (
        <div key={tipo} className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-violet-50/40 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex-1 truncate text-[10px] font-semibold text-slate-700" title={toTitleCase(tipo)}>
              {toTitleCase(tipo)}
            </span>
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${c.bg} ${c.text}`}>
              {cerradas > 0 ? `${completado}/${cerradas} · ${Math.round(pct ?? 0)}%` : 'Sin cerradas'}
            </span>
          </div>
          <div className="bg-slate-200 rounded-full h-1.5 overflow-hidden">
            {cerradas > 0 && pct !== null && (
              <div className={`h-full rounded-full ${c.bg} transition-all`}
                style={{ width: `${Math.min(100, pct)}%` }} />
            )}
          </div>
        </div>
      )
    })
  }

  /* ── Valor y color de celda según modo ── */
  function getCelda(p) {
    if (!p) return { display: '', bg: 'bg-white', text: 'text-slate-300' }
    const pct = p.pct_efectividad ?? null
    const { bg, text } = cellColor(pct)        // color siempre por efectividad %
    const display = esModoN
      ? (p.completado > 0 ? p.completado : '')  // N = completadas absolutas
      : (pct !== null ? Math.round(pct) : '')   // % = porcentaje
    return { display, bg, text }
  }

  /* ── Valor "Últ." según modo ── */
  function getUlt(pts) {
    const last = pts[pts.length - 1] ?? null
    if (!last) return { display: '—', bg: 'bg-slate-100', text: 'text-slate-300' }
    const pct = last.pct_efectividad ?? null
    const { bg, text } = cellColor(pct)
    const display = esModoN
      ? (last.completado > 0 ? last.completado : '—')
      : (pct !== null ? Math.round(pct) + '%' : '—')
    return { display, bg, text }
  }

  return (
    <div className="space-y-3">

      {/* ── KPI Banner ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          ))
        ) : (
          <>
            <div className={`rounded-xl border ${kpi1Bg} px-3 py-2.5`}>
              <p className={`text-xl font-bold leading-none tabular-nums ${kpi1Color}`}>
                {efectividadGlobal !== null ? `${efectividadGlobal}%` : '—'}
              </p>
              <p className="text-[11px] text-slate-400 font-medium mt-1 leading-snug">Efectividad actual</p>
              <p className="text-[10px] text-slate-400 opacity-70 mt-0.5">
                {gComp + gNc > 0 ? `${gComp} completadas de ${gComp + gNc} cerradas` : 'Sin OTs cerradas'}
              </p>
            </div>

            <div className={`rounded-xl border ${kpi2C.bg} px-3 py-2.5`}>
              <p className={`text-xl font-bold leading-none tabular-nums ${kpi2C.color}`}>
                {totalMicros > 0 ? criticas : '—'}
              </p>
              <p className="text-[11px] text-slate-400 font-medium mt-1 leading-snug">Microceldas críticas</p>
              <p className="text-[10px] text-slate-400 opacity-70 mt-0.5">
                {totalMicros > 0
                  ? criticas === 0 ? `Todas sobre ${UMBRAL_CRITICO}%`
                    : `de ${totalMicros} · bajo ${UMBRAL_CRITICO}%`
                  : 'Sin datos'}
              </p>
            </div>

            <div className={`rounded-xl border px-3 py-2.5 ${
              liveCerradas > 0 ? 'bg-violet-50 border-violet-200' : 'bg-white border-slate-200'
            }`}>
              <p className={`text-xl font-bold leading-none tabular-nums ${
                liveCerradas > 0 ? 'text-violet-700' : 'text-slate-400'
              }`}>{liveCerradas}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-1 leading-snug">OTs cerradas hoy</p>
              <p className="text-[10px] text-slate-400 opacity-70 mt-0.5">
                {liveCerradas > 0
                  ? `${liveComp} efectivas · ${liveNc} inefectivas`
                  : 'Sin OTs cerradas aún'}
              </p>
            </div>

            <div className={`rounded-xl border ${tendenciaBg} px-3 py-2.5`}>
              <p className={`text-xl font-bold leading-none tabular-nums ${tendenciaColor}`}>
                {tendenciaLabel}
              </p>
              <p className="text-[11px] text-slate-400 font-medium mt-1 leading-snug">Tendencia {horas}h</p>
              <p className="text-[10px] text-slate-400 opacity-70 mt-0.5">
                {efectFirst !== null && efectLast !== null
                  ? `${efectFirst}% → ${efectLast}%`
                  : 'Sin snapshots suficientes'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Header + controles ── */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-600">
            Efectividad OT — {granLabel} × tiempo
            {celulaFiltro ? ` · ${celulaFiltro}` : ''}
          </p>
          <p className="text-[10px] text-slate-400">
            {hasDatos
              ? `${displayItems.length} ${granLabelPl} · ${tiempos.length} snapshots · completadas / cerradas`
              : 'Sin datos'}
          </p>
        </div>

        {/* Controles: 1 fila compacta */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Célula / Micro / Ciudad */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {[
              { val: 'celula',     label: 'Célula' },
              { val: 'microcelda', label: 'Micro'  },
              { val: 'ciudad',     label: 'Ciudad' },
            ].map(o => (
              <button key={o.val} onClick={() => handleGranularidad(o.val)}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  granularidad === o.val
                    ? 'bg-violet-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
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

          {/* Horas — select mobile, botones desktop */}
          <div className="sm:hidden ml-auto">
            <select
              value={horas}
              onChange={e => setHoras(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
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
                  horas === o.value ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >{o.label}</button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="rounded-xl bg-slate-100 animate-pulse h-40" />}

      {error && !loading && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-xs text-red-500 text-center">
          {error}
        </div>
      )}

      {!loading && !error && !hasDatos && (
        <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-8 text-center text-xs text-slate-400">
          Sin snapshots de efectividad en las últimas {horas}h.
          <br />
          <span className="text-[10px]">Solo se registra cuando hay OTs cerradas (completadas + no completadas).</span>
        </div>
      )}

      {/* ── Tabla ── */}
      {!loading && !error && hasDatos && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto" ref={scrollRef}>
            <table
              className="w-full text-[10px] border-collapse"
              style={{ minWidth: Math.max(320, 100 + tiempos.length * 36 + 56) }}
            >
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 bg-slate-50 z-10 px-2 py-1.5 text-left font-semibold text-slate-500 border-b border-r border-slate-100 w-28 min-w-28">
                    {esCiudad ? 'Ciudad' : esMicro ? 'Microcelda' : 'Célula'}
                  </th>
                  {tiempos.map(t => (
                    <th key={t} className="px-1 py-1.5 text-center font-medium text-slate-400 border-b border-slate-100"
                      style={{ minWidth: 32 }}>
                      {t}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-center font-semibold text-violet-500 border-b border-l border-slate-100 w-14">
                    {esModoN ? 'Últ.N' : 'Últ.%'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map(({ key, celula }, idx) => {
                  const pts    = activeSeries[key] ?? []
                  const { display: ultDisplay, bg: ultBg, text: ultText } = getUlt(pts)
                  const isOpen = expandidos.has(key)
                  const rowBg  = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                  const tdBg   = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'

                  // Sub-items para filas expandidas
                  const subMicros = esMicro ? [] : esCiudad ? (ciudadMicros[key] ?? []) : (celMicros[key] ?? [])
                  const mcBreakdown = (!esMicro)
                    ? subMicros.map(mc => {
                        const mcPts  = baseSeries[mc] ?? []
                        const mcLast = mcPts[mcPts.length - 1]
                        return { mc, lastPct: mcLast?.pct_efectividad ?? null }
                      }).sort((a, b) => (a.lastPct ?? 200) - (b.lastPct ?? 200))
                    : []

                  const tiposMicro = esMicro ? getTiposEfectividad([key]) : []

                  return [
                    <tr key={key} className={rowBg}>
                      <td
                        className={`sticky left-0 z-10 px-2 py-1.5 border-r border-b border-slate-100 ${tdBg} cursor-pointer hover:bg-violet-50 transition-colors select-none`}
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
                            <p className="font-medium text-slate-700 truncate" style={{ maxWidth: 92 }}>
                              {esCiudad ? toTitleCase(key) : key}
                            </p>
                            {esMicro && celula && (
                              <p className="text-[8px] text-slate-400 truncate">{celula}</p>
                            )}
                            {!esMicro && (
                              <p className="text-[8px] text-slate-400 truncate">
                                {subMicros.length} micro{subMicros.length !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {tiempos.map(t => {
                        const p = lookup[key]?.[t]
                        const { display, bg, text } = getCelda(p)
                        const pct = p?.pct_efectividad ?? null
                        return (
                          <td key={t}
                            className={`text-center py-1 border-b border-slate-100 ${bg} ${text} cursor-default`}
                            title={p
                              ? pct !== null
                                ? `${key} @ ${t}: ${Math.round(pct)}% efectividad · ${p.completado}/${p.completado + p.no_completado} cerradas`
                                : `${key} @ ${t}: sin OTs cerradas`
                              : 'Sin dato'}
                          >
                            {display}
                          </td>
                        )
                      })}

                      <td className={`text-center px-1 py-1 font-bold border-b border-l border-slate-100 ${ultBg} ${ultText}`}>
                        {ultDisplay}
                      </td>
                    </tr>,

                    /* ── Fila expandida ── */
                    isOpen && (
                      <tr key={`${key}-exp`}>
                        <td colSpan={tiempos.length + 2} style={{ padding: 0 }}>
                          <div
                            className="px-3 py-2.5 bg-violet-50/60 border-b border-violet-100"
                            style={{
                              position: 'sticky',
                              left: 0,
                              width: scrollRef.current?.clientWidth ?? '100%',
                              boxSizing: 'border-box',
                            }}
                          >
                            {esMicro ? (
                              <>
                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                  {key} · efectividad por tipo de trabajo
                                </p>
                                <div className="space-y-1">{renderTipos(tiposMicro)}</div>
                              </>
                            ) : (
                              <>
                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                  {esCiudad ? toTitleCase(key) : key} · efectividad por microcelda
                                </p>
                                <div className="space-y-1">
                                  {mcBreakdown.map(({ mc, lastPct }) => {
                                    const c      = cellColor(lastPct)
                                    const mcOpen = expandedMicrosInCel.has(mc)
                                    const tiposMC = getTiposEfectividad([mc])
                                    return (
                                      <div key={mc} className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                                        <div
                                          className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none hover:bg-violet-50/60 transition-colors"
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
                                          <span className="text-[9px] text-slate-400 shrink-0">
                                            {tiposMC.length} tipo{tiposMC.length !== 1 ? 's' : ''}
                                          </span>
                                          <span className={`ml-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${c.bg} ${c.text}`}>
                                            {lastPct !== null ? `${Math.round(lastPct)}%` : '—'}
                                          </span>
                                        </div>
                                        {mcOpen && (
                                          <div className="border-t border-slate-100 bg-slate-50/40 py-1.5 px-2 space-y-1 border-l-2 border-violet-200">
                                            {renderTipos(tiposMC)}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
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

          {/* Leyenda */}
          <div className="px-3 py-2 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 mb-1">
              {esModoN
                ? 'N = OTs completadas absolutas · color = efectividad % del snapshot:'
                : 'Efectividad = completadas / (completadas + no completadas):'}
            </p>
            <Leyenda modoN={esModoN} />
          </div>
        </div>
      )}
    </div>
  )
}
