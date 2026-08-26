import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

/**
 * Parsea el string detalle_pendientes/detalle_completados del servicio.
 * Formato:  "HH:MM a HH:MM (Ciudad)###Actividad###OT######..."
 */
function parsearDetalle(str, conEstado = false) {
  if (!str) return []
  return str.split('######').map((bloque) => {
    const partes = bloque.split('###')
    const [rango = '', actividad = '', ot = '', estado = ''] = partes
    const [tiempos, ciudad = ''] = rango.split(' (')
    const [inicio = '', fin = ''] = tiempos.split(' a ')
    return {
      inicio: inicio.trim(),
      fin: fin.trim(),
      ciudad: ciudad.replace(')', '').trim(),
      actividad: actividad.trim(),
      ot: ot.trim(),
      estado: conEstado ? estado.trim() : undefined,
    }
  }).filter((r) => r.actividad)
}

function EstadoBadge({ estado }) {
  const map = {
    'Retraso actual':       'bg-red-100 text-red-700',
    'Retraso en siguiente': 'bg-orange-100 text-orange-700',
    'En ejecución':         'bg-blue-100 text-blue-700',
    'Finalizado':           'bg-green-100 text-green-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[estado] ?? 'bg-slate-100 text-slate-500'}`}>
      {estado ?? '—'}
    </span>
  )
}

/** Fila de dato en el detalle */
function Row({ label, value, mono = false, color }) {
  return (
    <div className="flex justify-between items-start px-4 py-2.5 gap-3">
      <span className="text-slate-500 text-sm shrink-0">{label}</span>
      <span className={`text-sm font-medium text-right min-w-0 ${mono ? 'font-mono' : ''} ${color || 'text-slate-800'}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}

/** Lista de actividades — vertical, legible */
function ListaActividades({ items, conEstado = false, color = 'slate' }) {
  if (!items.length) return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-8 text-center text-xs text-slate-400">
      Sin actividades registradas
    </div>
  )
  const borderColor = color === 'purple' ? 'border-purple-200' : 'border-slate-200'
  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden divide-y ${color === 'purple' ? 'divide-purple-100' : 'divide-slate-100'}`}>
      {items.map((p, i) => (
        <div key={i} className="px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[11px] tabular-nums text-slate-500 shrink-0">
              {p.inicio}{p.fin && p.fin !== p.inicio ? ` – ${p.fin}` : ''}
            </span>
            {conEstado && p.estado && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                p.estado === 'Completado' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}>{p.estado}</span>
            )}
          </div>
          <p className="text-xs font-medium text-slate-800 truncate">{p.actividad}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {p.ciudad && `${p.ciudad} · `}
            <span className="font-mono">{p.ot || '—'}</span>
          </p>
        </div>
      ))}
    </div>
  )
}

export default function ModalDetalle({ tecnico: row, onClose }) {
  const overlayRef = useRef(null)
  const [feedback, setFeedback] = useState('')
  const [sending, setSending] = useState(false)
  const [visible, setVisible]  = useState(false)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const cerrar = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  if (!row) return null

  const nombre = row['Técnico'] ?? '—'
  const pendientes  = parsearDetalle(row.detalle_pendientes, false)
  const completados = parsearDetalle(row.detalle_completados, true)
  const enRetraso   = row.estado_actual === 'Retraso actual' || row.estado_actual === 'Retraso en siguiente'

  const handleOverlayClick = (e) => { if (e.target === overlayRef.current) cerrar() }

  const handleFeedback = async (e) => {
    e.preventDefault()
    if (!feedback.trim()) return
    setSending(true)
    try {
      await api.post('/feedback-retraso', {
        tecnico: nombre,
        observacion: feedback.trim(),
        municipio: row.ciudad_actual,
      })
      toast.success('Observación registrada')
      setFeedback('')
    } catch {
      toast.error('Error al registrar observación')
    } finally {
      setSending(false)
    }
  }

  const bodyProps = { row, pendientes, completados, enRetraso, feedback, setFeedback, sending, handleFeedback }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className={`fixed inset-0 z-50 transition-colors duration-300 ${visible ? 'bg-black/50' : 'bg-black/0'}`}
    >
      {/* ── MOBILE: bottom sheet ── */}
      <div
        className={`sm:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl flex flex-col
          transition-transform duration-300 ease-out
          ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '92dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        <ModalHeader nombre={nombre} row={row} onClose={cerrar} />
        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <SheetBody {...bodyProps} />
        </div>
      </div>

      {/* ── DESKTOP: modal centrado ── */}
      <div
        className={`hidden sm:flex items-center justify-center h-full transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <ModalHeader nombre={nombre} row={row} onClose={cerrar} desktop />
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <SheetBody {...bodyProps} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Header compartido */
function ModalHeader({ nombre, row, onClose, desktop = false }) {
  return (
    <div className={`flex items-center justify-between border-b border-slate-100 shrink-0 ${desktop ? 'px-6 py-4' : 'px-4 py-3'}`}>
      <div className="min-w-0">
        <h2 className="font-bold text-slate-800 text-base truncate">{nombre}</h2>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {row.ciudad_actual || '—'}{row.Compañia ? ` · ${row.Compañia}` : ''}
        </p>
      </div>
      <button onClick={onClose}
        className={`ml-3 shrink-0 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors ${desktop ? 'w-8 h-8' : 'w-9 h-9'}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

/** Contenido con pestañas */
function SheetBody({ row, pendientes, completados, enRetraso, feedback, setFeedback, sending, handleFeedback }) {
  const [tab, setTab] = useState('estado')

  const TABS = [
    { id: 'estado',      label: `📋 Estado actual`                            },
    { id: 'pendientes',  label: `⏳ Pendientes (${pendientes.length})`         },
    { id: 'actividades', label: `✅ Del día (${completados.length})`           },
  ]

  return (
    <div className="px-4 py-3 sm:px-0 sm:py-0 space-y-3">

      {/* Pestañas */}
      <div className="flex rounded-xl overflow-hidden border border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-2.5 text-[11px] font-medium transition-colors leading-tight text-center ${
              tab === t.id
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Pestaña 1: Estado actual ── */}
      {tab === 'estado' && (
        <div className="space-y-3">

          {/* KPIs estado + hora */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1.5">Estado actual</p>
              <EstadoBadge estado={row.estado_actual} />
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Hora actual</p>
              <p className="text-sm font-bold text-slate-800 tabular-nums">{row.hora_actual || '—'}</p>
            </div>
          </div>

          {/* Actividad actual */}
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            <Row label="Actividad" value={
              <span className="truncate block max-w-[200px]" title={row.actividad_actual}>
                {row.actividad_actual || '—'}
              </span>
            } />
            <Row label="OT actual"  value={row.ot_actual} mono />
            <Row label="Ventana"
              value={row.inicio_actual && row.ventana_fin
                ? `${row.inicio_actual} – ${row.ventana_fin}`
                : row.inicio_actual || '—'} />
            {row.fin_norma && <Row label="Fin norma" value={row.fin_norma} />}
          </div>

          {/* Retraso */}
          {enRetraso && (
            <div className="rounded-xl border border-red-200 bg-red-50 divide-y divide-red-100">
              {row.retraso_hhmm && row.retraso_hhmm !== '00:00' && (
                <Row label="Retraso actual" value={row.retraso_hhmm} color="text-red-700 font-bold" />
              )}
              {row.retraso_siguiente_hhmm && row.retraso_siguiente_hhmm !== '00:00' && (
                <Row label="Retraso siguiente" value={row.retraso_siguiente_hhmm} color="text-red-700 font-bold" />
              )}
            </div>
          )}

          {/* Siguiente actividad */}
          {row.siguiente_actividad && (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              <div className="px-4 py-2 bg-slate-50">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Siguiente actividad</p>
              </div>
              <Row label="Actividad" value={
                <span className="truncate block max-w-[200px]" title={row.siguiente_actividad}>
                  {row.siguiente_actividad}
                </span>
              } />
              {row.ot_siguiente     && <Row label="OT siguiente" value={row.ot_siguiente} mono />}
              {row.ciudad_siguiente && <Row label="Ciudad" value={row.ciudad_siguiente} />}
              <Row label="Inicio" value={row.inicio_siguiente || '—'} />
              {row.parada_hhmm && row.parada_hhmm !== '00:00' && (
                <Row label="Parada prevista" value={row.parada_ajustada_hhmm || row.parada_hhmm} color="text-amber-700 font-semibold" />
              )}
            </div>
          )}

          {/* Feedback */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Registrar observación
            </p>
            <form onSubmit={handleFeedback} className="space-y-2">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Escribe una observación sobre este técnico…"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              />
              <button
                type="submit"
                disabled={sending || !feedback.trim()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {sending && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                Guardar observación
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Pestaña 2: Pendientes ── */}
      {tab === 'pendientes' && (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">
            Actividades pendientes · {pendientes.length} registro{pendientes.length !== 1 ? 's' : ''}
          </p>
          <ListaActividades items={pendientes} color="purple" />
        </div>
      )}

      {/* ── Pestaña 3: Actividades del día ── */}
      {tab === 'actividades' && (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">
            Actividades del día · {completados.length} registro{completados.length !== 1 ? 's' : ''}
          </p>
          <ListaActividades items={completados} conEstado />
        </div>
      )}

    </div>
  )
}
