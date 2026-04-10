import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Timer, X, Check, CheckCircle, SpeakerHigh, Lock, UserCircle, Microphone,
} from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { gradeFreeText, gradeMultipleChoice } from '../lib/grading'
import { updateReviewQueue } from '../lib/spacedRepetition'

/*
 * PocketBase collections required (create manually):
 *
 * scenarios:
 *   name (text, required), persona_name (text, required), persona_age (number),
 *   persona_description (text), persona_voice_id (text), difficulty (number 1-4),
 *   call_stage (select: intro_soa|qualifying|presenting|closing), category (text),
 *   estimated_minutes (number), active (bool default true)
 *
 * scenario_lines:
 *   scenario_id (relation → scenarios, required), line_order (number, required),
 *   speaker (select: client|agent_script|system, required), text (text, required),
 *   audio_file (file, optional), is_objection (bool default false),
 *   objection_id (relation → objections, optional), branch (text default "root"),
 *   parent_line_order (number, optional), triggers_response (bool default false),
 *   response_type (select: multiple_choice|free_text, optional)
 */

const DIFF_LABELS = ['', 'Warm-up', 'Standard', 'Tough', 'Brutal']

function personaInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ScenarioPlayer() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [scenario, setScenario] = useState(null)
  const [allLines, setAllLines] = useState([])
  const [loading, setLoading] = useState(true)

  // Playback state
  const [visibleLines, setVisibleLines] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState('loading') // loading | playing | responding | feedback | summary
  const [pendingLine, setPendingLine] = useState(null)

  // Response state
  const [selected, setSelected] = useState(null)
  const [text, setText] = useState('')
  const [mcData, setMcData] = useState(null)
  const [feedback, setFeedback] = useState(null)

  // Tracking
  const [responses, setResponses] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(Date.now())
  const itemStartedAt = useRef(Date.now())
  const chatEndRef = useRef(null)

  // Timer
  useEffect(() => {
    if (phase === 'summary') return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [phase])

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleLines, phase])

  // Load scenario
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sc = await pb.collection('scenarios').getOne(id)
        const lines = await pb.collection('scenario_lines').getFullList({
          filter: `scenario_id = "${id}"`,
          sort: 'line_order',
        })
        if (cancelled) return
        setScenario(sc)
        setAllLines(lines)

        // Create session
        try {
          const sess = await pb.collection('practice_sessions').create({
            agent_id: user.id,
            session_type: 'scenario',
            difficulty_level: sc.difficulty || 2,
            call_stage: sc.call_stage || 'intro_soa',
            total_score: 0,
            max_score: 0,
            passed: false,
          })
          if (!cancelled) setSessionId(sess.id)
        } catch (e) { console.error('Failed to create session', e) }

        if (!cancelled) {
          setLoading(false)
          setPhase('playing')
          startedAt.current = Date.now()
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) navigate('/scenarios')
      }
    }
    if (user?.id) load()
    return () => { cancelled = true }
  }, [id, user?.id, navigate])

  // Get root lines (branch === "root")
  const rootLines = useMemo(() => allLines.filter((l) => l.branch === 'root' || !l.branch), [allLines])

  // Advance to next line
  const advanceLine = useCallback(() => {
    const nextIdx = currentIdx + 1
    if (nextIdx >= rootLines.length) {
      finalize()
      return
    }
    const line = rootLines[nextIdx]
    setCurrentIdx(nextIdx)
    setVisibleLines((prev) => [...prev, { ...line, _type: 'line' }])

    if (line.triggers_response) {
      setPendingLine(line)
      itemStartedAt.current = Date.now()
      // Load MC data if needed
      if (line.response_type === 'multiple_choice' && line.objection_id) {
        pb.collection('quiz_questions').getFullList({ filter: `objection_id = "${line.objection_id}"` })
          .then((qs) => {
            if (qs.length > 0) {
              let opts = qs[0].options
              if (typeof opts === 'string') try { opts = JSON.parse(opts) } catch { opts = [] }
              setMcData({ question: qs[0].question_text, options: opts || [], correct: qs[0].correct_index, explanation: qs[0].explanation })
            }
            setPhase('responding')
          })
          .catch(() => setPhase('responding'))
      } else {
        setPhase('responding')
      }
    } else if (line.speaker === 'agent_script') {
      setPhase('playing') // wait for "I've read this" click
    } else {
      // Auto-advance client/system lines with a brief delay
      setTimeout(() => {
        if (nextIdx + 1 < rootLines.length) {
          const peek = rootLines[nextIdx + 1]
          if (peek.speaker !== 'agent_script' && !peek.triggers_response) {
            advanceLineRef.current?.()
          }
        }
      }, 800)
    }
  }, [currentIdx, rootLines])

  const advanceLineRef = useRef(advanceLine)
  advanceLineRef.current = advanceLine

  // Start first line
  useEffect(() => {
    if (phase === 'playing' && visibleLines.length === 0 && rootLines.length > 0) {
      const first = rootLines[0]
      setVisibleLines([{ ...first, _type: 'line' }])
      setCurrentIdx(0)
      if (first.triggers_response) {
        setPendingLine(first)
        itemStartedAt.current = Date.now()
        setPhase('responding')
      }
    }
  }, [phase, visibleLines.length, rootLines])

  // Submit response
  function submitResponse() {
    if (!pendingLine) return
    const sec = Math.round((Date.now() - itemStartedAt.current) / 1000)
    let grade
    const objId = pendingLine.objection_id || null

    if (pendingLine.response_type === 'multiple_choice' && mcData) {
      grade = gradeMultipleChoice(selected, mcData.correct)
    } else {
      grade = gradeFreeText(text, scenario?.category || 'default')
    }

    const pct = grade.max > 0 ? Math.round((grade.score / grade.max) * 100) : 0
    const branchKey = pct >= 85 ? 'good' : pct >= 50 ? 'mediocre' : 'bad'

    // Find branch lines
    const branchLines = allLines.filter(
      (l) => l.branch === branchKey && l.parent_line_order === pendingLine.line_order
    ).sort((a, b) => a.line_order - b.line_order)

    const resp = {
      session_id: sessionId,
      objection_id: objId,
      response_type: pendingLine.response_type || 'free_text',
      time_seconds: sec,
      selected_option: selected,
      score: grade.score,
      max_score: grade.max,
      feedback: grade.feedback,
      response_text: text,
    }
    setResponses((r) => [...r, resp])

    // Save to PocketBase
    if (sessionId) {
      pb.collection('session_responses').create(resp).catch(() => {})
    }
    if (objId) {
      updateReviewQueue(pb, user.id, objId, pct)
    }

    // Show feedback + branch lines
    setFeedback({ ...grade, pct, branchKey, mcData, branchLines })
    setVisibleLines((prev) => [
      ...prev,
      {
        _type: 'response',
        text: pendingLine.response_type === 'multiple_choice' && mcData
          ? `Selected: ${mcData.options[selected] || '—'}`
          : text,
        isAgent: true,
      },
    ])
    setPhase('feedback')
  }

  // Continue after feedback
  function continueAfterFeedback() {
    // Add branch lines to visible
    if (feedback?.branchLines?.length > 0) {
      setVisibleLines((prev) => [
        ...prev,
        ...feedback.branchLines.map((l) => ({ ...l, _type: 'line' })),
      ])
    }
    setFeedback(null)
    setMcData(null)
    setSelected(null)
    setText('')
    setPendingLine(null)
    setPhase('playing')

    // Advance
    setTimeout(() => advanceLineRef.current?.(), 300)
  }

  // Finalize
  async function finalize() {
    const total = responses.reduce((a, r) => a + (r.score || 0), 0)
    const max = responses.reduce((a, r) => a + (r.max_score || 0), 0)
    const passed = max > 0 ? (total / max) * 100 >= 75 : false
    if (sessionId) {
      await pb.collection('practice_sessions').update(sessionId, { total_score: total, max_score: max, passed }).catch(() => {})
    }
    setPhase('summary')
  }

  // Summary
  const summary = useMemo(() => {
    const total = responses.reduce((a, r) => a + (r.score || 0), 0)
    const max = responses.reduce((a, r) => a + (r.max_score || 0), 0)
    const pct = max > 0 ? Math.round((total / max) * 100) : 0
    return { total, max, pct, passed: pct >= 75 }
  }, [responses])

  if (loading) return <div className="tp-shell"><div className="loader">Loading scenario…</div></div>
  if (!scenario) return null

  // Summary screen
  if (phase === 'summary') {
    return (
      <div className="tp-shell">
        <motion.div className="tp-summary" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <div className="summary-head">
            <CheckCircle size={48} weight="regular" color={summary.passed ? 'var(--success)' : 'var(--warn)'} />
            <h2>Scenario Complete</h2>
            <p>{summary.passed ? 'Great job handling that call!' : 'Good practice — keep working on those objections.'}</p>
          </div>
          <div className="stats-strip">
            <div className="stat"><div className="label"><span className="dot green" />Score</div><div className="value">{summary.pct}%</div><div className="meta">{summary.total}/{summary.max} pts</div></div>
            <div className="stat"><div className="label"><span className="dot blue" />Objections</div><div className="value">{responses.length}</div><div className="meta">encountered</div></div>
            <div className="stat"><div className="label"><span className="dot amber" />Time</div><div className="value">{formatTime(elapsed)}</div><div className="meta">elapsed</div></div>
          </div>
          {responses.length > 0 && (
            <>
              <h3 style={{ marginTop: 28 }}>Per-objection breakdown</h3>
              <div className="activity">
                {responses.map((r, i) => {
                  const pct = r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0
                  const t = pct >= 85 ? 'success' : pct >= 50 ? 'warn' : 'error'
                  return (
                    <div key={i} className="tp-breakdown-row">
                      <div className="tp-breakdown-score-ring" data-tone={t}>{pct}</div>
                      <div className="tp-breakdown-content">
                        <div className="tp-breakdown-feedback">{r.feedback}</div>
                      </div>
                      <div className="tp-breakdown-pts">{r.score}/{r.max_score}</div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          <div className="row" style={{ marginTop: 24, gap: 12 }}>
            <button className="primary lg" onClick={() => navigate('/scenarios')}>Back to Scenarios</button>
            <button onClick={() => navigate('/practice')}>Practice</button>
          </div>
        </motion.div>
      </div>
    )
  }

  const currentLine = rootLines[currentIdx]
  const isWaitingForRead = phase === 'playing' && currentLine?.speaker === 'agent_script' && !currentLine?.triggers_response

  return (
    <div className="tp-shell">
      {/* Top bar */}
      <div className="sp-topbar">
        <Link to="/scenarios" className="sp-exit"><X size={16} /></Link>
        <div className="sp-persona">
          <div className="sp-persona-av">{personaInitials(scenario.persona_name)}</div>
          <div>
            <div className="sp-persona-name">{scenario.persona_name}</div>
            <div className="sp-persona-sub">{scenario.name}</div>
          </div>
        </div>
        <span className="badge" style={{ color: 'var(--text-dim)' }}>{DIFF_LABELS[scenario.difficulty]}</span>
        <span className="sp-timer"><Timer size={14} /> {formatTime(elapsed)}</span>
      </div>

      {/* Chat area */}
      <div className="sp-chat">
        <AnimatePresence>
          {visibleLines.map((line, i) => {
            if (line._type === 'response') {
              return (
                <motion.div key={`resp-${i}`} className="sp-bubble sp-agent" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="sp-bubble-label">YOUR RESPONSE</div>
                  <div className="sp-bubble-text">{line.text}</div>
                </motion.div>
              )
            }
            const isClient = line.speaker === 'client'
            const isSystem = line.speaker === 'system'
            const isAgent = line.speaker === 'agent_script'
            return (
              <motion.div
                key={`line-${line.id || i}`}
                className={`sp-bubble ${isClient ? 'sp-client' : isAgent ? 'sp-agent' : 'sp-system'}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {isClient && (
                  <div className="sp-bubble-header">
                    <div className="sp-client-av">{personaInitials(scenario.persona_name)}</div>
                    <span className="sp-bubble-name">{scenario.persona_name}</span>
                    {line.is_objection && <span className="badge danger" style={{ fontSize: 9 }}>Objection</span>}
                  </div>
                )}
                {isAgent && <div className="sp-bubble-label">YOUR SCRIPT</div>}
                {isSystem && <div className="sp-bubble-label">SYSTEM</div>}
                <div className="sp-bubble-text">{line.text}</div>
                {isClient && (
                  <button className="sp-audio-btn" disabled title="Audio coming soon">
                    <Lock size={12} /> Audio coming soon
                  </button>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

        {/* "I've read this" button for agent script lines */}
        {isWaitingForRead && (
          <motion.div className="sp-read-prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <button className="primary" onClick={() => advanceLineRef.current?.()}>
              <Check size={14} /> I've read this — continue
            </button>
          </motion.div>
        )}

        {/* Response area */}
        {phase === 'responding' && pendingLine && (
          <motion.div className="sp-respond-area" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="sp-respond-label">
              <Microphone size={14} weight="fill" /> Your turn to respond
            </div>
            {pendingLine.response_type === 'multiple_choice' && mcData ? (
              <div className="sp-mc-area">
                <p className="sp-mc-question">{mcData.question}</p>
                <div className="mc-options">
                  {mcData.options.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`mc-option ${selected === i ? 'selected' : ''}`}
                      onClick={() => setSelected(i)}
                    >
                      <span className="letter">{String.fromCharCode(65 + i)}</span>
                      <span className="text">{opt}</span>
                    </button>
                  ))}
                </div>
                <button className="primary lg" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={submitResponse} disabled={selected === null}>
                  Submit answer
                </button>
              </div>
            ) : (
              <div className="sp-ft-area">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type your response to the client…"
                  rows={3}
                />
                <button className="primary lg" style={{ width: '100%', marginTop: 8, justifyContent: 'center' }} onClick={submitResponse} disabled={text.trim().length < 10}>
                  Submit response
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Feedback panel */}
        {phase === 'feedback' && feedback && (
          <motion.div className="sp-feedback-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="sp-feedback-score" data-tone={feedback.pct >= 85 ? 'success' : feedback.pct >= 50 ? 'warn' : 'error'}>
              {feedback.pct}%
            </div>
            <div className="sp-feedback-text">{feedback.feedback}</div>
            {feedback.mcData?.explanation && (
              <div className="sp-feedback-explain">
                <div className="sp-feedback-explain-label">Recommended response</div>
                {feedback.mcData.explanation}
              </div>
            )}
            <button className="primary" onClick={continueAfterFeedback} style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}>
              Continue call
            </button>
          </motion.div>
        )}

        <div ref={chatEndRef} />
      </div>
    </div>
  )
}
