import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { CheckCircle, Warning, X, ArrowRight } from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { sessionsInLastDays, computeStreak } from '../lib/gamification'

function initials(name, email) {
  const src = (name || email || '').trim()
  if (!src) return 'A'
  const parts = src.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

const DISMISS_KEY = 'hia-dismissed-flags'

function getDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}')
  } catch { return {} }
}

function setDismissed(map) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(map)) } catch { /* ignore */ }
}

export default function SupervisorFlags() {
  const { user } = useAuth()
  const [agents, setAgents] = useState([])
  const [completions, setCompletions] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [dismissed, setDismissedState] = useState(getDismissed)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
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

  const flags = useMemo(() => {
    const list = []
    for (const a of agents) {
      const cs = completions.filter((c) => c.agent_id === a.id)
      const ps = sessions.filter((s) => s.agent_id === a.id)
      const quizAvg = cs.length > 0
        ? Math.round(cs.reduce((acc, c) => acc + (c.quiz_score || 0), 0) / cs.length)
        : -1
      const gpa = ps.length > 0
        ? parseFloat((ps.reduce((acc, s) => acc + ((s.total_score || 0) / (s.max_score || 1)) * 4, 0) / ps.length).toFixed(1))
        : -1
      const recent7 = sessionsInLastDays(ps, 7).length
      const recent14 = sessionsInLastDays(ps, 14).length
      const streak = computeStreak(ps, cs)
      const lastActive = ps[0]?.created || cs[0]?.completed_at || null

      // Quiz flags
      if (quizAvg >= 0 && quizAvg < 50) {
        list.push({ agentId: a.id, agent: a, severity: 'red', reason: `Quiz average below 50% (currently ${quizAvg}%)`, metric: `quiz-${quizAvg}`, lastActive })
      } else if (quizAvg >= 0 && quizAvg < 70) {
        list.push({ agentId: a.id, agent: a, severity: 'amber', reason: `Quiz average below 70% (currently ${quizAvg}%)`, metric: `quiz-${quizAvg}`, lastActive })
      }

      // GPA flags
      if (gpa >= 0 && gpa < 1.0) {
        list.push({ agentId: a.id, agent: a, severity: 'red', reason: `Practice GPA below 1.0 (currently ${gpa.toFixed(1)})`, metric: `gpa-${gpa.toFixed(1)}`, lastActive })
      } else if (gpa >= 0 && gpa < 2.0) {
        list.push({ agentId: a.id, agent: a, severity: 'amber', reason: `Practice GPA below 2.0 (currently ${gpa.toFixed(1)})`, metric: `gpa-${gpa.toFixed(1)}`, lastActive })
      }

      // Inactivity flags
      if (ps.length > 0 && recent14 === 0) {
        list.push({ agentId: a.id, agent: a, severity: 'red', reason: 'No practice sessions in the last 14 days', metric: 'inactive-14', lastActive })
      } else if (ps.length > 0 && recent7 === 0) {
        list.push({ agentId: a.id, agent: a, severity: 'amber', reason: 'No practice sessions in the last 7 days', metric: 'inactive-7', lastActive })
      }

      // Streak broken
      if (ps.length > 0 && streak === 0) {
        list.push({ agentId: a.id, agent: a, severity: 'amber', reason: 'Streak broken — was active, now at 0', metric: 'streak-0', lastActive })
      }
    }

    // Generate unique ID for dismiss tracking
    list.forEach((f) => { f.id = `${f.agentId}:${f.metric}` })

    return list
  }, [agents, completions, sessions])

  function dismissFlag(flagId) {
    const next = { ...dismissed, [flagId]: true }
    setDismissedState(next)
    setDismissed(next)
  }

  const visibleFlags = useMemo(() => {
    let list = flags.filter((f) => !dismissed[f.id])
    if (filter === 'red') list = list.filter((f) => f.severity === 'red')
    if (filter === 'amber') list = list.filter((f) => f.severity === 'amber')
    return list
  }, [flags, filter, dismissed])

  const redCount = flags.filter((f) => !dismissed[f.id] && f.severity === 'red').length
  const amberCount = flags.filter((f) => !dismissed[f.id] && f.severity === 'amber').length
  const totalCount = redCount + amberCount
  const agentsFlagged = new Set(flags.filter((f) => !dismissed[f.id]).map((f) => f.agentId)).size

  if (loading) return <div className="page"><div className="loader">Loading flags…</div></div>

  return (
    <div className="page flags-page">
      {/* Summary strip */}
      <motion.div
        className="stats-strip"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="stat">
          <div className="label"><span className="dot red" />Total Flags</div>
          <div className="value">{totalCount}</div>
          <div className="meta">active</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot red" />Red Flags</div>
          <div className="value">{redCount}</div>
          <div className="meta">critical</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot amber" />Amber Flags</div>
          <div className="value">{amberCount}</div>
          <div className="meta">warning</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot blue" />Agents Flagged</div>
          <div className="value">{agentsFlagged}</div>
          <div className="meta">of {agents.length}</div>
        </div>
      </motion.div>

      {/* Filter */}
      <motion.div
        className="flags-filter-bar"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <button className={`flags-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          All ({totalCount})
        </button>
        <button className={`flags-filter-btn red ${filter === 'red' ? 'active' : ''}`} onClick={() => setFilter('red')}>
          Red ({redCount})
        </button>
        <button className={`flags-filter-btn amber ${filter === 'amber' ? 'active' : ''}`} onClick={() => setFilter('amber')}>
          Amber ({amberCount})
        </button>
      </motion.div>

      {/* Flag list */}
      {visibleFlags.length === 0 ? (
        <motion.div
          className="card flags-success"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <CheckCircle size={40} weight="regular" color="var(--success)" />
          <h3>All clear</h3>
          <p>All agents are performing within thresholds.</p>
        </motion.div>
      ) : (
        <div className="flags-list">
          {visibleFlags.map((f, i) => (
            <motion.div
              key={f.id}
              className={`card flag-card flag-${f.severity}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.03 }}
            >
              <div className="flag-card-main">
                <div className="flag-agent">
                  <div className="sv-avatar">{initials(f.agent.name, f.agent.email)}</div>
                  <div>
                    <div className="sv-agent-name">{f.agent.name || f.agent.email}</div>
                    <div className="sv-agent-email">{f.agent.email}</div>
                  </div>
                </div>
                <div className="flag-detail">
                  <div className="flag-reason">
                    <Warning size={14} weight="fill" color={f.severity === 'red' ? 'var(--error)' : 'var(--warn)'} />
                    {f.reason}
                  </div>
                  {f.lastActive && (
                    <div className="flag-when">Last active: {new Date(f.lastActive).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  )}
                </div>
              </div>
              <div className="flag-actions">
                <Link to={`/supervisor/agent/${f.agentId}`} className="review-link">
                  View Agent <ArrowRight size={12} weight="bold" />
                </Link>
                <button className="flag-dismiss" onClick={() => dismissFlag(f.id)} title="Dismiss">
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
