import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import Papa from 'papaparse'
import {
  Plus, PencilSimple, Trash, MagnifyingGlass, X, Check,
  ArrowUp, ArrowDown, ListBullets, ArrowLeft, UploadSimple, DownloadSimple,
} from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { CATEGORIES } from '../lib/gamification'

const TABS = ['Lessons', 'Objections', 'Quiz Questions', 'Roleplays']
const BLOOM_LEVELS = [
  { value: 'remember', label: 'Knowledge — learn the facts' },
  { value: 'understand', label: 'Comprehension — understand why' },
  { value: 'apply', label: 'Application — use in practice' },
  { value: 'analyze', label: 'Mastery — handle complex situations' },
]
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
      <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <motion.div
          className="modal-card modal-lg"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
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
      <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
        <motion.div
          className="modal-card modal-sm"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
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
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [editItem, setEditItem] = useState(null) // null = closed, {} = new, {id,...} = edit
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Scenario line editor
  const [lineEditorId, setLineEditorId] = useState(null)
  const [scenarioLines, setScenarioLines] = useState([])
  const [editLine, setEditLine] = useState(null)
  const [lineSaving, setLineSaving] = useState(false)
  const [lineCounts, setLineCounts] = useState({})

  // Objection filters
  const [objSearch, setObjSearch] = useState('')
  const [objCatFilter, setObjCatFilter] = useState('all')

  // CSV Import
  const [showImport, setShowImport] = useState(false)
  const [csvRows, setCsvRows] = useState([])
  const [csvErrors, setCsvErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [importResult, setImportResult] = useState(null)
  const csvInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [ls, os, qs, scs] = await Promise.all([
          pb.collection('lessons').getFullList({ sort: 'week_number,order_index' }).catch(() => []),
          pb.collection('objections').getFullList({ sort: '-created' }).catch(() => []),
          pb.collection('quiz_questions').getFullList({ sort: '-created' }).catch(() => []),
          pb.collection('scenarios').getFullList({ sort: 'name' }).catch(() => []),
        ])
        // Fetch line counts per scenario
        let lc = {}
        if (scs.length > 0) {
          const allSl = await pb.collection('scenario_lines').getFullList({ sort: 'line_order' }).catch(() => [])
          for (const l of allSl) lc[l.scenario_id] = (lc[l.scenario_id] || 0) + 1
        }
        if (cancelled) return
        setLessons(ls)
        setObjections(os)
        setQuizzes(qs)
        setScenarios(scs)
        setLineCounts(lc)
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
      const coll = tab === 0 ? 'lessons' : tab === 1 ? 'objections' : tab === 2 ? 'quiz_questions' : 'scenarios'
      if (tab === 3) {
        // Delete all lines first
        const lines = await pb.collection('scenario_lines').getFullList({ filter: `scenario_id = "${deleteTarget.id}"` }).catch(() => [])
        for (const l of lines) await pb.collection('scenario_lines').delete(l.id).catch(() => {})
      }
      await pb.collection(coll).delete(deleteTarget.id)
      if (tab === 0) setLessons((prev) => prev.filter((l) => l.id !== deleteTarget.id))
      else if (tab === 1) setObjections((prev) => prev.filter((o) => o.id !== deleteTarget.id))
      else if (tab === 2) setQuizzes((prev) => prev.filter((q) => q.id !== deleteTarget.id))
      else setScenarios((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e) { console.error(e) }
    finally { setDeleting(false) }
  }

  async function saveScenario(data) {
    setSaving(true)
    try {
      if (data.id) {
        const updated = await pb.collection('scenarios').update(data.id, data)
        setScenarios((prev) => prev.map((s) => s.id === data.id ? updated : s))
      } else {
        const created = await pb.collection('scenarios').create(data)
        setScenarios((prev) => [...prev, created])
      }
      setEditItem(null)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  async function openLineEditor(scenarioId) {
    setLineEditorId(scenarioId)
    try {
      const lines = await pb.collection('scenario_lines').getFullList({
        filter: `scenario_id = "${scenarioId}"`,
        sort: 'line_order',
      })
      setScenarioLines(lines)
    } catch { setScenarioLines([]) }
  }

  async function saveScenarioLine(data) {
    setLineSaving(true)
    try {
      if (data.id) {
        const updated = await pb.collection('scenario_lines').update(data.id, data)
        setScenarioLines((prev) => prev.map((l) => l.id === data.id ? updated : l))
      } else {
        const created = await pb.collection('scenario_lines').create(data)
        setScenarioLines((prev) => [...prev, created].sort((a, b) => a.line_order - b.line_order))
        setLineCounts((prev) => ({ ...prev, [data.scenario_id]: (prev[data.scenario_id] || 0) + 1 }))
      }
      setEditLine(null)
    } catch (e) { console.error(e) }
    finally { setLineSaving(false) }
  }

  async function deleteScenarioLine(lineId) {
    try {
      const line = scenarioLines.find((l) => l.id === lineId)
      await pb.collection('scenario_lines').delete(lineId)
      setScenarioLines((prev) => prev.filter((l) => l.id !== lineId))
      if (line) setLineCounts((prev) => ({ ...prev, [line.scenario_id]: Math.max(0, (prev[line.scenario_id] || 1) - 1) }))
    } catch (e) { console.error(e) }
  }

  async function moveScenarioLine(lineId, direction) {
    const idx = scenarioLines.findIndex((l) => l.id === lineId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= scenarioLines.length) return
    const a = scenarioLines[idx]
    const b = scenarioLines[swapIdx]
    try {
      await Promise.all([
        pb.collection('scenario_lines').update(a.id, { line_order: b.line_order }),
        pb.collection('scenario_lines').update(b.id, { line_order: a.line_order }),
      ])
      const copy = [...scenarioLines]
      const tmpOrder = copy[idx].line_order
      copy[idx] = { ...copy[idx], line_order: copy[swapIdx].line_order }
      copy[swapIdx] = { ...copy[swapIdx], line_order: tmpOrder }
      setScenarioLines(copy.sort((x, y) => x.line_order - y.line_order))
    } catch (e) { console.error(e) }
  }

  const filteredObjections = objections.filter((o) => {
    if (objCatFilter !== 'all' && o.category !== objCatFilter) return false
    if (objSearch.trim() && !o.text?.toLowerCase().includes(objSearch.toLowerCase())) return false
    return true
  })

  // ── CSV Import ──
  const VALID_CATEGORIES = CATEGORIES.map((c) => c.key)
  const VALID_STAGES = CALL_STAGES.map((s) => s.value)
  const VALID_SOURCES = ['field', 'written', 'generated']

  function handleCsvFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const rows = []
        const errors = []
        results.data.forEach((row, i) => {
          const r = {
            text: (row.text || '').trim(),
            category: (row.category || '').trim(),
            difficulty: parseInt(row.difficulty, 10) || 1,
            call_stage: (row.call_stage || '').trim(),
            source: (row.source || 'written').trim(),
          }
          const rowErrors = []
          if (!r.text) rowErrors.push('text is required')
          if (!VALID_CATEGORIES.includes(r.category)) rowErrors.push(`invalid category "${r.category}"`)
          if (r.difficulty < 1 || r.difficulty > 4) rowErrors.push('difficulty must be 1-4')
          if (!VALID_STAGES.includes(r.call_stage)) rowErrors.push(`invalid call_stage "${r.call_stage}"`)
          if (!VALID_SOURCES.includes(r.source)) rowErrors.push(`invalid source "${r.source}"`)
          rows.push({ ...r, _row: i + 2, _errors: rowErrors })
          if (rowErrors.length > 0) errors.push({ row: i + 2, errors: rowErrors })
        })
        setCsvRows(rows)
        setCsvErrors(errors)
        setImportResult(null)
      },
    })
  }

  function downloadCsvTemplate() {
    const csv = `text,category,difficulty,call_stage,source\n"I was told I'd get a free food card just for calling",Intro/SOA,2,intro_soa,written\n"I don't need Medicare, I already have insurance",No Value,3,intro_soa,field`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'objections-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleCsvImport() {
    const valid = csvRows.filter((r) => r._errors.length === 0)
    if (valid.length === 0) return
    setImporting(true)
    setImportProgress({ current: 0, total: valid.length })
    const successes = []
    const failures = []
    for (let i = 0; i < valid.length; i++) {
      setImportProgress({ current: i + 1, total: valid.length })
      try {
        const { _row, _errors, ...data } = valid[i]
        const created = await pb.collection('objections').create({ ...data, active: true })
        successes.push(created)
      } catch (e) {
        failures.push({ row: valid[i]._row, error: e?.message || 'Failed to create' })
      }
    }
    setObjections((prev) => [...successes, ...prev])
    setImportResult({ success: successes.length, failed: failures.length, failures })
    setImporting(false)
  }

  function closeImportModal() {
    setShowImport(false)
    setCsvRows([])
    setCsvErrors([])
    setImportResult(null)
    setImporting(false)
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  if (loading) return <div className="page"><div className="loader">Loading content…</div></div>

  return (
    <div className="page cm-page">
      <div className="page-header">
        <h1>Content Manager</h1>
        <p className="lede">Manage training lessons, objections, quiz questions, and roleplays.</p>
      </div>

      {/* Tabs */}
      <div className="cm-tabs">
        {TABS.map((t, i) => (
          <button key={t} className={`cm-tab ${tab === i ? 'active' : ''}`} onClick={() => { setTab(i); setEditItem(null); setLineEditorId(null) }}>
            {t}
            <span className="cm-tab-count">{i === 0 ? lessons.length : i === 1 ? objections.length : i === 2 ? quizzes.length : scenarios.length}</span>
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
        {tab === 3 && lineEditorId ? (
          <button style={{ marginLeft: 'auto' }} onClick={() => setLineEditorId(null)}>
            <ArrowLeft size={14} /> Back to Scenarios
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            {tab === 1 && (
              <button className="sv-add-btn" style={{ background: 'transparent', borderColor: 'var(--border-subtle)' }} onClick={() => setShowImport(true)}>
                <UploadSimple size={14} weight="bold" /> Import CSV
              </button>
            )}
            <button className="sv-add-btn" onClick={() => setEditItem({})}>
              <Plus size={14} weight="bold" /> Add {tab === 3 ? 'Roleplay' : TABS[tab].replace(/s$/, '')}
            </button>
          </div>
        )}
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
                    <div className="cm-row-meta">Week {l.week_number} · Order {l.order_index} · {BLOOM_LEVELS.find((b) => b.value === l.bloom_level)?.label?.split(' — ')[0] || l.bloom_level} · {l.active ? 'Active' : 'Inactive'}</div>
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
          <LessonForm
            initial={editItem}
            saving={saving}
            onSave={saveLesson}
            onCancel={() => setEditItem(null)}
            quizzes={quizzes}
            onGoToQuizTab={(lessonId) => { setEditItem(null); setTab(2) }}
          />
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

      {/* ── SCENARIOS TAB ── */}
      {tab === 3 && !lineEditorId && (
        <div className="card cm-list-card">
          {scenarios.length === 0 ? <div className="empty-state"><p>No roleplays yet.</p></div> : (
            <div className="cm-list">
              {scenarios.map((s) => (
                <div key={s.id} className="cm-row">
                  <div className="cm-row-main">
                    <div className="cm-row-title">{s.persona_name}{s.persona_age ? `, ${s.persona_age}` : ''} — {s.name}</div>
                    <div className="cm-row-meta">
                      <span className="badge">Diff {s.difficulty}</span>
                      {s.category && <span className="badge">{s.category}</span>}
                      <span className="badge">{s.call_stage}</span>
                      <span className="badge info">{lineCounts[s.id] || 0} lines</span>
                      {!s.active && <span className="badge danger">Inactive</span>}
                    </div>
                  </div>
                  <div className="cm-row-actions">
                    <button className="cm-icon-btn" title="Edit Lines" onClick={() => openLineEditor(s.id)}><ListBullets size={14} /></button>
                    <button className="cm-icon-btn" title="Edit" onClick={() => setEditItem(s)}><PencilSimple size={14} /></button>
                    <button className="cm-icon-btn danger" title="Delete" onClick={() => setDeleteTarget(s)}><Trash size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SCENARIO LINE EDITOR ── */}
      {tab === 3 && lineEditorId && (
        <div className="card cm-list-card">
          <div className="cm-line-editor-header">
            <h3>Lines for: {scenarios.find((s) => s.id === lineEditorId)?.name || 'Scenario'}</h3>
            <button className="sv-add-btn" onClick={() => setEditLine({ scenario_id: lineEditorId, line_order: scenarioLines.length + 1, speaker: 'client', text: '', branch: 'root', is_objection: false, triggers_response: false, response_type: '' })}>
              <Plus size={14} weight="bold" /> Add Line
            </button>
          </div>
          {scenarioLines.length === 0 ? <div className="empty-state"><p>No lines yet. Add the first line of dialogue.</p></div> : (
            <div className="cm-list">
              {scenarioLines.map((l, idx) => (
                <div key={l.id} className={`cm-row cm-line-row ${l.branch !== 'root' && l.branch ? 'cm-line-branch' : ''}`}>
                  <div className="cm-line-order">{l.line_order}</div>
                  <div className={`cm-line-speaker cm-speaker-${l.speaker}`}>{l.speaker === 'client' ? 'Client' : l.speaker === 'agent_script' ? 'Agent' : 'System'}</div>
                  <div className="cm-row-main">
                    <div className="cm-row-title">{l.text?.slice(0, 90)}{l.text?.length > 90 ? '…' : ''}</div>
                    <div className="cm-row-meta">
                      {l.branch && l.branch !== 'root' && <span className="badge warn">{l.branch} branch</span>}
                      {l.is_objection && <span className="badge danger">Objection</span>}
                      {l.triggers_response && <span className="badge info">Triggers response</span>}
                    </div>
                  </div>
                  <div className="cm-row-actions">
                    <button className="cm-icon-btn" title="Move up" onClick={() => moveScenarioLine(l.id, 'up')} disabled={idx === 0}><ArrowUp size={12} /></button>
                    <button className="cm-icon-btn" title="Move down" onClick={() => moveScenarioLine(l.id, 'down')} disabled={idx === scenarioLines.length - 1}><ArrowDown size={12} /></button>
                    <button className="cm-icon-btn" title="Edit" onClick={() => setEditLine(l)}><PencilSimple size={14} /></button>
                    <button className="cm-icon-btn danger" title="Delete" onClick={() => deleteScenarioLine(l.id)}><Trash size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SCENARIO MODAL ── */}
      {tab === 3 && editItem !== null && !lineEditorId && (
        <Modal title={editItem.id ? 'Edit Roleplay' : 'Add Roleplay'} open onClose={() => setEditItem(null)}>
          <ScenarioForm initial={editItem} saving={saving} onSave={saveScenario} onCancel={() => setEditItem(null)} />
        </Modal>
      )}

      {/* ── LINE EDIT MODAL ── */}
      {editLine !== null && (
        <Modal title={editLine.id ? 'Edit Line' : 'Add Line'} open onClose={() => setEditLine(null)}>
          <ScenarioLineForm initial={editLine} saving={lineSaving} onSave={saveScenarioLine} onCancel={() => setEditLine(null)} objections={objections} />
        </Modal>
      )}

      {/* ── CSV IMPORT MODAL ── */}
      <Modal title="Import Objections from CSV" open={showImport} onClose={closeImportModal}>
        {importResult ? (
          <div>
            <div className={`badge ${importResult.failed === 0 ? 'success' : 'warn'}`} style={{ fontSize: 14, padding: '8px 14px', marginBottom: 12 }}>
              Successfully imported {importResult.success} objection{importResult.success !== 1 ? 's' : ''}.
              {importResult.failed > 0 && ` ${importResult.failed} failed.`}
            </div>
            {importResult.failures.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--error)', marginBottom: 12 }}>
                {importResult.failures.map((f, i) => (
                  <div key={i}>Row {f.row}: {f.error}</div>
                ))}
              </div>
            )}
            <button className="primary" onClick={closeImportModal} style={{ width: '100%' }}>Done</button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.5 }}>
              CSV should have columns: <strong>text, category, difficulty, call_stage, source</strong>.<br />
              Category must be one of: Intro/SOA, RWB Card, SEP, No Value.<br />
              Difficulty: 1-4. Call stage: intro_soa, qualifying, presenting, closing.<br />
              Source: field, written, generated.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <label className="sv-add-btn" style={{ cursor: 'pointer', background: 'transparent', borderColor: 'var(--border-subtle)' }}>
                <UploadSimple size={14} /> Choose CSV File
                <input ref={csvInputRef} type="file" accept=".csv" onChange={handleCsvFile} style={{ display: 'none' }} />
              </label>
              <button style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }} onClick={downloadCsvTemplate}>
                <DownloadSimple size={14} /> Download Template
              </button>
            </div>

            {csvRows.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
                  {csvRows.length} row{csvRows.length !== 1 ? 's' : ''} parsed
                  {csvErrors.length > 0 && <span style={{ color: 'var(--error)' }}> ({csvErrors.length} with errors)</span>}
                </div>
                <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 14 }}>
                  <table style={{ fontSize: 11, width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>#</th>
                        <th>Text</th>
                        <th>Category</th>
                        <th>Diff</th>
                        <th>Stage</th>
                        <th>Source</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.map((r, i) => (
                        <tr key={i} style={r._errors.length > 0 ? { background: 'rgba(239,68,68,0.06)' } : {}}>
                          <td>{r._row}</td>
                          <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.text?.slice(0, 60)}</td>
                          <td>{r.category}</td>
                          <td>{r.difficulty}</td>
                          <td>{r.call_stage}</td>
                          <td>{r.source}</td>
                          <td>{r._errors.length > 0
                            ? <span className="badge danger" title={r._errors.join(', ')} style={{ fontSize: 10 }}>Error</span>
                            : <span className="badge success" style={{ fontSize: 10 }}>OK</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importing ? (
                  <div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: '10px 0' }}>
                    Importing {importProgress.current} of {importProgress.total}...
                  </div>
                ) : (
                  <button
                    className="primary"
                    style={{ width: '100%' }}
                    onClick={handleCsvImport}
                    disabled={csvRows.filter((r) => r._errors.length === 0).length === 0}
                  >
                    Import {csvRows.filter((r) => r._errors.length === 0).length} Objection{csvRows.filter((r) => r._errors.length === 0).length !== 1 ? 's' : ''}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        message={tab === 3 ? 'Delete this roleplay and all its lines? This cannot be undone.' : `Delete this ${TABS[tab].replace(/s$/, '').toLowerCase()}? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}

// ── Form Components ──

function parseVideoEmbed(url) {
  if (!url) return null
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  return null
}

// Simple markdown-to-html: bold, italic, bullets
function LessonForm({ initial, saving, onSave, onCancel, quizzes = [], onGoToQuizTab }) {
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

  // Content type: derive from existing data
  const hasText = !!f.content_text.trim()
  const hasUrl = !!f.content_url.trim()
  const defaultType = hasText && hasUrl ? 'both' : hasUrl ? 'video' : 'text'
  const [contentType, setContentType] = useState(defaultType)

  const embedUrl = parseVideoEmbed(f.content_url)
  const linkedQuizzes = initial.id ? quizzes.filter((q) => q.lesson_id === initial.id) : []

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
            {BLOOM_LEVELS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
      </div>

      {/* Content Type Selector */}
      <div className="field">
        <label>Content Type</label>
        <div className="cm-content-toggle">
          {[{ key: 'text', label: 'Text' }, { key: 'video', label: 'Video URL' }, { key: 'both', label: 'Both' }].map((t) => (
            <button
              key={t.key}
              type="button"
              className={`cm-content-toggle-btn${contentType === t.key ? ' active' : ''}`}
              onClick={() => setContentType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Video URL */}
      {(contentType === 'video' || contentType === 'both') && (
        <div className="field">
          <label>Video URL</label>
          <input value={f.content_url} onChange={(e) => setF({ ...f, content_url: e.target.value })} placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..." />
          {embedUrl && (
            <div style={{ marginTop: 8, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
              <iframe src={embedUrl} width="100%" height="200" style={{ border: 'none', display: 'block' }} allowFullScreen title="Video preview" />
            </div>
          )}
        </div>
      )}

      {/* Content Text */}
      {(contentType === 'text' || contentType === 'both') && (
        <div className="field">
          <label>Content Text</label>
          <textarea
            rows={8}
            value={f.content_text}
            onChange={(e) => setF({ ...f, content_text: e.target.value })}
            placeholder="Type your lesson content here..."
            style={{ minHeight: 200 }}
          />
        </div>
      )}

      <label className="cm-toggle-label"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>

      {/* Attached Quiz Questions */}
      {initial.id && (
        <div style={{ marginTop: 16, padding: '12px 14px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              Quiz Questions <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({linkedQuizzes.length} linked)</span>
            </div>
            <button type="button" style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500 }} onClick={() => onGoToQuizTab?.(initial.id)}>
              Manage Quiz &rarr;
            </button>
          </div>
          {linkedQuizzes.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
              {linkedQuizzes.slice(0, 5).map((q) => (
                <div key={q.id} style={{ padding: '3px 0', borderTop: '1px solid var(--border-subtle)' }}>
                  {q.question_text?.slice(0, 60)}{q.question_text?.length > 60 ? '...' : ''}
                </div>
              ))}
              {linkedQuizzes.length > 5 && <div style={{ color: 'var(--text-muted)', paddingTop: 3 }}>+{linkedQuizzes.length - 5} more</div>}
            </div>
          )}
        </div>
      )}

      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
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

function ScenarioForm({ initial, saving, onSave, onCancel }) {
  const [f, setF] = useState({
    name: initial.name || '',
    persona_name: initial.persona_name || '',
    persona_age: initial.persona_age || 70,
    persona_description: initial.persona_description || '',
    difficulty: initial.difficulty || 2,
    call_stage: initial.call_stage || 'intro_soa',
    category: initial.category || CATEGORIES[0].key,
    estimated_minutes: initial.estimated_minutes || 5,
    active: initial.active ?? true,
    ...(initial.id ? { id: initial.id } : {}),
  })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f) }}>
      <div className="field"><label>Roleplay Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder='e.g. "Dorothy - Food Card Confusion"' required /></div>
      <div className="form-grid">
        <div className="field"><label>Persona Name</label><input value={f.persona_name} onChange={(e) => setF({ ...f, persona_name: e.target.value })} placeholder="Dorothy" required /></div>
        <div className="field"><label>Persona Age</label><input type="number" min={18} max={110} value={f.persona_age} onChange={(e) => setF({ ...f, persona_age: +e.target.value })} /></div>
        <div className="field"><label>Estimated Minutes</label><input type="number" min={1} value={f.estimated_minutes} onChange={(e) => setF({ ...f, estimated_minutes: +e.target.value })} /></div>
        <div className="field">
          <label>Difficulty</label>
          <select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: +e.target.value })}>
            {[1,2,3,4].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Persona Description</label><textarea rows={2} value={f.persona_description} onChange={(e) => setF({ ...f, persona_description: e.target.value })} placeholder="Sweet but confused about what she called for" /></div>
      <div className="form-grid">
        <div className="field">
          <label>Call Stage</label>
          <select value={f.call_stage} onChange={(e) => setF({ ...f, call_stage: e.target.value })}>
            {CALL_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Category</label>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
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

function ScenarioLineForm({ initial, saving, onSave, onCancel, objections }) {
  const [f, setF] = useState({
    scenario_id: initial.scenario_id || '',
    line_order: initial.line_order || 1,
    speaker: initial.speaker || 'client',
    text: initial.text || '',
    branch: initial.branch || 'root',
    parent_line_order: initial.parent_line_order || null,
    is_objection: initial.is_objection || false,
    objection_id: initial.objection_id || '',
    triggers_response: initial.triggers_response || false,
    response_type: initial.response_type || '',
    ...(initial.id ? { id: initial.id } : {}),
  })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f) }}>
      <div className="form-grid">
        <div className="field">
          <label>Speaker</label>
          <select value={f.speaker} onChange={(e) => setF({ ...f, speaker: e.target.value })}>
            <option value="client">Client</option>
            <option value="agent_script">Agent Script</option>
            <option value="system">System</option>
          </select>
        </div>
        <div className="field">
          <label>Line Order</label>
          <input type="number" min={1} value={f.line_order} onChange={(e) => setF({ ...f, line_order: +e.target.value })} />
        </div>
        <div className="field">
          <label>Branch</label>
          <select value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>
            <option value="root">Root (main flow)</option>
            <option value="good">Good (score 85%+)</option>
            <option value="mediocre">Mediocre (50-84%)</option>
            <option value="bad">Bad (below 50%)</option>
          </select>
        </div>
        {f.branch !== 'root' && (
          <div className="field">
            <label>Parent Line Order</label>
            <input type="number" min={1} value={f.parent_line_order || ''} onChange={(e) => setF({ ...f, parent_line_order: +e.target.value || null })} />
          </div>
        )}
      </div>
      <div className="field"><label>Dialogue Text</label><textarea rows={3} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} required /></div>
      <div className="form-grid">
        <label className="cm-toggle-label"><input type="checkbox" checked={f.is_objection} onChange={(e) => setF({ ...f, is_objection: e.target.checked })} /> Is Objection</label>
        <label className="cm-toggle-label"><input type="checkbox" checked={f.triggers_response} onChange={(e) => setF({ ...f, triggers_response: e.target.checked })} /> Triggers Response</label>
      </div>
      {f.is_objection && (
        <div className="field">
          <label>Linked Objection</label>
          <select value={f.objection_id} onChange={(e) => setF({ ...f, objection_id: e.target.value })}>
            <option value="">None</option>
            {objections.slice(0, 50).map((o) => <option key={o.id} value={o.id}>{o.text?.slice(0, 60)}</option>)}
          </select>
        </div>
      )}
      {f.triggers_response && (
        <div className="field">
          <label>Response Type</label>
          <select value={f.response_type} onChange={(e) => setF({ ...f, response_type: e.target.value })}>
            <option value="">Auto (free text)</option>
            <option value="multiple_choice">Multiple Choice</option>
            <option value="free_text">Free Text</option>
          </select>
        </div>
      )}
      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}
