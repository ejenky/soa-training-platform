import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight } from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { fetchDueReviews } from '../lib/spacedRepetition'
import {
  CATEGORIES,
  categoryMastery,
  computeStreak,
  computeXP,
  levelFor,
} from '../lib/gamification'

function initials(name, email) {
  const src = (name || email || '').trim()
  if (!src) return 'A'
  const parts = src.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
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

function timeAgo(d) {
  const ms = Date.now() - new Date(d).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  return `${days}d ago`
}

const ACHIEVEMENTS = [
  { key: 'first_drill', name: 'First Drill' },
  { key: 'streak_3', name: '3-Day Streak' },
  { key: 'streak_7', name: 'Week Warrior' },
  { key: 'perfect', name: 'Perfectionist' },
  { key: 'lessons_5', name: 'Scholar' },
  { key: 'sessions_10', name: 'Drill Master' },
  { key: 'cert_quiz', name: 'Quiz Pro' },
  { key: 'cert_practice', name: 'Practice Pro' },
]

const stagger = {
  hidden: { opacity: 0, y: 14 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] },
  }),
}

function Animated({ children, i = 0, className = '', as = 'div' }) {
  const Comp = motion[as]
  return (
    <Comp
      className={className}
      custom={i}
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {children}
    </Comp>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [lessons, setLessons] = useState([])
  const [completions, setCompletions] = useState([])
  const [sessions, setSessions] = useState([])
  const [responses, setResponses] = useState([])
  const [topAgents, setTopAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviewDueCount, setReviewDueCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [ls, cs, ps] = await Promise.all([
          pb.collection('lessons').getFullList({ filter: 'active = true', sort: 'week_number,order_index' }),
          pb.collection('lesson_completions').getFullList({ filter: `agent_id = "${user.id}"`, sort: '-completed_at' }),
          pb.collection('practice_sessions').getFullList({ filter: `agent_id = "${user.id}"`, sort: '-created' }),
        ])

        let rs = []
        if (ps.length > 0) {
          const filter = ps.slice(0, 30).map((p) => `session_id = "${p.id}"`).join(' || ')
          rs = await pb.collection('session_responses')
            .getFullList({ filter, expand: 'objection_id' })
            .catch(() => [])
        }

        let lb = []
        try {
          const agents = await pb.collection('users').getFullList({ filter: 'role = "agent"', sort: 'name' })
          const [allS, allC] = await Promise.all([
            pb.collection('practice_sessions').getFullList({ sort: '-created' }).catch(() => []),
            pb.collection('lesson_completions').getFullList().catch(() => []),
          ])
          lb = agents
            .map((a) => ({
              id: a.id,
              name: a.name || a.email,
              xp: computeXP(allS.filter((s) => s.agent_id === a.id), allC.filter((c) => c.agent_id === a.id)),
            }))
            .sort((a, b) => b.xp - a.xp)
            .slice(0, 5)
        } catch { /* optional */ }

        const dueReviews = await fetchDueReviews(pb, user.id)

        if (cancelled) return
        setLessons(ls)
        setCompletions(cs)
        setSessions(ps)
        setResponses(rs)
        setTopAgents(lb)
        setReviewDueCount(dueReviews.length)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (user?.id) load()
    return () => { cancelled = true }
  }, [user?.id])

  const computed = useMemo(() => {
    const passedIds = new Set(completions.filter((c) => c.passed).map((c) => c.lesson_id))
    const totalLessons = lessons.length
    const completedCount = passedIds.size
    const nextLesson = lessons.find((l) => !passedIds.has(l.id))

    const quizAvg = completions.length > 0
      ? Math.round(completions.reduce((a, c) => a + (c.quiz_score || 0), 0) / completions.length)
      : 0
    const practiceGpa = sessions.length > 0
      ? (sessions.reduce((a, s) => a + ((s.total_score || 0) / (s.max_score || 1)) * 4, 0) / sessions.length).toFixed(1)
      : '0.0'
    const xp = computeXP(sessions, completions, responses)
    const lvl = levelFor(xp)
    const streak = computeStreak(sessions, completions)

    return { completedCount, totalLessons, nextLesson, quizAvg, practiceGpa, xp, lvl, streak }
  }, [lessons, completions, sessions, responses])

  const mastery = useMemo(() => categoryMastery(responses), [responses])

  const earned = useMemo(() => {
    const set = new Set()
    if (sessions.length >= 1) set.add('first_drill')
    if (computed.streak >= 3) set.add('streak_3')
    if (computed.streak >= 7) set.add('streak_7')
    if (sessions.some((s) => s.max_score > 0 && s.total_score === s.max_score)) set.add('perfect')
    if (completions.filter((c) => c.passed).length >= 5) set.add('lessons_5')
    if (sessions.length >= 10) set.add('sessions_10')
    if (computed.quizAvg >= 85) set.add('cert_quiz')
    if (parseFloat(computed.practiceGpa) >= 3.0) set.add('cert_practice')
    return set
  }, [sessions, completions, computed])

  if (loading) {
    return (
      <div className="page">
        <div className="loader">Loading dashboard…</div>
      </div>
    )
  }

  const c = computed
  const recentSessions = sessions.slice(0, 5)

  // Smart drill recommendation
  const recommendation = (() => {
    if (reviewDueCount > 0) {
      return {
        title: `You have ${reviewDueCount} objection${reviewDueCount !== 1 ? 's' : ''} due for review`,
        desc: 'Keep what you learned sharp with spaced repetition.',
        btn: 'Start Review',
        href: '/practice/session?mode=review&type=mixed&stage=intro_soa&difficulty=2',
      }
    }
    const incomplete = completions.find((cc) => !cc.passed)
    if (incomplete) {
      const lesson = lessons.find((l) => l.id === incomplete.lesson_id)
      if (lesson) {
        return {
          title: `Continue Lesson: ${lesson.title}`,
          desc: 'Pick up where you left off — pass 85%+ to unlock the next lesson.',
          btn: 'Continue Lesson',
          href: `/lessons/${lesson.id}`,
        }
      }
    }
    const weakest = mastery.filter((m) => m.count > 0).sort((a, b) => a.pct - b.pct)[0]
    if (weakest && weakest.pct < 70) {
      return {
        title: `Drill your weak spot: ${weakest.key}`,
        desc: `Your mastery is ${weakest.pct}% — let's push it above 70%.`,
        btn: 'Start drill',
        href: `/practice/session?stage=intro_soa&type=mixed&difficulty=2&category=${encodeURIComponent(weakest.key)}`,
      }
    }
    return {
      title: 'Stay sharp: Quick 5-minute drill',
      desc: 'Five real objections at your level. Earn XP, keep your streak alive.',
      btn: 'Start drill',
      href: '/practice/session?stage=intro_soa&type=multiple_choice&difficulty=2',
    }
  })()

  // Daily goal tracker — drills completed today
  const drillsToday = (() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return sessions.filter((s) => new Date(s.created) >= start).length
  })()
  const DAILY_GOAL = 3
  const dailyProgress = Math.min(drillsToday, DAILY_GOAL)

  // Leaderboard visibility
  const rankedCount = topAgents.filter((a) => a.xp > 0).length
  const showLeaderboard = rankedCount >= 3
  const showLeaderboardEmpty = !showLeaderboard && sessions.length === 0

  // Top weak categories — show 5 with most data
  const weakSpots = mastery.filter((m) => m.count > 0).sort((a, b) => a.pct - b.pct).slice(0, 5)
  if (weakSpots.length === 0) {
    // fallback: show all categories at 0
    weakSpots.push(...mastery.slice(0, 5))
  }

  function tone(p) {
    if (p >= 85) return 'good'
    if (p >= 60) return 'ok'
    return 'bad'
  }

  return (
    <div className="page">
      {/* Stats strip */}
      <Animated i={0} className="stats-strip">
        <div className="stat">
          <div className="label"><span className="dot amber" />Streak</div>
          <div className="value">{c.streak}</div>
          <div className="meta">{c.streak > 0 ? 'days in a row' : 'start today'}</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />Level</div>
          <div className="value" style={{ fontSize: 18 }}>{c.lvl.name}</div>
          <div className="meta">{c.completedCount}/{c.totalLessons} lessons</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot blue" />Quiz Avg</div>
          <div className="value">{c.quizAvg}%</div>
          <div className="meta">{c.quizAvg >= 85 ? 'cert ready' : 'need 85%+'}</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />Practice GPA</div>
          <div className="value">{c.practiceGpa}</div>
          <div className="meta">{parseFloat(c.practiceGpa) >= 3.0 ? 'cert ready' : 'need 3.0+'}</div>
        </div>
      </Animated>

      <div className="split" style={{ marginTop: 18 }}>
        <div className="stack">
          {/* Drill CTA */}
          <Animated i={1} className="card drill-cta">
            <div className="overline">Today's Drill</div>
            <h2>{recommendation.title}</h2>
            <p>{recommendation.desc}</p>
            <div className="cta-row">
              <button
                className="cta lg"
                onClick={() => navigate(recommendation.href)}
              >
                {recommendation.btn} <ArrowRight size={14} weight="regular" />
              </button>
              {c.nextLesson && recommendation.btn !== 'Continue Lesson' && (
                <Link to={`/lessons/${c.nextLesson.id}`}>
                  <button className="lg">Resume lesson</button>
                </Link>
              )}
            </div>

            {/* Daily goal tracker */}
            <div
              className="daily-goal"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 18,
                paddingTop: 16,
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                Daily Goal: <span style={{ color: 'var(--text)' }}>{drillsToday}/{DAILY_GOAL}</span> drills completed
              </div>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                {Array.from({ length: DAILY_GOAL }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: i < dailyProgress ? 'var(--green)' : 'var(--border-subtle)',
                      transition: 'background 0.3s ease',
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="xp-bar">
              <span className="level-badge">{c.lvl.name}</span>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${Math.round(c.lvl.progress * 100)}%` }} />
              </div>
              <span className="meta">
                {c.lvl.xpToNext > 0 ? `${c.lvl.xpToNext.toLocaleString()} XP to ${c.lvl.nextName}` : 'Max'}
              </span>
            </div>
          </Animated>

          {/* Weak spots */}
          <Animated i={2} className="card">
            <div className="row between">
              <h2>Weak Spots</h2>
              <Link to="/progress" style={{ fontSize: 12 }}>View all →</Link>
            </div>
            <div className="bars">
              {weakSpots.map((m) => {
                const t = tone(m.pct)
                return (
                  <div key={m.key} className="bar-row">
                    <div className="label">{m.key}</div>
                    <div className="track">
                      <div className={`fill ${t}`} style={{ width: `${m.pct}%` }} />
                    </div>
                    <div className={`pct ${t}`}>{m.pct}%</div>
                  </div>
                )
              })}
            </div>
          </Animated>
        </div>

        <div className="stack">
          {/* Leaderboard */}
          {showLeaderboard && (
            <Animated i={2} className="card">
              <div className="row between">
                <h2>Leaderboard</h2>
                <span className="label-cap">This month</span>
              </div>
              <div className="lb-list">
                {topAgents.map((a, i) => {
                  const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''
                  return (
                    <div key={a.id} className={`lb-row ${a.id === user?.id ? 'me' : ''}`}>
                      <div className={`rank ${rankCls}`}>{i + 1}</div>
                      <div className="av">{initials(a.name)}</div>
                      <div className="name">{a.name}</div>
                      <div className="xp">{a.xp.toLocaleString()}</div>
                    </div>
                  )
                })}
              </div>
            </Animated>
          )}
          {showLeaderboardEmpty && (
            <Animated i={2} className="card">
              <h2>Leaderboard</h2>
              <p className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
                Complete your first drill to start ranking.
              </p>
              <Link to="/practice">
                <button className="primary" style={{ marginTop: 12 }}>
                  Go to Practice <ArrowRight size={13} weight="regular" />
                </button>
              </Link>
            </Animated>
          )}

          {/* Recent activity */}
          <Animated i={3} className="card">
            <h2>Recent Activity</h2>
            <div className="activity">
              {recentSessions.length === 0 && (
                <p className="text-muted" style={{ fontSize: 12 }}>
                  No sessions yet. <Link to="/practice">Run your first drill →</Link>
                </p>
              )}
              {recentSessions.map((s) => {
                const pct = s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0
                const t = pct >= 85 ? 'success' : pct >= 60 ? 'warn' : 'error'
                return (
                  <div key={s.id} className="activity-row">
                    <div className={`dot ${t}`} />
                    <div className="text">
                      {labelStage(s.call_stage)}
                      <span className="meta">{timeAgo(s.created)}</span>
                    </div>
                    <div className="score">{pct}%</div>
                  </div>
                )
              })}
            </div>
          </Animated>

          {/* Achievements */}
          <Animated i={4} className="card">
            <h2>Achievements</h2>
            <div className="achievements">
              {ACHIEVEMENTS.map((a) => {
                const got = earned.has(a.key)
                return (
                  <span
                    key={a.key}
                    className={`achievement-pill ${got ? 'earned' : 'locked'}`}
                  >
                    {a.name}
                  </span>
                )
              })}
            </div>
          </Animated>
        </div>
      </div>
    </div>
  )
}
