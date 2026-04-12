import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowLeft, ArrowRight, X } from '@phosphor-icons/react'
import { pb } from '../lib/pb'
import {
  computeXP,
  computeStreak,
  levelFor,
  categoryMastery,
} from '../lib/gamification'
import { fetchAllReviews, isDueForReview } from '../lib/spacedRepetition'

function initials(name, email) {
  const src = (name || email || '').trim()
  if (!src) return 'A'
  const parts = src.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

function quizTone(v) { return v >= 85 ? 'success' : v >= 60 ? 'warn' : 'danger' }
function gpaTone(v) { return v >= 3.0 ? 'success' : v >= 2.0 ? 'warn' : 'danger' }
function masteryTone(p) { return p >= 85 ? 'var(--green)' : p >= 50 ? 'var(--warn)' : 'var(--error)' }

const STAGE_LABELS = {
  intro_soa: 'Intro / SOA',
  qualifying: 'Qualifying',
  presenting: 'Presenting',
  closing: 'Closing',
}
const TYPE_LABELS = {
  multiple_choice: 'MC',
  free_text: 'Free Text',
  mixed: 'Mixed',
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(d) {
  if (!d) return 'Never'
  const ms = Date.now() - new Date(d).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return formatDate(d)
}

// Sparkline SVG
function Sparkline({ data, width = 200, height = 40 }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 100)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  const last = data[data.length - 1]
  const lastX = width
  const lastY = height - ((last - min) / range) * (height - 4) - 2
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3" fill="var(--green)" />
    </svg>
  )
}

export default function SupervisorAgent() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [agent, setAgent] = useState(null)
  const [completions, setCompletions] = useState([])
  const [sessions, setSessions] = useState([])
  const [responses, setResponses] = useState([])
  const [lessons, setLessons] = useState([])
  const [reviewQueue, setReviewQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [a, cs, ps, ls] = await Promise.all([
          pb.collection('users').getOne(id),
          pb.collection('lesson_completions').getFullList({ filter: `agent_id = "${id}"`, sort: '-completed_at' }).catch(() => []),
          pb.collection('practice_sessions').getFullList({ filter: `agent_id = "${id}"`, sort: '-created' }).catch(() => []),
          pb.collection('lessons').getFullList({ filter: 'active = true', sort: 'week_number,order_index' }).catch(() => []),
        ])

        let rs = []
        if (ps.length > 0) {
          const filter = ps.slice(0, 60).map((p) => `session_id = "${p.id}"`).join(' || ')
          rs = await pb.collection('session_responses').getFullList({ filter, expand: 'objection_id' }).catch(() => [])
        }

        const rq = await fetchAllReviews(pb, id).catch(() => [])

        if (cancelled) return
        setAgent(a)
        setCompletions(cs)
        setSessions(ps)
        setResponses(rs)
        setLessons(ls)
        setReviewQueue(rq)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const stats = useMemo(() => {
    const quizAvg = completions.length > 0
      ? Math.round(completions.reduce((a, c) => a + (c.quiz_score || 0), 0) / completions.length)
      : 0
    const gpa = sessions.length > 0
      ? parseFloat((sessions.reduce((a, s) => a + ((s.total_score || 0) / (s.max_score || 1)) * 4, 0) / sessions.length).toFixed(1))
      : 0
    const xp = computeXP(sessions, completions, responses)
    const lvl = levelFor(xp)
    const streak = computeStreak(sessions, completions)
    const certified = quizAvg >= 85 && gpa >= 3.0
    const lastActive = sessions[0]?.created || completions[0]?.completed_at || null
    return { quizAvg, gpa, xp, lvl, streak, certified, sessionCount: sessions.length, lastActive }
  }, [completions, sessions, responses])

  const mastery = useMemo(() => categoryMastery(responses), [responses])

  const trendData = useMemo(() => {
    return sessions.slice(0, 20).reverse().map((s) =>
      s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0
    )
  }, [sessions])

  const lessonMap = useMemo(() => Object.fromEntries(lessons.map((l) => [l.id, l])), [lessons])
  const completionsByLesson = useMemo(() => {
    const map = {}
    for (const c of completions) {
      if (!map[c.lesson_id] || c.quiz_score > (map[c.lesson_id].quiz_score || 0)) {
        map[c.lesson_id] = c
      }
    }
    return map
  }, [completions])

  const reviewStats = useMemo(() => {
    const total = reviewQueue.length
    const dueToday = reviewQueue.filter(isDueForReview).length
    return { total, dueToday }
  }, [reviewQueue])

  async function handleStatusChange(newStatus) {
    setStatusSaving(true)
    setStatusMsg('')
    try {
      await pb.collection('users').update(id, { status: newStatus })
      setAgent((a) => ({ ...a, status: newStatus }))
      setStatusMsg('saved')
      setTimeout(() => setStatusMsg(''), 2000)
    } catch (e) {
      setStatusMsg('error')
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleResetPassword() {
    setResetMsg('')
    try {
      await pb.collection('users').requestPasswordReset(agent.email)
      setResetMsg('sent')
      setTimeout(() => setResetMsg(''), 3000)
    } catch {
      setResetMsg('error')
    }
  }

  async function handleRemoveAgent() {
    setRemoving(true)
    try {
      await pb.collection('users').update(id, { status: 'suspended' })
      setShowRemoveConfirm(false)
      navigate('/supervisor')
    } catch {
      setRemoving(false)
    }
  }

  if (loading) return <div className="page"><div className="loader">Loading agent...</div></div>
  if (!agent) return <div className="page"><div className="card empty-state"><p>Agent not found.</p></div></div>

  const memberSince = agent.created
    ? new Date(agent.created).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '--'
  const status = agent.status || 'active'

  return (
    <div className="page sa-page">
      {/* Back link */}
      <div className="sa-breadcrumb">
        <Link to="/supervisor"><ArrowLeft size={14} /> Back to Team</Link>
      </div>

      {/* Agent info card */}
      <motion.div
        className="card sa-info-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="sa-info-left">
          <div className="sa-avatar">{initials(agent.name, agent.email)}</div>
          <div>
            <h2 className="sa-name">{agent.name || agent.email}</h2>
            <div className="sa-email">{agent.email}</div>
            <div className="sa-meta-badges">
              <span className="badge info">{agent.role || 'agent'}</span>
              <span className={`sv-status-dot ${status}`} />
              <span className="badge" style={{ textTransform: 'capitalize' }}>{status}</span>
              <span className="sa-member-since">Member since {memberSince}</span>
              <span className="sa-member-since">Last active: {timeAgo(stats.lastActive)}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="sv-level-badge" style={{ color: stats.lvl.color, borderColor: stats.lvl.color }}>
            {stats.lvl.name}
          </span>
          {stats.certified && <span className="badge success">Certified</span>}
        </div>
      </motion.div>

      {/* Quick stats */}
      <motion.div
        className="stats-strip"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <div className="stat">
          <div className="label"><span className="dot blue" />Quiz Avg</div>
          <div className="value">{stats.quizAvg}%</div>
          <div className="meta">{stats.quizAvg >= 85 ? 'cert ready' : 'need 85%+'}</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />Practice GPA</div>
          <div className="value">{stats.gpa.toFixed(1)}</div>
          <div className="meta">{stats.gpa >= 3.0 ? 'cert ready' : 'need 3.0+'}</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot blue" />Sessions</div>
          <div className="value">{stats.sessionCount}</div>
          <div className="meta">total practice</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot amber" />Streak</div>
          <div className="value">{stats.streak}</div>
          <div className="meta">{stats.streak > 0 ? 'days' : 'inactive'}</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />XP</div>
          <div className="value">{stats.xp.toLocaleString()}</div>
          <div className="meta">{stats.lvl.name}</div>
        </div>
      </motion.div>

      {/* Certification Progress */}
      <motion.div
        className="card"
        style={{ marginTop: 18 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
      >
        <h2>Certification Progress</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              Level: <strong style={{ color: stats.lvl.color }}>{stats.lvl.name}</strong>
              {stats.lvl.xpToNext > 0 && <span> — {stats.lvl.xpToNext.toLocaleString()} XP to {stats.lvl.nextName}</span>}
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(stats.lvl.progress * 100)}%`, background: stats.lvl.color, borderRadius: 4, transition: 'width 0.4s' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Quiz:</span>{' '}
              <span className={`badge ${quizTone(stats.quizAvg)}`}>{stats.quizAvg}%</span>
              <span style={{ color: 'var(--text-muted)' }}> / 85%</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>GPA:</span>{' '}
              <span className={`badge ${gpaTone(stats.gpa)}`}>{stats.gpa.toFixed(1)}</span>
              <span style={{ color: 'var(--text-muted)' }}> / 3.0</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Category Mastery */}
      <motion.div
        className="card"
        style={{ marginTop: 18 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <h2>Category Mastery</h2>
        {mastery.every((m) => m.count === 0) ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No graded responses yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {mastery.map((m) => (
              <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 80, fontSize: 12, fontWeight: 500, color: 'var(--text)', flexShrink: 0 }}>{m.key}</div>
                <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'var(--surface)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${m.pct}%`,
                    background: masteryTone(m.pct),
                    borderRadius: 5,
                    transition: 'width 0.4s',
                    minWidth: m.count > 0 ? 4 : 0,
                  }} />
                </div>
                <div style={{ width: 50, textAlign: 'right', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: masteryTone(m.pct) }}>
                  {m.count > 0 ? `${m.pct}%` : '--'}
                </div>
                <div style={{ width: 50, fontSize: 11, color: 'var(--text-muted)' }}>
                  {m.count > 0 ? `${m.count} drills` : 'none'}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Performance Trend */}
      {trendData.length >= 2 && (
        <motion.div
          className="card"
          style={{ marginTop: 18 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2>Performance Trend</h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last {trendData.length} sessions</span>
          </div>
          <Sparkline data={trendData} width={Math.min(600, trendData.length * 30)} height={48} />
        </motion.div>
      )}

      {/* Recent Sessions */}
      <motion.div
        className="card"
        style={{ marginTop: 18 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <h2>Recent Sessions</h2>
        {sessions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sessions yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Stage</th>
                  <th>Type</th>
                  <th>Diff</th>
                  <th>Score</th>
                  <th>Result</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 10).map((s) => {
                  const pct = s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0
                  return (
                    <tr key={s.id}>
                      <td className="nowrap">{formatDate(s.created)}</td>
                      <td><span className="badge info">{STAGE_LABELS[s.call_stage] || s.call_stage}</span></td>
                      <td><span className="badge">{TYPE_LABELS[s.session_type] || s.session_type}</span></td>
                      <td className="text-mono">{s.difficulty_level}</td>
                      <td><span className={`badge ${pct >= 80 ? 'success' : pct >= 60 ? 'warn' : 'danger'}`}>{pct}%</span></td>
                      <td><span className={`badge ${s.passed ? 'success' : 'warn'}`}>{s.passed ? 'Passed' : 'Retry'}</span></td>
                      <td>
                        <Link to={`/history/${s.id}`} className="review-link">
                          Replay <ArrowRight size={12} weight="bold" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Lesson Progress — all lessons */}
      <motion.div
        className="card"
        style={{ marginTop: 18 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h2>Lesson Progress</h2>
        {lessons.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No lessons configured.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lesson</th>
                  <th>Week</th>
                  <th>Score</th>
                  <th>Attempts</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((l) => {
                  const c = completionsByLesson[l.id]
                  return (
                    <tr key={l.id}>
                      <td>{l.title}</td>
                      <td className="text-mono">{l.week_number}</td>
                      <td>
                        {c ? <span className={`badge ${quizTone(c.quiz_score || 0)}`}>{c.quiz_score}%</span> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>--</span>}
                      </td>
                      <td className="text-mono">{c ? c.attempts : '--'}</td>
                      <td>
                        {c ? (
                          <span className={`badge ${c.passed ? 'success' : 'warn'}`}>{c.passed ? 'Passed' : 'Failed'}</span>
                        ) : (
                          <span className="badge" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}>Not Started</span>
                        )}
                      </td>
                      <td className="nowrap">{c?.completed_at ? formatDate(c.completed_at) : '--'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Review Queue */}
      <motion.div
        className="card"
        style={{ marginTop: 18 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
      >
        <h2>Review Queue</h2>
        <div className="sa-review-stats">
          <span><strong>{reviewStats.total}</strong> objection{reviewStats.total !== 1 ? 's' : ''} in queue</span>
          <span className="sa-review-sep" />
          <span>
            <strong className={reviewStats.dueToday > 0 ? 'text-error' : ''}>{reviewStats.dueToday}</strong> due today
          </span>
        </div>
        {reviewStats.total === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>No objections in spaced repetition queue.</p>
        )}
      </motion.div>

      {/* Actions */}
      <motion.div
        className="card sa-actions"
        style={{ marginTop: 18 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <h2>Actions</h2>
        <div className="sa-action-row">
          <div className="sa-action-group">
            <label className="sa-action-label">Status</label>
            <select
              value={status}
              disabled={statusSaving}
              onChange={(e) => handleStatusChange(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
            {statusMsg === 'saved' && <span className="inline-success">Updated</span>}
            {statusMsg === 'error' && <span className="inline-error">Failed</span>}
          </div>
          <div className="sa-action-group">
            <label className="sa-action-label">Password</label>
            <button className="outline-red" onClick={handleResetPassword}>Reset Password</button>
            {resetMsg === 'sent' && <span className="inline-success">Reset email sent</span>}
            {resetMsg === 'error' && <span className="inline-error">Failed to send</span>}
          </div>
          <div className="sa-action-group" style={{ marginLeft: 'auto' }}>
            <button className="outline-red" onClick={() => setShowRemoveConfirm(true)}>Remove Agent</button>
          </div>
        </div>
      </motion.div>

      {/* Remove confirmation modal */}
      <AnimatePresence>
        {showRemoveConfirm && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowRemoveConfirm(false)}>
            <motion.div
              className="modal-card modal-sm"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>Remove Agent</h2>
                <button className="modal-close" onClick={() => setShowRemoveConfirm(false)}><X size={16} /></button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
                  Are you sure you want to remove <strong>{agent.name || agent.email}</strong>? This will set their status to suspended. They will no longer be able to access the platform.
                </p>
                <div className="modal-actions">
                  <button onClick={() => setShowRemoveConfirm(false)}>Cancel</button>
                  <button className="outline-red" onClick={handleRemoveAgent} disabled={removing}>
                    {removing ? 'Removing...' : 'Confirm Remove'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
