import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  Target,
  Shield,
  EyeSlash,
  Moon,
  Question,
  Clock,
  Users,
  CurrencyDollar,
  Flame,
  HeartStraight,
  ArrowRight,
} from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { CATEGORIES, categoryMastery } from '../lib/gamification'

const ICON_MAP = {
  Target, Shield, EyeSlash, Moon, Question, Clock, Users, CurrencyDollar, Flame, HeartStraight,
}

const STAGES = [
  { value: 'intro_soa', label: 'Intro/SOA' },
  { value: 'qualifying', label: 'Qualifying' },
  { value: 'presenting', label: 'Presenting' },
  { value: 'closing', label: 'Closing' },
]

const TYPES = [
  { value: 'multiple_choice', label: 'MC' },
  { value: 'free_text', label: 'Free Text' },
  { value: 'mixed', label: 'Mixed' },
]

const DIFF_LABELS = ['', 'Warm-up', 'Standard', 'Tough', 'Brutal']

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
        if (cancelled) return
        setObjectionCounts(counts)
        setResponses(rs)
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

  return (
    <div className="page">
      <div className="page-header">
        <h1>Practice</h1>
        <p className="lede">Drill objections from real callers. Pick a category, dial in the difficulty, and go.</p>
      </div>

      <div className="label-cap" style={{ marginBottom: 10 }}>Categories</div>
      <div className="category-grid">
        {CATEGORIES.map((c, i) => {
          const Icon = ICON_MAP[c.iconName] || Target
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
            >
              <div className="icon"><Icon size={20} weight="regular" /></div>
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
          <div className="row between">
            <div className="label-cap">Difficulty</div>
            <span className="text-mono" style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
              Level {difficulty} · {DIFF_LABELS[difficulty]}
            </span>
          </div>
          <div className="slider-wrap">
            <input
              type="range"
              min="1"
              max="4"
              step="1"
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
            />
            <div className="slider-labels">
              <span>Warm-up</span>
              <span>Standard</span>
              <span>Tough</span>
              <span>Brutal</span>
            </div>
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
