import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, role }) {
  const { isAuthenticated, user } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (role && user?.role?.toLowerCase() !== role.toLowerCase()) return <Navigate to="/dashboard" replace />
  return children
}
