// Gamification helpers — derives XP, level, streak from existing data.
// All client-side, no schema changes.

export const LEVELS = [
  { name: 'Trainee', min: 0, max: 500, color: '#94A3B8' },
  { name: 'Rookie', min: 500, max: 1500, color: '#10B981' },
  { name: 'Pro', min: 1500, max: 3000, color: '#2563EB' },
  { name: 'Expert', min: 3000, max: 5000, color: '#8B5CF6' },
  { name: 'Master', min: 5000, max: Infinity, color: '#F59E0B' },
]

// 10 XP per practice item, +5 bonus if perfect, 50 XP per lesson passed
export function computeXP(sessions, completions, responses = []) {
  let xp = 0
  for (const r of responses) {
    if (!r) continue
    const max = r.max_score || 0
    const score = r.score || 0
    xp += 10
    if (max > 0 && score === max) xp += 5
  }
  // If we don't have responses loaded, fall back to per-session approximation
  if (responses.length === 0) {
    for (const s of sessions) {
      const max = s.max_score || 0
      const score = s.total_score || 0
      xp += 25
      if (max > 0) xp += Math.round((score / max) * 25)
    }
  }
  for (const c of completions) {
    if (c.passed) xp += 50
  }
  return xp
}

export function levelFor(xp) {
  const lvl = LEVELS.find((l) => xp >= l.min && xp < l.max) || LEVELS[0]
  const idx = LEVELS.indexOf(lvl)
  const next = LEVELS[idx + 1] || lvl
  const span = (lvl.max === Infinity ? lvl.min + 1000 : lvl.max) - lvl.min
  const progress = Math.min(1, (xp - lvl.min) / span)
  return {
    name: lvl.name,
    color: lvl.color,
    nextName: next.name,
    progress,
    xpInLevel: xp - lvl.min,
    xpToNext: lvl.max === Infinity ? 0 : lvl.max - xp,
    levelMin: lvl.min,
    levelMax: lvl.max,
  }
}

// Streak: count consecutive days (ending today or yesterday) with at least one
// session OR lesson completion.
export function computeStreak(sessions, completions) {
  const days = new Set()
  for (const s of sessions) {
    if (s.created) days.add(dateKey(s.created))
  }
  for (const c of completions) {
    if (c.completed_at) days.add(dateKey(c.completed_at))
  }
  if (days.size === 0) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let cursor = new Date(today)
  // Allow streak to start from yesterday if today has nothing
  if (!days.has(dateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!days.has(dateKey(cursor))) return 0
  }
  let streak = 0
  while (days.has(dateKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function dateKey(d) {
  const dt = typeof d === 'string' ? new Date(d) : d
  return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`
}

// Sessions in the last N days
export function sessionsInLastDays(sessions, n = 7) {
  const cutoff = Date.now() - n * 86400000
  return sessions.filter((s) => new Date(s.created).getTime() >= cutoff)
}

// Heatmap data — last 84 days (12 weeks) of activity counts
export function heatmapData(sessions, completions, days = 84) {
  const counts = {}
  for (const s of sessions) {
    const k = dateKey(s.created)
    counts[k] = (counts[k] || 0) + 1
  }
  for (const c of completions) {
    if (!c.completed_at) continue
    const k = dateKey(c.completed_at)
    counts[k] = (counts[k] || 0) + 1
  }
  const out = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    out.push({ date: new Date(d), count: counts[dateKey(d)] || 0 })
  }
  return out
}

// Objection categories (must match seeded data) — uses Phosphor icon names
export const CATEGORIES = [
  { key: 'Intro/SOA', iconName: 'Microphone', color: '#2563EB', tone: 'blue' },
  { key: 'RWB Card', iconName: 'CreditCard', color: '#EF4444', tone: 'red' },
  { key: 'SEP', iconName: 'CalendarCheck', color: '#F59E0B', tone: 'amber' },
  { key: 'No Value', iconName: 'XCircle', color: '#8B5CF6', tone: 'violet' },
]

export function categoryMastery(responses) {
  const map = {}
  for (const r of responses) {
    const cat = r.expand?.objection_id?.category || r.category
    if (!cat) continue
    if (!map[cat]) map[cat] = { total: 0, max: 0, count: 0 }
    map[cat].total += r.score || 0
    map[cat].max += r.max_score || 0
    map[cat].count += 1
  }
  return CATEGORIES.map((c) => {
    const v = map[c.key]
    return {
      ...c,
      pct: v && v.max > 0 ? Math.round((v.total / v.max) * 100) : 0,
      count: v ? v.count : 0,
    }
  })
}
