import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  House,
  BookOpen,
  Target,
  ChartLine,
  Users,
  Flag,
  Gear,
  List,
  SignOut,
  Sun,
  Moon,
  UserCircle,
  ClockCounterClockwise,
  Medal,
  Notebook,
} from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { pb } from '../lib/pb'
import { computeStreak, computeXP } from '../lib/gamification'

function initials(name, email) {
  const src = (name || email || '').trim()
  if (!src) return 'A'
  const parts = src.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/lessons': 'Lessons',
  '/practice': 'Practice',
  '/progress': 'Progress',
  '/supervisor': 'Team Overview',
  '/supervisor/flags': 'Flags',
  '/supervisor/settings': 'Settings',
  '/profile': 'Profile',
  '/history': 'Session History',
  '/certification': 'Certification',
  '/supervisor/content': 'Content Manager',
}

function pageTitleFor(pathname) {
  if (pathname.startsWith('/lessons/')) return 'Lesson'
  if (pathname.startsWith('/history/')) return 'Session Replay'
  if (pathname.startsWith('/supervisor/agent/')) return 'Agent Detail'
  return PAGE_TITLES[pathname] || 'HIA Sales Training'
}

function Brand() {
  return (
    <div className="sidebar-brand">
      <div className="logo">
        <span className="health">health</span><span className="ins">insurance.com</span>
      </div>
      <div className="subtitle">HIA Sales Training</div>
    </div>
  )
}

export default function Layout() {
  const { user, isSupervisor, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [streak, setStreak] = useState(0)
  const [xp, setXp] = useState(0)
  const [lessonProgress, setLessonProgress] = useState({ done: 0, total: 0 })
  const [hasPracticeToday, setHasPracticeToday] = useState(false)
  const [teamCount, setTeamCount] = useState(0)
  const [flagCount, setFlagCount] = useState(0)

  // Hide sidebar on practice/session for immersive view
  const immersive = location.pathname.startsWith('/practice/session') || location.pathname.startsWith('/practice/scenario/')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user?.id) return
      try {
        if (isSupervisor) {
          const ag = await pb.collection('users').getFullList({
            filter: `role = "agent" && supervisor_id = "${user.id}"`,
          }).catch(() => [])
          if (cancelled) return
          setTeamCount(ag.length)

          // flag count: agents with quiz < 70% or gpa < 2.0
          if (ag.length > 0) {
            const ids = ag.map((a) => `agent_id = "${a.id}"`).join(' || ')
            const [cs, ps] = await Promise.all([
              pb.collection('lesson_completions').getFullList({ filter: ids }).catch(() => []),
              pb.collection('practice_sessions').getFullList({ filter: ids }).catch(() => []),
            ])
            if (cancelled) return
            let flagged = 0
            for (const a of ag) {
              const ac = cs.filter((c) => c.agent_id === a.id)
              const ap = ps.filter((s) => s.agent_id === a.id)
              const quiz = ac.length ? ac.reduce((x, c) => x + (c.quiz_score || 0), 0) / ac.length : 0
              const gpa = ap.length
                ? ap.reduce((x, s) => x + ((s.total_score || 0) / (s.max_score || 1)) * 4, 0) / ap.length
                : 0
              if (quiz < 70 || gpa < 2.0) flagged++
            }
            setFlagCount(flagged)
          }
        } else {
          const [sessions, completions, lessons] = await Promise.all([
            pb.collection('practice_sessions').getFullList({ filter: `agent_id = "${user.id}"` }).catch(() => []),
            pb.collection('lesson_completions').getFullList({ filter: `agent_id = "${user.id}"` }).catch(() => []),
            pb.collection('lessons').getFullList({ filter: 'active = true' }).catch(() => []),
          ])
          if (cancelled) return
          setStreak(computeStreak(sessions, completions))
          setXp(computeXP(sessions, completions))
          const passed = new Set(completions.filter((c) => c.passed).map((c) => c.lesson_id))
          setLessonProgress({ done: passed.size, total: lessons.length })
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const hadToday = sessions.some((s) => new Date(s.created) >= today)
          setHasPracticeToday(!hadToday) // green dot when needs practice today
        }
      } catch (e) {
        console.error(e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, isSupervisor])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const agentNav = [
    { to: '/dashboard', label: 'Dashboard', Icon: House },
    {
      to: '/lessons',
      label: 'Lessons',
      Icon: BookOpen,
      meta: lessonProgress.total > 0 ? `${lessonProgress.done}/${lessonProgress.total}` : null,
    },
    { to: '/practice', label: 'Practice', Icon: Target, dot: hasPracticeToday },
    { to: '/progress', label: 'Progress', Icon: ChartLine },
    { to: '/certification', label: 'Certification', Icon: Medal },
    { to: '/history', label: 'History', Icon: ClockCounterClockwise },
  ]

  const supervisorNav = [
    {
      to: '/supervisor',
      label: 'Team',
      Icon: Users,
      meta: teamCount > 0 ? String(teamCount) : null,
    },
    {
      to: '/supervisor/flags',
      label: 'Flags',
      Icon: Flag,
      meta: flagCount > 0 ? String(flagCount) : null,
      metaClass: 'amber',
    },
    { to: '/supervisor/content', label: 'Content', Icon: Notebook },
    { to: '/supervisor/settings', label: 'Settings', Icon: Gear },
  ]

  const role = user?.role || 'agent'
  const title = pageTitleFor(location.pathname)

  return (
    <div className={`app ${immersive ? 'no-sidebar' : ''}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Brand />

        <div className="sidebar-section">
          <div className="section-label">Workspace</div>
          <nav className="sidebar-nav">
            {agentNav.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                onClick={() => setOpen(false)}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <span className="nav-icon"><l.Icon size={16} weight="regular" /></span>
                <span className="nav-label">{l.label}</span>
                {l.meta && <span className="nav-meta">{l.meta}</span>}
                {l.dot && <span className="green-dot" />}
              </NavLink>
            ))}
          </nav>
        </div>

        {isSupervisor && (
          <div className="sidebar-section">
            <div className="section-label">Supervisor</div>
            <nav className="sidebar-nav">
              {supervisorNav.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  <span className="nav-icon"><l.Icon size={16} weight="regular" /></span>
                  <span className="nav-label">{l.label}</span>
                  {l.meta && (
                    <span className={`nav-meta ${l.metaClass || ''}`}>{l.meta}</span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        )}

        <div className="sidebar-section sidebar-profile-section">
          <nav className="sidebar-nav">
            <NavLink
              to="/profile"
              end
              onClick={() => setOpen(false)}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="nav-icon"><UserCircle size={16} weight="regular" /></span>
              <span className="nav-label">Profile</span>
            </NavLink>
          </nav>
        </div>

        <div className="sidebar-footer">
          <NavLink to="/profile" className="avatar-link" onClick={() => setOpen(false)}>
            <div className="avatar">{initials(user?.name, user?.email)}</div>
          </NavLink>
          <div className="who">
            <div className="name">{user?.name || user?.email || 'Agent'}</div>
            <div className="role">{role}</div>
          </div>
          <button className="signout" onClick={handleLogout} title="Sign out">
            <SignOut size={14} weight="regular" />
          </button>
        </div>
      </aside>

      <div className="main">
        {!immersive && (
          <header className="topbar">
            <div className="row" style={{ gap: 12 }}>
              <button
                className="menu-toggle"
                onClick={() => setOpen((o) => !o)}
                aria-label="Menu"
              >
                <List size={16} weight="regular" />
              </button>
              <div className="page-title">{title}</div>
            </div>
            <div className="right">
              <button
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {theme === 'dark' ? (
                    <motion.span
                      key="moon"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ display: 'inline-flex' }}
                    >
                      <Moon size={16} weight="regular" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="sun"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ display: 'inline-flex' }}
                    >
                      <Sun size={16} weight="regular" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
              {!isSupervisor && (
                <>
                  <span className="streak-pill">🔥 {streak} day{streak === 1 ? '' : 's'}</span>
                  <span className="xp-pill">⚡ {xp.toLocaleString()} XP</span>
                </>
              )}
            </div>
          </header>
        )}

        <Outlet />
      </div>

      {!immersive && (
        <nav className="bottom-tabs">
          {agentNav.slice(0, 5).map((l) => (
            <NavLink key={l.to} to={l.to} end className={({ isActive }) => (isActive ? 'active' : '')}>
              <l.Icon size={18} weight="regular" />
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
