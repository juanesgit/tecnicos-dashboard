export default function FiltrosPanel({ filtros, onChange, zonas = {}, onClose }) {
  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'celula') {
      onChange({ ...filtros, celula: value, microcelda: '' })
    } else {
      onChange({ ...filtros, [name]: value })
    }
  }

  const limpiar = () => onChange({ celula: '', microcelda: '', tecnico: '', solo_retraso: false })

  const celulas    = Object.keys(zonas).filter(c => c !== 'Sin clasificar').sort()
  const microceldas = filtros.celula && zonas[filtros.celula]
    ? Object.keys(zonas[filtros.celula]).sort()
    : []

  const hayFiltros = filtros.celula || filtros.microcelda || filtros.tecnico || filtros.solo_retraso

  const inputCls = [
    'w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 bg-white',
    'border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400',
    'transition-colors placeholder-slate-400',
  ].join(' ')

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          <span className="text-sm font-semibold text-slate-700">Filtros</span>
          {hayFiltros && (
            <span className="text-[10px] font-bold bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">
              Activos
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hayFiltros && (
            <button
              onClick={limpiar}
              className="text-xs font-semibold text-red-500 hover:text-red-700 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors"
            >
              Limpiar todo
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Campos ── */}
      <div className="p-4 space-y-3">

        {/* Fila 1: Célula + Microcelda */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Célula</label>
            <div className="relative">
              <select
                name="celula"
                value={filtros.celula}
                onChange={handleChange}
                className={inputCls + ' appearance-none pr-8 ' + (filtros.celula ? 'border-cyan-400 ring-1 ring-cyan-300' : '')}
              >
                <option value="">Todas las células</option>
                {celulas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-semibold uppercase tracking-wide ${filtros.celula ? 'text-slate-500' : 'text-slate-300'}`}>
              Microcelda
            </label>
            <div className="relative">
              <select
                name="microcelda"
                value={filtros.microcelda}
                onChange={handleChange}
                disabled={!filtros.celula}
                className={inputCls + ' appearance-none pr-8 disabled:bg-slate-50 disabled:text-slate-300 disabled:border-slate-100 disabled:cursor-not-allowed ' + (filtros.microcelda ? 'border-cyan-400 ring-1 ring-cyan-300' : '')}
              >
                <option value="">Todas</option>
                {microceldas.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <svg className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 ${filtros.celula ? 'text-slate-400' : 'text-slate-200'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Fila 2: Técnico */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Técnico</label>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              name="tecnico"
              value={filtros.tecnico}
              onChange={handleChange}
              placeholder="Buscar técnico por nombre…"
              className={inputCls + ' pl-9 ' + (filtros.tecnico ? 'border-cyan-400 ring-1 ring-cyan-300' : '')}
            />
            {filtros.tecnico && (
              <button
                onClick={() => onChange({ ...filtros, tecnico: '' })}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Fila 3: Toggle Solo retraso */}
        <button
          onClick={() => onChange({ ...filtros, solo_retraso: !filtros.solo_retraso })}
          style={{ WebkitTapHighlightColor: 'transparent' }}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
            filtros.solo_retraso
              ? 'bg-red-50 border-red-300 text-red-700'
              : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
          }`}
        >
          <span className="flex items-center gap-2">
            <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
              filtros.solo_retraso ? 'border-red-500 bg-red-500' : 'border-slate-300'
            }`}>
              {filtros.solo_retraso && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            Solo técnicos con retraso
          </span>
          {filtros.solo_retraso && (
            <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
              Activo
            </span>
          )}
        </button>

      </div>
    </div>
  )
}
