import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, CaretDown, CaretUp } from '@phosphor-icons/react'
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

function toneColor(pct) {
  if (pct >= 80) return 'var(--success)'
  if (pct >= 60) return 'var(--warn)'
  return 'var(--error)'
}

function formatDuration(seconds) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
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

export default function SessionReplay() {
  const { sessionId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [responses, setResponses] = useState([])
  const [objections, setObjections] = useState({})
  const [quizQuestions, setQuizQuestions] = useState({})
  const [loading, setLoading] = useState(true)
  const [expandedFeedback, setExpandedFeedback] = useState({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sess = await pb.collection('practice_sessions').getOne(sessionId)
        if (cancelled) return
        if (sess.agent_id !== user?.id) {
          navigate('/history')
          return
        }
        setSession(sess)

        const rs = await pb.collection('session_responses').getFullList({
          filter: `session_id = "${sessionId}"`,
          sort: 'created',
        })
        if (cancelled) return
        setResponses(rs)

        // Fetch objection details
        const objIds = [...new Set(rs.map((r) => r.objection_id).filter(Boolean))]
        if (objIds.length > 0) {
          const filter = objIds.map((id) => `id = "${id}"`).join(' || ')
          const objs = await pb.collection('objections').getFullList({ filter }).catch(() => [])
          if (cancelled) return
          const map = {}
          for (const o of objs) map[o.id] = o
          setObjections(map)

          // Fetch quiz questions for MC responses to get options/explanation
          const mcObjIds = rs.filter((r) => r.response_type === 'multiple_choice' && r.objection_id).map((r) => r.objection_id)
          const uniqueMcIds = [...new Set(mcObjIds)]
          if (uniqueMcIds.length > 0) {
            const qFilter = uniqueMcIds.map((id) => `objection_id = "${id}"`).join(' || ')
            const qs = await pb.collection('quiz_questions').getFullList({ filter: qFilter }).catch(() => [])
            if (cancelled) return
            const qMap = {}
            for (const q of qs) {
              if (!qMap[q.objection_id]) qMap[q.objection_id] = q
            }
            setQuizQuestions(qMap)
          }
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) navigate('/history')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (user?.id) load()
    return () => { cancelled = true }
  }, [sessionId, user?.id, navigate])

  const totalDuration = useMemo(() => {
    const total = responses.reduce((sum, r) => sum + (r.time_seconds || 0), 0)
    return total
  }, [responses])

  function toggleFeedback(idx) {
    setExpandedFeedback((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }

  function retryUrl() {
    if (!session) return '/practice'
    const params = new URLSearchParams()
    if (session.call_stage) params.set('stage', session.call_stage)
    if (session.session_type) params.set('type', session.session_type)
    if (session.difficulty_level) params.set('difficulty', String(session.difficulty_level))
    return `/practice/session?${params.toString()}`
  }

  if (loading) {
    return <div className="page"><div className="loader">Loading session…</div></div>
  }

  if (!session) return null

  const overallPct = session.max_score > 0
    ? Math.round((session.total_score / session.max_score) * 100)
    : 0

  return (
    <div className="page replay-page">
      {/* Summary card */}
      <Animated i={0} className="card replay-summary">
        <div className="replay-score-ring" style={{ borderColor: toneColor(overallPct) }}>
          <span className="replay-score-value">{overallPct}%</span>
        </div>
        <div className="replay-summary-info">
          <div className="replay-date">{formatDate(session.created)}</div>
          <div className="replay-badges">
            <span className="badge info">{STAGE_LABELS[session.call_stage] || session.call_stage}</span>
            <span className="badge">{TYPE_LABELS[session.session_type] || session.session_type}</span>
            <span className="badge">{session.difficulty_level} — {DIFF_LABELS[session.difficulty_level] || ''}</span>
          </div>
          <div className="replay-meta-row">
            <span>{responses.length} objection{responses.length !== 1 ? 's' : ''}</span>
            <span>{session.total_score}/{session.max_score} pts</span>
            {totalDuration > 0 && <span>{formatDuration(totalDuration)}</span>}
          </div>
        </div>
      </Animated>

      {/* Per-objection cards */}
      <div className="replay-objections">
        {responses.map((r, idx) => {
          const obj = objections[r.objection_id]
          const pct = r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0
          const tone = scoreTone(pct)
          const isExpanded = expandedFeedback[idx]
          const qq = quizQuestions[r.objection_id]
          let mcOptions = null
          if (qq) {
            mcOptions = typeof qq.options === 'string'
              ? (() => { try { return JSON.parse(qq.options) } catch { return [] } })()
              : qq.options || []
          }

          return (
            <Animated key={r.id} i={idx + 1} className="card replay-objection-card">
              <div className="replay-obj-header">
                <div className="replay-obj-num">#{idx + 1}</div>
                <div className="replay-obj-score-circle" style={{ background: toneColor(pct) }}>
                  {pct}
                </div>
              </div>

              {/* Objection text */}
              {obj && (
                <blockquote className="replay-objection-text">
                  &ldquo;{obj.text}&rdquo;
                </blockquote>
              )}

              {/* Tags */}
              <div className="replay-obj-tags">
                {obj?.category && <span className="badge">{obj.category}</span>}
                {obj?.difficulty && <span className="badge">Difficulty {obj.difficulty}</span>}
                {r.time_seconds > 0 && <span className="badge">{formatDuration(r.time_seconds)}</span>}
              </div>

              {/* Agent's response */}
              <div className="replay-response-section">
                <div className="replay-section-label">Your response</div>
                {r.response_type === 'multiple_choice' && mcOptions ? (
                  <div className="replay-mc-options">
                    {mcOptions.map((opt, i) => {
                      const isSelected = r.selected_option === i
                      const isCorrect = qq && qq.correct_index === i
                      let cls = 'replay-mc-opt'
                      if (isSelected && isCorrect) cls += ' correct'
                      else if (isSelected && !isCorrect) cls += ' wrong'
                      else if (isCorrect) cls += ' correct-indicator'
                      return (
                        <div key={i} className={cls}>
                          <span className="replay-mc-letter">{String.fromCharCode(65 + i)}</span>
                          <span>{opt}</span>
                          {isSelected && isCorrect && <span className="replay-mc-tag correct-tag">Your answer (correct)</span>}
                          {isSelected && !isCorrect && <span className="replay-mc-tag wrong-tag">Your answer</span>}
                          {!isSelected && isCorrect && <span className="replay-mc-tag correct-tag">Correct</span>}
                        </div>
                      )
                    })}
                  </div>
                ) : r.response_type === 'multiple_choice' ? (
                  <div className="replay-text-response">
                    Option {r.selected_option != null ? String.fromCharCode(65 + r.selected_option) : '—'} selected
                  </div>
                ) : (
                  <div className="replay-text-response">
                    {r.response_text || <span style={{ color: 'var(--text-muted)' }}>No response recorded</span>}
                  </div>
                )}
              </div>

              {/* Recommended response for MC */}
              {r.response_type === 'multiple_choice' && qq?.explanation && (
                <div className="replay-recommended">
                  <div className="replay-section-label">Recommended response</div>
                  <div className="replay-recommended-text">{qq.explanation}</div>
                </div>
              )}

              {/* Feedback */}
              {r.feedback && (
                <div className="replay-feedback-section">
                  <button className="replay-feedback-toggle" onClick={() => toggleFeedback(idx)}>
                    <span>Feedback</span>
                    {isExpanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
                  </button>
                  {isExpanded && (
                    <motion.div
                      className="replay-feedback-body"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.2 }}
                    >
                      {r.feedback}
                    </motion.div>
                  )}
                </div>
              )}
            </Animated>
          )
        })}
      </div>

      {responses.length === 0 && (
        <Animated i={1} className="card empty-state">
          <p>No responses recorded for this session.</p>
        </Animated>
      )}

      {/* Bottom actions */}
      <Animated i={responses.length + 2} className="replay-actions">
        <Link to="/history" className="btn-secondary">
          <ArrowLeft size={14} weight="bold" /> Back to History
        </Link>
        <Link to={retryUrl()} className="btn-primary">
          Retry this drill <ArrowRight size={14} weight="bold" />
        </Link>
      </Animated>
    </div>
  )
}
