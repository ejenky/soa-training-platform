import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'hia-theme'

function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'light') root.classList.add('light')
  else root.classList.remove('light')
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return localStorage.getItem(STORAGE_KEY) || 'dark'
  })

  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  function toggle() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
