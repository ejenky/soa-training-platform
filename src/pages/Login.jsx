import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err?.message || 'Sign in failed. Check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-shell">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="login-brand">
          <div className="logo">
            <span className="health">health</span><span className="ins">insurance.com</span>
          </div>
          <div className="subtitle">HIA Sales Training</div>
        </div>

        <h1>Sign in</h1>
        <p className="help">Welcome back — let's run some drills.</p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@healthinsurance.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="primary lg"
            disabled={loading || submitting}
            style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
          >
            {submitting || loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="footer-note">Licensed Medicare Advantage agents only</div>
      </motion.div>
    </div>
  )
}
