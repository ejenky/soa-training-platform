import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Timer,
  ArrowRight,
  ArrowLeft,
  Lightbulb,
  Check,
  X,
  CheckCircle,
} from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { gradeFreeText, gradeMultipleChoice } from '../lib/grading'

const SESSION_LENGTH = 5

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function labelStage(s) {
  const map = {
    intro_soa: 'Intro / SOA',
    qualifying: 'Qualifying',
    presenting: 'Presenting',
    closing: 'Closing',
  }
  return map[s] || s
}

export default function PracticeSession() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const stage = params.get('stage') || 'intro_soa'
  const sessionType = params.get('type') || 'multiple_choice'
  const difficulty = parseInt(params.get('difficulty') || '2', 10)
  const category = params.get('category')

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [idx, setIdx] = useState(0)
  const [responses, setResponses] = useState([])
  const [selected, setSelected] = useState(null)
  const [text, setText] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [showFeedback, setShowFeedback] = useState(null)
  const [done, setDone] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [savingFinal, setSavingFinal] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(Date.now())
  const itemStartedAt = useRef(Date.now())

  useEffect(() => {
    if (done) return
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [done])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const filterParts = ['active = true', `call_stage = "${stage}"`]
        if (category) filterParts.push(`category = "${category}"`)
        const baseFilter = filterParts.join(' && ')

        let list = await pb.collection('objections').getFullList({
          filter: `${baseFilter} && difficulty = ${difficulty}`,
          sort: '@random',
        })
        if (list.length < SESSION_LENGTH) {
          const more = await pb.collection('objections').getFullList({ filter: baseFilter, sort: '@random' })
          const seen = new Set(list.map((o) => o.id))
          for (const o of more) {
            if (!seen.has(o.id)) { list.push(o); seen.add(o.id) }
            if (list.length >= SESSION_LENGTH) break
          }
        }
        list = list.slice(0, SESSION_LENGTH)

        const built = await Promise.all(
          list.map(async (o) => {
            let mode = sessionType === 'mixed'
              ? Math.random() < 0.5 ? 'multiple_choice' : 'free_text'
              : sessionType
            let questions = []
            if (mode === 'multiple_choice') {
              try {
                const qs = await pb.collection('quiz_questions').getFullList({ filter: `objection_id = "${o.id}"` })
                if (qs.length === 0) {
                  mode = 'free_text'
                } else {
                  questions = qs.map((q) => {
                    let options = q.options
                    if (typeof options === 'string') {
                      try { options = JSON.parse(options) } catch { options = [] }
                    }
                    return { ...q, options: options || [] }
                  })
                }
              } catch {
                mode = 'free_text'
              }
            }
            return { objection: o, mode, questions }
          }),
        )

        if (cancelled) return
        setItems(built)

        try {
          const created = await pb.collection('practice_sessions').create({
            agent_id: user.id,
            session_type: sessionType,
            difficulty_level: difficulty,
            call_stage: stage,
            total_score: 0,
            max_score: 0,
            passed: false,
          })
          if (!cancelled) setSessionId(created.id)
        } catch (e) {
          console.error('Failed to create session', e)
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) {
          setLoading(false)
          itemStartedAt.current = Date.now()
          startedAt.current = Date.now()
        }
      }
    }
    if (user?.id) load()
    return () => { cancelled = true }
  }, [user?.id, stage, sessionType, difficulty, category])

  const current = items[idx]

  function submitCurrent() {
    if (!current) return
    const sec = Math.round((Date.now() - itemStartedAt.current) / 1000)
    let grade
    let payload = {
      session_id: sessionId,
      objection_id: current.objection.id,
      response_type: current.mode,
      time_seconds: sec,
    }

    if (current.mode === 'multiple_choice') {
      const q = current.questions[0]
      grade = gradeMultipleChoice(selected, q.correct_index)
      payload = {
        ...payload,
        selected_option: selected,
        score: grade.score,
        max_score: grade.max,
        feedback: grade.feedback,
        response_text: '',
      }
    } else {
      grade = gradeFreeText(text, current.objection.category)
      payload = {
        ...payload,
        response_text: text,
        selected_option: null,
        score: grade.score,
        max_score: grade.max,
        feedback: grade.feedback,
      }
    }

    setResponses((r) => [...r, { ...payload, _grade: grade }])
    setShowFeedback({ ...grade, mode: current.mode, payload, correctIndex: current.questions[0]?.correct_index })

    if (sessionId) {
      pb.collection('session_responses').create(payload).catch((e) => console.error('Failed to save response', e))
    }
  }

  async function next() {
    setShowFeedback(null)
    setSelected(null)
    setText('')
    setShowHint(false)
    if (idx + 1 >= items.length) {
      await finalize()
    } else {
      setIdx(idx + 1)
      itemStartedAt.current = Date.now()
    }
  }

  async function finalize() {
    setSavingFinal(true)
    try {
      const total = responses.reduce((a, r) => a + (r.score || 0), 0)
      const max = responses.reduce((a, r) => a + (r.max_score || 0), 0)
      const percent = max > 0 ? (total / max) * 100 : 0
      const passed = percent >= 75
      if (sessionId) {
        await pb.collection('practice_sessions').update(sessionId, { total_score: total, max_score: max, passed })
      }
      setDone(true)
    } catch (e) {
      console.error(e)
    } finally {
      setSavingFinal(false)
    }
  }

  const summary = useMemo(() => {
    const total = responses.reduce((a, r) => a + (r.score || 0), 0)
    const max = responses.reduce((a, r) => a + (r.max_score || 0), 0)
    const percent = max > 0 ? Math.round((total / max) * 100) : 0
    const gpa = ((percent / 100) * 4).toFixed(1)
    const xp = responses.reduce((a, r) => a + 10 + (r.max_score > 0 && r.score === r.max_score ? 5 : 0), 0)
    return { total, max, percent, gpa, xp, passed: percent >= 75 }
  }, [responses])

  const runningScore = useMemo(() => responses.reduce((a, r) => a + (r.score || 0), 0), [responses])

  if (loading) return <div className="session-shell"><div className="loader">Building your session…</div></div>

  if (items.length === 0) {
    return (
      <div className="session-shell">
        <div className="card empty">
          <h2 style={{ marginBottom: 8 }}>No objections found</h2>
          <p>Nothing matches that filter yet. Try a different category or difficulty.</p>
          <Link to="/practice"><button className="primary" style={{ marginTop: 14 }}><ArrowLeft size={13} weight="regular" /> Back to practice</button></Link>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="session-shell">
        <motion.div className="card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="summary-head">
            <CheckCircle size={42} weight="regular" color={summary.passed ? 'var(--success)' : 'var(--warn)'} />
            <h2>Drill complete</h2>
            <p>{summary.passed ? 'Nice work — your streak lives on.' : 'Keep at it — every rep sharpens the pitch.'}</p>
          </div>

          <div className="stats-strip">
            <div className="stat">
              <div className="label"><span className="dot green" />Score</div>
              <div className="value">{summary.percent}%</div>
              <div className="meta">{summary.total}/{summary.max} pts</div>
            </div>
            <div className="stat">
              <div className="label"><span className="dot blue" />GPA</div>
              <div className="value">{summary.gpa}</div>
              <div className="meta">out of 4.0</div>
            </div>
            <div className="stat">
              <div className="label"><span className="dot green" />XP earned</div>
              <div className="value">+{summary.xp}</div>
              <div className="meta">accuracy bonuses</div>
            </div>
            <div className="stat">
              <div className="label"><span className="dot amber" />Streak</div>
              <div className="value">+1</div>
              <div className="meta">saved today</div>
            </div>
          </div>

          <h3 style={{ marginTop: 24 }}>Per-question breakdown</h3>
          <div className="activity">
            {responses.map((r, i) => {
              const t = r.score === r.max_score ? 'success' : r.score === 0 ? 'error' : 'warn'
              return (
                <div key={i} className="activity-row">
                  <div className={`dot ${t}`} />
                  <div className="text">Item {i + 1}<span className="meta">{r.feedback}</span></div>
                  <div className="score">{r.score}/{r.max_score}</div>
                </div>
              )
            })}
          </div>

          <div className="row" style={{ marginTop: 22 }}>
            <button className="primary lg" onClick={() => navigate('/practice')}>New session</button>
            <button onClick={() => navigate('/progress')}>View progress</button>
          </div>
        </motion.div>
      </div>
    )
  }

  const cat = current.objection.category

  return (
    <div className="session-shell">
      <div className="row between">
        <Link to="/practice" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ArrowLeft size={12} weight="regular" /> Cancel session
        </Link>
        <span className="qcount">{idx + 1} / {items.length}</span>
      </div>

      <div className="session-bar">
        <div className="dots">
          {items.map((_, i) => (
            <div key={i} className={`dot ${i < idx ? 'done' : i === idx ? 'current' : ''}`} />
          ))}
        </div>
        <div className="meta"><Timer size={13} weight="regular" />{formatTime(elapsed)}</div>
        <div className="meta">{runningScore} pts</div>
      </div>

      <motion.div
        className="objection-card"
        key={current.objection.id}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="tag-row">
          <span className="badge">{labelStage(current.objection.call_stage)}</span>
          <span className="badge warn">Difficulty {current.objection.difficulty}</span>
          {cat && <span className="badge info">{cat}</span>}
        </div>

        <div className="quote">{current.objection.text}</div>

        {!showFeedback && current.mode === 'multiple_choice' && (
          <>
            <h3>{current.questions[0]?.question_text || 'Choose your best response:'}</h3>
            <div className="mc-options">
              {current.questions[0]?.options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  className={`mc-option ${selected === i ? 'selected' : ''}`}
                  onClick={() => setSelected(i)}
                >
                  <span className="letter">{String.fromCharCode(65 + i)}</span>
                  <span className="opt-text">{opt}</span>
                </button>
              ))}
            </div>
            <button
              className="cta lg"
              disabled={selected === null}
              onClick={submitCurrent}
              style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
            >
              Submit answer
            </button>
          </>
        )}

        {!showFeedback && current.mode === 'free_text' && (
          <>
            <div className="row between" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Your live rebuttal</h3>
              <button className="ghost" onClick={() => setShowHint((h) => !h)} style={{ fontSize: 12 }}>
                <Lightbulb size={13} weight="regular" />
                {showHint ? 'Hide coaching' : 'Coaching hint'}
              </button>
            </div>
            {showHint && (
              <div className="script green">
                Acknowledge the concern, reframe with empathy, hit the SOA disclosure, then ask permission to continue.
              </div>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your response…"
            />
            <button
              className="cta lg"
              disabled={text.trim().length < 10}
              onClick={submitCurrent}
              style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            >
              Submit response
            </button>
          </>
        )}

        {showFeedback && current.mode === 'multiple_choice' && (
          <div className="mc-options" style={{ marginTop: 16 }}>
            {current.questions[0]?.options.map((opt, i) => {
              const isCorrect = i === showFeedback.correctIndex
              const isSelected = i === selected
              let cls = 'mc-option'
              if (isCorrect) cls += ' correct'
              else if (isSelected) cls += ' wrong'
              return (
                <div key={i} className={cls}>
                  <span className="letter">{String.fromCharCode(65 + i)}</span>
                  <span className="opt-text">{opt}</span>
                  {isCorrect && <Check size={16} weight="regular" color="var(--success)" className="icon" />}
                  {!isCorrect && isSelected && <X size={16} weight="regular" color="var(--error)" className="icon" />}
                </div>
              )
            })}
          </div>
        )}

        <AnimatePresence>
          {showFeedback && (
            <motion.div
              className="feedback-panel"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {(() => {
                const isStrong = showFeedback.percent >= 85
                const isOk = showFeedback.percent >= 60
                return (
                  <>
                    <div className={`head ${isStrong ? 'good' : isOk ? '' : 'bad'}`}>
                      {isStrong ? <Check size={18} weight="regular" color="var(--success)" /> :
                       !isOk ? <X size={18} weight="regular" color="var(--error)" /> : null}
                      <span className="score">{showFeedback.score}/{showFeedback.max}</span>
                      <span className="text-dim" style={{ fontSize: 13 }}>
                        {isStrong ? 'Strong response' : isOk ? 'Decent — room to grow' : 'Needs work'}
                      </span>
                    </div>
                    <div className="section">
                      <div className="label">Feedback</div>
                      <div className="body-text">{showFeedback.feedback}</div>
                    </div>
                    {current.mode === 'multiple_choice' && current.questions[0]?.explanation && (
                      <div className="section">
                        <div className="label">Recommended response</div>
                        <div className="body-text">{current.questions[0].explanation}</div>
                      </div>
                    )}
                    <button
                      className="primary lg"
                      onClick={next}
                      disabled={savingFinal}
                      style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                    >
                      {idx + 1 >= items.length ? (savingFinal ? 'Finishing…' : 'See results') : 'Next →'}
                      <ArrowRight size={14} weight="regular" />
                    </button>
                  </>
                )
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
