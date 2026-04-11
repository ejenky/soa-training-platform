import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Timer, UserCircle, Phone } from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'

const DIFF_LABELS = ['', 'Warm-up', 'Standard', 'Tough', 'Brutal']
const DIFF_COLORS = ['', 'var(--success)', 'var(--blue)', 'var(--warn)', 'var(--error)']
const STAGE_LABELS = { intro_soa: 'Intro / SOA', qualifying: 'Qualifying', presenting: 'Presenting', closing: 'Closing' }

function personaInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function Scenarios() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [diffFilter, setDiffFilter] = useState(0)
  const [catFilter, setCatFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const list = await pb.collection('scenarios').getFullList({ filter: 'active = true', sort: 'difficulty,name' }).catch(() => [])
        if (!cancelled) setScenarios(list)
      } catch (e) { console.error(e) }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const categories = useMemo(() => [...new Set(scenarios.map((s) => s.category).filter(Boolean))], [scenarios])

  const filtered = useMemo(() => {
    let list = scenarios
    if (diffFilter > 0) list = list.filter((s) => s.difficulty === diffFilter)
    if (catFilter !== 'all') list = list.filter((s) => s.category === catFilter)
    return list
  }, [scenarios, diffFilter, catFilter])

  if (loading) return <div className="page"><div className="loader">Loading scenarios…</div></div>

  return (
    <div className="page">
      <div className="page-header">
        <h1>Roleplays</h1>
        <p className="lede">Practice full phone calls with realistic AI clients. Each roleplay simulates a real caller based on actual call transcripts.</p>
      </div>

      {scenarios.length === 0 ? (
        <motion.div
          className="card empty-state"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'center', padding: '64px 28px' }}
        >
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(37, 99, 235, 0.1))',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <Phone size={52} weight="regular" style={{ color: '#8B5CF6' }} />
          </div>
          <h3 style={{ marginBottom: 10 }}>Roleplays coming soon</h3>
          <p className="text-muted" style={{ maxWidth: 540, margin: '0 auto', fontSize: 14, lineHeight: 1.6 }}>
            Your supervisor is building realistic call scenarios from real caller transcripts. Each roleplay will simulate a complete phone conversation with a unique client persona, so you can practice handling the full call from intro to close.
          </p>
        </motion.div>
      ) : (
      <>
      {/* Filters */}
      <div className="sc-filter-bar">
        <select value={diffFilter} onChange={(e) => setDiffFilter(+e.target.value)}>
          <option value={0}>All Difficulties</option>
          <option value={1}>1 — Warm-up</option>
          <option value={2}>2 — Standard</option>
          <option value={3}>3 — Tough</option>
          <option value={4}>4 — Brutal</option>
        </select>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="sc-count">{filtered.length} roleplay{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <motion.div className="card empty-state" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Phone size={40} weight="regular" style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3>No roleplays match your filters</h3>
          <p>Try clearing the difficulty or category filter.</p>
        </motion.div>
      ) : (
        <div className="sc-grid">
          {filtered.map((s, i) => (
            <motion.div
              key={s.id}
              className="card sc-card"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="sc-card-top">
                <div className="sc-persona-avatar">{personaInitials(s.persona_name)}</div>
                <div className="sc-persona-info">
                  <div className="sc-persona-name">{s.persona_name}{s.persona_age ? `, ${s.persona_age}` : ''}</div>
                  <div className="sc-persona-desc">{s.persona_description || s.name}</div>
                </div>
              </div>
              <div className="sc-card-badges">
                <span className="badge" style={{ color: DIFF_COLORS[s.difficulty] || 'var(--text-dim)', borderColor: DIFF_COLORS[s.difficulty] || 'var(--border)' }}>
                  {DIFF_LABELS[s.difficulty] || `Diff ${s.difficulty}`}
                </span>
                {s.category && <span className="badge">{s.category}</span>}
                <span className="badge">{STAGE_LABELS[s.call_stage] || s.call_stage}</span>
                {s.estimated_minutes > 0 && (
                  <span className="badge"><Timer size={10} weight="bold" /> {s.estimated_minutes}m</span>
                )}
              </div>
              <button className="cta sc-start-btn" onClick={() => navigate(`/practice/scenario/${s.id}`)}>
                Start Roleplay <ArrowRight size={14} weight="regular" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}
