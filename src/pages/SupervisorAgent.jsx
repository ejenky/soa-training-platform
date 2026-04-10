import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowLeft, ArrowRight, Warning, X } from '@phosphor-icons/react'
import { pb } from '../lib/pb'
import {
  computeXP,
  computeStreak,
  levelFor,
  categoryMastery,
  CATEGORIES,
} from '../lib/gamification'
import { fetchAllReviews, isDueForReview } from '../lib/spacedRepetition'

function initials(name, email) {
  const src = (name || email || '').trim()
  if (!src) return 'A'
  const parts = src.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

function tone(p) { return p >= 85 ? 'good' : p >= 60 ? 'ok' : 'bad' }
function quizTone(v) { return v >= 85 ? 'success' : v >= 60 ? 'warn' : 'danger' }
function gpaTone(v) { return v >= 3.0 ? 'success' : v >= 2.0 ? 'warn' : 'danger' }

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
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
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
          pb.collection('lesson_completions').getFullList({ filter: `agent_id = "${id}"`, sort: '-completed_at' }),
          pb.collection('practice_sessions').getFullList({ filter: `agent_id = "${id}"`, sort: '-created' }),
          pb.collection('lessons').getFullList({ filter: 'active = true' }),
        ])

        let rs = []
        if (ps.length > 0) {
          const filter = ps.slice(0, 60).map((p) => `session_id = "${p.id}"`).join(' || ')
          rs = await pb.collection('session_responses').getFullList({ filter, expand: 'objection_id' }).catch(() => [])
        }

        const rq = await fetchAllReviews(pb, id)

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
    return { quizAvg, gpa, xp, lvl, streak, certified, sessionCount: sessions.length }
  }, [completions, sessions, responses])

  const mastery = useMemo(() => categoryMastery(responses), [responses])
  const sortedMastery = useMemo(() => [...mastery].filter((m) => m.count > 0).sort((a, b) => a.pct - b.pct), [mastery])

  const reviewStats = useMemo(() => {
    const total = reviewQueue.length
    const dueToday = reviewQueue.filter(isDueForReview).length
    return { total, dueToday }
  }, [reviewQueue])

  const lessonMap = useMemo(() => Object.fromEntries(lessons.map((l) => [l.id, l])), [lessons])

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

  if (loading) return <div className="page"><div className="loader">Loading agent…</div></div>
  if (!agent) return <div className="page"><div className="card empty-state"><p>Agent not found.</p></div></div>

  const memberSince = agent.created
    ? new Date(agent.created).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—'
  const status = agent.status || 'active'

  return (
    <div className="page sa-page">
      {/* Breadcrumb */}
      <div className="sa-breadcrumb">
        <Link to="/supervisor"><ArrowLeft size={14} /> Team</Link>
        <span className="sa-breadcrumb-sep">/</span>
        <span>{agent.name || agent.email}</span>
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
              <span className="sv-level-badge" style={{ color: stats.lvl.color, borderColor: stats.lvl.color }}>
                {stats.lvl.name}
              </span>
              <span className={`sv-status-dot ${status}`} />
              <span className="sa-member-since">Member since {memberSince}</span>
            </div>
          </div>
        </div>
        {stats.certified && <span className="badge success">Certified</span>}
      </motion.div>

      {/* Stats strip */}
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
          <div className="label"><span className="dot green" />Total XP</div>
          <div className="value">{stats.xp.toLocaleString()}</div>
          <div className="meta">{stats.lvl.name}</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot amber" />Streak</div>
          <div className="value">{stats.streak}</div>
          <div className="meta">{stats.streak > 0 ? 'days' : 'inactive'}</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot blue" />Sessions</div>
          <div className="value">{stats.sessionCount}</div>
          <div className="meta">practice drills</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />Cert Level</div>
          <div className="value">{agent.certification_level || 0}</div>
          <div className="meta">{stats.certified ? 'certified' : 'in progress'}</div>
        </div>
      </motion.div>

      {/* Weak Spots */}
      <motion.div
        className="card"
        style={{ marginTop: 18 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <h2>Weak Spots</h2>
        {sortedMastery.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No graded responses yet.</p>
        ) : (
          <div className="bars">
            {sortedMastery.slice(0, 8).map((m) => (
              <div key={m.key} className="bar-row">
                <div className="label">{m.key}</div>
                <div className="track"><div className={`fill ${tone(m.pct)}`} style={{ width: `${m.pct}%` }} /></div>
                <div className={`pct ${tone(m.pct)}`}>{m.pct}%</div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

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

      {/* Lesson Progress */}
      <motion.div
        className="card"
        style={{ marginTop: 18 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h2>Lesson Progress</h2>
        {completions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No lessons attempted.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lesson</th>
                  <th>Score</th>
                  <th>Attempts</th>
                  <th>Result</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {completions.map((c) => (
                  <tr key={c.id}>
                    <td>{lessonMap[c.lesson_id]?.title || c.lesson_id}</td>
                    <td><span className={`badge ${quizTone(c.quiz_score || 0)}`}>{c.quiz_score}%</span></td>
                    <td className="text-mono">{c.attempts}</td>
                    <td><span className={`badge ${c.passed ? 'success' : 'warn'}`}>{c.passed ? 'Passed' : 'Retry'}</span></td>
                    <td className="nowrap">{c.completed_at ? formatDate(c.completed_at) : '—'}</td>
                  </tr>
                ))}
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
                    {removing ? 'Removing…' : 'Confirm Remove'}
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
