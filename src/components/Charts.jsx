// Lightweight inline-SVG chart components — dark theme.

export function ProgressRing({
  size = 80,
  stroke = 6,
  pct = 0,
  color = '#8B5CF6',
  trackColor = 'rgba(255,255,255,0.06)',
  label,
  glow = true,
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c
  const id = `lg-${Math.random().toString(36).slice(2, 8)}`
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={glow ? { filter: `drop-shadow(0 0 8px ${color}66)` } : {}}
      >
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div
        className="center"
        style={{ fontSize: size > 80 ? '1.05rem' : '0.78rem' }}
      >
        {label ?? `${Math.round(pct)}%`}
      </div>
    </div>
  )
}

export function RadarChart({ data, size = 300, max = 100 }) {
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 56
  const n = data.length || 1
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2
  const point = (i, v) => {
    const r = (Math.max(0, Math.min(max, v)) / max) * radius
    return [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r]
  }
  const pts = data.map((d, i) => point(i, d.pct)).map((p) => p.join(',')).join(' ')
  const rings = [0.25, 0.5, 0.75, 1]

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id="radarFill" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="radarStroke" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#C4B5FD" />
        </linearGradient>
      </defs>
      {rings.map((r, i) => (
        <polygon
          key={i}
          points={data
            .map((_, j) => {
              const x = cx + Math.cos(angle(j)) * radius * r
              const y = cy + Math.sin(angle(j)) * radius * r
              return `${x},${y}`
            })
            .join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
        />
      ))}
      {data.map((_, i) => {
        const [x, y] = point(i, max)
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />
        )
      })}
      <polygon
        points={pts}
        fill="url(#radarFill)"
        stroke="url(#radarStroke)"
        strokeWidth={2}
        style={{ filter: 'drop-shadow(0 0 8px rgba(139,92,246,0.5))' }}
      />
      {data.map((d, i) => {
        const [x, y] = point(i, d.pct)
        const lx = cx + Math.cos(angle(i)) * (radius + 30)
        const ly = cy + Math.sin(angle(i)) * (radius + 30)
        return (
          <g key={d.key}>
            <circle
              cx={x}
              cy={y}
              r={3}
              fill="#C4B5FD"
              style={{ filter: 'drop-shadow(0 0 4px rgba(139,92,246,0.8))' }}
            />
            <text
              x={lx}
              y={ly}
              fontSize={10}
              fontWeight={600}
              fill="#94A3B8"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {truncate(d.key, 14)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function truncate(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function LineChart({ data, width = 600, height = 220 }) {
  if (!data || data.length === 0) {
    return (
      <div className="center-empty" style={{ padding: '2rem' }}>
        Not enough data yet
      </div>
    )
  }
  const padding = { top: 20, right: 16, bottom: 28, left: 36 }
  const w = width - padding.left - padding.right
  const h = height - padding.top - padding.bottom
  const ys = data.map((d) => d.y)
  const yMax = Math.max(100, ...ys)
  const yMin = 0
  const xStep = data.length > 1 ? w / (data.length - 1) : 0
  const points = data.map((d, i) => {
    const x = padding.left + i * xStep
    const y = padding.top + h - ((d.y - yMin) / (yMax - yMin || 1)) * h
    return [x, y]
  })
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`)
    .join(' ')
  const area = `${path} L ${points[points.length - 1][0]} ${
    padding.top + h
  } L ${points[0][0]} ${padding.top + h} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto' }}
    >
      <defs>
        <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lineStroke" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#C4B5FD" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const y = padding.top + h * t
        return (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={y + 3}
              fontSize={9}
              fill="#64748B"
              textAnchor="end"
            >
              {Math.round(yMax - (yMax - yMin) * t)}
            </text>
          </g>
        )
      })}
      <path d={area} fill="url(#lineFill)" />
      <path
        d={path}
        fill="none"
        stroke="url(#lineStroke)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 6px rgba(139,92,246,0.6))' }}
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={3}
          fill="#C4B5FD"
          style={{ filter: 'drop-shadow(0 0 4px rgba(139,92,246,0.9))' }}
        />
      ))}
    </svg>
  )
}

export function Heatmap({ data }) {
  const cols = []
  for (let i = 0; i < data.length; i += 7) {
    cols.push(data.slice(i, i + 7))
  }
  function level(c) {
    if (c === 0) return ''
    if (c === 1) return 'l1'
    if (c === 2) return 'l2'
    if (c === 3) return 'l3'
    return 'l4'
  }
  return (
    <>
      <div className="heatmap">
        {cols.map((col, i) => (
          <div key={i} className="col">
            {col.map((d, j) => (
              <div
                key={j}
                className={`cell ${level(d.count)}`}
                title={`${d.date.toDateString()} — ${d.count} activity`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="legend">
        Less
        <span className="sw" />
        <span className="sw l1" />
        <span className="sw l2" />
        <span className="sw l3" />
        <span className="sw l4" />
        More
      </div>
    </>
  )
}

// Animated count-up using motion's animate()
import { useEffect, useState } from 'react'
import { animate, motion, useInView } from 'motion/react'
import { useRef } from 'react'

export function CountUp({ value, duration = 1.1, suffix = '', prefix = '' }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-20px' })
  useEffect(() => {
    if (!inView) return
    const controls = animate(0, value || 0, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    })
    return () => controls.stop()
  }, [value, duration, inView])
  const isFloat = !Number.isInteger(value) && value <= 10
  const text = isFloat
    ? display.toFixed(1)
    : Math.round(display).toLocaleString()
  return (
    <motion.span ref={ref}>
      {prefix}
      {text}
      {suffix}
    </motion.span>
  )
}

// Animated progress bar fill
export function MotionBar({ pct, className = 'progress' }) {
  return (
    <div className={className}>
      <motion.div
        initial={{ width: 0 }}
        whileInView={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        viewport={{ once: true, margin: '-20px' }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}
