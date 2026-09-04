const ALL_TABS = [
  {
    id: 'encurso',
    label: 'En curso',
    adminOnly: false,
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.8}
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
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.8}
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
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.8}
          d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    id: 'productividad',
    label: 'Productividad',
    adminOnly: false,
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.8}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'alarmas',
    label: 'Alarmas',
    adminOnly: false,
    roles: ['admin', 'supervisor_ccot'],
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.8}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    id: 'snapshots',
    label: 'Admin',
    adminOnly: true,
    icon: (active) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.8}
          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
  },
]

export default function BottomNav({ activeTab, onTabChange, counts = {}, isAdmin = false, userRole = '' }) {
  const TABS = ALL_TABS.filter(t => {
    if (t.roles) return t.roles.includes(userRole)
    return !t.adminOnly || isAdmin
  })

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: '#0b0b0b',
        borderTop: '1px solid rgba(204,39,53,0.2)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex h-16 max-w-4xl mx-auto px-1">
        {TABS.map(({ id, label, icon }) => {
          const active = activeTab === id
          const count  = counts[id]

          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 relative transition-all duration-150"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {/* Línea superior activa */}
              {active && (
                <span
                  className="absolute top-0 left-2 right-2 rounded-b-full"
                  style={{ height: 3, background: '#CC2735' }}
                />
              )}

              {/* Pill de fondo — cubre ícono + label completo */}
              {active && (
                <span
                  className="absolute rounded-xl transition-all"
                  style={{
                    inset: '6px 4px 6px 4px',
                    background: 'rgba(204,39,53,0.22)',
                  }}
                />
              )}

              {/* Ícono */}
              <span
                className="relative z-10 transition-colors"
                style={{ color: active ? '#FFFFFF' : '#4A4568' }}
              >
                {icon(active)}
                {count > 0 && !active && (
                  <span
                    className="absolute -top-1 -right-1.5 min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-0.5 leading-none"
                    style={{ background: '#CC2735', color: '#fff' }}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>

              {/* Label */}
              <span
                className="text-[10px] font-medium leading-none relative z-10 transition-colors"
                style={{ color: active ? '#FFFFFF' : '#4A4568' }}
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
