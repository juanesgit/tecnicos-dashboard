import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

// Umbral para marcar snapshot como "sospechoso" (total < 20% del promedio general)
function isSuspect(snap, avgTotal) {
  if (!snap.total) return true
  if (avgTotal && snap.total < avgTotal * 0.5) return true
  return false
}

export default function Snapshots() {
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [deleting, setDeleting]   = useState(null)   // snapshot_id being deleted
  const [confirmId, setConfirmId] = useState(null)   // snapshot_id pending confirm
  const [expanded, setExpanded]   = useState(null)   // snapshot_id expanded for détalle
  const [limit, setLimit]         = useState(100)
  const [toast, setToast]         = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`/historico/admin/snapshots?limit=${limit}`)
      setSnapshots(data.snapshots ?? [])
    } catch (e) {
      setError(e.response?.data?.detail ?? e.message)
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id) => {
    setConfirmId(null)
    setDeleting(id)
    try {
      const { data } = await api.delete(`/historico/admin/snapshots/${id}`)
      setSnapshots(prev => prev.filter(s => s.id !== id))
      showToast(data.msg ?? `Snapshot ${id} eliminado`, 'success')
    } catch (e) {
      showToast(e.response?.data?.detail ?? e.message, 'error')
    } finally {
      setDeleting(null)
    }
  }

  // Promedio de totales para detectar snapshots incompletos
  const avgTotal = snapshots.length
    ? Math.round(snapshots.reduce((s, x) => s + x.total, 0) / snapshots.length)
    : 0

  const suspects = snapshots.filter(s => isSuspect(s, avgTotal))

  return (
    <div className="pb-24 px-3 pt-3 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Administración de Snapshots</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {snapshots.length} snapshots cargados · promedio {avgTotal} técnicos
            {suspects.length > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                · {suspects.length} sospechoso{suspects.length > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
          >
            <option value={50}>50 más recientes</option>
            <option value={100}>100 más recientes</option>
            <option value={200}>200 más recientes</option>
            <option value={500}>500 más recientes</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" />
          Incompleto / sospechoso
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-emerald-50 border border-emerald-200 inline-block" />
          Normal
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !snapshots.length && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && !error && snapshots.length === 0 && (
        <div className="text-center py-16 text-slate-400">No hay snapshots registrados.</div>
      )}

      {snapshots.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2.5 font-semibold text-slate-600 w-8">#</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-600">Fecha / Hora</th>
                <th className="text-right px-3 py-2.5 font-semibold text-slate-600">Total</th>
                <th className="text-right px-3 py-2.5 font-semibold text-slate-600">Retraso</th>
                <th className="text-right px-3 py-2.5 font-semibold text-slate-600">Parada</th>
                <th className="text-right px-3 py-2.5 font-semibold text-slate-600">Cumpl.%</th>
                <th className="text-right px-3 py-2.5 font-semibold text-slate-600">Détalle</th>
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap, idx) => {
                const suspect = isSuspect(snap, avgTotal)
                const isExpanded = expanded === snap.id
                const isDeleting = deleting === snap.id
                const isConfirming = confirmId === snap.id

                return (
                  <>
                    <tr
                      key={snap.id}
                      className={`border-b border-slate-100 transition-colors ${
                        suspect
                          ? 'bg-amber-50 hover:bg-amber-100'
                          : idx % 2 === 0
                            ? 'bg-white hover:bg-slate-50'
                            : 'bg-slate-50/50 hover:bg-slate-100'
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-400 tabular-nums">{snap.id}</td>
                      <td className="px-3 py-2 font-mono text-slate-700">
                        <div className="flex items-center gap-1.5">
                          {suspect && (
                            <span title="Snapshot posiblemente incompleto">
                              <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                          {snap.captured_at}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{snap.total}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600">{snap.con_retraso}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-orange-600">{snap.con_parada}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{snap.cumplimiento_pct}%</td>
                      <td className="px-3 py-2 text-right">
                        {snap.celulas?.length > 0 && (
                          <button
                            onClick={() => setExpanded(isExpanded ? null : snap.id)}
                            className="text-blue-500 hover:text-blue-700 transition-colors"
                            title="Ver desglose por célula"
                          >
                            <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isConfirming ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => handleDelete(snap.id)}
                              className="text-[10px] bg-red-600 text-white rounded px-1.5 py-0.5 hover:bg-red-700"
                            >
                              Sí
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="text-[10px] bg-slate-200 text-slate-700 rounded px-1.5 py-0.5 hover:bg-slate-300"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmId(snap.id)}
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

                    {/* Expanded célula detail */}
                    {isExpanded && snap.celulas?.length > 0 && (
                      <tr key={`${snap.id}-detail`} className={suspect ? 'bg-amber-50' : 'bg-blue-50/40'}>
                        <td colSpan={8} className="px-4 py-2">
                          <div className="flex flex-wrap gap-2">
                            {snap.celulas.map(c => (
                              <div
                                key={c.celula}
                                className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px]"
                              >
                                <div className="font-semibold text-slate-700 mb-0.5">{c.celula}</div>
                                <div className="text-slate-500">
                                  Total <span className="font-medium text-slate-700">{c.total}</span>
                                  {' · '}
                                  Retraso <span className="font-medium text-red-600">{c.con_retraso}</span>
                                  {' · '}
                                  Cumpl <span className="font-medium text-emerald-600">{c.cumplimiento_pct}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
