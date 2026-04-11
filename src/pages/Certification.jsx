import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Check, X as XIcon, ArrowRight } from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { computeXP, levelFor } from '../lib/gamification'

const CERT_LEVELS = [
  {
    name: 'Foundations',
    level: 1,
    color: '#10B981',
    requirements: [
      { key: 'quizAvg', label: 'Quiz average 70%+', threshold: 70, unit: '%' },
      { key: 'gpa', label: 'Practice GPA 2.0+', threshold: 2.0, unit: '' },
      { key: 'lessonsPassed', label: 'Pass 3+ lessons', threshold: 3, unit: '' },
      { key: 'sessionCount', label: 'Complete 5+ sessions', threshold: 5, unit: '' },
    ],
  },
  {
    name: 'Advanced',
    level: 2,
    color: '#2563EB',
    requirements: [
      { key: 'quizAvg', label: 'Quiz average 85%+', threshold: 85, unit: '%' },
      { key: 'gpa', label: 'Practice GPA 3.0+', threshold: 3.0, unit: '' },
      { key: 'lessonsPassed', label: 'Pass 6+ lessons', threshold: 6, unit: '' },
      { key: 'sessionCount', label: 'Complete 15+ sessions', threshold: 15, unit: '' },
    ],
  },
  {
    name: 'Expert',
    level: 3,
    color: '#8B5CF6',
    requirements: [
      { key: 'quizAvg', label: 'Quiz average 90%+', threshold: 90, unit: '%' },
      { key: 'gpa', label: 'Practice GPA 3.5+', threshold: 3.5, unit: '' },
      { key: 'lessonsPassed', label: 'Pass all lessons', threshold: -1, unit: '' },
      { key: 'sessionCount', label: 'Complete 30+ sessions', threshold: 30, unit: '' },
    ],
  },
]

function ProgressRing({ percent, color, size = 80, stroke = 6 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(percent, 100) / 100) * circ
  return (
    <svg width={size} height={size} className="cert-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fill="var(--text)" fontSize={size * 0.22} fontWeight={700}>
        {Math.round(percent)}%
      </text>
    </svg>
  )
}

export default function Certification() {
  const { user } = useAuth()
  const [completions, setCompletions] = useState([])
  const [sessions, setSessions] = useState([])
  const [totalLessons, setTotalLessons] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user?.id) return
      try {
        const [cs, ps, ls] = await Promise.all([
          pb.collection('lesson_completions').getFullList({ filter: `agent_id = "${user.id}"` }),
          pb.collection('practice_sessions').getFullList({ filter: `agent_id = "${user.id}"` }),
          pb.collection('lessons').getFullList({ filter: 'active = true' }),
        ])
        if (cancelled) return
        setCompletions(cs)
        setSessions(ps)
        setTotalLessons(ls.length)
      } catch (e) { console.error(e) }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [user?.id])

  const metrics = useMemo(() => {
    const quizAvg = completions.length > 0
      ? Math.round(completions.reduce((a, c) => a + (c.quiz_score || 0), 0) / completions.length)
      : 0
    const gpa = sessions.length > 0
      ? parseFloat((sessions.reduce((a, s) => a + ((s.total_score || 0) / (s.max_score || 1)) * 4, 0) / sessions.length).toFixed(1))
      : 0
    const lessonsPassed = completions.filter((c) => c.passed).length
    const sessionCount = sessions.length
    const xp = computeXP(sessions, completions)
    const lvl = levelFor(xp)
    return { quizAvg, gpa, lessonsPassed, sessionCount, xp, lvl }
  }, [completions, sessions])

  function checkReq(req) {
    const val = metrics[req.key] ?? 0
    if (req.key === 'lessonsPassed' && req.threshold === -1) {
      if (totalLessons === 0) return false
      return val >= totalLessons
    }
    return val >= req.threshold
  }

  function currentValue(req) {
    const val = metrics[req.key] ?? 0
    if (req.key === 'gpa') return val.toFixed(1)
    return val
  }

  function reqProgress(cert) {
    const met = cert.requirements.filter(checkReq).length
    return Math.round((met / cert.requirements.length) * 100)
  }

  function certLink(req) {
    if (req.key === 'lessonsPassed' || req.key === 'quizAvg') return '/lessons'
    return '/practice'
  }

  if (loading) return <div className="page"><div className="loader">Loading certification…</div></div>

  const currentCert = CERT_LEVELS.filter((c) => reqProgress(c) === 100).length

  const totalMetAll = CERT_LEVELS.reduce((acc, c) => acc + c.requirements.filter(checkReq).length, 0)
  let motivational
  if (totalMetAll === 0) {
    motivational = 'Start your training journey below.'
  } else if (currentCert === 3) {
    motivational = "You're fully certified — legend status."
  } else if (currentCert > 0) {
    motivational = 'Great work! Push for the next tier.'
  } else {
    motivational = "You're making progress. Keep going."
  }

  return (
    <div className="page cert-page">
      <div className="page-header">
        <h1>Certification</h1>
        <p className="lede">Meet all requirements at each level to advance your certification.</p>
      </div>

      {/* Current status */}
      <motion.div className="stats-strip" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="stat"><div className="label"><span className="dot green" />Level</div><div className="value">{metrics.lvl.name}</div><div className="meta">{metrics.xp.toLocaleString()} XP</div></div>
        <div className="stat"><div className="label"><span className="dot blue" />Quiz Avg</div><div className="value">{metrics.quizAvg}%</div><div className="meta">{completions.length} attempts</div></div>
        <div className="stat"><div className="label"><span className="dot green" />Practice GPA</div><div className="value">{metrics.gpa.toFixed(1)}</div><div className="meta">{metrics.sessionCount} sessions</div></div>
        <div className="stat"><div className="label"><span className="dot amber" />Cert Level</div><div className="value">{currentCert}/3</div><div className="meta">{currentCert === 3 ? 'fully certified' : 'in progress'}</div></div>
      </motion.div>

      <motion.p
        className="text-muted"
        style={{ textAlign: 'center', fontSize: 13, marginTop: 14, marginBottom: 0 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {motivational}
      </motion.p>

      {/* Level cards */}
      <div className="cert-cards">
        {CERT_LEVELS.map((cert, ci) => {
          const pct = reqProgress(cert)
          const complete = pct === 100
          const prevComplete = ci === 0 || reqProgress(CERT_LEVELS[ci - 1]) === 100
          return (
            <motion.div
              key={cert.name}
              className={`card cert-level-card ${complete ? 'complete' : ''} ${!prevComplete ? 'locked' : ''}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: ci * 0.08 }}
            >
              <div className="cert-level-header">
                <ProgressRing percent={pct} color={cert.color} />
                <div>
                  <div className="cert-level-name" style={{ color: cert.color }}>Level {cert.level}: {cert.name}</div>
                  <div className="cert-level-status">
                    {complete
                      ? <span className="badge success">Complete</span>
                      : !prevComplete
                        ? <span className="badge">Locked</span>
                        : <span className="badge warn">In Progress</span>
                    }
                  </div>
                </div>
              </div>

              <div className="cert-requirements">
                {cert.requirements.map((req) => {
                  const met = checkReq(req)
                  const threshold = req.key === 'lessonsPassed' && req.threshold === -1 ? totalLessons : req.threshold
                  return (
                    <div key={req.key} className={`cert-req ${met ? 'met' : 'unmet'}`}>
                      <span className="cert-req-icon">
                        {met ? <Check size={14} weight="bold" /> : <XIcon size={14} weight="bold" />}
                      </span>
                      <span className="cert-req-label">{req.label}</span>
                      <span className="cert-req-value">
                        {currentValue(req)}{req.unit} / {threshold}{req.unit}
                      </span>
                      {!met && prevComplete && (
                        <Link to={certLink(req)} className="cert-req-link">
                          Go <ArrowRight size={10} weight="bold" />
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
