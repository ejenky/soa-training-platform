import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Plus, PencilSimple, Trash, MagnifyingGlass, X, Check,
} from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { CATEGORIES } from '../lib/gamification'

const TABS = ['Lessons', 'Objections', 'Quiz Questions']
const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze']
const CALL_STAGES = [
  { value: 'intro_soa', label: 'Intro / SOA' },
  { value: 'qualifying', label: 'Qualifying' },
  { value: 'presenting', label: 'Presenting' },
  { value: 'closing', label: 'Closing' },
]

function Modal({ title, open, onClose, children }) {
  if (!open) return null
  return (
    <AnimatePresence>
      <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div
          className="modal-card modal-lg"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>{title}</h2>
            <button className="modal-close" onClick={onClose}><X size={16} /></button>
          </div>
          <div className="modal-body">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function ConfirmDialog({ open, message, onConfirm, onCancel, loading }) {
  if (!open) return null
  return (
    <AnimatePresence>
      <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}>
        <motion.div
          className="modal-card modal-sm"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header"><h2>Confirm</h2><button className="modal-close" onClick={onCancel}><X size={16} /></button></div>
          <div className="modal-body">
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>{message}</p>
            <div className="modal-actions">
              <button onClick={onCancel}>Cancel</button>
              <button className="outline-red" onClick={onConfirm} disabled={loading}>{loading ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default function ContentManager() {
  const { user } = useAuth()
  const [tab, setTab] = useState(0)
  const [lessons, setLessons] = useState([])
  const [objections, setObjections] = useState([])
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [editItem, setEditItem] = useState(null) // null = closed, {} = new, {id,...} = edit
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Objection filters
  const [objSearch, setObjSearch] = useState('')
  const [objCatFilter, setObjCatFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [ls, os, qs] = await Promise.all([
          pb.collection('lessons').getFullList({ sort: 'week_number,order_index' }),
          pb.collection('objections').getFullList({ sort: '-created' }),
          pb.collection('quiz_questions').getFullList({ sort: '-created' }),
        ])
        if (cancelled) return
        setLessons(ls)
        setObjections(os)
        setQuizzes(qs)
      } catch (e) { console.error(e) }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── CRUD helpers ──
  async function saveLesson(data) {
    setSaving(true)
    try {
      if (data.id) {
        const updated = await pb.collection('lessons').update(data.id, data)
        setLessons((prev) => prev.map((l) => l.id === data.id ? updated : l))
      } else {
        const created = await pb.collection('lessons').create(data)
        setLessons((prev) => [...prev, created])
      }
      setEditItem(null)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  async function saveObjection(data) {
    setSaving(true)
    try {
      if (data.id) {
        const updated = await pb.collection('objections').update(data.id, data)
        setObjections((prev) => prev.map((o) => o.id === data.id ? updated : o))
      } else {
        const created = await pb.collection('objections').create(data)
        setObjections((prev) => [created, ...prev])
      }
      setEditItem(null)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  async function saveQuiz(data) {
    setSaving(true)
    try {
      const payload = { ...data, options: JSON.stringify(data.options || []) }
      if (data.id) {
        const updated = await pb.collection('quiz_questions').update(data.id, payload)
        setQuizzes((prev) => prev.map((q) => q.id === data.id ? updated : q))
      } else {
        const created = await pb.collection('quiz_questions').create(payload)
        setQuizzes((prev) => [created, ...prev])
      }
      setEditItem(null)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const coll = tab === 0 ? 'lessons' : tab === 1 ? 'objections' : 'quiz_questions'
      await pb.collection(coll).delete(deleteTarget.id)
      if (tab === 0) setLessons((prev) => prev.filter((l) => l.id !== deleteTarget.id))
      else if (tab === 1) setObjections((prev) => prev.filter((o) => o.id !== deleteTarget.id))
      else setQuizzes((prev) => prev.filter((q) => q.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e) { console.error(e) }
    finally { setDeleting(false) }
  }

  const filteredObjections = objections.filter((o) => {
    if (objCatFilter !== 'all' && o.category !== objCatFilter) return false
    if (objSearch.trim() && !o.text?.toLowerCase().includes(objSearch.toLowerCase())) return false
    return true
  })

  if (loading) return <div className="page"><div className="loader">Loading content…</div></div>

  return (
    <div className="page cm-page">
      <div className="page-header">
        <h1>Content Manager</h1>
        <p className="lede">Manage training lessons, objections, and quiz questions.</p>
      </div>

      {/* Tabs */}
      <div className="cm-tabs">
        {TABS.map((t, i) => (
          <button key={t} className={`cm-tab ${tab === i ? 'active' : ''}`} onClick={() => { setTab(i); setEditItem(null) }}>
            {t}
            <span className="cm-tab-count">{i === 0 ? lessons.length : i === 1 ? objections.length : quizzes.length}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="cm-toolbar">
        {tab === 1 && (
          <>
            <div className="sv-search" style={{ maxWidth: 220 }}>
              <MagnifyingGlass size={14} weight="regular" className="sv-search-icon" />
              <input type="text" placeholder="Search objections…" value={objSearch} onChange={(e) => setObjSearch(e.target.value)} />
            </div>
            <select value={objCatFilter} onChange={(e) => setObjCatFilter(e.target.value)} style={{ width: 'auto', minWidth: 140, padding: '0.5rem 0.7rem', fontSize: 13 }}>
              <option value="all">All Categories</option>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
            </select>
          </>
        )}
        <button className="sv-add-btn" style={{ marginLeft: 'auto' }} onClick={() => setEditItem({})}>
          <Plus size={14} weight="bold" /> Add {TABS[tab].replace(/s$/, '')}
        </button>
      </div>

      {/* ── LESSONS TAB ── */}
      {tab === 0 && (
        <div className="card cm-list-card">
          {lessons.length === 0 ? <div className="empty-state"><p>No lessons yet.</p></div> : (
            <div className="cm-list">
              {lessons.map((l) => (
                <div key={l.id} className="cm-row">
                  <div className="cm-row-main">
                    <div className="cm-row-title">{l.title}</div>
                    <div className="cm-row-meta">Week {l.week_number} · Order {l.order_index} · {l.bloom_level} · {l.active ? 'Active' : 'Inactive'}</div>
                  </div>
                  <div className="cm-row-actions">
                    <button className="cm-icon-btn" title="Edit" onClick={() => setEditItem(l)}><PencilSimple size={14} /></button>
                    <button className="cm-icon-btn danger" title="Delete" onClick={() => setDeleteTarget(l)}><Trash size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── OBJECTIONS TAB ── */}
      {tab === 1 && (
        <div className="card cm-list-card">
          {filteredObjections.length === 0 ? <div className="empty-state"><p>No objections match.</p></div> : (
            <div className="cm-list">
              {filteredObjections.map((o) => (
                <div key={o.id} className="cm-row">
                  <div className="cm-row-main">
                    <div className="cm-row-title">"{o.text?.slice(0, 80)}{o.text?.length > 80 ? '…' : ''}"</div>
                    <div className="cm-row-meta">
                      <span className="badge">{o.category}</span>
                      <span className="badge">Diff {o.difficulty}</span>
                      <span className="badge">{o.call_stage}</span>
                      {!o.active && <span className="badge danger">Inactive</span>}
                    </div>
                  </div>
                  <div className="cm-row-actions">
                    <button className="cm-icon-btn" title="Edit" onClick={() => setEditItem(o)}><PencilSimple size={14} /></button>
                    <button className="cm-icon-btn danger" title="Delete" onClick={() => setDeleteTarget(o)}><Trash size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── QUIZ QUESTIONS TAB ── */}
      {tab === 2 && (
        <div className="card cm-list-card">
          {quizzes.length === 0 ? <div className="empty-state"><p>No quiz questions yet.</p></div> : (
            <div className="cm-list">
              {quizzes.map((q) => {
                let opts = q.options
                if (typeof opts === 'string') try { opts = JSON.parse(opts) } catch { opts = [] }
                return (
                  <div key={q.id} className="cm-row">
                    <div className="cm-row-main">
                      <div className="cm-row-title">{q.question_text?.slice(0, 90)}{q.question_text?.length > 90 ? '…' : ''}</div>
                      <div className="cm-row-meta">
                        <span className="badge">Diff {q.difficulty}</span>
                        {q.lesson_id && <span className="badge info">Lesson linked</span>}
                        {q.objection_id && <span className="badge info">Objection linked</span>}
                        <span className="badge success">Correct: {String.fromCharCode(65 + (q.correct_index || 0))}</span>
                      </div>
                    </div>
                    <div className="cm-row-actions">
                      <button className="cm-icon-btn" title="Edit" onClick={() => setEditItem({ ...q, options: opts })}><PencilSimple size={14} /></button>
                      <button className="cm-icon-btn danger" title="Delete" onClick={() => setDeleteTarget(q)}><Trash size={14} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── LESSON MODAL ── */}
      {tab === 0 && editItem !== null && (
        <Modal title={editItem.id ? 'Edit Lesson' : 'Add Lesson'} open onClose={() => setEditItem(null)}>
          <LessonForm initial={editItem} saving={saving} onSave={saveLesson} onCancel={() => setEditItem(null)} />
        </Modal>
      )}

      {/* ── OBJECTION MODAL ── */}
      {tab === 1 && editItem !== null && (
        <Modal title={editItem.id ? 'Edit Objection' : 'Add Objection'} open onClose={() => setEditItem(null)}>
          <ObjectionForm initial={editItem} saving={saving} onSave={saveObjection} onCancel={() => setEditItem(null)} />
        </Modal>
      )}

      {/* ── QUIZ MODAL ── */}
      {tab === 2 && editItem !== null && (
        <Modal title={editItem.id ? 'Edit Quiz Question' : 'Add Quiz Question'} open onClose={() => setEditItem(null)}>
          <QuizForm initial={editItem} saving={saving} onSave={saveQuiz} onCancel={() => setEditItem(null)} lessons={lessons} objections={objections} />
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        message={`Delete this ${TABS[tab].replace(/s$/, '').toLowerCase()}? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}

// ── Form Components ──

function LessonForm({ initial, saving, onSave, onCancel }) {
  const [f, setF] = useState({
    title: initial.title || '',
    week_number: initial.week_number || 1,
    order_index: initial.order_index || 0,
    bloom_level: initial.bloom_level || 'remember',
    content_text: initial.content_text || '',
    content_url: initial.content_url || '',
    est_minutes: initial.est_minutes || 10,
    active: initial.active ?? true,
    ...(initial.id ? { id: initial.id } : {}),
  })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f) }}>
      <div className="field"><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></div>
      <div className="form-grid">
        <div className="field"><label>Week</label><input type="number" min={1} value={f.week_number} onChange={(e) => setF({ ...f, week_number: +e.target.value })} /></div>
        <div className="field"><label>Order</label><input type="number" min={0} value={f.order_index} onChange={(e) => setF({ ...f, order_index: +e.target.value })} /></div>
        <div className="field"><label>Est. Minutes</label><input type="number" min={1} value={f.est_minutes} onChange={(e) => setF({ ...f, est_minutes: +e.target.value })} /></div>
        <div className="field">
          <label>Bloom Level</label>
          <select value={f.bloom_level} onChange={(e) => setF({ ...f, bloom_level: e.target.value })}>
            {BLOOM_LEVELS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Content URL</label><input value={f.content_url} onChange={(e) => setF({ ...f, content_url: e.target.value })} placeholder="https://…" /></div>
      <div className="field"><label>Content Text</label><textarea rows={4} value={f.content_text} onChange={(e) => setF({ ...f, content_text: e.target.value })} /></div>
      <label className="cm-toggle-label"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

function ObjectionForm({ initial, saving, onSave, onCancel }) {
  const [f, setF] = useState({
    text: initial.text || '',
    category: initial.category || CATEGORIES[0].key,
    difficulty: initial.difficulty || 1,
    call_stage: initial.call_stage || 'intro_soa',
    source: initial.source || 'written',
    active: initial.active ?? true,
    ...(initial.id ? { id: initial.id } : {}),
  })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f) }}>
      <div className="field"><label>Objection Text</label><textarea rows={3} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} required /></div>
      <div className="form-grid">
        <div className="field">
          <label>Category</label>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Difficulty</label>
          <select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: +e.target.value })}>
            {[1,2,3,4].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Call Stage</label>
          <select value={f.call_stage} onChange={(e) => setF({ ...f, call_stage: e.target.value })}>
            {CALL_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Source</label>
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            <option value="field">Field</option>
            <option value="written">Written</option>
            <option value="generated">Generated</option>
          </select>
        </div>
      </div>
      <label className="cm-toggle-label"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

function QuizForm({ initial, saving, onSave, onCancel, lessons, objections }) {
  const [f, setF] = useState({
    question_text: initial.question_text || '',
    options: initial.options || ['', '', '', ''],
    correct_index: initial.correct_index || 0,
    difficulty: initial.difficulty || 1,
    explanation: initial.explanation || '',
    lesson_id: initial.lesson_id || '',
    objection_id: initial.objection_id || '',
    ...(initial.id ? { id: initial.id } : {}),
  })

  function setOption(i, val) {
    const opts = [...f.options]
    opts[i] = val
    setF({ ...f, options: opts })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f) }}>
      <div className="field"><label>Question Text</label><textarea rows={2} value={f.question_text} onChange={(e) => setF({ ...f, question_text: e.target.value })} required /></div>
      <div className="field">
        <label>Options (select correct answer)</label>
        {f.options.map((opt, i) => (
          <div key={i} className="cm-option-row">
            <button type="button" className={`cm-correct-btn ${f.correct_index === i ? 'active' : ''}`} onClick={() => setF({ ...f, correct_index: i })} title="Mark as correct">
              {f.correct_index === i ? <Check size={12} weight="bold" /> : String.fromCharCode(65 + i)}
            </button>
            <input value={opt} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`} required />
          </div>
        ))}
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Difficulty</label>
          <select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: +e.target.value })}>
            {[1,2,3,4].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Linked Lesson</label>
          <select value={f.lesson_id} onChange={(e) => setF({ ...f, lesson_id: e.target.value })}>
            <option value="">None</option>
            {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Linked Objection</label>
          <select value={f.objection_id} onChange={(e) => setF({ ...f, objection_id: e.target.value })}>
            <option value="">None</option>
            {objections.slice(0, 50).map((o) => <option key={o.id} value={o.id}>{o.text?.slice(0, 50)}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Explanation</label><textarea rows={2} value={f.explanation} onChange={(e) => setF({ ...f, explanation: e.target.value })} placeholder="Why this is the correct answer…" /></div>
      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}
