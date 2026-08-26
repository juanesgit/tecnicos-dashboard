import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { CELULAS_LIST, getMicroceldas, getCiudadesDeMicrocelda } from '../constants/celulas'

const ROLES = [
  { value: 'admin',                label: 'Admin' },
  { value: 'lider_celula',         label: 'Líder de Célula' },
  { value: 'supervisor_microcelda', label: 'Supervisor de Microcelda' },
]

const BADGE_ROLE = {
  admin:                 'bg-violet-100 text-violet-700',
  lider_celula:          'bg-indigo-100 text-indigo-700',
  supervisor_microcelda: 'bg-blue-100 text-blue-700',
}

const ROLE_LABEL = {
  admin:                 'Admin',
  lider_celula:          'Líder Célula',
  supervisor_microcelda: 'Supervisor',
}

const NEEDS_CELULA     = (role) => role === 'lider_celula' || role === 'supervisor_microcelda'
const NEEDS_MICROCELDA = (role) => role === 'supervisor_microcelda'

/* ── Menú de acciones por usuario ── */
function AccionesMenu({ usuario, onEdit, onToggle, toggling }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  const handleToggle = () => {
    setOpen(false)
    if (usuario.is_active) {
      toast((t) => (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-slate-800">¿Desactivar a {usuario.full_name}?</p>
          <p className="text-xs text-slate-500">Ya no podrá iniciar sesión.</p>
          <div className="flex gap-2">
            <button
              onClick={() => { toast.dismiss(t.id); onToggle(usuario) }}
              className="flex-1 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold"
            >Desactivar</button>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="flex-1 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold"
            >Cancelar</button>
          </div>
        </div>
      ), { duration: 8000 })
    } else {
      onToggle(usuario)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ WebkitTapHighlightColor: 'transparent' }}
        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
          open ? 'bg-slate-200 text-slate-700' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
        }`}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5"  r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 w-44">
          <button
            onClick={() => { setOpen(false); onEdit(usuario) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar usuario
          </button>
          <div className="border-t border-slate-100 mx-2 my-1" />
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
              usuario.is_active
                ? 'text-red-600 hover:bg-red-50'
                : 'text-green-600 hover:bg-green-50'
            }`}
          >
            {usuario.is_active ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Desactivar
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Activar
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Modal crear / editar ── */
function ModalUsuario({ usuario, onClose, onSaved }) {
  const isEdit = Boolean(usuario?.id)

  // Resolver lista inicial de microceldas del usuario (soporta campo legacy y nuevo)
  const initialMicroceldas = usuario?.microceldas?.length
    ? usuario.microceldas
    : (usuario?.microcelda ? [usuario.microcelda] : [])

  const [form, setForm] = useState({
    username:    usuario?.username  ?? '',
    full_name:   usuario?.full_name ?? '',
    password:    '',
    role:        usuario?.role      ?? 'supervisor_microcelda',
    celula:      usuario?.celula    ?? '',
    microceldas: initialMicroceldas,   // siempre es un array
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const celulaMicroceldas = getMicroceldas(form.celula)  // opciones disponibles

  const handleCelulaChange = (v) => setForm((f) => ({ ...f, celula: v, microceldas: [] }))

  const handleRoleChange = (v) => setForm((f) => ({
    ...f,
    role: v,
    celula:      v === 'admin' ? '' : f.celula,
    microceldas: v !== 'supervisor_microcelda' ? [] : f.microceldas,
  }))

  const toggleMicrocelda = (mc) => {
    setForm((f) => ({
      ...f,
      microceldas: f.microceldas.includes(mc)
        ? f.microceldas.filter((m) => m !== mc)
        : [...f.microceldas, mc],
    }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (NEEDS_MICROCELDA(form.role) && form.celula && form.microceldas.length === 0) {
      toast.error('Selecciona al menos una microcelda')
      return
    }
    setSaving(true)
    try {
      const body = {
        username:  form.username,
        full_name: form.full_name,
        role:      form.role,
        celula:    NEEDS_CELULA(form.role) ? form.celula : null,
        microceldas: NEEDS_MICROCELDA(form.role) ? form.microceldas : null,
      }
      if (form.password) body.password = form.password
      else if (!isEdit)  body.password = form.password  // requerido en creación (validado por HTML)

      if (isEdit) {
        await api.put(`/usuarios/${usuario.id}`, body)
        toast.success('Usuario actualizado')
      } else {
        await api.post('/usuarios', body)
        toast.success('Usuario creado')
      }
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ paddingBottom: '72px' }}>
      <form
        onSubmit={submit}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl"
        style={{ maxHeight: 'calc(100dvh - 140px)', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header fijo */}
        <div style={{ flexShrink: 0 }} className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cuerpo scrolleable */}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100dvh - 280px)', flexShrink: 1 }} className="px-5 py-4 space-y-4">
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Usuario</label>
              <input required value={form.username}
                onChange={(e) => set('username', e.target.value)}
                className={inputCls} placeholder="nombre.apellido" />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Nombre completo</label>
            <input required value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              className={inputCls} placeholder="Juan Pérez" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              {isEdit ? 'Nueva contraseña (vacío = sin cambio)' : 'Contraseña'}
            </label>
            <input required={!isEdit} type="password" value={form.password}
              onChange={(e) => set('password', e.target.value)}
              className={inputCls} placeholder="••••••••" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Rol</label>
            <select value={form.role} onChange={(e) => handleRoleChange(e.target.value)} className={inputCls}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {NEEDS_CELULA(form.role) && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Célula</label>
              <select required value={form.celula} onChange={(e) => handleCelulaChange(e.target.value)} className={inputCls}>
                <option value="">— Seleccionar célula —</option>
                {CELULAS_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* ── Multi-select de microceldas (supervisor) ── */}
          {NEEDS_MICROCELDA(form.role) && form.celula && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Microceldas <span className="text-slate-400 font-normal normal-case">({form.celula})</span>
                </label>
                {form.microceldas.length > 0 && (
                  <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {form.microceldas.length} seleccionada{form.microceldas.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-52 overflow-y-auto">
                {celulaMicroceldas.length === 0 ? (
                  <p className="text-xs text-slate-400 px-3 py-3 text-center">Sin microceldas disponibles</p>
                ) : (
                  celulaMicroceldas.map((mc) => {
                    const checked = form.microceldas.includes(mc)
                    return (
                      <button
                        key={mc}
                        type="button"
                        onClick={() => toggleMicrocelda(mc)}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors ${
                          checked ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          checked ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                        }`}>
                          {checked && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className={`font-medium ${checked ? 'text-blue-700' : 'text-slate-700'}`}>{mc}</span>
                      </button>
                    )
                  })
                )}
              </div>
              {form.microceldas.length === 0 && (
                <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Selecciona al menos una microcelda
                </p>
              )}
            </div>
          )}

          {/* Alcance supervisor — resumen */}
          {form.role === 'supervisor_microcelda' && form.celula && form.microceldas.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-blue-700">
                📍 Alcance · {form.microceldas.length === 1 ? form.microceldas[0] : `${form.microceldas.length} microceldas`}
              </p>
              <p className="text-xs text-blue-500">Célula <span className="font-medium">{form.celula}</span></p>
              {form.microceldas.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {form.microceldas.map((mc) => (
                    <span key={mc} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{mc}</span>
                  ))}
                </div>
              )}
              <p className="text-xs text-blue-400">
                Verá los técnicos de {form.microceldas.length === 1 ? 'esta microcelda' : 'estas microceldas'}.
              </p>
            </div>
          )}

          {/* Alcance líder */}
          {form.role === 'lider_celula' && form.celula && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-3 space-y-1">
              <p className="text-xs font-semibold text-indigo-700">🗺 Alcance · Célula {form.celula}</p>
              <p className="text-xs text-indigo-500">{celulaMicroceldas.length} microcelda{celulaMicroceldas.length !== 1 ? 's' : ''} asignadas</p>
              <p className="text-xs text-indigo-400">Verá todos los técnicos de su célula.</p>
            </div>
          )}

        </div>

        {/* Botones fijos al fondo */}
        <div style={{ flexShrink: 0 }} className="flex gap-3 px-5 py-4 border-t border-slate-100 bg-white rounded-b-2xl">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-semibold transition-colors">
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Página principal ── */
export default function Usuarios() {
  const [users, setUsers]       = useState(null)
  const [modal, setModal]       = useState(null)
  const [toggling, setToggling] = useState(null)

  const load = async () => {
    try {
      const { data } = await api.get('/usuarios')
      setUsers(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cargar usuarios')
    }
  }

  useEffect(() => { load() }, [])

  const toggleActivo = async (u) => {
    setToggling(u.id)
    try {
      await api.put(`/usuarios/${u.id}`, { is_active: !u.is_active })
      await load()
      toast.success(u.is_active ? 'Usuario desactivado' : 'Usuario activado')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error')
    } finally {
      setToggling(null)
    }
  }

  const activos   = (users ?? []).filter(u =>  u.is_active)
  const inactivos = (users ?? []).filter(u => !u.is_active)

  return (
    <div className="max-w-4xl mx-auto px-3 py-3 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-slate-800 text-base">Usuarios</h1>
          {users !== null && (
            <p className="text-xs text-slate-400">{activos.length} activo{activos.length !== 1 ? 's' : ''}{inactivos.length > 0 ? ` · ${inactivos.length} inactivo${inactivos.length !== 1 ? 's' : ''}` : ''}</p>
          )}
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo usuario
        </button>
      </div>

      {/* Skeleton */}
      {users === null && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Vacío */}
      {users !== null && users.length === 0 && (
        <div className="text-center py-16 text-slate-400 text-sm">
          <div className="text-4xl mb-3">👤</div>
          No hay usuarios registrados aún.
        </div>
      )}

      {/* Lista activos */}
      {activos.length > 0 && (
        <div className="space-y-2">
          {activos.map((u) => (
            <UserRow key={u.id} u={u} onEdit={setModal} onToggle={toggleActivo} toggling={toggling === u.id} />
          ))}
        </div>
      )}

      {/* Lista inactivos */}
      {inactivos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">Inactivos</p>
          {inactivos.map((u) => (
            <UserRow key={u.id} u={u} onEdit={setModal} onToggle={toggleActivo} toggling={toggling === u.id} />
          ))}
        </div>
      )}

      {modal && (
        <ModalUsuario
          usuario={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}

/* ── Fila de usuario ── */
function UserRow({ u, onEdit, onToggle, toggling }) {
  const initials = u.full_name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
  const avatarColor = u.is_active ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400'

  return (
    <div className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-3 transition-opacity ${
      u.is_active ? 'border-slate-100' : 'border-slate-100 opacity-60'
    }`}>
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${avatarColor}`}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-slate-800 text-sm truncate">{u.full_name}</p>
          {!u.is_active && (
            <span className="text-[10px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">
              Inactivo
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 truncate">
          @{u.username}
          {u.celula     ? ` · ${u.celula}`     : ''}
          {u.microcelda ? ` / ${u.microcelda}` : ''}
        </p>
      </div>

      {/* Badge rol */}
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${BADGE_ROLE[u.role] ?? 'bg-slate-100 text-slate-500'}`}>
        {ROLE_LABEL[u.role] ?? u.role}
      </span>

      {/* Menú acciones */}
      <AccionesMenu usuario={u} onEdit={onEdit} onToggle={onToggle} toggling={toggling} />
    </div>
  )
}
