import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'

export default function Supervisor() {
  const { user } = useAuth()
  const [agents, setAgents] = useState([])
  const [completions, setCompletions] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const ag = await pb.collection('users').getFullList({
          filter: `role = "agent" && supervisor_id = "${user.id}"`,
          sort: 'name',
        })
        const ids = ag.map((a) => `agent_id = "${a.id}"`).join(' || ')
        let cs = []
        let ps = []
        if (ids) {
          ;[cs, ps] = await Promise.all([
            pb.collection('lesson_completions').getFullList({ filter: ids }).catch(() => []),
            pb.collection('practice_sessions').getFullList({ filter: ids }).catch(() => []),
          ])
        }
        if (cancelled) return
        setAgents(ag)
        setCompletions(cs)
        setSessions(ps)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (user?.id) load()
    return () => { cancelled = true }
  }, [user?.id])

  if (loading) return <div className="page"><div className="loader">Loading team…</div></div>

  function metricsFor(agentId) {
    const cs = completions.filter((c) => c.agent_id === agentId)
    const ps = sessions.filter((s) => s.agent_id === agentId)
    const quizAvg = cs.length > 0 ? Math.round(cs.reduce((a, c) => a + (c.quiz_score || 0), 0) / cs.length) : 0
    const gpa = ps.length > 0
      ? (ps.reduce((a, s) => a + ((s.total_score || 0) / (s.max_score || 1)) * 4, 0) / ps.length).toFixed(1)
      : '0.0'
    const flagged = quizAvg < 70 || parseFloat(gpa) < 2.0
    const certified = quizAvg >= 85 && parseFloat(gpa) >= 3.0
    const lastSession = ps[0]
    return {
      quizAvg,
      gpa,
      flagged,
      certified,
      lessonCount: cs.filter((c) => c.passed).length,
      sessionCount: ps.length,
      lastActive: lastSession ? new Date(lastSession.created).toLocaleDateString() : '—',
    }
  }

  const teamSize = agents.length
  const flaggedCount = agents.filter((a) => metricsFor(a.id).flagged).length
  const certifiedCount = agents.filter((a) => metricsFor(a.id).certified).length

  return (
    <div className="page">
      <div className="page-header">
        <h1>Team</h1>
        <p className="lede">Monitor your agents' lesson and practice performance.</p>
      </div>

      <div className="stats-strip cols-3">
        <div className="stat">
          <div className="label"><span className="dot blue" />Agents</div>
          <div className="value">{teamSize}</div>
          <div className="meta">managed</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot green" />Certified</div>
          <div className="value">{certifiedCount}</div>
          <div className="meta">quiz 85%+, GPA 3.0+</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot red" />Flagged</div>
          <div className="value">{flaggedCount}</div>
          <div className="meta">quiz &lt;70 or GPA &lt;2.0</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Agents</h2>
        {agents.length === 0 ? (
          <p>No agents assigned to you yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Quiz avg</th>
                  <th>GPA</th>
                  <th>Lessons</th>
                  <th>Sessions</th>
                  <th>Last active</th>
                  <th>Cert</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => {
                  const m = metricsFor(a.id)
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name || a.email}</strong>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.email}</div>
                      </td>
                      <td>
                        <span className={`badge ${a.status === 'active' ? 'success' : ''}`}>
                          {a.status || 'active'}
                        </span>
                      </td>
                      <td className="text-mono">{m.quizAvg}%</td>
                      <td className="text-mono">{m.gpa}</td>
                      <td className="text-mono">{m.lessonCount}</td>
                      <td className="text-mono">{m.sessionCount}</td>
                      <td className="text-mono">{m.lastActive}</td>
                      <td>
                        {m.certified ? (
                          <span className="badge success">Certified</span>
                        ) : m.flagged ? (
                          <span className="badge danger">Flagged</span>
                        ) : (
                          <span className="badge warn">In progress</span>
                        )}
                      </td>
                      <td>
                        <Link to={`/supervisor/agent/${a.id}`}><button>View</button></Link>
                      </td>
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
