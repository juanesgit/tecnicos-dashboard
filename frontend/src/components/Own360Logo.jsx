/**
 * Own360Logo — componente de marca reutilizable
 * Props:
 *   size      : 'xs' | 'sm' | 'md' | 'lg'   (default 'md')
 *   showTagline: bool                          (default false)
 *   theme     : 'dark' | 'light'              (default 'dark')
 *   className  : string extra para el wrapper
 *
 * Geometría del isotipo (viewBox 0 0 48 48, centro 24 24, radio 18):
 *   Arco 300° — abre arriba, entre la 1 y las 11 en punto
 *   Inicio arco : (33, 8.41) = posición 1 en punto  (-60° desde eje X)
 *   Fin arco    : (15, 8.41) = posición 11 en punto (-120° desde eje X)
 *   Punto cyan  : en (15, 8.41) = lado izquierdo de la apertura
 *   Degradado   : violeta claro arriba → violeta oscuro abajo
 */
export default function Own360Logo({
  size = 'md',
  showTagline = false,
  theme = 'dark',
  className = '',
}) {
  const cfg = {
    xs: { mark: 22, own: 14, s360: 14, gap: 5,  dot: 2.6, sw: 2.2 },
    sm: { mark: 28, own: 18, s360: 18, gap: 6,  dot: 3.0, sw: 2.6 },
    md: { mark: 38, own: 24, s360: 24, gap: 8,  dot: 3.5, sw: 2.8 },
    lg: { mark: 58, own: 36, s360: 36, gap: 10, dot: 4.5, sw: 3.0 },
  }
  const c = cfg[size] ?? cfg.md
  const isDark = theme === 'dark'

  const ownColor  = isDark ? '#FFFFFF' : '#0C071C'
  const s360Color = isDark ? '#9B6BFA' : '#5C14D4'
  const tagColor  = isDark ? 'rgba(237,232,253,.38)' : 'rgba(12,7,28,.32)'

  // IDs únicos para evitar colisiones entre instancias del mismo tamaño
  const gradId = `own360-g-${size}-${isDark ? 'd' : 'l'}`

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: c.gap,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {/* ── Isotipo ── */}
      <svg
        viewBox="0 0 48 48"
        fill="none"
        width={c.mark}
        height={c.mark}
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <defs>
          {/* Degradado vertical: claro arriba → oscuro abajo (igual que la imagen) */}
          <linearGradient id={gradId} x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%"   stopColor="#A87EFA" />
            <stop offset="55%"  stopColor="#6B24E8" />
            <stop offset="100%" stopColor="#3E0E9C" />
          </linearGradient>
        </defs>

        {/*
          Arco 300° con apertura en la parte superior:
            M 33 8.41   → punto de inicio en la 1 en punto
            A 18 18 0   → radio 18, sin rotación
            1           → large-arc-flag = 1 (tomar el arco largo, 300°)
            1           → sweep-flag = 1 (sentido horario)
            15 8.41     → punto final en las 11 en punto
        */}
        <path
          d="M33 8.41 A18 18 0 1 1 15 8.41"
          stroke={`url(#${gradId})`}
          strokeWidth={c.sw}
          strokeLinecap="round"
        />

        {/* Punto señal en las 11 en punto (lado izquierdo de la apertura) */}
        <circle cx="15" cy="8.41" r={c.dot} fill="#00C9A8" />
      </svg>

      {/* ── Wordmark ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, lineHeight: 1 }}>
          <span style={{
            fontFamily: "'Syne', system-ui, sans-serif",
            fontWeight: 800,
            fontSize: c.own,
            color: ownColor,
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}>
            OWN
          </span>
          <span style={{
            fontFamily: "'Syne', system-ui, sans-serif",
            fontWeight: 400,
            fontSize: c.s360,
            color: s360Color,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}>
            360
          </span>
        </div>

        {showTagline && (
          <span style={{
            fontFamily: "'Outfit', system-ui, sans-serif",
            fontWeight: 300,
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: tagColor,
            lineHeight: 1,
          }}>
            Tu campo. Tu control.
          </span>
        )}
      </div>
    </div>
  )
}
