import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import useAuth from '../hooks/useAuth'
import FiltrosPanel from '../components/FiltrosPanel'
import TablaRetrasos from '../components/TablaRetrasos'
import TablaParadas from '../components/TablaParadas'
import TablaTecnicos from '../components/TablaTecnicos'
import ModalDetalle from '../components/ModalDetalle'
import BottomNav from '../components/BottomNav'
import useTabStore from '../hooks/useTabStore'
import { useActividad } from '../hooks/useActividad'
import ResumenPanel from '../components/ResumenPanel'
import Historico from './Historico'
import AvanceMapaView from '../components/AvanceMapaView'
import Prediccion6pm from '../components/Prediccion6pm'
import RetrasoActualView from '../components/RetrasoActualView'
import Usuarios from './Usuarios'
import Admin from './Admin'
import ProductividadView from '../components/ProductividadView'

/* ─── KPI banner compacto ─────────────────────────────────────── */
function KpiCard({ label, value, color = 'slate', sub }) {
  const colors = {
    slate:  'bg-white border-slate-200 text-slate-800',
    red:    'bg-red-50 border-red-200 text-red-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
  }
  const labelColors = {
    slate: 'text-slate-400', red: 'text-red-400', amber: 'text-amber-400',
    green: 'text-green-400', blue: 'text-blue-400',
  }
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${colors[color]}`}>
      <p className={`text-xl sm:text-2xl font-bold leading-none tabular-nums`}>{value ?? '—'}</p>
      <p className={`text-[11px] font-medium mt-1 leading-snug ${labelColors[color]}`}>{label}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${labelColors[color]} opacity-70`}>{sub}</p>}
    </div>
  )
}

function KpiBanner({ stats, loading }) {
  const Skeleton = () => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
      ))}
    </div>
  )
  if (loading || !stats) return <Skeleton />
  const pctCumpl = stats.cumplimiento_time_slot_dia ?? 0
  const pctRet   = stats.porcentaje_retrasados ?? 0
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <KpiCard label="Total técnicos"   value={stats.total_tecnicos}             color="slate" />
      <KpiCard label="Con retraso"      value={stats.tecnicos_retrasados}
        sub={`${pctRet.toFixed(1)}%`}
        color={stats.tecnicos_retrasados > 0 ? 'red' : 'green'} />
      <KpiCard label="Paradas futuras"  value={stats.tecnicos_con_parada_futura}
        color={stats.tecnicos_con_parada_futura > 0 ? 'amber' : 'slate'} />
      <KpiCard label="Cumplimiento"     value={`${pctCumpl.toFixed(1)}%`}
        color={pctCumpl >= 80 ? 'green' : pctCumpl >= 50 ? 'amber' : 'red'} />
    </div>
  )
}

/* ─── Sub-tab button ──────────────────────────────────────────── */
function SubTabBtn({ id, current, onClick, children, count, activeColor = 'bg-slate-800 text-white' }) {
  const active = current === id
  return (
    <button
      onClick={() => onClick(id)}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      className={`flex-1 px-2 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
        active ? activeColor : 'bg-white text-slate-500 hover:bg-slate-50'
      }`}
    >
      {children}
      {count != null && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'
        }`}>
          {count}
        </span>
      )}
    </button>
  )
}

/* ─── Tab: En curso ───────────────────────────────────────────── */
function EnCursoTab({ loading, stats, statsDisplay, tabRetrasos, tabParadas, tabTecnicos, onDetalle, filtros, hasScopedRole, filtrosOpen, setFiltrosOpen, zonas, setFiltros }) {
  const [subTab, setSubTab] = useState('retrasos')
  const [showResumen, setShowResumen] = useState(false)

  return (
    <div className="space-y-3">

      {/* Filtros colapsables */}
      {filtrosOpen && (
        <FiltrosPanel filtros={filtros} onChange={setFiltros} zonas={zonas} onClose={() => setFiltrosOpen(false)} />
      )}

      {/* KPI Banner */}
      <KpiBanner stats={statsDisplay} loading={loading} />

      {/* Toggle resumen completo */}
      <button
        onClick={() => setShowResumen(v => !v)}
        className="w-full text-xs text-slate-400 flex items-center justify-center gap-1 py-1 hover:text-slate-600 transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${showResumen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {showResumen ? 'Ocultar resumen' : 'Ver resumen completo'}
      </button>

      {showResumen && (
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <ResumenPanel stats={statsDisplay} loading={loading} />
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex rounded-xl overflow-hidden border border-slate-200">
        <SubTabBtn id="retrasos" current={subTab} onClick={setSubTab}
          count={tabRetrasos.length} activeColor="bg-red-600 text-white">
          ⏱ Retrasos
        </SubTabBtn>
        <SubTabBtn id="paradas" current={subTab} onClick={setSubTab}
          count={tabParadas.length} activeColor="bg-amber-500 text-white">
          ⏸ Paradas
        </SubTabBtn>
        <SubTabBtn id="todos" current={subTab} onClick={setSubTab}
          count={tabTecnicos.length} activeColor="bg-blue-600 text-white">
          👷 Todos
        </SubTabBtn>
      </div>

      {/* Contenido */}
      {subTab === 'retrasos' && (
        <TablaRetrasos datos={loading ? null : tabRetrasos} onDetalle={onDetalle} />
      )}
      {subTab === 'paradas' && (
        <TablaParadas datos={loading ? null : tabParadas} />
      )}
      {subTab === 'todos' && (
        <TablaTecnicos datos={loading ? null : tabTecnicos} onDetalle={onDetalle} />
      )}
    </div>
  )
}

/* ─── Tab: Mapas ──────────────────────────────────────────────── */
function MapasTab({ rows, filtros, loading, onDetalle, avance, avanceLoading }) {
  const [subTab, setSubTab] = useState('retrasos')
  const celulaFiltro = filtros?.celula ?? ''
  return (
    <div className="space-y-3">
      <div className="flex rounded-xl overflow-hidden border border-slate-200">
        <SubTabBtn id="retrasos" current={subTab} onClick={setSubTab}
          activeColor="bg-red-600 text-white">
          🔴 Retrasos actuales
        </SubTabBtn>
        <SubTabBtn id="prediccion" current={subTab} onClick={setSubTab}
          activeColor="bg-slate-800 text-white">
          🏁 Predicción 6pm
        </SubTabBtn>
        <SubTabBtn id="avance" current={subTab} onClick={setSubTab}
          activeColor="bg-emerald-600 text-white">
          📊 Avance operación
        </SubTabBtn>
      </div>

      {subTab === 'retrasos' && (
        <RetrasoActualView
          rows={loading ? [] : rows}
          filtros={filtros}
          loading={loading}
          onDetalle={onDetalle}
        />
      )}

      {subTab === 'prediccion' && (
        <Prediccion6pm rows={loading ? [] : rows} filtros={filtros} onDetalle={onDetalle} />
      )}

      {subTab === 'avance' && (
        <AvanceMapaView
          celulaFiltro={celulaFiltro}
          avance={avance}
          loading={avanceLoading}
          rows={loading ? [] : rows}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Dashboard principal
══════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { user, setAuth } = useAuth()
  const hasScopedRole = user?.role === 'lider_celula' || user?.role === 'supervisor_microcelda'
  // Lista efectiva de microceldas del supervisor (soporta múltiples)
  const userMicroceldas = user?.microceldas?.length
    ? user.microceldas
    : (user?.microcelda ? [user.microcelda] : [])

  const [rows, setRows]           = useState(null)
  const [stats, setStats]         = useState(null)
  const [zonas, setZonas]         = useState({})
  const [loading, setLoading]     = useState(false)
  const [avance, setAvance]             = useState(null)
  const [avanceLoading, setAvanceLoading] = useState(true)
  const { activeTab, setActiveTab } = useTabStore()

  // Tracking silencioso de uso por pestaña
  const TAB_EVENTO = {
    encurso:       'tab_dashboard',
    mapas:         'tab_avance',
    tendencias:    'tab_historico',
    productividad: 'tab_productividad',
    usuarios:      'tab_usuarios',
    snapshots:     'tab_admin',
  }
  useActividad(TAB_EVENTO[activeTab] || null)

  const [detalleTecnico, setDetalleTecnico] = useState(null)
  const [lastUpdate, setLastUpdate]         = useState(null)
  const [filtrosOpen, setFiltrosOpen]       = useState(false)
  const [settingsOpen, setSettingsOpen]     = useState(false)
  const settingsRef                         = useRef(null)
  const [filtros, setFiltros] = useState({ celula: '', microcelda: '', tecnico: '', solo_retraso: false })

  /* ── Auto-refresh ─────────────────────────────────────────── */
  const REFRESH_OPTS = [
    { label: 'Off', value: 0       },
    { label: '5m',  value: 5  * 60 },
    { label: '10m', value: 10 * 60 },
    { label: '15m', value: 15 * 60 },
  ]
  const [refreshSecs, setRefreshSecs] = useState(5 * 60)
  const [countdown,   setCountdown]   = useState(5 * 60)
  const intervalRef = useRef(null)
  const countRef    = useRef(refreshSecs)

  const fetchAvance = useCallback(async () => {
    setAvanceLoading(true)
    try {
      const { data } = await api.get('/avance-ot')
      setAvance(data)
    } catch { /* silencioso */ }
    finally { setAvanceLoading(false) }
  }, [])

  const fetchDatos = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/datos')
      setRows(data.datos ?? [])
      setStats(data.estadisticas ?? null)
      setLastUpdate(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }))
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchZonas = useCallback(async () => {
    try {
      const { data } = await api.get('/zonas')
      setZonas(data.zonas ?? {})
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    fetchDatos()
    fetchZonas()
    fetchAvance()
    api.get('/auth/me').then(({ data }) => {
      const token = localStorage.getItem('tecnicos_token')
      if (token) setAuth(token, data)
    }).catch(() => {})
  }, []) // eslint-disable-line

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (refreshSecs === 0) { setCountdown(0); return }
    countRef.current = refreshSecs
    setCountdown(refreshSecs)
    intervalRef.current = setInterval(() => {
      countRef.current -= 1
      setCountdown(countRef.current)
      if (countRef.current <= 0) {
        countRef.current = refreshSecs
        setCountdown(refreshSecs)
        fetchDatos()
      }
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [refreshSecs, fetchDatos])

  /* ── Filtrado local ───────────────────────────────────────── */
  // Normalizar a minúsculas+trim para comparaciones de scope (el casing de MySQL
  // puede diferir del almacenado en user.microceldas / user.celula)
  const userCelulaLow  = (user?.celula ?? '').trim().toLowerCase()
  const microSetLow    = new Set(userMicroceldas.map(m => m.trim().toLowerCase()))

  const filtrarLocal = (lista) => {
    if (!lista) return []
    return lista.filter((r) => {
      // Scope forzado por el rol del usuario logueado (comparación case-insensitive)
      if (hasScopedRole && userCelulaLow && (r.celula ?? '').trim().toLowerCase() !== userCelulaLow) return false
      if (user?.role === 'supervisor_microcelda' && microSetLow.size > 0 && !microSetLow.has((r.microcelda ?? '').trim().toLowerCase())) return false
      // Filtros aplicados manualmente
      if (filtros.tecnico    && !r['Técnico']?.toLowerCase().includes(filtros.tecnico.toLowerCase())) return false
      if (filtros.celula     && r.celula     !== filtros.celula)     return false
      if (filtros.microcelda && r.microcelda !== filtros.microcelda) return false
      return true
    })
  }

  const allRows    = rows ?? []
  const retrasados = allRows.filter(r => r.estado_actual === 'Retraso actual' || r.estado_actual === 'Retraso en siguiente')
  const conParada  = allRows.filter(r => r.estado_siguiente === 'Parada futura')

  const tabRetrasos = filtrarLocal(retrasados)
  const tabParadas  = filtrarLocal(conParada)
  const tabTecnicos = filtrarLocal(filtros.solo_retraso ? retrasados : allRows)

  const hayFiltros = filtros.celula || filtros.microcelda || filtros.tecnico || filtros.solo_retraso

  // Célula/microcelda efectivas para propagar a sub-vistas:
  // si el rol ya tiene scope propio, ese scope tiene prioridad sobre los filtros manuales
  const celulaEfectiva = hasScopedRole ? (user?.celula ?? '') : filtros.celula
  // microceldaEfectiva: truthy cuando hay scope de microcelda (sea 1 o N microceldas)
  const microceldaEfectiva = user?.role === 'supervisor_microcelda' && userMicroceldas.length > 0
    ? userMicroceldas[0]   // valor truthy; el filtrado real usa userMicroceldas.includes()
    : filtros.microcelda

  // Filas ya acotadas al scope del usuario (usadas en Mapas y Tendencias)
  const scopedRows = filtrarLocal(allRows)

  const computarStats = (filas) => {
    if (!filas?.length) return null
    const total        = filas.length
    const retrasados_  = filas.filter(r => r.estado_actual === 'Retraso actual').length
    const retrasoSig   = filas.filter(r => r.estado_actual === 'Retraso en siguiente').length
    const conParadaF   = filas.filter(r => r.estado_siguiente === 'Parada futura').length
    const minRetrasos  = filas.map(r => Number(r.minutos_retraso) || 0).filter(v => v > 0)
    const promedioRet  = minRetrasos.length ? minRetrasos.reduce((a, b) => a + b, 0) / minRetrasos.length : 0
    const maxRet       = minRetrasos.length ? Math.max(...minRetrasos) : 0
    const pendientes   = filas.reduce((a, r) => a + (Number(r.pendientes_post_siguiente) || 0), 0)
    const cumpVals     = filas.map(r => Number(r.cumplimiento_time_slot_dia) || 0)
    const cumplimiento = cumpVals.length ? cumpVals.reduce((a, b) => a + b, 0) / cumpVals.length : 0
    return {
      total_tecnicos: total,
      tecnicos_retrasados: retrasados_,
      tecnicos_retraso_siguiente: retrasoSig,
      tecnicos_con_parada_futura: conParadaF,
      promedio_retraso: parseFloat(promedioRet.toFixed(1)),
      max_retraso: parseFloat(maxRet.toFixed(1)),
      total_pendientes: pendientes,
      promedio_completados: 0,
      promedio_no_completados: 0,
      porcentaje_retrasados: total ? parseFloat((retrasados_ / total * 100).toFixed(1)) : 0,
      cumplimiento_norma: 0,
      cumplimiento_time_slot_dia: parseFloat(cumplimiento.toFixed(1)),
    }
  }

  // Si el usuario tiene scope de célula/microcelda o hay filtros activos,
  // calculamos los stats desde las filas filtradas en lugar de usar los globales del API
  const statsDisplay = (hasScopedRole || hayFiltros) ? computarStats(filtrarLocal(allRows)) : stats

  const tituloZona = user?.role === 'supervisor_microcelda'
    ? userMicroceldas.length > 1
      ? `${user.celula ?? ''} / ${userMicroceldas.length} microceldas`
      : `${user.celula ?? ''} / ${userMicroceldas[0] ?? ''}`
    : user?.role === 'lider_celula'
    ? `Célula ${user.celula ?? ''}`
    : filtros.microcelda
      ? `${filtros.celula} · ${filtros.microcelda}`
      : filtros.celula || 'Región Occidente'

  const handleRefresh = () => {
    fetchDatos()
    fetchAvance()
    if (refreshSecs > 0) { countRef.current = refreshSecs; setCountdown(refreshSecs) }
    setSettingsOpen(false)
  }

  /* Cierra el popover al hacer click fuera */
  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [settingsOpen])

  return (
    <>
      <div className="max-w-4xl mx-auto px-3 py-3 space-y-3">

        {/* ── Barra superior — oculta en la sección de usuarios ── */}
        {activeTab !== 'usuarios' && <div className="flex items-center justify-between gap-2">

          {/* Zona + timestamps */}
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-slate-800 font-bold text-sm sm:text-base truncate">{tituloZona}</h1>
            <div className="flex items-center gap-1 shrink-0">
              {lastUpdate && (
                <span className="text-[10px] sm:text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {lastUpdate}
                </span>
              )}
              {refreshSecs > 0 && !loading && (
                <span className="text-[10px] sm:text-xs text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full tabular-nums">
                  🔄 {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                </span>
              )}
            </div>
          </div>

          {/* Controles */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Filtros — solo tabs que los usan */}
            {!hasScopedRole && (
              <button
                onClick={() => setFiltrosOpen(v => !v)}
                className="relative flex items-center gap-1 px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-600"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                <span className="hidden sm:inline text-xs font-medium">Filtros</span>
                {hayFiltros && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
                )}
              </button>
            )}

            {/* ⚙ Settings popover */}
            <div className="relative shrink-0" ref={settingsRef}>
              <button
                onClick={() => setSettingsOpen(v => !v)}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                className={`relative w-9 h-9 flex items-center justify-center rounded-xl border transition-colors ${
                  settingsOpen
                    ? 'bg-slate-800 border-slate-800 text-white'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {/* Punto indicador cuando polling activo */}
                {refreshSecs > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-500 border-2 border-white" />
                )}
              </button>

              {/* Popover */}
              {settingsOpen && (
                <div className="absolute right-0 top-11 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 w-52 space-y-3">
                  {/* Intervalo */}
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Auto-actualizar</p>
                    <div className="flex rounded-lg overflow-hidden border border-slate-200">
                      {REFRESH_OPTS.map((o) => (
                        <button
                          key={o.value}
                          onClick={() => setRefreshSecs(o.value)}
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                          className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                            refreshSecs === o.value ? 'bg-cyan-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actualizar ahora */}
                  <button
                    onClick={handleRefresh}
                    disabled={loading}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white text-xs font-semibold transition-colors"
                  >
                    <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Actualizar ahora
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>}

        {/* Filtros panel — solo para Mapas/Tendencias (En curso los maneja internamente) */}
        {filtrosOpen && activeTab !== 'encurso' && activeTab !== 'usuarios' && (
          <FiltrosPanel filtros={filtros} onChange={setFiltros} zonas={zonas} onClose={() => setFiltrosOpen(false)} />
        )}

        {/* ── Contenido por tab ── */}
        {activeTab === 'encurso' && (
          <EnCursoTab
            loading={loading}
            stats={stats}
            statsDisplay={statsDisplay}
            tabRetrasos={tabRetrasos}
            tabParadas={tabParadas}
            tabTecnicos={tabTecnicos}
            onDetalle={setDetalleTecnico}
            filtros={filtros}
            hasScopedRole={hasScopedRole}
            filtrosOpen={filtrosOpen}
            setFiltrosOpen={setFiltrosOpen}
            zonas={zonas}
            setFiltros={setFiltros}
          />
        )}

        {activeTab === 'mapas' && (
          <MapasTab
            rows={loading ? [] : scopedRows}
            filtros={filtros}
            loading={loading}
            onDetalle={setDetalleTecnico}
            avance={avance}
            avanceLoading={avanceLoading}
          />
        )}

        {activeTab === 'tendencias' && (
          <Historico
            celulaFiltro={celulaEfectiva}
            microceldaFiltro={microceldaEfectiva}
            microceldas={userMicroceldas}
            rows={loading ? [] : scopedRows}
            onDetalle={setDetalleTecnico}
            showMapa={false}
          />
        )}

        {activeTab === 'productividad' && (
          <ProductividadView celulaFiltro={celulaEfectiva} />
        )}

        {activeTab === 'usuarios' && <Usuarios />}

        {activeTab === 'snapshots' && user?.role === 'admin' && <Admin />}

      </div>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={{ encurso: tabRetrasos.length }}
        isAdmin={user?.role === 'admin'}
      />

      {detalleTecnico && (
        <ModalDetalle tecnico={detalleTecnico} onClose={() => setDetalleTecnico(null)} />
      )}
    </>
  )
}
