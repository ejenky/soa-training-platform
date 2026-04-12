import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import AuthBackground from '../components/AuthBackground'

/*
 * NOTE: PocketBase admin must enable self-registration for the "users" collection.
 * In the PocketBase admin UI → Collections → users → API Rules → Create:
 *   Set the "Create" rule to "" (empty string) to allow anyone to create an account.
 *   Leaving it blank/locked will reject signup requests with a 403.
 */

export default function Register() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  function validate() {
    const next = {}
    if (!firstName.trim()) next.firstName = 'First name is required'
    if (!lastName.trim()) next.lastName = 'Last name is required'
    if (!email.trim()) next.email = 'Email is required'
    else if (!email.trim().toLowerCase().endsWith('@medicareinsurance.com')) next.email = 'Registration is limited to HealthInsurance.com employees. Please use your @medicareinsurance.com email address.'
    if (password.length < 8) next.password = 'Password must be at least 8 characters'
    if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setErrors({})

    try {
      await pb.collection('users').create({
        name: `${firstName.trim()} ${lastName.trim()}`,
        email: email.trim(),
        password: password,
        passwordConfirm: password,
        role: 'agent',
        status: 'Active',
        certification_level: 0,
      })

      // Auto-login after successful registration
      await login(email.trim(), password)
      navigate('/dashboard')
    } catch (err) {
      const data = err?.response?.data
      if (data?.email) {
        setErrors({ email: 'An account with this email already exists' })
      } else if (data?.password) {
        setErrors({ password: data.password.message || 'Invalid password' })
      } else {
        setErrors({ form: err?.message || 'Registration failed. Please try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="lp login-shell">
      <AuthBackground />
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

        <h1>Create account</h1>
        <p className="help">Get started with your sales training.</p>

        {errors.form && <div className="error">{errors.form}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="firstName">First Name</label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                required
              />
              {errors.firstName && <span className="field-error">{errors.firstName}</span>}
            </div>
            <div className="field">
              <label htmlFor="lastName">Last Name</label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
                required
              />
              {errors.lastName && <span className="field-error">{errors.lastName}</span>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="regEmail">Email</label>
            <input
              id="regEmail"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@healthinsurance.com"
              required
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>
          <div className="field">
            <label htmlFor="regPassword">Password</label>
            <input
              id="regPassword"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            {errors.confirmPassword && <span className="field-error">{errors.confirmPassword}</span>}
          </div>
          <button
            type="submit"
            className="primary lg"
            disabled={submitting}
            style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="footer-note">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </motion.div>
    </div>
  )
}
