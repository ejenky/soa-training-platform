import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  Microphone,
  CreditCard,
  CalendarCheck,
  XCircle,
  ArrowRight,
  Phone,
  Timer,
} from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { CATEGORIES, categoryMastery } from '../lib/gamification'
import { fetchDueReviews } from '../lib/spacedRepetition'

const ICON_MAP = {
  Microphone, CreditCard, CalendarCheck, XCircle,
}

const STAGES = [
  { value: 'intro_soa', label: 'Intro/SOA' },
  { value: 'rwb_card', label: 'RWB Card' },
  { value: 'sep', label: 'SEP' },
  { value: 'no_value', label: 'No Value' },
]

const DIFFICULTY_LEVELS = [
  { level: 1, label: 'Warm-up', color: '#10B981' },
  { level: 2, label: 'Standard', color: '#2563EB' },
  { level: 3, label: 'Tough', color: '#F59E0B' },
  { level: 4, label: 'Brutal', color: '#EF4444' },
]

const TYPES = [
  { value: 'multiple_choice', label: 'MC' },
  { value: 'free_text', label: 'Free Text' },
  { value: 'mixed', label: 'Mixed' },
]

export default function Practice() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [objectionCounts, setObjectionCounts] = useState({})
  const [responses, setResponses] = useState([])
  const [stage, setStage] = useState('intro_soa')
  const [sessionType, setSessionType] = useState('multiple_choice')
  const [difficulty, setDifficulty] = useState(2)
  const [selectedCat, setSelectedCat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dueCount, setDueCount] = useState(0)
  const [scenarios, setScenarios] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const objs = await pb.collection('objections').getFullList({ filter: 'active = true' }).catch(() => [])
        const counts = {}
        objs.forEach((o) => { counts[o.category] = (counts[o.category] || 0) + 1 })

        let rs = []
        if (user?.id) {
          const sessions = await pb.collection('practice_sessions')
            .getFullList({ filter: `agent_id = "${user.id}"`, sort: '-created' })
            .catch(() => [])
          if (sessions.length > 0) {
            const filter = sessions.slice(0, 30).map((s) => `session_id = "${s.id}"`).join(' || ')
            rs = await pb.collection('session_responses').getFullList({ filter, expand: 'objection_id' }).catch(() => [])
          }
        }
        const dueReviews = await fetchDueReviews(pb, user?.id)
        const scs = await pb.collection('scenarios').getFullList({ filter: 'active = true', sort: 'difficulty,name' }).catch(() => [])

        if (cancelled) return
        setObjectionCounts(counts)
        setResponses(rs)
        setDueCount(dueReviews.length)
        setScenarios(scs)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user?.id])

  const masteryByCat = useMemo(
    () => Object.fromEntries(categoryMastery(responses).map((c) => [c.key, c])),
    [responses],
  )

  function start() {
    const params = new URLSearchParams({ stage, type: sessionType, difficulty: String(difficulty) })
    if (selectedCat) params.set('category', selectedCat)
    navigate(`/practice/session?${params.toString()}`)
  }

  function startQuickDrill() {
    const ranked = CATEGORIES
      .map((c) => ({ key: c.key, m: masteryByCat[c.key] }))
      .filter((r) => (objectionCounts[r.key] || 0) > 0)
    const sorted = ranked.sort((a, b) => {
      const ap = a.m?.count > 0 ? a.m.pct : 101
      const bp = b.m?.count > 0 ? b.m.pct : 101
      return ap - bp
    })
    const target = sorted[0]?.key || CATEGORIES[0].key
    const params = new URLSearchParams({
      stage: 'intro_soa',
      type: 'mixed',
      difficulty: '2',
      category: target,
    })
    navigate(`/practice/session?${params.toString()}`)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Practice</h1>
        <p className="lede">Drill objections from real callers. Pick a category, dial in the difficulty, and go.</p>
      </div>

      <motion.div
        className="card quick-drill-card"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          marginBottom: 16,
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(16, 185, 129, 0.06))',
          border: '1px solid rgba(37, 99, 235, 0.2)',
        }}
      >
        <div className="row between" style={{ alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'rgba(37, 99, 235, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Timer size={22} weight="regular" style={{ color: 'var(--blue)' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>Quick Drill</h3>
              <p className="text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                Auto-picks your weakest category at your current level
              </p>
            </div>
          </div>
          <button className="cta" onClick={startQuickDrill}>
            Go <ArrowRight size={14} weight="regular" />
          </button>
        </div>
      </motion.div>

      {dueCount > 0 && (
        <motion.div
          className="card review-due-card"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="review-due-content">
            <div>
              <h3 className="review-due-title">Due for Review</h3>
              <p className="review-due-desc">
                You have <strong className={dueCount >= 4 ? 'text-error' : 'text-amber'}>{dueCount}</strong> objection{dueCount !== 1 ? 's' : ''} due for spaced repetition review.
              </p>
            </div>
            <button
              className="cta"
              onClick={() => navigate('/practice/session?mode=review&type=mixed&stage=intro_soa&difficulty=2')}
            >
              Start Review ({dueCount}) <ArrowRight size={14} weight="regular" />
            </button>
          </div>
        </motion.div>
      )}

      <div className="label-cap" style={{ marginBottom: 10 }}>Categories</div>
      <div
        className="category-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 14,
        }}
      >
        {CATEGORIES.map((c, i) => {
          const Icon = ICON_MAP[c.iconName] || Microphone
          const m = masteryByCat[c.key]
          const count = objectionCounts[c.key] || 0
          const selected = selectedCat === c.key
          return (
            <motion.button
              key={c.key}
              type="button"
              className={`cat-card ${selected ? 'selected' : ''}`}
              onClick={() => setSelectedCat(selected ? null : c.key)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              style={{ padding: 20, minHeight: 96 }}
            >
              <div className="icon"><Icon size={24} weight="regular" /></div>
              <div>
                <div className="cat-name">{c.key}</div>
                <div className="cat-meta">{count} obj · {m?.count || 0} graded</div>
              </div>
              <div className="mastery">
                <div className="mtrack">
                  <div className="mfill" style={{ width: `${m?.pct || 0}%` }} />
                </div>
                <span>{m?.pct || 0}%</span>
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Scenarios section */}
      {scenarios.length > 0 && (
        <motion.div
          className="card"
          style={{ marginTop: 20 }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          <div className="row between">
            <h2><Phone size={16} weight="regular" style={{ marginRight: 6 }} />Roleplay Scenarios</h2>
            <Link to="/scenarios" style={{ fontSize: 12 }}>View all →</Link>
          </div>
          <div className="sc-compact-grid">
            {scenarios.slice(0, 4).map((s) => (
              <button key={s.id} className="sc-compact-card" onClick={() => navigate(`/practice/scenario/${s.id}`)}>
                <div className="sc-compact-av">{s.persona_name?.[0]?.toUpperCase() || '?'}</div>
                <div className="sc-compact-info">
                  <div className="sc-compact-name">{s.persona_name}</div>
                  <div className="sc-compact-meta">{s.category} · Diff {s.difficulty}</div>
                </div>
                <ArrowRight size={12} weight="bold" className="sc-compact-arrow" />
              </button>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div
        className="card"
        style={{ marginTop: 20 }}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <h2>Session Config</h2>

        <div className="config-row">
          <div className="label-cap">Call Stage</div>
          <div className="toggle-group">
            {STAGES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={stage === s.value ? 'on' : ''}
                onClick={() => setStage(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="config-row">
          <div className="label-cap">Difficulty</div>
          <div
            className="toggle-group"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}
          >
            {DIFFICULTY_LEVELS.map((d) => {
              const on = difficulty === d.level
              return (
                <button
                  key={d.level}
                  type="button"
                  className={on ? 'on' : ''}
                  onClick={() => setDifficulty(d.level)}
                  style={{
                    minHeight: 44,
                    fontWeight: 600,
                    background: on ? d.color : 'transparent',
                    borderColor: on ? d.color : 'var(--border-subtle)',
                    color: on ? '#fff' : 'var(--text)',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 11, opacity: 0.75 }}>Level {d.level}</span>
                  <span style={{ display: 'block', fontSize: 13 }}>{d.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="config-row">
          <div className="label-cap">Session Type</div>
          <div className="toggle-group">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={sessionType === t.value ? 'on' : ''}
                onClick={() => setSessionType(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="cta lg"
          onClick={start}
          disabled={loading}
          style={{ marginTop: 26, width: '100%', justifyContent: 'center' }}
        >
          Start drill <ArrowRight size={14} weight="regular" />
        </button>
      </motion.div>
    </div>
  )
}
