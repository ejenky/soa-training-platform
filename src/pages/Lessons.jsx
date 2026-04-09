import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Lock, Check, ArrowRight } from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'

export default function Lessons() {
  const { user } = useAuth()
  const [lessons, setLessons] = useState([])
  const [completions, setCompletions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [ls, cs] = await Promise.all([
          pb.collection('lessons').getFullList({ filter: 'active = true', sort: 'week_number,order_index' }),
          pb.collection('lesson_completions').getFullList({ filter: `agent_id = "${user.id}"` }),
        ])
        if (cancelled) return
        setLessons(ls)
        setCompletions(cs)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (user?.id) load()
    return () => { cancelled = true }
  }, [user?.id])

  if (loading) return <div className="page"><div className="loader">Loading lessons…</div></div>

  const passedIds = new Set(completions.filter((c) => c.passed).map((c) => c.lesson_id))
  let foundUnpassed = false
  const lockMap = {}
  let currentId = null
  lessons.forEach((l) => {
    if (foundUnpassed) {
      lockMap[l.id] = true
    } else {
      lockMap[l.id] = false
      if (!passedIds.has(l.id)) {
        if (!currentId) currentId = l.id
        foundUnpassed = true
      }
    }
  })

  return (
    <div className="page">
      <div className="page-header">
        <h1>Lessons</h1>
        <p className="lede">Each lesson unlocks after you pass the previous at 85%+.</p>
      </div>

      {lessons.length === 0 && (
        <div className="card empty">No lessons yet. Check back soon.</div>
      )}

      <div className="lesson-list">
        {lessons.map((l, i) => {
          const passed = passedIds.has(l.id)
          const locked = lockMap[l.id]
          const isCurrent = l.id === currentId
          const completion = completions.find((c) => c.lesson_id === l.id)
          const cls = `lesson-row ${passed ? 'completed' : ''} ${locked ? 'locked' : ''}`
          return (
            <motion.div
              key={l.id}
              className={cls}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="num">
                {locked ? (
                  <Lock size={16} weight="regular" />
                ) : passed ? (
                  <Check size={18} weight="regular" />
                ) : (
                  String(l.order_index || i + 1).padStart(2, '0')
                )}
              </div>
              <div>
                <div className="title">{l.title}</div>
                <div className="meta">
                  <span>Week {l.week_number || 1}</span>
                  <span>·</span>
                  <span>{l.est_minutes || 15} min</span>
                  {completion && (
                    <>
                      <span>·</span>
                      <span>{completion.quiz_score || 0}%</span>
                    </>
                  )}
                </div>
              </div>
              {locked ? (
                <button disabled>
                  <Lock size={13} weight="regular" /> Locked
                </button>
              ) : (
                <Link to={`/lessons/${l.id}`}>
                  <button className={isCurrent || !passed ? 'primary' : ''}>
                    {passed ? 'Review' : isCurrent ? 'Continue' : 'Start'}
                    <ArrowRight size={13} weight="regular" />
                  </button>
                </Link>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
