import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Target, Flame, BookOpen, Trophy, Star, Medal, ShieldCheck, Crown, ArrowRight } from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { categoryMastery, computeStreak, computeXP, heatmapData, sessionsInLastDays } from '../lib/gamification'
import { fetchAllReviews, isDueForReview } from '../lib/spacedRepetition'

const ACHIEVEMENTS = [
  { key: 'first_drill', name: 'First Drill', desc: 'Complete a session', Icon: Target },
  { key: 'streak_3', name: '3-Day Streak', desc: '3 days in a row', Icon: Flame },
  { key: 'streak_7', name: 'Week Warrior', desc: '7-day streak', Icon: Trophy },
  { key: 'perfect', name: 'Perfectionist', desc: 'Score 100%', Icon: Star },
  { key: 'lessons_5', name: 'Scholar', desc: 'Pass 5 lessons', Icon: BookOpen },
  { key: 'sessions_10', name: 'Drill Master', desc: '10 sessions', Icon: Medal },
  { key: 'cert_quiz', name: 'Quiz Pro', desc: 'Quiz avg 85%+', Icon: ShieldCheck },
  { key: 'cert_practice', name: 'Practice Pro', desc: 'GPA 3.0+', Icon: Crown },
]

function tone(p) { return p >= 85 ? 'good' : p >= 60 ? 'ok' : 'bad' }

function LineChart({ data }) {
  if (!data || data.length === 0) return <p>Not enough data yet.</p>
  const w = 700, h = 200
  const padding = { top: 16, right: 12, bottom: 24, left: 30 }
  const cw = w - padding.left - padding.right
  const ch = h - padding.top - padding.bottom
  const yMax = Math.max(100, ...data.map((d) => d.y))
  const xStep = data.length > 1 ? cw / (data.length - 1) : 0
  const points = data.map((d, i) => [
    padding.left + i * xStep,
    padding.top + ch - (d.y / yMax) * ch,
  ])
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
  return (
    <div className="line-chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = padding.top + ch * t
          return (
            <g key={i}>
              <line x1={padding.left} x2={w - padding.right} y1={y} y2={y} className="chart-grid" strokeWidth={1} />
              <text x={padding.left - 8} y={y + 3} fontSize={9} className="chart-axis" textAnchor="end" fontFamily="Geist Mono, monospace">
                {Math.round(yMax - yMax * t)}
              </text>
            </g>
          )
        })}
        <path d={path} fill="none" stroke="#4CAF50" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={3} fill="#4CAF50" />
        ))}
      </svg>
    </div>
  )
}

function Heatmap({ data }) {
  const cols = []
  for (let i = 0; i < data.length; i += 7) cols.push(data.slice(i, i + 7))
  function level(c) {
    if (c === 0) return ''
    if (c === 1) return 'l1'
    if (c === 2) return 'l2'
    if (c === 3) return 'l3'
    return 'l4'
  }
  return (
    <>
      <div className="heatmap">
        {cols.map((col, i) => (
          <div key={i} className="col">
            {col.map((d, j) => (
              <div key={j} className={`cell ${level(d.count)}`} title={`${d.date.toDateString()} — ${d.count} activity`} />
            ))}
          </div>
        ))}
      </div>
      <div className="legend">
        Less <span className="sw" /><span className="sw l1" /><span className="sw l2" /><span className="sw l3" /><span className="sw l4" /> More
      </div>
    </>
  )
}

export default function Progress() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [completions, setCompletions] = useState([])
  const [sessions, setSessions] = useState([])
  const [responses, setResponses] = useState([])
  const [lessons, setLessons] = useState([])
  const [reviewQueue, setReviewQueue] = useState([])
  const [reviewObjections, setReviewObjections] = useState({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [cs, ps, ls] = await Promise.all([
          pb.collection('lesson_completions').getFullList({ filter: `agent_id = "${user.id}"`, sort: '-completed_at' }),
          pb.collection('practice_sessions').getFullList({ filter: `agent_id = "${user.id}"`, sort: '-created' }),
          pb.collection('lessons').getFullList({ filter: 'active = true' }),
        ])
        let rs = []
        if (ps.length > 0) {
          const filter = ps.slice(0, 60).map((p) => `session_id = "${p.id}"`).join(' || ')
          rs = await pb.collection('session_responses').getFullList({ filter, expand: 'objection_id' })
        }
        // Fetch spaced repetition queue
        const rq = await fetchAllReviews(pb, user.id)
        let rqObjs = {}
        if (rq.length > 0) {
          const objIds = [...new Set(rq.map((r) => r.objection_id))]
          const objFilter = objIds.map((id) => `id = "${id}"`).join(' || ')
          const objs = await pb.collection('objections').getFullList({ filter: objFilter }).catch(() => [])
          rqObjs = Object.fromEntries(objs.map((o) => [o.id, o]))
        }

        if (cancelled) return
        setCompletions(cs)
        setSessions(ps)
        setResponses(rs)
        setLessons(ls)
        setReviewQueue(rq)
        setReviewObjections(rqObjs)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (user?.id) load()
    return () => { cancelled = true }
  }, [user?.id])

  const stats = useMemo(() => {
    const quizAvg = completions.length > 0
      ? Math.round(completions.reduce((a, c) => a + (c.quiz_score || 0), 0) / completions.length)
      : 0
    const practiceGpa = sessions.length > 0
      ? (sessions.reduce((a, s) => a + ((s.total_score || 0) / (s.max_score || 1)) * 4, 0) / sessions.length).toFixed(1)
      : '0.0'
    const xp = computeXP(sessions, completions, responses)
    const streak = computeStreak(sessions, completions)
    const sessionsThisWeek = sessionsInLastDays(sessions, 7).length
    return { quizAvg, practiceGpa, xp, streak, sessionsThisWeek }
  }, [sessions, completions, responses])

  const mastery = useMemo(() => categoryMastery(responses), [responses])

  const lineData = useMemo(() => {
    const out = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      const ses = sessions.filter((s) => {
        const t = new Date(s.created)
        return t >= d && t < next
      })
      let y = 0
      if (ses.length > 0) {
        y = ses.reduce((a, s) => a + (s.max_score > 0 ? (s.total_score / s.max_score) * 100 : 0), 0) / ses.length
      }
      out.push({ x: d, y: Math.round(y) })
    }
    return out
  }, [sessions])

  const heatmap = useMemo(() => heatmapData(sessions, completions, 84), [sessions, completions])

  const earned = useMemo(() => {
    const set = new Set()
    if (sessions.length >= 1) set.add('first_drill')
    if (stats.streak >= 3) set.add('streak_3')
    if (stats.streak >= 7) set.add('streak_7')
    if (sessions.some((s) => s.max_score > 0 && s.total_score === s.max_score)) set.add('perfect')
    if (completions.filter((c) => c.passed).length >= 5) set.add('lessons_5')
    if (sessions.length >= 10) set.add('sessions_10')
    if (stats.quizAvg >= 85) set.add('cert_quiz')
    if (parseFloat(stats.practiceGpa) >= 3.0) set.add('cert_practice')
    return set
  }, [sessions, completions, stats])

  if (loading) return <div className="page"><div className="loader">Loading progress…</div></div>

  const lessonMap = Object.fromEntries(lessons.map((l) => [l.id, l]))
  const sortedMastery = [...mastery].filter((r) => r.count > 0).sort((a, b) => a.pct - b.pct)

  return (
    <div className="page">
      <div className="page-header">
        <h1>Progress</h1>
        <p className="lede">Hard numbers. Honest weak spots. Measurable wins.</p>
      </div>

      <motion.div className="stats-strip" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="stat">
          <div className="label"><span className="dot blue" />Quiz Avg</div>
          <div className="value">{stats.quizAvg}%</div>
          <div className="meta">{stats.quizAvg >= 85 ? 'cert ready' : 'need 85%+'}</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />Practice GPA</div>
          <div className="value">{stats.practiceGpa}</div>
          <div className="meta">{parseFloat(stats.practiceGpa) >= 3.0 ? 'cert ready' : 'need 3.0+'}</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />Total XP</div>
          <div className="value">{stats.xp.toLocaleString()}</div>
          <div className="meta">all-time</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot amber" />Streak</div>
          <div className="value">{stats.streak}</div>
          <div className="meta">{stats.sessionsThisWeek} this week</div>
        </div>
      </motion.div>

      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
          <h2>30-Day Score Trend</h2>
          <LineChart data={lineData} />
        </motion.div>

        <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
          <h2>Mastery by Category</h2>
          {sortedMastery.length === 0 ? (
            <p>Run some drills first.</p>
          ) : (
            <div className="bars">
              {sortedMastery.slice(0, 8).map((m) => {
                const t = tone(m.pct)
                return (
                  <div key={m.key} className="bar-row">
                    <div className="label">{m.key}</div>
                    <div className="track"><div className={`fill ${t}`} style={{ width: `${m.pct}%` }} /></div>
                    <div className={`pct ${t}`}>{m.pct}%</div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      </div>

      <motion.div className="card" style={{ marginTop: 18 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
        <h2>Activity Heatmap</h2>
        <p style={{ fontSize: 12 }}>Last 12 weeks of training activity.</p>
        <Heatmap data={heatmap} />
      </motion.div>

      {reviewQueue.length > 0 && (
        <motion.div className="card" style={{ marginTop: 18 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.22 }}>
          <div className="row between">
            <h2>Spaced Repetition</h2>
            {reviewQueue.filter(isDueForReview).length > 0 && (
              <Link to="/practice/session?mode=review&type=mixed&stage=intro_soa&difficulty=2" style={{ fontSize: 12 }}>Start review →</Link>
            )}
          </div>
          <div className="stats-strip" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="label"><span className="dot blue" />In Queue</div>
              <div className="value">{reviewQueue.length}</div>
              <div className="meta">total objections</div>
            </div>
            <div className="stat">
              <div className="label"><span className={`dot ${reviewQueue.filter(isDueForReview).length > 0 ? 'red' : 'green'}`} />Due Today</div>
              <div className="value">{reviewQueue.filter(isDueForReview).length}</div>
              <div className="meta">need review</div>
            </div>
            <div className="stat">
              <div className="label"><span className="dot amber" />Due This Week</div>
              <div className="value">{reviewQueue.filter((r) => {
                const d = new Date(r.next_review)
                const weekEnd = new Date()
                weekEnd.setDate(weekEnd.getDate() + 7)
                return d <= weekEnd
              }).length}</div>
              <div className="meta">next 7 days</div>
            </div>
            <div className="stat">
              <div className="label"><span className="dot green" />Avg Ease</div>
              <div className="value">{(reviewQueue.reduce((a, r) => a + (r.ease_factor || 2.5), 0) / reviewQueue.length).toFixed(1)}</div>
              <div className="meta">{(reviewQueue.reduce((a, r) => a + (r.ease_factor || 2.5), 0) / reviewQueue.length) >= 2.0 ? 'good mastery' : 'needs work'}</div>
            </div>
          </div>
          <div className="label-cap" style={{ marginBottom: 8 }}>Upcoming Reviews</div>
          <div className="sr-upcoming">
            {reviewQueue.sort((a, b) => new Date(a.next_review) - new Date(b.next_review)).slice(0, 5).map((r) => {
              const obj = reviewObjections[r.objection_id]
              const due = isDueForReview(r)
              return (
                <div key={r.id} className={`sr-upcoming-row ${due ? 'due' : ''}`}>
                  <div className="sr-upcoming-text">{obj?.text ? `"${obj.text.slice(0, 70)}${obj.text.length > 70 ? '…' : ''}"` : r.objection_id}</div>
                  <div className="sr-upcoming-meta">
                    <span className={`badge ${due ? 'danger' : 'info'}`}>{due ? 'Due now' : new Date(r.next_review).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span className="badge">Ease {r.ease_factor}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      <motion.div className="card" style={{ marginTop: 18 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25 }}>
        <h2>Achievements</h2>
        <div className="achievements-grid">
          {ACHIEVEMENTS.map((a) => {
            const got = earned.has(a.key)
            return (
              <div key={a.key} className={`achievement-card ${got ? 'earned' : 'locked'}`}>
                <a.Icon size={22} weight="regular" className="ach-icon" />
                <div className="ach-name">{a.name}</div>
                <div className="ach-desc">{a.desc}</div>
              </div>
            )
          })}
        </div>
      </motion.div>

      <motion.div className="card" style={{ marginTop: 18 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}>
        <h2>Weakness Breakdown</h2>
        {sortedMastery.length === 0 ? (
          <p>Run more drills to map your weak spots.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Mastery</th>
                  <th>Reps</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedMastery.map((r) => (
                  <tr key={r.key}>
                    <td><strong>{r.key}</strong></td>
                    <td>
                      <span className={`badge ${r.pct >= 85 ? 'success' : r.pct >= 60 ? 'warn' : 'danger'}`}>
                        {r.pct}%
                      </span>
                    </td>
                    <td className="text-mono">{r.count}</td>
                    <td>
                      <Link to={`/practice/session?stage=intro_soa&type=multiple_choice&difficulty=2&category=${encodeURIComponent(r.key)}`}>
                        <button>Drill <ArrowRight size={13} weight="regular" /></button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <motion.div className="card" style={{ marginTop: 18 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.35 }}>
        <h2>Recent Sessions</h2>
        {sessions.length === 0 ? (
          <p>No sessions yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Stage</th>
                  <th>Type</th>
                  <th>Diff</th>
                  <th>Score</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 15).map((s) => {
                  const pct = s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0
                  return (
                    <tr key={s.id}>
                      <td>{new Date(s.created).toLocaleDateString()}</td>
                      <td>{s.call_stage}</td>
                      <td>{s.session_type}</td>
                      <td className="text-mono">{s.difficulty_level}</td>
                      <td className="text-mono">{pct}%</td>
                      <td>
                        <span className={`badge ${s.passed ? 'success' : 'warn'}`}>
                          {s.passed ? 'Passed' : 'Try again'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {completions.length > 0 && (
        <motion.div className="card" style={{ marginTop: 18 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }}>
          <h2>Lesson History</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lesson</th>
                  <th>Score</th>
                  <th>Attempts</th>
                  <th>Result</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {completions.map((c) => (
                  <tr key={c.id}>
                    <td>{lessonMap[c.lesson_id]?.title || c.lesson_id}</td>
                    <td className="text-mono">{c.quiz_score}%</td>
                    <td className="text-mono">{c.attempts}</td>
                    <td>
                      <span className={`badge ${c.passed ? 'success' : 'warn'}`}>{c.passed ? 'Passed' : 'Retry'}</span>
                    </td>
                    <td>{c.completed_at ? new Date(c.completed_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  )
}
