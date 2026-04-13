import { createContext, useContext, useEffect, useState } from 'react'
import { pb, login as pbLogin, logout as pbLogout } from '../lib/pb'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(pb.authStore.record || pb.authStore.model || null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      setUser(pb.authStore.record || pb.authStore.model || null)
    })
    return () => unsub()
  }, [])

  async function login(email, password) {
    setLoading(true)
    try {
      const result = await pbLogin(email, password)
      return result
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    pbLogout()
  }

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
    isSupervisor: user?.role?.toLowerCase() === 'supervisor',
    isAgent: user?.role?.toLowerCase() === 'agent',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
