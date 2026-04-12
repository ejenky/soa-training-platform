import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Flame, Warning, MagnifyingGlass, ArrowRight, X, Export, Plus, Users, Notebook } from '@phosphor-icons/react'
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
  const [contentCounts, setContentCounts] = useState({ lessons: 0, objections: 0, quizzes: 0, roleplays: 0 })

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name-asc')

  // Add Agent modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [addErrors, setAddErrors] = useState({})
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addSuccess, setAddSuccess] = useState(false)

  // Export dropdown
  const [showExport, setShowExport] = useState(false)
  const exportRef = useRef(null)

  // Print ref
  const printRef = useRef(null)

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
        // Fetch content counts for summary card
        const [lessonList, objectionList, quizList, scenarioList] = await Promise.all([
          pb.collection('lessons').getFullList({ fields: 'id' }).catch(() => []),
          pb.collection('objections').getFullList({ fields: 'id' }).catch(() => []),
          pb.collection('quiz_questions').getFullList({ fields: 'id' }).catch(() => []),
          pb.collection('scenarios').getFullList({ fields: 'id' }).catch(() => []),
        ])
        if (cancelled) return
        setAgents(ag)
        setCompletions(cs)
        setSessions(ps)
        setContentCounts({
          lessons: lessonList.length,
          objections: objectionList.length,
          quizzes: quizList.length,
          roleplays: scenarioList.length,
        })
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (user?.id) load()
    return () => { cancelled = true }
  }, [user?.id])

  // Close export dropdown on outside click
  useEffect(() => {
    function handle(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

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

      map[a.id] = { quizAvg, gpa, xp, level: lvl, streak, sessionCount: ps.length, flagged, certified: quizAvg >= 85 && gpa >= 3.0, lastActive }
    }
    return map
  }, [agents, completions, sessions])

  const teamStats = useMemo(() => {
    const metrics = Object.values(agentMetrics)
    const total = agents.length
    const certified = metrics.filter((m) => m.certified).length
    const flagged = metrics.filter((m) => m.flagged).length
    const quizArr = metrics.filter((m) => m.quizAvg > 0)
    const avgQuiz = quizArr.length > 0 ? Math.round(quizArr.reduce((a, m) => a + m.quizAvg, 0) / quizArr.length) : 0
    const gpaArr = metrics.filter((m) => m.gpa > 0)
    const avgGpa = gpaArr.length > 0 ? (gpaArr.reduce((a, m) => a + m.gpa, 0) / gpaArr.length).toFixed(1) : '0.0'
    return { total, certified, flagged, avgQuiz, avgGpa }
  }, [agents, agentMetrics])

  const filtered = useMemo(() => {
    let list = [...agents]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((a) => (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q))
    }
    if (statusFilter !== 'all') list = list.filter((a) => (a.status || 'active') === statusFilter)
    if (levelFilter !== 'all') list = list.filter((a) => agentMetrics[a.id]?.level.name === levelFilter)

    list.sort((a, b) => {
      const ma = agentMetrics[a.id] || {}
      const mb = agentMetrics[b.id] || {}
      switch (sortBy) {
        case 'name-asc': return (a.name || a.email || '').localeCompare(b.name || b.email || '')
        case 'name-desc': return (b.name || b.email || '').localeCompare(a.name || a.email || '')
        case 'quiz-desc': return (mb.quizAvg || 0) - (ma.quizAvg || 0)
        case 'gpa-desc': return (mb.gpa || 0) - (ma.gpa || 0)
        case 'active': return (mb.lastActive ? new Date(mb.lastActive).getTime() : 0) - (ma.lastActive ? new Date(ma.lastActive).getTime() : 0)
        case 'streak': return (mb.streak || 0) - (ma.streak || 0)
        default: return 0
      }
    })
    return list
  }, [agents, search, statusFilter, levelFilter, sortBy, agentMetrics])

  // ── Add Agent ──
  async function handleAddAgent(e) {
    e.preventDefault()
    const errs = {}
    if (!addForm.firstName.trim()) errs.firstName = 'Required'
    if (!addForm.lastName.trim()) errs.lastName = 'Required'
    if (!addForm.email.trim()) errs.email = 'Required'
    else if (!addForm.email.trim().toLowerCase().endsWith('@medicareinsurance.com')) errs.email = 'Must use @medicareinsurance.com email'
    if (addForm.password.length < 8) errs.password = 'Min 8 characters'
    setAddErrors(errs)
    if (Object.keys(errs).length > 0) return

    setAddSubmitting(true)
    try {
      const created = await pb.collection('users').create({
        name: `${addForm.firstName.trim()} ${addForm.lastName.trim()}`,
        email: addForm.email.trim(),
        password: addForm.password,
        passwordConfirm: addForm.password,
        role: 'agent',
        status: 'active',
        supervisor_id: user.id,
        certification_level: 0,
      })
      setAgents((prev) => [...prev, created])
      setAddSuccess(true)
      setAddForm({ firstName: '', lastName: '', email: '', password: '' })
    } catch (err) {
      const data = err?.response?.data
      if (data?.email) setAddErrors({ email: 'An account with this email already exists' })
      else setAddErrors({ form: err?.message || 'Failed to create agent' })
    } finally {
      setAddSubmitting(false)
    }
  }

  function closeAddModal() {
    setShowAddModal(false)
    setAddSuccess(false)
    setAddErrors({})
    setAddForm({ firstName: '', lastName: '', email: '', password: '' })
  }

  // ── Export CSV ──
  function exportCSV() {
    const header = ['Name', 'Email', 'Level', 'Quiz Avg', 'Practice GPA', 'Sessions', 'Streak', 'Last Active', 'Status']
    const rows = filtered.map((a) => {
      const m = agentMetrics[a.id] || {}
      return [
        a.name || '',
        a.email || '',
        m.level?.name || 'Trainee',
        `${m.quizAvg || 0}%`,
        m.gpa?.toFixed?.(1) ?? '0.0',
        String(m.sessionCount || 0),
        String(m.streak || 0),
        m.lastActive ? new Date(m.lastActive).toLocaleDateString() : '',
        a.status || 'active',
      ]
    })
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `hia-team-report-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setShowExport(false)
  }

  // ── Export PDF (print) ──
  function exportPDF() {
    setShowExport(false)
    setTimeout(() => window.print(), 100)
  }

  if (loading) return <div className="page"><div className="loader">Loading team…</div></div>

  return (
    <div className="page supervisor-page">
      {/* Stats strip */}
      <motion.div className="stats-strip" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="stat"><div className="label"><span className="dot blue" />Agents</div><div className="value">{teamStats.total}</div><div className="meta">total managed</div></div>
        <div className="stat"><div className="label"><span className="dot green" />Certified</div><div className="value">{teamStats.certified}</div><div className="meta">quiz 85%+ &amp; GPA 3.0+</div></div>
        <div className="stat"><div className="label"><span className="dot blue" />Avg Quiz</div><div className="value">{teamStats.avgQuiz}%</div><div className="meta">across all agents</div></div>
        <div className="stat"><div className="label"><span className="dot green" />Avg GPA</div><div className="value">{teamStats.avgGpa}</div><div className="meta">practice sessions</div></div>
        <div className="stat"><div className="label"><span className="dot red" />Flags</div><div className="value">{teamStats.flagged}</div><div className="meta">need attention</div></div>
      </motion.div>

      {/* Filter bar */}
      <motion.div className="sv-filter-bar" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
        <div className="sv-search">
          <MagnifyingGlass size={14} weight="regular" className="sv-search-icon" />
          <input type="text" placeholder="Search agents…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
        <div className="sv-btn-group">
          <div className="sv-export-wrap" ref={exportRef}>
            <button className="sv-export-btn" onClick={() => setShowExport((v) => !v)}>
              <Export size={14} /> Export
            </button>
            {showExport && (
              <div className="sv-export-dropdown">
                <button onClick={exportCSV}>Export CSV</button>
                <button onClick={exportPDF}>Export PDF</button>
              </div>
            )}
          </div>
          <button className="sv-add-btn" onClick={() => setShowAddModal(true)}>
            <Plus size={14} weight="bold" /> Add Agent
          </button>
        </div>
      </motion.div>

      {/* Agent table */}
      <motion.div className="card sv-table-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
            {agents.length === 0 ? (
              <>
                <Users size={48} weight="regular" color="var(--text-muted)" style={{ marginBottom: 12, opacity: 0.6 }} />
                <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No agents on your team yet.</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Use the <strong>Add Agent</strong> button above to onboard your first agent.</p>
              </>
            ) : <p>No agents match your filters.</p>}
          </div>
        ) : (
          <div className="sv-table-scroll">
            <table className="sv-table" ref={printRef}>
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
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => {
                  const m = agentMetrics[a.id] || {}
                  const status = a.status || 'active'
                  return (
                    <motion.tr key={a.id} custom={i} variants={stagger} initial="hidden" animate="visible" className="sv-row" onClick={() => navigate(`/supervisor/agent/${a.id}`)}>
                      <td>
                        <div className="sv-agent-cell">
                          <div className="sv-avatar">{initials(a.name, a.email)}</div>
                          <div>
                            <div className="sv-agent-name">{a.name || a.email}</div>
                            <div className="sv-agent-email">{a.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="sv-level-badge" style={{ color: m.level?.color, borderColor: m.level?.color }}>{m.level?.name || 'Trainee'}</span></td>
                      <td><span className={`badge ${quizTone(m.quizAvg || 0)}`}>{m.quizAvg || 0}%</span></td>
                      <td><span className={`badge ${gpaTone(m.gpa || 0)}`}>{m.gpa?.toFixed?.(1) ?? '0.0'}</span></td>
                      <td className="text-mono">{m.sessionCount || 0}</td>
                      <td><span className="sv-streak">{m.streak > 0 && <Flame size={12} weight="fill" color="var(--warn)" />}{m.streak || 0}</span></td>
                      <td className="sv-last-active">{timeAgo(m.lastActive)}</td>
                      <td><span className={`sv-status-dot ${status}`} title={status} /></td>
                      <td>{m.flagged && <Warning size={14} weight="fill" color="var(--error)" title="Below thresholds" />}</td>
                      <td className="no-print">
                        <Link to={`/supervisor/agent/${a.id}`} className="review-link" onClick={(e) => e.stopPropagation()}>View <ArrowRight size={12} weight="bold" /></Link>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Content Status */}
      <motion.div className="card" style={{ marginTop: 18, padding: '18px 22px' }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Notebook size={16} weight="regular" color="var(--text-muted)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Content Status</span>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{contentCounts.lessons}</span> Lessons
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{contentCounts.objections}</span> Objections
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{contentCounts.quizzes}</span> Quiz Questions
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{contentCounts.roleplays}</span> Roleplays
          </div>
        </div>
      </motion.div>

      {/* Print-only header */}
      <div className="print-header">
        <h1>HIA Sales Training — Team Performance Report</h1>
        <p>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        <p>{teamStats.total} agents · {teamStats.certified} certified · {teamStats.flagged} flagged · Avg Quiz {teamStats.avgQuiz}% · Avg GPA {teamStats.avgGpa}</p>
      </div>

      {/* Add Agent Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeAddModal}>
            <motion.div
              className="modal-card"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>Add Agent</h2>
                <button className="modal-close" onClick={closeAddModal}><X size={16} /></button>
              </div>

              {addSuccess ? (
                <div className="modal-body">
                  <div className="success-msg" style={{ marginBottom: 16 }}>Agent created successfully. They can sign in with their email and temporary password.</div>
                  <button className="primary" onClick={closeAddModal} style={{ width: '100%' }}>Done</button>
                </div>
              ) : (
                <form className="modal-body" onSubmit={handleAddAgent}>
                  {addErrors.form && <div className="error">{addErrors.form}</div>}
                  <div className="field-row">
                    <div className="field">
                      <label>First Name</label>
                      <input type="text" value={addForm.firstName} onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))} required />
                      {addErrors.firstName && <span className="field-error">{addErrors.firstName}</span>}
                    </div>
                    <div className="field">
                      <label>Last Name</label>
                      <input type="text" value={addForm.lastName} onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))} required />
                      {addErrors.lastName && <span className="field-error">{addErrors.lastName}</span>}
                    </div>
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} placeholder="agent@medicareinsurance.com" required />
                    {addErrors.email && <span className="field-error">{addErrors.email}</span>}
                  </div>
                  <div className="field">
                    <label>Temporary Password</label>
                    <input type="text" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" required />
                    {addErrors.password && <span className="field-error">{addErrors.password}</span>}
                  </div>
                  <button type="submit" className="primary" disabled={addSubmitting} style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}>
                    {addSubmitting ? 'Creating…' : 'Create Agent'}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
