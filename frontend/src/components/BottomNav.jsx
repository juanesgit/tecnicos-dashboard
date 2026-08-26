const ALL_TABS = [
  {
    id: 'encurso',
    label: 'En curso',
    adminOnly: false,
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'mapas',
    label: 'Mapas',
    adminOnly: false,
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
  {
    id: 'tendencias',
    label: 'Tendencias',
    adminOnly: false,
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    id: 'snapshots',
    label: 'Snapshots',
    adminOnly: true,
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2}
          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
  },
]

const ACTIVE_COLORS = {
  encurso:    { text: '#dc2626', bg: '#fef2f2' },
  mapas:      { text: '#0891b2', bg: '#ecfeff' },
  tendencias: { text: '#7c3aed', bg: '#f5f3ff' },
  snapshots:  { text: '#0f766e', bg: '#f0fdfa' },
}

export default function BottomNav({ activeTab, onTabChange, counts = {}, isAdmin = false }) {
  const TABS = ALL_TABS.filter(t => !t.adminOnly || isAdmin)

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-200/80 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16 max-w-4xl mx-auto">
        {TABS.map(({ id, label, icon }) => {
          const active = activeTab === id
          const colors = ACTIVE_COLORS[id] || { text: '#475569', bg: '#f1f5f9' }
          const count  = counts[id]

          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {active && (
                <span
                  className="absolute top-1.5 rounded-full transition-all"
                  style={{ background: colors.bg, width: 48, height: 30 }}
                />
              )}

              <span className="relative z-10" style={{ color: active ? colors.text : '#94a3b8' }}>
                {icon(active)}
                {count > 0 && !active && (
                  <span
                    className="absolute -top-1 -right-1.5 min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-0.5 leading-none"
                    style={{ background: colors.text, color: '#fff' }}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>

              <span
                className="text-[10px] font-medium leading-none relative z-10 transition-colors"
                style={{ color: active ? colors.text : '#94a3b8' }}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
