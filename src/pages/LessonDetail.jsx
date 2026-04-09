import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, ArrowLeft, ArrowCounterClockwise, CheckCircle } from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'

const INTRO_SCRIPT = `Hi (Client Name)? My name is (Agent First & Last Name), I am a licensed agent with (company name), for your protection I am required to let you know that this call may be monitored, recorded, and may also be shared with insurance companies who administer plans we offer. Plans are insured or covered by a Medicare Advantage organization with a Medicare contract and/or a Medicare approved Part D sponsor. Enrollment in the plan depends on contract renewal with Medicare. Now to confirm, I have your number as (Client Phone Number) and If we get disconnected (Client Name) do I have your permission to call you back at this number? Thank you.`

const SOA_SCRIPT = `Before we proceed, I want to let you know that (Company Name) offers Medicare Advantage plans and Stand-Alone Prescription Drug plan options. We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer in your area. Currently we represent (# of carriers) organizations which offer (# of plans) plans in your area. Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program to get information on all of your options. Do I have your permission to discuss all plan types that (Company Name) offers to find the benefits that fit your needs?`

export default function LessonDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [lesson, setLesson] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState('learn')
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const l = await pb.collection('lessons').getOne(id)
        const qs = await pb.collection('quiz_questions').getFullList({
          filter: `lesson_id = "${id}"`,
          sort: 'difficulty',
        })
        if (cancelled) return
        setLesson(l)
        setQuestions(qs)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const parsedQuestions = useMemo(() => {
    return questions.map((q) => {
      let options = q.options
      if (typeof options === 'string') {
        try { options = JSON.parse(options) } catch { options = [] }
      }
      return { ...q, options: options || [] }
    })
  }, [questions])

  if (loading) return <div className="page"><div className="loader">Loading lesson…</div></div>
  if (!lesson) return <div className="page"><div className="card empty">Lesson not found.</div></div>

  function selectAnswer(qid, idx) {
    if (phase !== 'quiz') return
    setAnswers((a) => ({ ...a, [qid]: idx }))
  }

  async function submitQuiz() {
    setSubmitting(true)
    try {
      let correct = 0
      parsedQuestions.forEach((q) => {
        if (answers[q.id] === q.correct_index) correct += 1
      })
      const total = parsedQuestions.length || 1
      const scorePct = Math.round((correct / total) * 100)
      const passed = scorePct >= 85

      const existing = await pb.collection('lesson_completions').getFullList({
        filter: `agent_id = "${user.id}" && lesson_id = "${id}"`,
      })
      const prior = existing[0]
      const attempts = (prior?.attempts || 0) + 1

      const payload = {
        agent_id: user.id,
        lesson_id: id,
        quiz_score: scorePct,
        attempts,
        passed,
        completed_at: new Date().toISOString(),
      }

      if (prior) {
        await pb.collection('lesson_completions').update(prior.id, payload)
      } else {
        await pb.collection('lesson_completions').create(payload)
      }

      setResult({ scorePct, passed, attempts, correct, total })
      setPhase('result')
    } catch (e) {
      console.error(e)
      alert('Failed to submit quiz: ' + (e?.message || 'unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  function retry() {
    setAnswers({})
    setResult(null)
    setPhase('quiz')
  }

  const allAnswered = parsedQuestions.length > 0 && parsedQuestions.every((q) => answers[q.id] !== undefined)

  return (
    <div className="page">
      <div className="page-header">
        <div className="breadcrumb">
          <Link to="/lessons"><ArrowLeft size={12} weight="regular" /> Lessons</Link>
          <span>›</span>
          <span>Week {lesson.week_number}</span>
        </div>
        <h1>{lesson.title}</h1>
        <p className="lede">Week {lesson.week_number} · {lesson.est_minutes || 15} min · {lesson.bloom_level}</p>
      </div>

      {phase === 'learn' && (
        <div className="stack">
          <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h2>Lesson</h2>
            {lesson.content_text ? (
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'var(--text-dim)', marginTop: 10 }}>
                {lesson.content_text}
              </div>
            ) : (
              <p>No written content for this lesson.</p>
            )}
            {lesson.content_url && (
              <p style={{ marginTop: 12 }}>
                <a href={lesson.content_url} target="_blank" rel="noreferrer">Open external resource ↗</a>
              </p>
            )}
          </motion.div>

          <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}>
            <h2>Required Scripts</h2>
            <h3 style={{ marginTop: 14 }}>Intro script</h3>
            <div className="script">{INTRO_SCRIPT}</div>
            <h3 style={{ marginTop: 18 }}>SOA disclosure</h3>
            <div className="script green">{SOA_SCRIPT}</div>
          </motion.div>

          <div className="row">
            <button className="primary lg" onClick={() => setPhase('quiz')} disabled={parsedQuestions.length === 0}>
              {parsedQuestions.length === 0 ? 'No quiz available' : 'Start quiz'}
              <ArrowRight size={14} weight="regular" />
            </button>
          </div>
        </div>
      )}

      {phase === 'quiz' && (
        <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h2>Quiz · {parsedQuestions.length} questions</h2>
          <p>Pass at 85%+ to unlock the next lesson.</p>
          {parsedQuestions.map((q, qi) => (
            <div key={q.id} style={{ marginTop: 22 }}>
              <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>
                {qi + 1}. {q.question_text}
              </div>
              <div className="quiz-options">
                {q.options.map((opt, idx) => (
                  <button
                    key={idx}
                    className={`quiz-option ${answers[q.id] === idx ? 'selected' : ''}`}
                    onClick={() => selectAnswer(q.id, idx)}
                  >
                    {String.fromCharCode(65 + idx)}. {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="row" style={{ marginTop: 22 }}>
            <button className="primary lg" disabled={!allAnswered || submitting} onClick={submitQuiz}>
              {submitting ? 'Submitting…' : 'Submit answers'}
            </button>
            <button className="ghost" onClick={() => setPhase('learn')}>Back to lesson</button>
          </div>
        </motion.div>
      )}

      {phase === 'result' && result && (
        <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {result.passed ? (
            <div className="summary-head">
              <CheckCircle size={42} weight="regular" color="var(--success)" />
              <h2>You passed — {result.scorePct}%</h2>
              <p>{result.correct} of {result.total} correct · attempt {result.attempts} · +50 XP</p>
            </div>
          ) : (
            <div className="summary-head">
              <h2>Not quite — {result.scorePct}%</h2>
              <p>{result.correct} of {result.total} correct · attempt {result.attempts}. You need 85%+ to pass.</p>
            </div>
          )}

          <div style={{ marginTop: 22 }}>
            {parsedQuestions.map((q, qi) => {
              const selected = answers[q.id]
              const correct = q.correct_index
              return (
                <div key={q.id} style={{ marginBottom: 22 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>
                    {qi + 1}. {q.question_text}
                  </div>
                  <div className="quiz-options">
                    {q.options.map((opt, idx) => {
                      let cls = 'quiz-option'
                      if (idx === correct) cls += ' correct'
                      else if (idx === selected) cls += ' incorrect'
                      return (
                        <div key={idx} className={cls}>
                          {String.fromCharCode(65 + idx)}. {opt}
                        </div>
                      )
                    })}
                  </div>
                  {q.explanation && (
                    <p style={{ fontSize: 12, marginTop: 8 }}>{q.explanation}</p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            {!result.passed && (
              <button className="primary" onClick={retry}>
                <ArrowCounterClockwise size={14} weight="regular" /> Retry quiz
              </button>
            )}
            <button onClick={() => navigate('/lessons')}>Back to lessons</button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
