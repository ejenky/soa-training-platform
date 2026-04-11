import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Target } from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'

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

const DIFF_LABELS = ['', 'Warm-up', 'Standard', 'Tough', 'Brutal']

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ' \u00B7 ' + new Date(d).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function scoreTone(pct) {
  if (pct >= 80) return 'success'
  if (pct >= 60) return 'warn'
  return 'danger'
}

const stagger = {
  hidden: { opacity: 0, y: 14 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] },
  }),
}

function Animated({ children, i = 0, className = '' }) {
  return (
    <motion.div
      className={className}
      custom={i}
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  )
}

const PAGE_SIZE = 20

export default function History() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState([])
  const [responseCounts, setResponseCounts] = useState({})
  const [loading, setLoading] = useState(true)

  // Filters
  const [stageFilter, setStageFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')

  // Pagination
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user?.id) return
      try {
        const ps = await pb.collection('practice_sessions').getFullList({
          filter: `agent_id = "${user.id}"`,
          sort: '-created',
        })
        if (cancelled) return
        setSessions(ps)

        // Fetch response counts per session
        if (ps.length > 0) {
          const allResponses = await pb.collection('session_responses').getFullList({
            filter: ps.map((s) => `session_id = "${s.id}"`).join(' || '),
          }).catch(() => [])
          if (cancelled) return
          const counts = {}
          for (const r of allResponses) {
            counts[r.session_id] = (counts[r.session_id] || 0) + 1
          }
          setResponseCounts(counts)
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user?.id])

  const filtered = useMemo(() => {
    let list = sessions

    if (stageFilter !== 'all') {
      list = list.filter((s) => s.call_stage === stageFilter)
    }
    if (typeFilter !== 'all') {
      list = list.filter((s) => s.session_type === typeFilter)
    }
    if (dateFilter !== 'all') {
      const now = Date.now()
      const ms = dateFilter === '7' ? 7 * 86400000 : 30 * 86400000
      list = list.filter((s) => now - new Date(s.created).getTime() < ms)
    }

    return list
  }, [sessions, stageFilter, typeFilter, dateFilter])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [stageFilter, typeFilter, dateFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) {
    return <div className="page"><div className="loader">Loading history…</div></div>
  }

  return (
    <div className="page history-page">
      {/* Filter bar */}
      <Animated i={0} className="history-filters">
        <div className="filter-group">
          <label>Stage</label>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="all">All Stages</option>
            <option value="intro_soa">Intro / SOA</option>
            <option value="qualifying">Qualifying</option>
            <option value="presenting">Presenting</option>
            <option value="closing">Closing</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Type</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="multiple_choice">Multiple Choice</option>
            <option value="free_text">Free Text</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Date</label>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="all">All Time</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
          </select>
        </div>
        <div className="filter-count">{filtered.length} session{filtered.length !== 1 ? 's' : ''}</div>
      </Animated>

      {/* Table */}
      {filtered.length === 0 ? (
        <Animated i={1} className="card empty-state" >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(16, 185, 129, 0.08))',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <Target size={44} weight="regular" style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3>No sessions yet</h3>
          <p>Head to <Link to="/practice">Practice</Link> to run your first drill.</p>
        </Animated>
      ) : (
        <Animated i={1} className="card history-table-wrap">
          <div className="history-table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Stage</th>
                  <th>Type</th>
                  <th>Difficulty</th>
                  <th>Score</th>
                  <th>Objections</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((s) => {
                  const pct = s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0
                  const tone = scoreTone(pct)
                  return (
                    <tr key={s.id}>
                      <td className="nowrap">{formatDate(s.created)}</td>
                      <td><span className="badge info">{STAGE_LABELS[s.call_stage] || s.call_stage}</span></td>
                      <td><span className="badge">{TYPE_LABELS[s.session_type] || s.session_type}</span></td>
                      <td>
                        <span className="badge">{s.difficulty_level} — {DIFF_LABELS[s.difficulty_level] || ''}</span>
                      </td>
                      <td>
                        <span className={`badge ${tone}`}>{pct}%</span>
                      </td>
                      <td>{responseCounts[s.id] || '—'}</td>
                      <td>
                        <Link to={`/history/${s.id}`} className="review-link">
                          Review <ArrowRight size={12} weight="bold" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="page-info">Page {page} of {totalPages}</span>
              <button
                className="page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </Animated>
      )}
    </div>
  )
}
