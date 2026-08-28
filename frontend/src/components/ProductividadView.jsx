import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'
import MapaCalorProductividad from './MapaCalorProductividad'
import ProductividadTecnicos from './ProductividadTecnicos'

/* ── Slider de peso individual ── */
function WeightSlider({ label, value, color, onChange }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-slate-600">{label}</span>
        <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${color}`}>
          {value}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-500"
      />
    </div>
  )
}

/* ── Panel de pesos configurables ── */
function WeightsPanel({ weights, onChange }) {
  const total = weights.avance + weights.calidad + weights.velocidad
  const ok    = total === 100

  const handleChange = (key, newVal) => {
    // Redistribuye el resto entre los otros dos proporcionalmente
    const otros = ['avance', 'calidad', 'velocidad'].filter(k => k !== key)
    const restante = 100 - newVal
    const sumOtros = otros.reduce((s, k) => s + weights[k], 0)

    let nuevo = { ...weights, [key]: newVal }
    if (sumOtros === 0) {
      // Distribuye equitativamente
      const parte = Math.floor(restante / 2)
      nuevo[otros[0]] = parte
      nuevo[otros[1]] = restante - parte
    } else {
      // Proporcional al valor actual
      let asignado = 0
      for (let i = 0; i < otros.length - 1; i++) {
        const k = otros[i]
        const v = Math.round((weights[k] / sumOtros) * restante)
        nuevo[k] = v
        asignado += v
      }
      nuevo[otros[otros.length - 1]] = restante - asignado
    }
    // Clamp todos a [0, 100]
    for (const k of Object.keys(nuevo)) {
      nuevo[k] = Math.max(0, Math.min(100, nuevo[k]))
    }
    onChange(nuevo)
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-indigo-700">⚖️ Pesos del score</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
          Total: {total}%
        </span>
      </div>

      <div className="flex gap-3">
        <WeightSlider
          label="Avance"
          value={weights.avance}
          color="bg-orange-100 text-orange-700"
          onChange={v => handleChange('avance', v)}
        />
        <WeightSlider
          label="Calidad"
          value={weights.calidad}
          color="bg-emerald-100 text-emerald-700"
          onChange={v => handleChange('calidad', v)}
        />
        <WeightSlider
          label="Velocidad"
          value={weights.velocidad}
          color="bg-blue-100 text-blue-700"
          onChange={v => handleChange('velocidad', v)}
        />
      </div>

      <p className="text-[9px] text-slate-400">
        Avance = OTs cerradas/ejecutables · Calidad = completadas/cerradas · Velocidad = proyección a 18:00
      </p>
    </div>
  )
}

/* ── KPI banner ── */
function KpiBanner({ data, loading }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}
      </div>
    )
  }

  const mcs = data.por_microcelda ?? []
  const tecs = data.por_tecnico   ?? []

  const avgAvance = mcs.length
    ? Math.round(mcs.reduce((s, m) => s + (m.avance ?? 0), 0) / mcs.length)
    : 0
  const avgCalidad = mcs.filter(m => m.calidad !== null).length
    ? Math.round(mcs.filter(m => m.calidad !== null).reduce((s, m) => s + m.calidad, 0) / mcs.filter(m => m.calidad !== null).length)
    : null
  const avgVelocidad = mcs.filter(m => m.velocidad !== null).length
    ? Math.round(mcs.filter(m => m.velocidad !== null).reduce((s, m) => s + m.velocidad, 0) / mcs.filter(m => m.velocidad !== null).length)
    : null

  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'Avance medio', val: `${avgAvance}%`,
          color: avgAvance >= 70 ? 'text-emerald-600' : avgAvance >= 40 ? 'text-amber-600' : 'text-red-600',
          bg: avgAvance >= 70 ? 'bg-emerald-50 border-emerald-200' : avgAvance >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200',
          sub: `${mcs.length} microceldas` },
        { label: 'Calidad media', val: avgCalidad !== null ? `${avgCalidad}%` : '—',
          color: avgCalidad === null ? 'text-slate-400' : avgCalidad >= 80 ? 'text-emerald-600' : avgCalidad >= 60 ? 'text-amber-600' : 'text-red-600',
          bg: avgCalidad === null ? 'bg-white border-slate-200' : avgCalidad >= 80 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200',
          sub: 'completadas / cerradas' },
        { label: 'Velocidad media', val: avgVelocidad !== null ? `${avgVelocidad}%` : '—',
          color: avgVelocidad === null ? 'text-slate-400' : avgVelocidad >= 70 ? 'text-blue-600' : avgVelocidad >= 40 ? 'text-amber-600' : 'text-red-600',
          bg: avgVelocidad === null ? 'bg-white border-slate-200' : avgVelocidad >= 70 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200',
          sub: data.hora_corte ? `A las ${data.hora_corte}` : 'Proyección a 18:00' },
      ].map(({ label, val, color, bg, sub }) => (
        <div key={label} className={`rounded-xl border ${bg} px-3 py-2.5`}>
          <p className={`text-xl font-bold leading-none tabular-nums ${color}`}>{val}</p>
          <p className="text-[11px] text-slate-400 font-medium mt-1 leading-snug">{label}</p>
          {sub && <p className="text-[10px] text-slate-400 opacity-70 mt-0.5">{sub}</p>}
        </div>
      ))}
    </div>
  )
}

/* ── Vista sub-tab ── */
const SUB_TABS = [
  { id: 'heatmap',  label: '🗺️ Heatmap' },
  { id: 'tecnicos', label: '👷 Técnicos' },
]

function SubTabBtn({ id, current, onClick, children }) {
  const active = current === id
  return (
    <button
      onClick={() => onClick(id)}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      className={`flex-1 px-2 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
        active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function ProductividadView({ celulaFiltro = '' }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [subTab,  setSubTab]  = useState('heatmap')

  const [weights, setWeights] = useState({ avance: 50, calidad: 35, velocidad: 15 })

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const params = celulaFiltro ? `?celula=${encodeURIComponent(celulaFiltro)}` : ''
      const { data: res } = await api.get(`/productividad/tecnicos${params}`)
      setData(res)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cargar productividad')
    } finally {
      setLoading(false)
    }
  }, [celulaFiltro])

  useEffect(() => { cargar() }, [cargar])

  const porMicrocelda = data?.por_microcelda ?? []
  const porTecnico    = data?.por_tecnico    ?? []

  return (
    <div className="space-y-3 pb-2">

      {/* KPI Banner */}
      <KpiBanner data={data} loading={loading} />

      {/* Pesos configurables */}
      <WeightsPanel weights={weights} onChange={setWeights} />

      {/* Sub-tabs */}
      <div className="flex rounded-xl overflow-hidden border border-slate-200">
        {SUB_TABS.map(({ id, label }) => (
          <SubTabBtn key={id} id={id} current={subTab} onClick={setSubTab}>
            {label}
          </SubTabBtn>
        ))}
      </div>

      {/* Contenido */}
      {subTab === 'heatmap' && (
        <div className="bg-white rounded-xl border border-slate-100 p-3">
          <p className="text-xs font-bold text-slate-700 mb-3">Microceldas — métricas actuales</p>
          <MapaCalorProductividad
            porMicrocelda={porMicrocelda}
            weights={weights}
            loading={loading}
          />
        </div>
      )}

      {subTab === 'tecnicos' && (
        <ProductividadTecnicos
          porTecnico={porTecnico}
          weights={weights}
          loading={loading}
        />
      )}

    </div>
  )
}
