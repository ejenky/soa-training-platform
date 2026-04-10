import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  SignOut,
  Eye,
  EyeSlash,
  Check,
  Copy,
} from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { pb } from '../lib/pb'
import { computeStreak, computeXP, levelFor } from '../lib/gamification'

function initials(name, email) {
  const src = (name || email || '').trim()
  if (!src) return 'A'
  const parts = src.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

const stagger = {
  hidden: { opacity: 0, y: 14 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] },
  }),
}

function Animated({ children, i = 0, className = '' }) {
  return (
    <motion.div
      className={className}
      custom={i}
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  )
}

export default function Profile() {
  const { user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()

  // User info
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Stats
  const [sessions, setSessions] = useState([])
  const [completions, setCompletions] = useState([])
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)

  // Password
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMsg, setPwMsg] = useState({ type: '', text: '' })
  const [pwSubmitting, setPwSubmitting] = useState(false)
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)

  // Preferences
  const [soundEffects, setSoundEffects] = useState(() => {
    try { return localStorage.getItem('hia-sound') !== 'off' } catch { return true }
  })
  const [teleSpeed, setTeleSpeed] = useState(() => {
    try { return localStorage.getItem('hia-tele-speed') || '1' } catch { return '1' }
  })

  // Copy ID
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user?.id) return
      try {
        const [ps, cs] = await Promise.all([
          pb.collection('practice_sessions').getFullList({ filter: `agent_id = "${user.id}"`, sort: '-created' }),
          pb.collection('lesson_completions').getFullList({ filter: `agent_id = "${user.id}"`, sort: '-completed_at' }),
        ])
        let rs = []
        if (ps.length > 0) {
          const filter = ps.slice(0, 30).map((p) => `session_id = "${p.id}"`).join(' || ')
          rs = await pb.collection('session_responses').getFullList({ filter }).catch(() => [])
        }
        if (cancelled) return
        setSessions(ps)
        setCompletions(cs)
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

  const stats = useMemo(() => {
    const xp = computeXP(sessions, completions, responses)
    const lvl = levelFor(xp)
    const streak = computeStreak(sessions, completions)
    const quizAvg = completions.length > 0
      ? Math.round(completions.reduce((a, c) => a + (c.quiz_score || 0), 0) / completions.length)
      : 0
    const practiceGpa = sessions.length > 0
      ? (sessions.reduce((a, s) => a + ((s.total_score || 0) / (s.max_score || 1)) * 4, 0) / sessions.length).toFixed(1)
      : '0.0'
    const certified = quizAvg >= 85 && parseFloat(practiceGpa) >= 3.0

    // Best streak: compute by scanning all activity days
    let bestStreak = streak
    const days = new Set()
    for (const s of sessions) if (s.created) days.add(dayKey(s.created))
    for (const c of completions) if (c.completed_at) days.add(dayKey(c.completed_at))
    if (days.size > 0) {
      const sorted = [...days].sort()
      let run = 1
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1])
        const curr = new Date(sorted[i])
        const diff = (curr - prev) / 86400000
        if (diff <= 1.5) { run++; bestStreak = Math.max(bestStreak, run) }
        else run = 1
      }
    }

    return { xp, lvl, streak, bestStreak, totalSessions: sessions.length, certified }
  }, [sessions, completions, responses])

  function dayKey(d) {
    const dt = typeof d === 'string' ? new Date(d) : d
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }

  async function handleSaveName(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setSaveMsg('')
    try {
      await pb.collection('users').update(user.id, { name: name.trim() })
      setSaveMsg('saved')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch (err) {
      setSaveMsg('error')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPwMsg({ type: '', text: '' })

    if (newPw.length < 8) {
      setPwMsg({ type: 'error', text: 'New password must be at least 8 characters.' })
      return
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' })
      return
    }

    setPwSubmitting(true)
    try {
      await pb.collection('users').update(user.id, {
        oldPassword: currentPw,
        password: newPw,
        passwordConfirm: newPw,
      })
      // Re-authenticate with new password
      await pb.collection('users').authWithPassword(user.email, newPw)
      setPwMsg({ type: 'success', text: 'Password updated successfully.' })
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      const msg = err?.response?.data?.oldPassword
        ? 'Current password is incorrect.'
        : (err?.message || 'Failed to update password.')
      setPwMsg({ type: 'error', text: msg })
    } finally {
      setPwSubmitting(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function handleSoundToggle() {
    const next = !soundEffects
    setSoundEffects(next)
    try { localStorage.setItem('hia-sound', next ? 'on' : 'off') } catch { /* ignore */ }
  }

  function handleTeleSpeed(val) {
    setTeleSpeed(val)
    try { localStorage.setItem('hia-tele-speed', val) } catch { /* ignore */ }
  }

  function handleCopyId() {
    navigator.clipboard.writeText(user?.id || '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  const memberSince = user?.created
    ? new Date(user.created).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—'

  const lastLogin = user?.updated
    ? new Date(user.updated).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : null

  if (loading) {
    return <div className="page"><div className="loader">Loading profile…</div></div>
  }

  return (
    <div className="page profile-page">
      {/* User info card */}
      <Animated i={0} className="card profile-header">
        <div className="profile-avatar">{initials(user?.name, user?.email)}</div>
        <form className="profile-info" onSubmit={handleSaveName}>
          <div className="field">
            <label htmlFor="profileName">Full Name</label>
            <input
              id="profileName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="profileEmail">Email</label>
            <input
              id="profileEmail"
              type="email"
              value={user?.email || ''}
              disabled
              className="disabled"
            />
          </div>
          <div className="profile-meta-row">
            <span className="role-badge">{user?.role || 'agent'}</span>
            <span className="member-since">Member since {memberSince}</span>
          </div>
          <button
            type="submit"
            className="primary"
            disabled={saving || name.trim() === (user?.name || '')}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saveMsg === 'saved' && <span className="inline-success">Saved</span>}
          {saveMsg === 'error' && <span className="inline-error">Failed to save</span>}
        </form>
      </Animated>

      {/* Stats strip */}
      <Animated i={1} className="stats-strip">
        <div className="stat">
          <div className="label"><span className="dot green" />Level</div>
          <div className="value" style={{ fontSize: 18 }}>{stats.lvl.name}</div>
          <div className="meta">{stats.xp.toLocaleString()} XP</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot blue" />Sessions</div>
          <div className="value">{stats.totalSessions}</div>
          <div className="meta">completed</div>
        </div>
        <div className="stat">
          <div className="label"><span className="dot amber" />Streak</div>
          <div className="value">{stats.streak}</div>
          <div className="meta">best: {stats.bestStreak}</div>
        </div>
        <div className="stat">
          <div className="label"><span className={`dot ${stats.certified ? 'green' : 'red'}`} />Certification</div>
          <div className="value" style={{ fontSize: 16 }}>{stats.certified ? 'Certified' : 'In Progress'}</div>
          <div className="meta">{stats.certified ? 'requirements met' : 'need 85% quiz & 3.0 GPA'}</div>
        </div>
      </Animated>

      <div className="profile-grid">
        {/* Password section */}
        <Animated i={2} className="card">
          <h2>Change password</h2>
          {pwMsg.text && (
            <div className={pwMsg.type === 'success' ? 'success-msg' : 'error'}>
              {pwMsg.text}
            </div>
          )}
          <form onSubmit={handleChangePassword}>
            <div className="field">
              <label htmlFor="currentPw">Current password</label>
              <div className="pw-field">
                <input
                  id="currentPw"
                  type={showCurrentPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowCurrentPw((v) => !v)}
                  tabIndex={-1}
                >
                  {showCurrentPw ? <EyeSlash size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="newPw">New password</label>
              <div className="pw-field">
                <input
                  id="newPw"
                  type={showNewPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowNewPw((v) => !v)}
                  tabIndex={-1}
                >
                  {showNewPw ? <EyeSlash size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="confirmNewPw">Confirm new password</label>
              <input
                id="confirmNewPw"
                type="password"
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="primary" disabled={pwSubmitting}>
              {pwSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </Animated>

        {/* Account section */}
        <Animated i={3} className="card">
          <h2>Account</h2>
          <div className="account-detail">
            <div className="detail-label">Account ID</div>
            <div className="detail-value mono">
              {user?.id}
              <button className="copy-btn" onClick={handleCopyId} title="Copy ID">
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          </div>
          {lastLogin && (
            <div className="account-detail">
              <div className="detail-label">Last active</div>
              <div className="detail-value">{lastLogin}</div>
            </div>
          )}
          <div className="account-actions">
            <button className="outline-red" onClick={handleLogout}>
              <SignOut size={14} weight="regular" /> Sign out
            </button>
          </div>
        </Animated>

        {/* Preferences */}
        <Animated i={4} className="card">
          <h2>Preferences</h2>
          <div className="pref-row">
            <div>
              <div className="pref-label">Dark mode</div>
              <div className="pref-desc">Toggle between dark and light theme</div>
            </div>
            <button
              className={`toggle-switch ${theme === 'dark' ? 'on' : ''}`}
              onClick={toggleTheme}
              role="switch"
              aria-checked={theme === 'dark'}
            >
              <span className="toggle-knob" />
            </button>
          </div>
          <div className="pref-row">
            <div>
              <div className="pref-label">Sound effects</div>
              <div className="pref-desc">Play sounds during practice sessions</div>
            </div>
            <button
              className={`toggle-switch ${soundEffects ? 'on' : ''}`}
              onClick={handleSoundToggle}
              role="switch"
              aria-checked={soundEffects}
            >
              <span className="toggle-knob" />
            </button>
          </div>
          <div className="pref-row">
            <div>
              <div className="pref-label">Teleprompter speed</div>
              <div className="pref-desc">Scroll speed for script teleprompter</div>
            </div>
            <select
              className="pref-select"
              value={teleSpeed}
              onChange={(e) => handleTeleSpeed(e.target.value)}
            >
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </div>
        </Animated>
      </div>
    </div>
  )
}
