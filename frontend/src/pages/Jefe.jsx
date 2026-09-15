import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

/* ── Paginador reutilizable ── */
function Paginador({ page, total, pageSize, onChange }) {
  const pages = Math.ceil(total / pageSize)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between pt-2">
      <span className="text-[10px] text-slate-400">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 disabled:opacity-30 hover:bg-slate-50"
        >
          ‹
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
              p === page
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === pages}
          className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 disabled:opacity-30 hover:bg-slate-50"
        >
          ›
        </button>
      </div>
    </div>
  )
}

/* ── Helpers ── */
function Badge({ children, color = 'slate' }) {
  const cls = {
    slate:   'bg-slate-100 text-slate-600',
    green:   'bg-emerald-100 text-emerald-700',
    amber:   'bg-amber-100 text-amber-700',
    red:     'bg-red-100 text-red-700',
    blue:    'bg-blue-100 text-blue-700',
    indigo:  'bg-indigo-100 text-indigo-700',
    purple:  'bg-purple-100 text-purple-700',
    orange:  'bg-orange-100 text-orange-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls[color] || cls.slate}`}>
      {children}
    </span>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )
}

function NivelDot({ nivel }) {
  const colors = { critica: 'bg-red-500', moderada: 'bg-amber-400', leve: 'bg-blue-400' }
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[nivel] || 'bg-slate-300'}`} />
}

/* ── Sub-tab buttons ── */
const SUB_TABS = [
  { id: 'supervisores', label: '👷 Supervisores' },
  { id: 'alarmas',      label: '🔔 Alarmas' },
  { id: 'config',       label: '⚙️ Config' },
]

function SubTabBtn({ id, current, onClick, children }) {
  const active = current === id
  return (
    <button
      onClick={() => onClick(id)}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      className={`flex-1 px-2 py-2.5 text-xs font-semibold transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════
   Modal de Reasignación
══════════════════════════════════════════════════════════════ */
function ModalReasignar({ alarma, supervisores, onConfirm, onClose }) {
  const [supId, setSupId] = useState('')
  const [saving, setSaving] = useState(false)
  const opciones = supervisores.filter(s => s.id !== alarma.asignado_a)

  const handleConfirm = async () => {
    if (!supId) return
    setSaving(true)
    try {
      await onConfirm(alarma.id, Number(supId))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl">
        <p className="text-sm font-bold text-slate-800 mb-1">Reasignar alarma</p>
        <p className="text-xs text-slate-500 mb-4">
          Técnico: <span className="font-semibold">{alarma.tecnico}</span> · {alarma.celula}
        </p>
        <select
          value={supId}
          onChange={e => setSupId(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        >
          <option value="">Selecciona supervisor destino…</option>
          {opciones.map(s => (
            <option key={s.id} value={s.id}>
              {s.full_name} {s.online ? '● online' : '○ offline'} — {s.alarmas_activas} activas
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!supId || saving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Reasignar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB: Supervisores
══════════════════════════════════════════════════════════════ */
const PAGE_SIZE_SUPS = 5

function SupervisoresTab({ sups, loading, onToggleDisponible, toggling }) {
  const [page, setPage] = useState(1)

  // Resetear página cuando cambian los supervisores
  useEffect(() => { setPage(1) }, [sups.length])

  if (loading) return <Spinner />
  if (!sups.length) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-8 text-xs text-slate-400 text-center">
        No hay supervisores ccot registrados.
      </div>
    )
  }

  const paginated = sups.slice((page - 1) * PAGE_SIZE_SUPS, page * PAGE_SIZE_SUPS)

  return (
    <div className="space-y-2">
      {paginated.map(s => {
        const totalActivas = s.alarmas_activas
        const cargaColor = totalActivas >= 4 ? 'red' : totalActivas >= 2 ? 'amber' : 'green'
        return (
          <div
            key={s.id}
            className={`rounded-xl border p-3 ${s.online ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}
          >
            {/* Header */}
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${s.online ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                  <p className="text-sm font-bold text-slate-800 truncate">{s.full_name}</p>
                  <Badge color={s.disponible ? 'green' : 'slate'}>
                    {s.disponible ? 'Disponible' : 'No disponible'}
                  </Badge>
                  {s.online && <Badge color="indigo">Online</Badge>}
                </div>
                <p className="text-[10px] text-slate-400 ml-4 mt-0.5">@{s.username}</p>
              </div>
              {/* Toggle disponible */}
              <button
                onClick={() => onToggleDisponible(s.id, !s.disponible)}
                disabled={toggling === s.id}
                className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${
                  s.disponible
                    ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                } disabled:opacity-50`}
              >
                {toggling === s.id ? '…' : s.disponible ? 'Desactivar' : 'Activar'}
              </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              <div className={`rounded-lg px-2 py-1.5 border ${
                totalActivas === 0 ? 'bg-white border-slate-100' : `bg-${cargaColor}-50 border-${cargaColor}-200`
              }`}>
                <p className={`text-base font-bold tabular-nums text-${cargaColor}-600`}>{totalActivas}</p>
                <p className="text-[10px] text-slate-400">Activas ahora</p>
              </div>
              <div className="rounded-lg px-2 py-1.5 border bg-white border-slate-100">
                <p className="text-base font-bold tabular-nums text-slate-700">{s.cerradas_hoy ?? 0}</p>
                <p className="text-[10px] text-slate-400">Cerradas hoy</p>
              </div>
              <div className="rounded-lg px-2 py-1.5 border bg-white border-slate-100">
                <p className={`text-base font-bold tabular-nums ${s.sla_pct !== null ? (s.sla_pct >= 80 ? 'text-emerald-600' : s.sla_pct >= 60 ? 'text-amber-600' : 'text-red-600') : 'text-slate-400'}`}>
                  {s.sla_pct !== null ? `${s.sla_pct}%` : '—'}
                </p>
                <p className="text-[10px] text-slate-400">SLA cumplido</p>
              </div>
              <div className="rounded-lg px-2 py-1.5 border bg-white border-slate-100">
                <p className="text-base font-bold tabular-nums text-slate-700">
                  {s.tiempo_medio_min !== null ? `${s.tiempo_medio_min}m` : '—'}
                </p>
                <p className="text-[10px] text-slate-400">T° medio resolución</p>
              </div>
            </div>

            {/* Barra de carga */}
            {totalActivas > 0 && (
              <div className="mt-2 flex gap-1">
                <div className="flex-1 flex gap-0.5 items-center">
                  <span className="text-[10px] text-slate-400 w-16 shrink-0">
                    {s.alarmas_abiertas} abiertas · {s.alarmas_en_gestion} en gestión
                  </span>
                </div>
                {s.documentadas_pct !== null && (
                  <Badge color="purple">{s.documentadas_pct}% documentadas</Badge>
                )}
              </div>
            )}
          </div>
        )
      })}
      <Paginador page={page} total={sups.length} pageSize={PAGE_SIZE_SUPS} onChange={setPage} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB: Alarmas activas con reasignación
══════════════════════════════════════════════════════════════ */
const PAGE_SIZE_ALARMAS = 8

function AlarmasTab({ alarmas, sups, loading, onReasignar }) {
  const [modal, setModal] = useState(null)  // alarma seleccionada
  const [page, setPage]   = useState(1)

  useEffect(() => { setPage(1) }, [alarmas.length])

  const handleConfirm = async (alarmaId, supId) => {
    await onReasignar(alarmaId, supId)
    setModal(null)
  }

  if (loading) return <Spinner />

  if (!alarmas.length) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-8 text-xs text-emerald-600 text-center font-semibold">
        ✅ Sin alarmas activas ahora mismo
      </div>
    )
  }

  const nivelOrder = { critica: 0, moderada: 1, leve: 2 }
  const sorted = [...alarmas].sort((a, b) => (nivelOrder[a.nivel] ?? 3) - (nivelOrder[b.nivel] ?? 3))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE_ALARMAS, page * PAGE_SIZE_ALARMAS)

  return (
    <>
      <div className="space-y-2">
        {paginated.map(a => (
          <div key={a.id} className={`rounded-xl border p-3 ${
            a.nivel === 'critica' ? 'border-red-200 bg-red-50/40'
            : a.nivel === 'moderada' ? 'border-amber-200 bg-amber-50/40'
            : 'border-blue-200 bg-blue-50/20'
          }`}>
            <div className="flex items-start gap-2">
              <NivelDot nivel={a.nivel} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs font-bold text-slate-800">{a.tecnico}</p>
                  <Badge color={a.nivel === 'critica' ? 'red' : a.nivel === 'moderada' ? 'amber' : 'blue'}>
                    {a.nivel}
                  </Badge>
                  <Badge color={a.estado === 'en_gestion' ? 'purple' : 'slate'}>
                    {a.estado === 'en_gestion' ? 'En gestión' : 'Abierta'}
                  </Badge>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {a.celula} · {a.microcelda}
                </p>
                <p className="text-[10px] text-slate-400">
                  Asignada a: <span className="font-semibold">{a.asignado_nombre || 'Sin asignar'}</span>
                  {a.minutos_retraso_inicio ? ` · ${a.minutos_retraso_inicio}m retraso` : ''}
                </p>
              </div>
              <button
                onClick={() => setModal(a)}
                className="shrink-0 px-2.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-700 font-semibold hover:bg-indigo-100"
              >
                Reasignar
              </button>
            </div>
          </div>
        ))}
      </div>

      <Paginador page={page} total={alarmas.length} pageSize={PAGE_SIZE_ALARMAS} onChange={setPage} />

      {modal && (
        <ModalReasignar
          alarma={modal}
          supervisores={sups}
          onConfirm={handleConfirm}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB: Configuración
══════════════════════════════════════════════════════════════ */
function ConfigTab({ config, loading, onSave }) {
  const [val, setVal] = useState(config?.max_alarmas_sup ?? 5)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (config?.max_alarmas_sup !== undefined) setVal(config.max_alarmas_sup)
  }, [config])

  const handleSave = async () => {
    const n = Number(val)
    if (!n || n < 1 || n > 50) { toast.error('Debe ser entre 1 y 50'); return }
    setSaving(true)
    try {
      await onSave(n)
      toast.success('Configuración guardada')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-bold text-slate-700 mb-1">Capacidad máxima por supervisor</p>
        <p className="text-[11px] text-slate-400 mb-3">
          Número máximo de alarmas activas simultáneas que puede manejar un supervisor ccot. El sistema deja las alarmas en cola si todos los supervisores están al tope.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={50}
            value={val}
            onChange={e => setVal(e.target.value)}
            className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-xs text-slate-500">alarmas / supervisor</span>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 hover:bg-indigo-700"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-[11px] text-amber-700 font-semibold">⚠️ Efecto inmediato</p>
        <p className="text-[10px] text-amber-600 mt-0.5">
          El nuevo cap se aplica en el próximo ciclo de detección de alarmas. Las alarmas ya asignadas no se redistribuyen automáticamente.
        </p>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   KPI Banner
══════════════════════════════════════════════════════════════ */
function KpiBanner({ sups, alarmas, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[1,2,3,4].map(i => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}
      </div>
    )
  }

  const online   = sups.filter(s => s.online).length
  const disponib = sups.filter(s => s.disponible).length
  const criticas = alarmas.filter(a => a.nivel === 'critica').length
  const totalAct = alarmas.length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[
        { label: 'Supervisores online',   val: online,    color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', sub: `de ${sups.length} total` },
        { label: 'Disponibles',           val: disponib,  color: 'text-indigo-600',  bg: 'bg-indigo-50 border-indigo-200',   sub: 'para recibir alarmas' },
        { label: 'Alarmas activas',       val: totalAct,  color: totalAct > 0 ? 'text-amber-600' : 'text-slate-400', bg: totalAct > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200', sub: 'abiertas + en gestión' },
        { label: 'Críticas',              val: criticas,  color: criticas > 0 ? 'text-red-600' : 'text-slate-400',   bg: criticas > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200',   sub: 'requieren atención' },
      ].map(({ label, val, color, bg, sub }) => (
        <div key={label} className={`rounded-xl border ${bg} px-3 py-2.5`}>
          <p className={`text-xl font-bold leading-none tabular-nums ${color}`}>{val}</p>
          <p className="text-[11px] text-slate-400 font-medium mt-1">{label}</p>
          {sub && <p className="text-[10px] text-slate-400 opacity-70 mt-0.5">{sub}</p>}
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function Jefe() {
  const [subTab,   setSubTab]   = useState('supervisores')
  const [sups,     setSups]     = useState([])
  const [alarmas,  setAlarmas]  = useState([])
  const [config,   setConfig]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [toggling, setToggling] = useState(null)  // sup_id en proceso de toggle
  const timerRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const [supsRes, alarmasRes, configRes] = await Promise.all([
        api.get('/jefe/supervisores'),
        api.get('/jefe/alarmas'),
        api.get('/jefe/config'),
      ])
      setSups(supsRes.data)
      setAlarmas(alarmasRes.data)
      setConfig(configRes.data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    timerRef.current = setInterval(fetchAll, 30_000)
    return () => clearInterval(timerRef.current)
  }, [fetchAll])

  const handleToggleDisponible = async (supId, nuevoEstado) => {
    setToggling(supId)
    try {
      await api.patch(`/jefe/supervisores/${supId}/disponible`, { disponible: nuevoEstado })
      setSups(prev => prev.map(s => s.id === supId ? { ...s, disponible: nuevoEstado } : s))
      toast.success(nuevoEstado ? 'Supervisor activado' : 'Supervisor desactivado')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cambiar disponibilidad')
    } finally {
      setToggling(null)
    }
  }

  const handleReasignar = async (alarmaId, supId) => {
    try {
      const { data } = await api.patch(`/jefe/alarmas/${alarmaId}/reasignar`, { supervisor_id: supId })
      setAlarmas(prev => prev.map(a => a.id === alarmaId ? { ...a, asignado_a: data.asignado_a, asignado_nombre: data.asignado_nombre } : a))
      toast.success(`Alarma reasignada a ${data.asignado_nombre}`)
      // Refrescar sups para actualizar cargas
      const supsRes = await api.get('/jefe/supervisores')
      setSups(supsRes.data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al reasignar')
    }
  }

  const handleSaveConfig = async (maxAlarmas) => {
    const { data } = await api.patch('/jefe/config', { max_alarmas_sup: maxAlarmas })
    setConfig(data)
  }

  return (
    <div className="space-y-3 pb-2">
      {/* KPI Banner */}
      <KpiBanner sups={sups} alarmas={alarmas} loading={loading} />

      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-slate-400">Actualiza cada 30 s</p>
        <button
          onClick={() => { setLoading(true); fetchAll() }}
          className="text-[10px] text-indigo-500 font-semibold hover:text-indigo-700"
        >
          ↻ Refrescar
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex rounded-xl overflow-hidden border border-slate-200">
        {SUB_TABS.map(({ id, label }) => (
          <SubTabBtn key={id} id={id} current={subTab} onClick={setSubTab}>
            {label}
            {id === 'alarmas' && alarmas.length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[9px] px-1 rounded-full">{alarmas.length}</span>
            )}
          </SubTabBtn>
        ))}
      </div>

      {/* Contenido por sub-tab */}
      {subTab === 'supervisores' && (
        <SupervisoresTab
          sups={sups}
          loading={loading}
          onToggleDisponible={handleToggleDisponible}
          toggling={toggling}
        />
      )}
      {subTab === 'alarmas' && (
        <AlarmasTab
          alarmas={alarmas}
          sups={sups}
          loading={loading}
          onReasignar={handleReasignar}
        />
      )}
      {subTab === 'config' && (
        <ConfigTab
          config={config}
          loading={loading}
          onSave={handleSaveConfig}
        />
      )}
    </div>
  )
}
