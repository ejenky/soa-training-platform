import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Flame, Warning, MagnifyingGlass, ArrowRight } from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { computeXP, computeStreak, levelFor, sessionsInLastDays } from '../lib/gamification'

function initials(name, email) {
  const src = (name || email || '').trim()
  if (!src) return 'A'
  const parts = src.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

function timeAgo(d) {
  if (!d) return '—'
  const ms = Date.now() - new Date(d).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(d).toLocaleDateString()
}

function quizTone(v) { return v >= 85 ? 'success' : v >= 60 ? 'warn' : 'danger' }
function gpaTone(v) { return v >= 3.0 ? 'success' : v >= 2.0 ? 'warn' : 'danger' }

const stagger = {
  hidden: { opacity: 0, y: 8 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.3, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] },
  }),
}

export default function Supervisor() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [completions, setCompletions] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name-asc')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Try supervisor_id first, fall back to all agents
        let ag = await pb.collection('users').getFullList({
          filter: `role = "agent" && supervisor_id = "${user.id}"`,
          sort: 'name',
        }).catch(() => [])
        if (ag.length === 0) {
          ag = await pb.collection('users').getFullList({
            filter: 'role = "agent"',
            sort: 'name',
          }).catch(() => [])
        }
        let cs = []
        let ps = []
        if (ag.length > 0) {
          const ids = ag.map((a) => `agent_id = "${a.id}"`).join(' || ')
          ;[cs, ps] = await Promise.all([
            pb.collection('lesson_completions').getFullList({ filter: ids }).catch(() => []),
            pb.collection('practice_sessions').getFullList({ filter: ids, sort: '-created' }).catch(() => []),
          ])
        }
        if (cancelled) return
        setAgents(ag)
        setCompletions(cs)
        setSessions(ps)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (user?.id) load()
    return () => { cancelled = true }
  }, [user?.id])

  // Compute metrics per agent (memoized)
  const agentMetrics = useMemo(() => {
    const map = {}
    for (const a of agents) {
      const cs = completions.filter((c) => c.agent_id === a.id)
      const ps = sessions.filter((s) => s.agent_id === a.id)
      const quizAvg = cs.length > 0
        ? Math.round(cs.reduce((acc, c) => acc + (c.quiz_score || 0), 0) / cs.length)
        : 0
      const gpa = ps.length > 0
        ? parseFloat((ps.reduce((acc, s) => acc + ((s.total_score || 0) / (s.max_score || 1)) * 4, 0) / ps.length).toFixed(1))
        : 0
      const xp = computeXP(ps, cs)
      const lvl = levelFor(xp)
      const streak = computeStreak(ps, cs)
      const recentSessions = sessionsInLastDays(ps, 7).length
      const flagged = (cs.length > 0 && quizAvg < 70) || recentSessions < 3
      const lastActive = ps[0]?.created || cs[0]?.completed_at || null

      map[a.id] = {
        quizAvg,
        gpa,
        xp,
        level: lvl,
        streak,
        sessionCount: ps.length,
        flagged,
        certified: quizAvg >= 85 && gpa >= 3.0,
        lastActive,
      }
    }
    return map
  }, [agents, completions, sessions])

  // Aggregate stats
  const teamStats = useMemo(() => {
    const metrics = Object.values(agentMetrics)
    const total = agents.length
    const certified = metrics.filter((m) => m.certified).length
    const flagged = metrics.filter((m) => m.flagged).length
    const quizArr = metrics.filter((m) => m.quizAvg > 0)
    const avgQuiz = quizArr.length > 0
      ? Math.round(quizArr.reduce((a, m) => a + m.quizAvg, 0) / quizArr.length)
      : 0
    const gpaArr = metrics.filter((m) => m.gpa > 0)
    const avgGpa = gpaArr.length > 0
      ? (gpaArr.reduce((a, m) => a + m.gpa, 0) / gpaArr.length).toFixed(1)
      : '0.0'
    return { total, certified, flagged, avgQuiz, avgGpa }
  }, [agents, agentMetrics])

  // Filter + sort
  const filtered = useMemo(() => {
    let list = [...agents]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((a) =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.email || '').toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      list = list.filter((a) => (a.status || 'active') === statusFilter)
    }
    if (levelFilter !== 'all') {
      list = list.filter((a) => agentMetrics[a.id]?.level.name === levelFilter)
    }

    list.sort((a, b) => {
      const ma = agentMetrics[a.id] || {}
      const mb = agentMetrics[b.id] || {}
      switch (sortBy) {
        case 'name-asc': return (a.name || a.email || '').localeCompare(b.name || b.email || '')
        case 'name-desc': return (b.name || b.email || '').localeCompare(a.name || a.email || '')
        case 'quiz-desc': return (mb.quizAvg || 0) - (ma.quizAvg || 0)
        case 'gpa-desc': return (mb.gpa || 0) - (ma.gpa || 0)
        case 'active': {
          const da = ma.lastActive ? new Date(ma.lastActive).getTime() : 0
          const db = mb.lastActive ? new Date(mb.lastActive).getTime() : 0
          return db - da
        }
        case 'streak': return (mb.streak || 0) - (ma.streak || 0)
        default: return 0
      }
    })

    return list
  }, [agents, search, statusFilter, levelFilter, sortBy, agentMetrics])

  if (loading) return <div className="page"><div className="loader">Loading team…</div></div>

  return (
    <div className="page supervisor-page">
      {/* Stats strip */}
      <motion.div
        className="stats-strip"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="stat">
          <div className="label"><span className="dot blue" />Agents</div>
          <div className="value">{teamStats.total}</div>
          <div className="meta">total managed</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />Certified</div>
          <div className="value">{teamStats.certified}</div>
          <div className="meta">quiz 85%+ &amp; GPA 3.0+</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot blue" />Avg Quiz</div>
          <div className="value">{teamStats.avgQuiz}%</div>
          <div className="meta">across all agents</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />Avg GPA</div>
          <div className="value">{teamStats.avgGpa}</div>
          <div className="meta">practice sessions</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot red" />Flags</div>
          <div className="value">{teamStats.flagged}</div>
          <div className="meta">need attention</div>
        </div>
      </motion.div>

      {/* Filter bar */}
      <motion.div
        className="sv-filter-bar"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <div className="sv-search">
          <MagnifyingGlass size={14} weight="regular" className="sv-search-icon" />
          <input
            type="text"
            placeholder="Search agents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="all">All Levels</option>
          <option value="Trainee">Trainee</option>
          <option value="Rookie">Rookie</option>
          <option value="Pro">Pro</option>
          <option value="Expert">Expert</option>
          <option value="Master">Master</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
          <option value="quiz-desc">Quiz High-Low</option>
          <option value="gpa-desc">GPA High-Low</option>
          <option value="active">Last Active</option>
          <option value="streak">Streak</option>
        </select>
        <Link to="/register" className="sv-add-btn">Add Agent</Link>
      </motion.div>

      {/* Agent table */}
      <motion.div
        className="card sv-table-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: '36px 24px' }}>
            {agents.length === 0
              ? <p>No agents assigned to you yet.</p>
              : <p>No agents match your filters.</p>
            }
          </div>
        ) : (
          <div className="sv-table-scroll">
            <table className="sv-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Level</th>
                  <th>Quiz Avg</th>
                  <th>GPA</th>
                  <th>Sessions</th>
                  <th>Streak</th>
                  <th>Last Active</th>
                  <th>Status</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => {
                  const m = agentMetrics[a.id] || {}
                  const status = a.status || 'active'
                  return (
                    <motion.tr
                      key={a.id}
                      custom={i}
                      variants={stagger}
                      initial="hidden"
                      animate="visible"
                      className="sv-row"
                      onClick={() => navigate(`/supervisor/agent/${a.id}`)}
                    >
                      <td>
                        <div className="sv-agent-cell">
                          <div className="sv-avatar">{initials(a.name, a.email)}</div>
                          <div>
                            <div className="sv-agent-name">{a.name || a.email}</div>
                            <div className="sv-agent-email">{a.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="sv-level-badge" style={{ color: m.level?.color, borderColor: m.level?.color }}>
                          {m.level?.name || 'Trainee'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${quizTone(m.quizAvg || 0)}`}>{m.quizAvg || 0}%</span>
                      </td>
                      <td>
                        <span className={`badge ${gpaTone(m.gpa || 0)}`}>{m.gpa?.toFixed?.(1) ?? '0.0'}</span>
                      </td>
                      <td className="text-mono">{m.sessionCount || 0}</td>
                      <td>
                        <span className="sv-streak">
                          {m.streak > 0 && <Flame size={12} weight="fill" color="var(--warn)" />}
                          {m.streak || 0}
                        </span>
                      </td>
                      <td className="sv-last-active">{timeAgo(m.lastActive)}</td>
                      <td>
                        <span className={`sv-status-dot ${status}`} title={status} />
                      </td>
                      <td>
                        {m.flagged && <Warning size={14} weight="fill" color="var(--error)" title="Below thresholds" />}
                      </td>
                      <td>
                        <Link
                          to={`/supervisor/agent/${a.id}`}
                          className="review-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View <ArrowRight size={12} weight="bold" />
                        </Link>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  )
}
