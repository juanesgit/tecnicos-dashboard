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

const HORAS_OPTS = [
  { label: '4h',  value: 4  },
  { label: '8h',  value: 8  },
  { label: '12h', value: 12 },
  { label: '24h', value: 24 },
]

const JORNADA_INICIO_MIN = 420  // 07:00
const JORNADA_FIN_MIN    = 1080 // 18:00

/* Convierte "HH:MM" a minutos desde medianoche */
function timeToMin(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/* Proyecta el % de cierre a las 18:00 según el ritmo desde 07:00.
   Retorna un número 0-100 o null si no aplica. */
function proyectarCierre(t, cerradas, porCerrar) {
  const snapMin      = timeToMin(t)
  if (snapMin === null) return null
  const totalEjecutable = cerradas + porCerrar
  if (totalEjecutable === 0) return null

  const transcurridos = snapMin - JORNADA_INICIO_MIN
  if (transcurridos <= 0) return null   // antes de las 07:00

  const restantes = JORNADA_FIN_MIN - snapMin
  if (restantes <= 0) {
    // Ya pasaron las 18:00 → mostrar cierre real
    return Math.min(100, (cerradas / totalEjecutable) * 100)
  }

  const ritmo = cerradas / transcurridos
  return Math.min(100, ((cerradas + ritmo * restantes) / totalEjecutable) * 100)
}

/* ── Escala INVERTIDA: alto % avance = verde, bajo = rojo ── */
function cellColor(pct) {
  if (pct === null || pct === undefined) return { bg: 'bg-slate-100', text: 'text-slate-300', level: null }
  if (pct >= 90) return { bg: 'bg-emerald-100', text: 'text-emerald-700', level: 'excelente' }
  if (pct >= 60) return { bg: 'bg-yellow-200',  text: 'text-yellow-800',  level: 'bueno'     }
  if (pct >= 40) return { bg: 'bg-amber-400',   text: 'text-white',       level: 'medio'     }
  if (pct >= 20) return { bg: 'bg-red-500',     text: 'text-white',       level: 'bajo'      }
  if (pct >   0) return { bg: 'bg-red-700',     text: 'text-white',       level: 'critico'   }
  return              { bg: 'bg-slate-50',    text: 'text-slate-300',   level: 'cero'      }
}

function Leyenda() {
  return (
    <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
      {[
        { label: '≥90% avance', bg: 'bg-emerald-100' },
        { label: '60-90%',      bg: 'bg-yellow-200'  },
        { label: '40-60%',      bg: 'bg-amber-400'   },
        { label: '20-40%',      bg: 'bg-red-500'     },
        { label: '<20%',        bg: 'bg-red-700'     },
        { label: '0%',          bg: 'bg-slate-50 border border-slate-200' },
      ].map(({ label, bg }) => (
        <span key={label} className="flex items-center gap-1">
          <span className={`inline-block w-3 h-3 rounded-sm ${bg}`} />
          {label}
        </span>
      ))}
    </div>
  )
}

function LeyendaProy() {
  return (
    <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
      {[
        { label: 'Proyecta ≥90%', bg: 'bg-emerald-100' },
        { label: '60-90%',        bg: 'bg-yellow-200'  },
        { label: '40-60%',        bg: 'bg-amber-400'   },
        { label: '20-40%',        bg: 'bg-red-500'     },
        { label: '<20%',          bg: 'bg-red-700'     },
        { label: 'Sin datos',     bg: 'bg-slate-50 border border-slate-200' },
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
export default function MapaCalorAvance({ celulaFiltro = '', microceldaFiltro = '' }) {
  const [horas,        setHoras]        = useState(4)
  const [modo,         setModo]         = useState('%')           // '%' | 'Proy.'
  const [granularidad, setGranularidad] = useState('microcelda')  // 'microcelda' | 'celula'
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [expandidos,   setExpandidos]   = useState(new Set())
  const [liveMcMap,    setLiveMcMap]    = useState({})   // mc name → { por_tipo }
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
      if (celulaFiltro) params.set('celula', celulaFiltro)

      // Fetch histórico (crítico) + datos vivos (no crítico) en paralelo
      const liveUrl = `/avance-ot${celulaFiltro ? `?celula=${encodeURIComponent(celulaFiltro)}` : ''}`
      const [histResult, liveResult] = await Promise.allSettled([
        api.get(`/historico/avance?${params}`),
        api.get(liveUrl),
      ])

      if (histResult.status === 'fulfilled') {
        setData(histResult.value.data)
      } else {
        throw histResult.reason
      }

      if (liveResult.status === 'fulfilled') {
        const mcMap = {}
        for (const item of (liveResult.value.data?.por_microcelda ?? [])) {
          mcMap[item.microcelda] = item
        }
        setLiveMcMap(mcMap)
      }
      // Si live falla, liveMcMap queda vacío — el breakdown de tipos simplemente no aparece
    } catch (e) {
      const msg = e.response?.data?.detail || 'Error al cargar avance OT'
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

  // Series base — filtrar por microcelda si aplica
  let baseSeries = data?.series ?? {}
  if (microceldaFiltro && granularidad === 'microcelda') {
    baseSeries = Object.fromEntries(
      Object.entries(baseSeries).filter(([mc]) => mc === microceldaFiltro)
    )
  }

  const tiempos = data?.tiempos ?? []

  // ── Agregar por célula ──────────────────────────────────────
  const celulaSeries  = {}
  const celMicros     = {}
  const celulaTimeMap = {}

  for (const [mc, pts] of Object.entries(baseSeries)) {
    const cel = pts[0]?.celula ?? 'Sin célula'
    if (!celulaTimeMap[cel]) celulaTimeMap[cel] = {}
    if (!celMicros[cel]) celMicros[cel] = []
    celMicros[cel].push(mc)
    for (const p of pts) {
      if (!celulaTimeMap[cel][p.t]) {
        celulaTimeMap[cel][p.t] = { t: p.t, completado: 0, no_completado: 0, iniciado: 0, pendiente: 0, suspendido: 0, total: 0 }
      }
      celulaTimeMap[cel][p.t].completado    += p.completado    ?? 0
      celulaTimeMap[cel][p.t].no_completado += p.no_completado ?? 0
      celulaTimeMap[cel][p.t].iniciado      += p.iniciado      ?? 0
      celulaTimeMap[cel][p.t].pendiente     += p.pendiente     ?? 0
      celulaTimeMap[cel][p.t].suspendido    += p.suspendido    ?? 0
      celulaTimeMap[cel][p.t].total         += p.total         ?? 0
    }
  }
  for (const [cel, tMap] of Object.entries(celulaTimeMap)) {
    celulaSeries[cel] = Object.values(tMap)
      .map(p => {
        const denom = p.completado + p.no_completado + p.iniciado + p.pendiente + p.suspendido
        return { ...p, pct_avance: denom > 0 ? ((p.completado + p.no_completado) / denom) * 100 : 0 }
      })
      .sort((a, b) => a.t.localeCompare(b.t))
  }
  // ────────────────────────────────────────────────────────────

  const esCelula    = granularidad === 'celula'
  const activeSeries = esCelula ? celulaSeries : baseSeries

  /* Calcula la proyección para un punto de datos dado */
  function getProy(p) {
    if (!p) return null
    const cerradas  = (p.completado ?? 0) + (p.no_completado ?? 0)
    const porCerrar = (p.iniciado   ?? 0) + (p.pendiente    ?? 0) + (p.suspendido ?? 0)
    return proyectarCierre(p.t, cerradas, porCerrar)
  }

  // Items ordenados por último snapshot — menor avance primero (más urgente)
  const displayItems = Object.entries(activeSeries)
    .map(([key, pts]) => {
      const last = pts[pts.length - 1]
      let lastPct
      if (modo === 'Proy.') {
        lastPct = getProy(last) ?? 0
      } else {
        lastPct = last?.pct_avance ?? 0
      }
      const celula = !esCelula ? (pts[0]?.celula ?? '') : ''
      return { key, celula, lastPct }
    })
    .sort((a, b) => a.lastPct - b.lastPct)  // menor avance = más urgente, va arriba

  // Lookup por key → t
  const lookup = {}
  for (const [key, pts] of Object.entries(activeSeries)) {
    lookup[key] = {}
    for (const p of pts) lookup[key][p.t] = p
  }

  const hasDatos = displayItems.length > 0 && tiempos.length > 0

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-600">
            Avance OT — {esCelula ? 'célula' : 'microcelda'} × tiempo
            {celulaFiltro ? ` · ${celulaFiltro}` : ''}
          </p>
          <p className="text-[10px] text-slate-400">
            {hasDatos
              ? `${displayItems.length} ${esCelula ? 'célula' : 'microcelda'}${displayItems.length !== 1 ? 's' : ''} · ${tiempos.length} snapshots · granularidad 5 min`
              : 'Sin datos'}
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
          {/* % / Proy. */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {['%', 'Proy.'].map(m => (
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
                  horas === o.value ? 'bg-cyan-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >{o.label}</button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl bg-slate-100 animate-pulse h-40" />
      )}
      {error && !loading && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-xs text-red-500 text-center">
          {error}
        </div>
      )}
      {!loading && !error && !hasDatos && (
        <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-8 text-center text-xs text-slate-400">
          Sin snapshots de avance OT en las últimas {horas}h.
          <br />
          <span className="text-[10px]">El sistema captura automáticamente cada 5 min.</span>
        </div>
      )}

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
                    {esCelula ? 'Célula' : 'Microcelda'}
                  </th>
                  {tiempos.map(t => (
                    <th key={t} className="px-1 py-1.5 text-center font-medium text-slate-400 border-b border-slate-100"
                      style={{ minWidth: 32 }}>
                      {t}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-center font-semibold text-slate-500 border-b border-l border-slate-100 w-14">
                    Últ.
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map(({ key, celula }, idx) => {
                  const pts  = activeSeries[key] ?? []
                  const last = pts[pts.length - 1] ?? null

                  // ── % modo ──
                  const lastPct = last?.pct_avance ?? null
                  const ultCell = cellColor(lastPct)

                  // ── Proy. modo ──
                  const lastProy     = getProy(last)
                  const ultCellProy  = cellColor(lastProy)

                  // ── Breakdown para sub-fila expandida ──
                  let mcBreakdown = []
                  if (esCelula) {
                    mcBreakdown = (celMicros[key] ?? [])
                      .map(mc => {
                        const mcPts = baseSeries[mc] ?? []
                        const mcLast = mcPts[mcPts.length - 1]
                        return { mc, last: mcLast }
                      })
                      .sort((a, b) => {
                        if (modo === 'Proy.') {
                          return (getProy(a.last) ?? 0) - (getProy(b.last) ?? 0)
                        }
                        return (a.last?.pct_avance ?? 0) - (b.last?.pct_avance ?? 0)
                      })
                  }

                  const lastPunto = pts[pts.length - 1]
                  const isOpen    = expandidos.has(key)
                  const rowBg     = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                  const tdBg      = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'

                  // Proyección del último punto para fila expandida microcelda
                  const proyFinal = lastPunto
                    ? getProy(lastPunto)
                    : null
                  const cerradasUlt = (lastPunto?.completado ?? 0) + (lastPunto?.no_completado ?? 0)
                  const totalEjecUlt = cerradasUlt
                    + (lastPunto?.iniciado   ?? 0)
                    + (lastPunto?.pendiente  ?? 0)
                    + (lastPunto?.suspendido ?? 0)

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

                        if (modo === 'Proy.') {
                          const cerradas  = (p?.completado ?? 0) + (p?.no_completado ?? 0)
                          const porCerrar = (p?.iniciado   ?? 0) + (p?.pendiente    ?? 0) + (p?.suspendido ?? 0)
                          const proy      = p ? proyectarCierre(t, cerradas, porCerrar) : null
                          const { bg, text } = cellColor(proy)
                          return (
                            <td key={t}
                              className={`text-center py-1 border-b border-slate-100 ${bg} ${text} cursor-default`}
                              title={p
                                ? proy != null
                                  ? `${key} @ ${t}: proyecta ${Math.round(proy)}% al cierre · ritmo ${cerradas > 0 ? (cerradas / Math.max(1, timeToMin(t) - JORNADA_INICIO_MIN) * 60).toFixed(1) : '0'} OT/h`
                                  : `${key} @ ${t}: antes de las 07:00`
                                : 'Sin dato'}
                            >
                              {proy != null ? Math.round(proy) : ''}
                            </td>
                          )
                        }

                        const pct = p?.pct_avance ?? null
                        const { bg, text } = cellColor(pct)
                        return (
                          <td key={t}
                            className={`text-center py-1 border-b border-slate-100 ${bg} ${text} cursor-default`}
                            title={p ? `${key} @ ${t}: ${pct != null ? Math.round(pct) : '—'}% avance (${p.completado ?? 0}/${p.total ?? 0})` : 'Sin dato'}
                          >
                            {pct !== null ? (pct > 0 ? Math.round(pct) : '—') : ''}
                          </td>
                        )
                      })}

                      {/* Último snapshot */}
                      {modo === 'Proy.' ? (
                        <td className={`text-center px-1 py-1 font-bold border-l border-slate-100 ${ultCellProy.bg} ${ultCellProy.text}`}>
                          {lastProy != null ? Math.round(lastProy) + '%' : '—'}
                        </td>
                      ) : (
                        <td className={`text-center px-1 py-1 font-bold border-l border-slate-100 ${ultCell.bg} ${ultCell.text}`}>
                          {lastPct != null ? Math.round(lastPct) + '%' : '—'}
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
                              /* Microcelda → desglose de estados OT en último snapshot */
                              <>
                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                                  Desglose OT en {key}
                                </p>

                                {/* Bloque predictivo si modo Proy. */}
                                {modo === 'Proy.' && lastPunto && (
                                  <div className={`mb-2 px-2 py-1 rounded-lg text-[10px] font-medium ${
                                    proyFinal === null
                                      ? 'bg-slate-100 text-slate-400'
                                      : cellColor(proyFinal).bg + ' ' + cellColor(proyFinal).text
                                  }`}>
                                    {proyFinal === null
                                      ? 'Sin proyección disponible (antes de las 07:00 o sin OTs)'
                                      : `Proyecta cerrar ${Math.round(proyFinal)}% a las 18:00 al ritmo actual · ${cerradasUlt} cerradas de ${totalEjecUlt} ejecutables`
                                    }
                                  </div>
                                )}

                                {/* ── Por tipo de trabajo (datos en vivo) ── */}
                                {(() => {
                                  const liveItem = liveMcMap[key]
                                  const tipos = liveItem?.por_tipo ?? []
                                  if (!tipos.length) return null
                                  return (
                                    <div className="mt-3">
                                      <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                        Por tipo de trabajo · datos en vivo ({liveItem.total} OTs)
                                      </p>
                                      <div className="space-y-1.5">
                                        {(() => {
                                          // Hora actual para proyección por tipo
                                          const _now = new Date()
                                          const tNow = `${String(_now.getHours()).padStart(2,'0')}:${String(_now.getMinutes()).padStart(2,'0')}`
                                          return tipos.map(({ tipo, total: tTot, completado: tCom, no_completado: tNc, iniciado: tIni, pendiente: tPen, suspendido: tSus, pct_avance: tPct }) => {
                                            const tipoLabel  = toTitleCase(tipo)
                                            const esProy     = modo === 'Proy.'
                                            const proyTipo   = esProy
                                              ? proyectarCierre(tNow, tCom + tNc, tIni + tPen + tSus)
                                              : null
                                            const displayPct = esProy ? (proyTipo ?? null) : tPct
                                            const { bg: cBg } = cellColor(displayPct)
                                            return (
                                              <div key={tipo} className="flex items-center gap-2">
                                                <div className="w-40 shrink-0 truncate text-[10px] font-medium text-slate-700" title={tipoLabel}>
                                                  {tipoLabel}
                                                </div>
                                                <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                  <div className={`h-full rounded-full ${cBg} transition-all`}
                                                    style={{ width: `${Math.min(100, displayPct ?? 0)}%` }} />
                                                </div>
                                                <span className="text-[10px] tabular-nums text-slate-500 shrink-0 w-24 text-right">
                                                  {esProy
                                                    ? (proyTipo != null ? `${tCom + tNc}/${tTot} → ${Math.round(proyTipo)}%` : `${tCom + tNc}/${tTot} · —`)
                                                    : `${tCom + tNc}/${tTot} · ${Math.round(tPct)}%`
                                                  }
                                                </span>
                                              </div>
                                            )
                                          })
                                        })()}
                                      </div>
                                    </div>
                                  )
                                })()}
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
                                    {mcBreakdown.map(({ mc, last: mcLast }) => {
                                      let displayVal, barPct, c
                                      if (modo === 'Proy.') {
                                        const proy = getProy(mcLast)
                                        displayVal = proy != null ? `${Math.round(proy)}%` : '—'
                                        barPct     = proy ?? 0
                                        c          = cellColor(proy)
                                      } else {
                                        const pctAv = mcLast?.pct_avance ?? 0
                                        displayVal  = `${Math.round(pctAv)}%`
                                        barPct      = pctAv
                                        c           = cellColor(pctAv)
                                      }
                                      return (
                                        <div key={mc} className="flex items-center gap-2">
                                          <div className="w-32 shrink-0 truncate text-[10px] font-medium text-slate-700" title={mc}>
                                            {mc}
                                          </div>
                                          <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                            <div className={`h-full rounded-full ${c.bg} transition-all`}
                                              style={{ width: `${Math.min(100, barPct)}%` }} />
                                          </div>
                                          <span className="text-[10px] font-semibold tabular-nums text-slate-600 shrink-0 w-16 text-right">
                                            {displayVal}
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

          {/* Leyenda */}
          <div className="px-3 py-2 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 mb-1">
              {modo === 'Proy.'
                ? 'Proyección de cierre a las 18:00 basada en el ritmo desde las 07:00:'
                : '% avance operacional (completadas + inefectivas) / total ejecutable:'}
            </p>
            {modo === 'Proy.' ? <LeyendaProy /> : <Leyenda />}
          </div>
        </div>
      )}
    </div>
  )
}
