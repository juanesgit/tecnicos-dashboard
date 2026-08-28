import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import Usuarios from './Usuarios'

/* ══════════════════════════════════════════════════════════════
   Helpers
══════════════════════════════════════════════════════════════ */
function Badge({ children, color = 'slate' }) {
  const cls = {
    slate:  'bg-slate-100 text-slate-600',
    green:  'bg-green-100 text-green-700',
    amber:  'bg-amber-100 text-amber-700',
    red:    'bg-red-100 text-red-700',
    violet: 'bg-violet-100 text-violet-700',
    teal:   'bg-teal-100 text-teal-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls[color] || cls.slate}`}>
      {children}
    </span>
  )
}

function SubTabBtn({ id, current, onClick, icon, label }) {
  const active = current === id
  return (
    <button
      onClick={() => onClick(id)}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors rounded-xl ${
        active
          ? 'bg-slate-800 text-white'
          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </button>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB 1 — Monitor de Snapshots
══════════════════════════════════════════════════════════════ */
function MonitorTab() {
  const [snapshots, setSnapshots] = useState([])
  const [stats, setStats]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [purging, setPurging]     = useState(false)
  const [dias, setDias]           = useState(7)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, stRes] = await Promise.all([
        api.get('/admin/snapshots?limit=200'),
        api.get('/admin/snapshots/stats'),
      ])
      setSnapshots(sRes.data.snapshots ?? [])
      setStats(stRes.data)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error cargando snapshots')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handlePurge = async () => {
    if (!confirm(`¿Eliminar snapshots con más de ${dias} días de antigüedad?`)) return
    setPurging(true)
    try {
      const { data } = await api.delete(`/admin/snapshots/purge?dias=${dias}`)
      toast.success(`${data.eliminados} snapshots eliminados (corte: ${data.corte})`)
      fetchData()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al purgar')
    } finally {
      setPurging(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-100 bg-white p-3 text-center">
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{stats.total_snapshots}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Snapshots totales</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3 text-center">
            <p className="text-xs font-bold text-slate-700 leading-tight">{stats.primer_snapshot ?? '—'}</p>
            <p className="text-[11px] text-slate-400 mt-1">Primer registro</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3 text-center">
            <p className="text-xs font-bold text-slate-700 leading-tight">{stats.ultimo_snapshot ?? '—'}</p>
            <p className="text-[11px] text-slate-400 mt-1">Último registro</p>
          </div>
        </div>
      )}

      {/* Purge control */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-700">Purgar snapshots</p>
          <p className="text-xs text-slate-400">Elimina registros más antiguos de N días</p>
        </div>
        <select
          value={dias}
          onChange={e => setDias(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          {[3, 7, 14, 30, 60, 90].map(d => (
            <option key={d} value={d}>{d} días</option>
          ))}
        </select>
        <button
          onClick={handlePurge}
          disabled={purging}
          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-200 text-white text-xs font-semibold transition-colors"
        >
          {purging ? 'Purgando…' : 'Purgar'}
        </button>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
        >
          ↻
        </button>
      </div>

      {/* Tabla de snapshots */}
      {loading ? <Spinner /> : (
        <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Últimos {snapshots.length} snapshots</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-3 py-2 font-semibold text-slate-500">Hora</th>
                  <th className="px-3 py-2 font-semibold text-slate-500 text-right">Total</th>
                  <th className="px-3 py-2 font-semibold text-slate-500 text-right">Retraso</th>
                  <th className="px-3 py-2 font-semibold text-slate-500 text-right">%</th>
                  <th className="px-3 py-2 font-semibold text-slate-500 text-right">Cumpl.</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map(s => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-slate-700">{s.captured_at}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{s.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={s.con_retraso > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}>{s.con_retraso}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Badge color={s.pct_retraso >= 20 ? 'red' : s.pct_retraso >= 10 ? 'amber' : 'green'}>
                        {s.pct_retraso}%
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Badge color={s.cumplimiento_pct >= 80 ? 'green' : s.cumplimiento_pct >= 50 ? 'amber' : 'red'}>
                        {s.cumplimiento_pct}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {snapshots.length === 0 && (
              <p className="text-center py-8 text-slate-400 text-sm">Sin snapshots almacenados</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB 2 — Gestión de Zonas
══════════════════════════════════════════════════════════════ */
function ZonasTab() {
  const [zonas, setZonas]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [editing, setEditing]   = useState(null)   // {distrito_id, celula, microcelda, descripcion}
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(null)

  const fetchZonas = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/zonas')
      setZonas(data.zonas ?? [])
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error cargando zonas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchZonas() }, [fetchZonas])

  const filtered = zonas.filter(z =>
    !search ||
    z.distrito_id.toLowerCase().includes(search.toLowerCase()) ||
    z.celula.toLowerCase().includes(search.toLowerCase()) ||
    z.microcelda.toLowerCase().includes(search.toLowerCase())
  )

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await api.put(`/admin/zonas/${editing.distrito_id}`, {
        celula:      editing.celula,
        microcelda:  editing.microcelda,
        descripcion: editing.descripcion,
      })
      toast.success(`Distrito ${editing.distrito_id} actualizado`)
      setEditing(null)
      fetchZonas()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async (did) => {
    if (!confirm(`¿Restaurar ${did} al valor base (eliminar override)?`)) return
    setDeleting(did)
    try {
      await api.delete(`/admin/zonas/${did}`)
      toast.success(`Override de ${did} eliminado`)
      fetchZonas()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No había override para este distrito')
    } finally {
      setDeleting(null)
    }
  }

  // Células únicas para el selector del modal
  const celulas = [...new Set(zonas.map(z => z.celula))].sort()

  return (
    <div className="space-y-4">
      {/* Buscador */}
      <div className="relative">
        <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar distrito, célula o microcelda…"
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
        />
      </div>

      <p className="text-xs text-slate-400">
        {filtered.length} distritos · Los cambios recargan el mapa de zonas inmediatamente
      </p>

      {loading ? <Spinner /> : (
        <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left bg-slate-50">
                  <th className="px-3 py-2.5 font-semibold text-slate-500">Distrito</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-500">Célula</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-500">Microcelda</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-500">Origen</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(z => (
                  <tr key={z.distrito_id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5 font-mono font-semibold text-slate-800">{z.distrito_id}</td>
                    <td className="px-3 py-2.5 text-slate-700">{z.celula}</td>
                    <td className="px-3 py-2.5 text-slate-700">{z.microcelda}</td>
                    <td className="px-3 py-2.5">
                      {z.sobreescrito
                        ? <Badge color="violet">BD</Badge>
                        : <Badge color="slate">Base</Badge>
                      }
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => setEditing({ ...z })}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 text-white text-[10px] font-semibold hover:bg-slate-700 transition-colors"
                        >
                          Editar
                        </button>
                        {z.sobreescrito && (
                          <button
                            onClick={() => handleReset(z.distrito_id)}
                            disabled={deleting === z.distrito_id}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 text-[10px] font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                          >
                            {deleting === z.distrito_id ? '…' : 'Resetear'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de edición */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base">Editar Distrito</h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{editing.distrito_id}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Célula</label>
                <select
                  value={editing.celula}
                  onChange={e => setEditing(ed => ({ ...ed, celula: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {celulas.map(c => <option key={c}>{c}</option>)}
                  <option value={editing.celula}>{editing.celula}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Microcelda</label>
                <input
                  type="text"
                  value={editing.microcelda}
                  onChange={e => setEditing(ed => ({ ...ed, microcelda: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="Nombre de la microcelda"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Descripción (opcional)</label>
                <input
                  type="text"
                  value={editing.descripcion ?? ''}
                  onChange={e => setEditing(ed => ({ ...ed, descripcion: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="Ej: Tuluá + Andalucía"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editing.celula || !editing.microcelda}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:bg-slate-300 transition-colors"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB 3 — Carga de Excel
══════════════════════════════════════════════════════════════ */
function ExcelTab() {
  const [info, setInfo]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  const fetchInfo = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/excel-info')
      setInfo(data)
    } catch (e) {
      toast.error('Error obteniendo info del Excel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchInfo() }, [fetchInfo])

  const uploadFile = async (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      toast.error('Solo se aceptan archivos .xlsx o .xls')
      return
    }
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const { data } = await api.post('/admin/upload-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success(`✅ ${data.nodos_cargados.toLocaleString()} nodos cargados desde ${data.filename}`)
      fetchInfo()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  return (
    <div className="space-y-4">
      {/* Info del Excel actual */}
      {loading ? <Spinner /> : info && (
        <div className="rounded-xl border border-slate-100 bg-white p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <div>
              <p className="text-sm font-semibold text-slate-800">Excel actual</p>
              <p className="text-xs text-slate-400 font-mono break-all">{info.excel_path}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="text-center">
              <p className="text-xl font-bold text-teal-600 tabular-nums">
                {info.nodos_cargados?.toLocaleString() ?? '—'}
              </p>
              <p className="text-[11px] text-slate-400">Nodos en memoria</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">{info.excel_size_kb ? `${info.excel_size_kb} KB` : '—'}</p>
              <p className="text-[11px] text-slate-400">Tamaño</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">{info.excel_mtime ?? '—'}</p>
              <p className="text-[11px] text-slate-400">Modificado</p>
            </div>
          </div>
          {info.backup_exists && (
            <p className="text-[11px] text-slate-400">✓ Backup disponible (.xlsx.bak)</p>
          )}
        </div>
      )}

      {/* Zona de drop */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-teal-400 bg-teal-50'
            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        } ${uploading ? 'opacity-60 cursor-wait' : ''}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => uploadFile(e.target.files?.[0])}
        />
        {uploading ? (
          <div className="space-y-2">
            <div className="w-8 h-8 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-500 font-medium">Subiendo y procesando…</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-4xl">📁</div>
            <p className="text-sm font-semibold text-slate-700">
              {dragging ? 'Suelta el archivo aquí' : 'Arrastra el nuevo Nodos.xlsx aquí'}
            </p>
            <p className="text-xs text-slate-400">o haz clic para seleccionar · .xlsx / .xls</p>
          </div>
        )}
      </div>

      {/* Instrucciones */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 space-y-1.5">
        <p className="text-xs font-semibold text-amber-800">¿Cuándo actualizar el Excel?</p>
        <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
          <li>Cuando se activen nuevos nodos o se cambie el distrito de un nodo</li>
          <li>Cuando aparezcan técnicos "Sin clasificar" en el dashboard</li>
          <li>Después de cambios de zonificación operacional</li>
        </ul>
        <p className="text-xs text-amber-600 mt-1">
          El archivo anterior se guarda como <code className="font-mono">.xlsx.bak</code> antes de reemplazarlo.
        </p>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Componente principal Admin
══════════════════════════════════════════════════════════════ */
export default function Admin() {
  const [subTab, setSubTab] = useState('monitor')

  const TABS = [
    { id: 'monitor',  icon: '📊', label: 'Monitor'  },
    { id: 'zonas',    icon: '🗺️',  label: 'Zonas'    },
    { id: 'excel',    icon: '📁',  label: 'Excel'    },
    { id: 'usuarios', icon: '👥',  label: 'Usuarios' },
  ]

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-teal-600 flex items-center justify-center text-white text-base">⚙</div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">Panel de Administración</h2>
          <p className="text-[11px] text-slate-400">Snapshots · Zonas · Excel · Usuarios</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
        {TABS.map(t => (
          <SubTabBtn key={t.id} id={t.id} current={subTab} onClick={setSubTab} icon={t.icon} label={t.label} />
        ))}
      </div>

      {/* Contenido */}
      {subTab === 'monitor'  && <MonitorTab />}
      {subTab === 'zonas'    && <ZonasTab />}
      {subTab === 'excel'    && <ExcelTab />}
      {subTab === 'usuarios' && <Usuarios />}
    </div>
  )
}
