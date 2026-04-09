import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pb } from '../lib/pb'

export default function SupervisorAgent() {
  const { id } = useParams()
  const [agent, setAgent] = useState(null)
  const [completions, setCompletions] = useState([])
  const [sessions, setSessions] = useState([])
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [a, cs, ps, ls] = await Promise.all([
          pb.collection('users').getOne(id),
          pb.collection('lesson_completions').getFullList({ filter: `agent_id = "${id}"`, sort: '-completed_at' }),
          pb.collection('practice_sessions').getFullList({ filter: `agent_id = "${id}"`, sort: '-created' }),
          pb.collection('lessons').getFullList({ filter: 'active = true' }),
        ])
        if (cancelled) return
        setAgent(a)
        setCompletions(cs)
        setSessions(ps)
        setLessons(ls)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  if (loading) return <div className="page"><div className="loader">Loading agent…</div></div>
  if (!agent) return <div className="page"><div className="card empty">Agent not found.</div></div>

  const lessonMap = Object.fromEntries(lessons.map((l) => [l.id, l]))
  const quizAvg = completions.length > 0
    ? Math.round(completions.reduce((a, c) => a + (c.quiz_score || 0), 0) / completions.length)
    : 0
  const gpa = sessions.length > 0
    ? (sessions.reduce((a, s) => a + ((s.total_score || 0) / (s.max_score || 1)) * 4, 0) / sessions.length).toFixed(1)
    : '0.0'
  const certified = quizAvg >= 85 && parseFloat(gpa) >= 3.0

  return (
    <div className="page">
      <div className="page-header">
        <div className="breadcrumb">
          <Link to="/supervisor">Team</Link>
          <span>›</span>
          <span>{agent.name || agent.email}</span>
        </div>
        <h1>{agent.name || agent.email}</h1>
        <p className="lede">
          {agent.email} ·{' '}
          <span className={`badge ${certified ? 'success' : 'warn'}`}>
            {certified ? 'Certified' : 'In progress'}
          </span>
        </p>
      </div>

      <div className="stats-strip">
        <div className="stat">
          <div className="label"><span className="dot blue" />Quiz Avg</div>
          <div className="value">{quizAvg}%</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />Practice GPA</div>
          <div className="value">{gpa}</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />Lessons Passed</div>
          <div className="value">{completions.filter((c) => c.passed).length}/{lessons.length}</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot amber" />Sessions</div>
          <div className="value">{sessions.length}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Lesson History</h2>
        {completions.length === 0 ? (
          <p>No lessons attempted.</p>
        ) : (
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
                    <td><span className={`badge ${c.passed ? 'success' : 'warn'}`}>{c.passed ? 'Passed' : 'Retry'}</span></td>
                    <td>{c.completed_at ? new Date(c.completed_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Practice Sessions</h2>
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
                {sessions.map((s) => {
                  const pct = s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0
                  return (
                    <tr key={s.id}>
                      <td>{new Date(s.created).toLocaleDateString()}</td>
                      <td>{s.call_stage}</td>
                      <td>{s.session_type}</td>
                      <td className="text-mono">{s.difficulty_level}</td>
                      <td className="text-mono">{pct}%</td>
                      <td><span className={`badge ${s.passed ? 'success' : 'warn'}`}>{s.passed ? 'Passed' : 'Retry'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
