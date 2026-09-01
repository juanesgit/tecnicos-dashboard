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
  const [deleting, setDeleting]   = useState(null)   // snapshot_id en proceso
  const [confirmId, setConfirmId] = useState(null)   // snapshot_id pendiente confirmar

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

  const handleDelete = async (id) => {
    setDeleting(id)
    setConfirmId(null)
    try {
      await api.delete(`/historico/admin/snapshots/${id}`)
      toast.success(`Snapshot ${id} eliminado`)
      setSnapshots(prev => prev.filter(s => s.id !== id))
      fetchData()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al eliminar snapshot')
    } finally {
      setDeleting(null)
    }
  }

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
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {snapshots.map(s => {
                  const isDeleting   = deleting   === s.id
                  const isConfirming = confirmId  === s.id
                  return (
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
                    <td className="px-3 py-2 text-right">
                      {isConfirming ? (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="text-[10px] bg-red-600 text-white rounded px-1.5 py-0.5 hover:bg-red-700"
                          >Sí</button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="text-[10px] bg-slate-200 text-slate-700 rounded px-1.5 py-0.5 hover:bg-slate-300"
                          >No</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(s.id)}
                          disabled={!!deleting}
                          title="Eliminar snapshot"
                          className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-30"
                        >
                          {isDeleting ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                  )
                })}
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
   TAB 5 — Adherencia al sistema
══════════════════════════════════════════════════════════════ */
function AdherenciaTab() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [dias, setDias]         = useState(30)
  const [detalle, setDetalle]   = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [onlineIds, setOnlineIds] = useState(new Set())

  // Polling de presencia cada 30 s
  useEffect(() => {
    let cancelled = false
    const fetchOnline = async () => {
      try {
        const { data: res } = await api.get('/actividad/online')
        if (!cancelled) setOnlineIds(new Set(res.online.map(u => u.user_id)))
      } catch { /* silencioso */ }
    }
    fetchOnline()
    const iv = setInterval(fetchOnline, 30_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await api.get(`/actividad/adherencia?dias=${dias}`)
      setData(res)
    } catch (e) {
      toast.error('Error cargando adherencia')
    } finally {
      setLoading(false)
    }
  }, [dias])

  useEffect(() => { fetchData() }, [fetchData])

  const openTimeline = async (userId) => {
    if (detalle === userId) { setDetalle(null); setTimeline(null); return }
    setDetalle(userId)
    setTimeline(null)
    try {
      const { data: res } = await api.get(`/actividad/timeline/${userId}?dias=${dias}`)
      setTimeline(res.dias)
    } catch {
      toast.error('Error cargando historial')
    }
  }

  const SEM_COLOR = {
    green:  { dot: 'bg-emerald-400', text: 'text-emerald-600', label: 'Activo hoy',       bg: 'bg-emerald-50' },
    yellow: { dot: 'bg-amber-400',   text: 'text-amber-600',   label: 'Activo (≤3 días)', bg: 'bg-amber-50'   },
    red:    { dot: 'bg-red-400',     text: 'text-red-600',     label: '+3 días inactivo',  bg: 'bg-red-50'     },
    gray:   { dot: 'bg-slate-300',   text: 'text-slate-400',   label: 'Sin actividad',     bg: 'bg-slate-50'   },
  }

  const fmtFecha = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const fmtDia = (iso) => new Date(iso).toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' })

  const fmtTiempo = (min) => {
    if (!min || min === 0) return '—'
    if (min < 60) return `${min}m`
    return `${Math.floor(min / 60)}h ${min % 60}m`
  }

  const EVT_ICON = {
    login: '🔑', tab_dashboard: '📊', tab_avance: '📈',
    tab_historico: '🕐', tab_productividad: '⚡', tab_admin: '⚙️',
    tab_usuarios: '👥', datos: '📡',
  }

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex items-center gap-2">
        <select
          value={dias}
          onChange={e => setDias(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          {[7, 15, 30, 60, 90].map(d => (
            <option key={d} value={d}>Últimos {d} días</option>
          ))}
        </select>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
        >↻</button>
        <span className="ml-auto text-[11px] text-slate-400">
          Actualizado al cargar la pestaña
        </span>
      </div>

      {loading && <Spinner />}

      {!loading && data && (
        <>
          {/* Cards de resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Activos hoy',    val: data.resumen.activos_hoy,                          color: 'text-emerald-600' },
              { label: 'Activos semana', val: data.resumen.activos_semana,                        color: 'text-amber-600'   },
              { label: 'Sin actividad',  val: data.resumen.nunca_entraron,                        color: 'text-slate-400'   },
              { label: 'Tiempo total',   val: fmtTiempo(data.resumen.total_tiempo_min),           color: 'text-violet-600'  },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
                <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.val}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Leyenda semáforo */}
          <div className="flex flex-wrap gap-3 px-1">
            {Object.entries(SEM_COLOR).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                {v.label}
              </div>
            ))}
          </div>

          {/* Tabla de usuarios */}
          <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-left bg-slate-50">
                    <th className="px-3 py-2.5 font-semibold text-slate-500 w-4" />
                    <th className="px-3 py-2.5 font-semibold text-slate-500">Usuario</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 hidden sm:table-cell">Rol</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500">Último acceso</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 text-right">Días activos</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 text-right">Logins</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 text-right">Eventos</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-500 text-right">Tiempo</th>
                    <th className="px-3 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {data.usuarios.map(u => {
                    const sem     = SEM_COLOR[u.semaforo] || SEM_COLOR.gray
                    const isOpen  = detalle === u.user_id
                    const isOnline = onlineIds.has(u.user_id)
                    return (
                      <>
                        <tr
                          key={u.user_id}
                          className={`border-b border-slate-50 transition-colors ${isOpen ? sem.bg : 'hover:bg-slate-50'}`}
                        >
                          <td className="px-3 py-2.5">
                            <span className={`block w-2 h-2 rounded-full ${sem.dot}`} title={sem.label} />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-slate-800">{u.full_name}</p>
                              {isOnline && (
                                <span className="relative flex h-2 w-2" title="En línea ahora">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                </span>
                              )}
                            </div>
                            <p className="text-slate-400">@{u.username}</p>
                          </td>
                          <td className="px-3 py-2.5 hidden sm:table-cell text-slate-500">{u.role_label}</td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtFecha(u.ultimo_acceso)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <span className={`font-semibold ${u.dias_activos_30 > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                              {u.dias_activos_30}
                            </span>
                            <span className="text-slate-300">/{dias}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{u.logins_30}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{u.total_eventos_30}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-violet-600 font-medium">{fmtTiempo(u.tiempo_activo_min)}</td>
                          <td className="px-2 py-2.5 text-center">
                            <button
                              onClick={() => openTimeline(u.user_id)}
                              className={`w-6 h-6 rounded flex items-center justify-center text-[10px] transition-colors ${
                                isOpen ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-100'
                              }`}
                            >
                              {isOpen ? '▲' : '▼'}
                            </button>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr key={`tl-${u.user_id}`} className="border-b border-slate-100">
                            <td colSpan={9} className="px-4 py-3 bg-slate-50">
                              {timeline === null ? (
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                  <div className="w-3 h-3 border border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                                  Cargando historial…
                                </div>
                              ) : timeline.length === 0 ? (
                                <p className="text-xs text-slate-400">Sin actividad registrada en este período.</p>
                              ) : (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  {timeline.map(dia => (
                                    <div key={dia.fecha} className="flex items-start gap-2">
                                      <span className="text-[11px] font-semibold text-slate-500 w-28 shrink-0 pt-0.5">
                                        {fmtDia(dia.fecha)}
                                        {dia.tiempo_activo_min > 0 && (
                                          <span className="ml-1 text-violet-500 font-medium">
                                            {fmtTiempo(dia.tiempo_activo_min)}
                                          </span>
                                        )}
                                      </span>
                                      <div className="flex flex-wrap gap-1">
                                        {Object.entries(
                                          dia.eventos.reduce((acc, ev) => { acc[ev] = (acc[ev] || 0) + 1; return acc }, {})
                                        ).map(([ev, count]) => (
                                          <span
                                            key={ev}
                                            className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2 py-0.5 text-[10px] text-slate-600"
                                          >
                                            {EVT_ICON[ev] || '•'} {ev.replace('tab_', '')}
                                            {count > 1 && <span className="font-bold text-slate-400">×{count}</span>}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Componente principal Admin
══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   TAB — Mapa de calor de alarmas (admin)
   Filas = células · Columnas = buckets de tiempo abierto
══════════════════════════════════════════════════════════════ */
const ALARM_BUCKETS = [
  { label: '0–30 m',  max: 30,       color: '#64748b', bg: '#f1f5f9', bgHi: '#cbd5e1' },
  { label: '30–60 m', max: 60,       color: '#ca8a04', bg: '#fefce8', bgHi: '#fde047' },
  { label: '1–1½ h',  max: 90,       color: '#ea580c', bg: '#fff7ed', bgHi: '#fdba74' },
  { label: '1½–2 h',  max: 120,      color: '#dc2626', bg: '#fef2f2', bgHi: '#fca5a5' },
  { label: '>2 h',    max: Infinity, color: '#7f1d1d', bg: '#fef2f2', bgHi: '#f87171' },
]

function fmtMinAdmin(m) {
  if (!m && m !== 0) return '—'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

/** Tarjetas de alarma compartidas entre bottom-sheet y modal desktop */
function ListaAlarmasDetalle({ alarmas, b }) {
  return (
    <div className="space-y-2 px-4 py-3">
      {[...alarmas].sort((a, x) => x.edadMin - a.edadMin).map((a, i) => (
        <div key={i} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-semibold text-slate-800 text-sm truncate">{a.tecnico}</span>
            <span className="font-bold tabular-nums shrink-0 text-sm" style={{ color: b.color }}>
              {fmtMinAdmin(a.edadMin)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
            {a.ot         && <span><span className="text-slate-400">OT </span><span className="font-medium text-slate-700">{a.ot}</span></span>}
            {a.microcelda && <span><span className="text-slate-400">MC </span><span className="font-medium text-slate-700">{a.microcelda}</span></span>}
            {a.ciudad     && <span><span className="text-slate-400">Ciudad </span><span className="font-medium text-slate-700">{a.ciudad}</span></span>}
            {a.actividad  && (
              <span className="col-span-2 truncate" title={a.actividad}>
                <span className="text-slate-400">Trabajo </span><span className="font-medium text-slate-700">{a.actividad}</span>
              </span>
            )}
            {a.asignado_nombre && (
              <span className="col-span-2">
                <span className="text-slate-400">Supervisor </span><span className="font-medium text-slate-700">{a.asignado_nombre}</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ModalAlarmaDetalle({ detalle, alarmas, onClose }) {
  const overlayRef            = useRef(null)
  const [visible, setVisible] = useState(false)
  const b                     = ALARM_BUCKETS[detalle.bucketIdx]

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
      <h2 className="font-bold text-slate-800 text-base truncate">
        {detalle.celula}
        <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold align-middle"
          style={{ background: b.bg, color: b.color }}>
          {b.label}
        </span>
      </h2>
      <p className="text-xs text-slate-500 mt-0.5">
        {alarmas.length} técnico{alarmas.length !== 1 ? 's' : ''} en retraso
      </p>
    </>
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
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Header mobile */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="min-w-0">{titulo}</div>
          <button onClick={cerrar}
            className="ml-3 shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body mobile */}
        <div className="flex-1 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <ListaAlarmasDetalle alarmas={alarmas} b={b} />
        </div>
      </div>

      {/* ── DESKTOP: modal centrado ───────────────────────────────── */}
      <div className={`hidden sm:flex items-center justify-center h-full transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header desktop */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <div>{titulo}</div>
            <button onClick={cerrar}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body desktop */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-2">
              {[...alarmas].sort((a, x) => x.edadMin - a.edadMin).map((a, i) => (
                <div key={i} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-slate-800 text-sm truncate">{a.tecnico}</span>
                    <span className="font-bold tabular-nums shrink-0 text-sm" style={{ color: b.color }}>
                      {fmtMinAdmin(a.edadMin)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
                    {a.ot         && <span><span className="text-slate-400">OT </span><span className="font-medium text-slate-700">{a.ot}</span></span>}
                    {a.microcelda && <span><span className="text-slate-400">MC </span><span className="font-medium text-slate-700">{a.microcelda}</span></span>}
                    {a.ciudad     && <span><span className="text-slate-400">Ciudad </span><span className="font-medium text-slate-700">{a.ciudad}</span></span>}
                    {a.actividad  && (
                      <span className="col-span-2 truncate" title={a.actividad}>
                        <span className="text-slate-400">Trabajo </span><span className="font-medium text-slate-700">{a.actividad}</span>
                      </span>
                    )}
                    {a.asignado_nombre && (
                      <span className="col-span-2">
                        <span className="text-slate-400">Supervisor </span><span className="font-medium text-slate-700">{a.asignado_nombre}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AlarmasTab() {
  const [alarmas,   setAlarmas]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [detalle,   setDetalle]   = useState(null)   // { celula, bucketIdx }
  const [autoRef,   setAutoRef]   = useState(true)

  const cargar = useCallback(async () => {
    try {
      const res = await api.get('/alarmas/todas')
      setAlarmas(res.data ?? [])
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (!autoRef) return
    const id = setInterval(cargar, 30000)
    return () => clearInterval(id)
  }, [autoRef, cargar])

  const now = Date.now()
  const abiertas = alarmas.filter(a => a.estado === 'abierta')

  // Agrupar por célula
  const celulas = [...new Set(abiertas.map(a => a.celula))].sort()

  // Matriz: celula → buckets → [alarmas]
  const matriz = Object.fromEntries(
    celulas.map(cel => {
      const grupos = ALARM_BUCKETS.map(() => [])
      abiertas.filter(a => a.celula === cel).forEach(a => {
        const retraso = Math.max(0, a.minutos_retraso_inicio ?? 0)
        let idx = ALARM_BUCKETS.length - 1
        for (let i = 0; i < ALARM_BUCKETS.length; i++) {
          if (retraso < ALARM_BUCKETS[i].max) { idx = i; break }
        }
        grupos[idx].push({ ...a, edadMin: retraso })
      })
      return [cel, grupos]
    })
  )

  // Máximo por bucket para escalar intensidad
  const maxPorBucket = ALARM_BUCKETS.map((_, i) =>
    Math.max(1, ...celulas.map(cel => matriz[cel]?.[i]?.length ?? 0))
  )

  const detalleAlarmas = detalle ? (matriz[detalle.celula]?.[detalle.bucketIdx] ?? []) : []

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-700">Retrasos activos por célula</p>
          <p className="text-[11px] text-slate-400">
            {abiertas.length} alarma{abiertas.length !== 1 ? 's' : ''} abiertas · {celulas.length} célula{celulas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
            <input type="checkbox" checked={autoRef} onChange={e => setAutoRef(e.target.checked)}
              className="w-3 h-3 accent-teal-600" />
            Auto-refresh
          </label>
          <button onClick={cargar}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            ↻ Actualizar
          </button>
        </div>
      </div>

      {celulas.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">✅ Sin alarmas abiertas</div>
      ) : (
        <>
          {/* Leyenda de buckets */}
          <div className="flex gap-2 flex-wrap">
            {ALARM_BUCKETS.map((b, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] font-medium"
                style={{ color: b.color }}>
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: b.bgHi }} />
                {b.label}
              </span>
            ))}
          </div>

          {/* Tabla de calor */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap">
                    Célula
                  </th>
                  {ALARM_BUCKETS.map((b, i) => (
                    <th key={i} className="px-3 py-2 text-center text-[11px] font-semibold border-b border-slate-200 whitespace-nowrap"
                      style={{ color: b.color }}>
                      {b.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center text-[11px] font-semibold text-slate-500 border-b border-slate-200">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {celulas.map(cel => {
                  const grupos = matriz[cel]
                  const total  = grupos.reduce((s, g) => s + g.length, 0)
                  return (
                    <tr key={cel} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                      <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{cel}</td>
                      {grupos.map((tecs, i) => {
                        const cnt   = tecs.length
                        const b     = ALARM_BUCKETS[i]
                        const pct   = total > 0 ? Math.round(cnt / total * 100) : 0
                        const ratio = cnt / maxPorBucket[i]
                        // Intensidad de fondo según ratio
                        const bg = cnt === 0 ? 'transparent'
                          : ratio > 0.66 ? b.bgHi
                          : b.bg
                        return (
                          <td key={i} className="px-3 py-2 text-center"
                            style={{ background: bg }}>
                            {cnt > 0 ? (
                              <button
                                onClick={() => setDetalle({ celula: cel, bucketIdx: i })}
                                className="flex flex-col items-center gap-0 w-full focus:outline-none"
                              >
                                <span className="font-bold text-[13px]" style={{ color: b.color }}>{cnt}</span>
                                <span className="text-[9px] opacity-60" style={{ color: b.color }}>{pct}%</span>
                              </button>
                            ) : (
                              <span className="text-slate-200">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-center font-semibold text-slate-600">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Modal de detalle — centrado, sin scroll de página */}
          {detalle && detalleAlarmas.length > 0 && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(15,23,42,0.45)' }}
              onClick={() => setDetalle(null)}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col"
                style={{ maxHeight: '80vh' }}
                onClick={e => e.stopPropagation()}
              >
                {/* Header del modal */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {detalle.celula}
                      <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: ALARM_BUCKETS[detalle.bucketIdx].bg, color: ALARM_BUCKETS[detalle.bucketIdx].color }}>
                        {ALARM_BUCKETS[detalle.bucketIdx].label}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {detalleAlarmas.length} técnico{detalleAlarmas.length !== 1 ? 's' : ''} en retraso
                    </p>
                  </div>
                  <button onClick={() => setDetalle(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 text-base transition-colors">
                    ×
                  </button>
                </div>

                {/* Lista scrollable dentro del modal */}
                <div className="overflow-y-auto px-4 py-3 space-y-2">
                  {detalleAlarmas
                    .sort((a, b) => b.edadMin - a.edadMin)
                    .map((a, i) => (
                      <div key={i} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-[11px]">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-semibold text-slate-800 truncate">{a.tecnico}</span>
                          <span className="font-bold tabular-nums shrink-0 text-[12px]"
                            style={{ color: ALARM_BUCKETS[detalle.bucketIdx].color }}>
                            {fmtMinAdmin(a.edadMin)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                          {a.ot && (
                            <span><span className="text-slate-400">OT </span><span className="font-medium text-slate-600">{a.ot}</span></span>
                          )}
                          {a.microcelda && (
                            <span><span className="text-slate-400">MC </span><span className="font-medium text-slate-600">{a.microcelda}</span></span>
                          )}
                          {a.ciudad && (
                            <span><span className="text-slate-400">Ciudad </span><span className="font-medium text-slate-600">{a.ciudad}</span></span>
                          )}
                          {a.actividad && (
                            <span className="col-span-2 truncate" title={a.actividad}>
                              <span className="text-slate-400">Trabajo </span><span className="font-medium text-slate-600">{a.actividad}</span>
                            </span>
                          )}
                          {a.asignado_nombre && (
                            <span className="col-span-2">
                              <span className="text-slate-400">Supervisor </span><span className="font-medium text-slate-600">{a.asignado_nombre}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-100">
                  <button onClick={() => setDetalle(null)}
                    className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition-colors">
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── CausasTab: gestión de causas de retraso ─────────────────────────────── */
function CausasTab() {
  const [causas, setCausas] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nombre: '', descripcion: '' })
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({ nombre: '', descripcion: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const { data } = await api.get('/causas')
      setCausas(data)
    } catch { toast.error('Error cargando causas') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const crear = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return toast.error('El nombre es obligatorio')
    setSaving(true)
    try {
      await api.post('/causas', form)
      setForm({ nombre: '', descripcion: '' })
      toast.success('Causa creada')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al crear')
    } finally { setSaving(false) }
  }

  const toggleActiva = async (c) => {
    try {
      await api.patch(`/causas/${c.id}`, { activa: !c.activa })
      toast.success(c.activa ? 'Causa desactivada' : 'Causa activada')
      load()
    } catch { toast.error('Error al actualizar') }
  }

  const guardarEdit = async (id) => {
    if (!editForm.nombre.trim()) return toast.error('El nombre es obligatorio')
    try {
      await api.patch(`/causas/${id}`, editForm)
      setEditId(null)
      toast.success('Causa actualizada')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al actualizar')
    }
  }

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar esta causa?')) return
    try {
      await api.delete(`/causas/${id}`)
      toast.success('Causa eliminada')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al eliminar')
    }
  }

  if (loading) return <div className="text-center py-8 text-gray-400">Cargando causas…</div>

  return (
    <div className="space-y-4">
      {/* Formulario de creación */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Nueva causa de retraso</h3>
        <form onSubmit={crear} className="flex flex-col gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            placeholder="Nombre de la causa *"
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
          />
          <input
            className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            placeholder="Descripción (opcional)"
            value={form.descripcion}
            onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
          />
          <button
            type="submit"
            disabled={saving}
            className="self-start bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? 'Guardando…' : '+ Agregar causa'}
          </button>
        </form>
      </div>

      {/* Lista de causas */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Nombre</th>
              <th className="px-4 py-2 text-left">Descripción</th>
              <th className="px-4 py-2 text-center">Estado</th>
              <th className="px-4 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {causas.length === 0 && (
              <tr><td colSpan={4} className="text-center py-6 text-gray-400">Sin causas configuradas</td></tr>
            )}
            {causas.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                <td className="px-4 py-2">
                  {editId === c.id
                    ? <input
                        className="border rounded px-2 py-1 text-sm w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        value={editForm.nombre}
                        onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                      />
                    : <span className={!c.activa ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-100'}>{c.nombre}</span>
                  }
                </td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                  {editId === c.id
                    ? <input
                        className="border rounded px-2 py-1 text-sm w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        value={editForm.descripcion}
                        onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                      />
                    : c.descripcion || '—'
                  }
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => toggleActiva(c)}
                    className={`text-xs px-2 py-1 rounded-full font-medium ${c.activa ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                  >
                    {c.activa ? 'Activa' : 'Inactiva'}
                  </button>
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex gap-2 justify-center">
                    {editId === c.id ? (
                      <>
                        <button onClick={() => guardarEdit(c.id)} className="text-xs bg-teal-600 text-white px-2 py-1 rounded hover:bg-teal-700">Guardar</button>
                        <button onClick={() => setEditId(null)} className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-2 py-1 rounded">Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditId(c.id); setEditForm({ nombre: c.nombre, descripcion: c.descripcion || '' }) }} className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-1 rounded hover:bg-blue-200">Editar</button>
                        <button onClick={() => eliminar(c.id)} className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 px-2 py-1 rounded hover:bg-red-200">Eliminar</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Admin() {
  const [subTab, setSubTab] = useState('monitor')

  const TABS = [
    { id: 'monitor',    icon: '📊', label: 'Monitor'    },
    { id: 'alarmas',    icon: '🚨', label: 'Alarmas'    },
    { id: 'zonas',      icon: '🗺️',  label: 'Zonas'      },
    { id: 'excel',      icon: '📁',  label: 'Excel'      },
    { id: 'usuarios',   icon: '👥',  label: 'Usuarios'   },
    { id: 'adherencia', icon: '📋', label: 'Adherencia' },
    { id: 'causas',     icon: '📌', label: 'Causas'     },
  ]

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-teal-600 flex items-center justify-center text-white text-base">⚙</div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">Panel de Administración</h2>
          <p className="text-[11px] text-slate-400">Snapshots · Zonas · Excel · Usuarios · Adherencia</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
        {TABS.map(t => (
          <SubTabBtn key={t.id} id={t.id} current={subTab} onClick={setSubTab} icon={t.icon} label={t.label} />
        ))}
      </div>

      {/* Contenido */}
      {subTab === 'monitor'    && <MonitorTab />}
      {subTab === 'alarmas'    && <AlarmasTab />}
      {subTab === 'zonas'      && <ZonasTab />}
      {subTab === 'excel'      && <ExcelTab />}
      {subTab === 'usuarios'   && <Usuarios />}
      {subTab === 'adherencia' && <AdherenciaTab />}
      {subTab === 'causas'     && <CausasTab />}
    </div>
  )
}
