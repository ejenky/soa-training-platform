import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Lessons from './pages/Lessons'
import LessonDetail from './pages/LessonDetail'
import Practice from './pages/Practice'
import PracticeSession from './pages/PracticeSession'
import Progress from './pages/Progress'
import Supervisor from './pages/Supervisor'
import SupervisorAgent from './pages/SupervisorAgent'
import Register from './pages/Register'
import SupervisorFlags from './pages/SupervisorFlags'
import Profile from './pages/Profile'
import Certification from './pages/Certification'
import ContentManager from './pages/ContentManager'
import SupervisorSettings from './pages/SupervisorSettings'
import Scenarios from './pages/Scenarios'
import ScenarioPlayer from './pages/ScenarioPlayer'
import History from './pages/History'
import SessionReplay from './pages/SessionReplay'

function PageFade({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<PageFade><Login /></PageFade>} />
        <Route path="/register" element={<PageFade><Register /></PageFade>} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<PageFade><Dashboard /></PageFade>} />
          <Route path="/lessons" element={<PageFade><Lessons /></PageFade>} />
          <Route path="/lessons/:id" element={<PageFade><LessonDetail /></PageFade>} />
          <Route path="/practice" element={<PageFade><Practice /></PageFade>} />
          <Route path="/practice/session" element={<PageFade><PracticeSession /></PageFade>} />
          <Route path="/practice/scenario/:id" element={<PageFade><ScenarioPlayer /></PageFade>} />
          <Route path="/scenarios" element={<PageFade><Scenarios /></PageFade>} />
          <Route path="/progress" element={<PageFade><Progress /></PageFade>} />
          <Route path="/profile" element={<PageFade><Profile /></PageFade>} />
          <Route path="/certification" element={<PageFade><Certification /></PageFade>} />
          <Route path="/history" element={<PageFade><History /></PageFade>} />
          <Route path="/history/:sessionId" element={<PageFade><SessionReplay /></PageFade>} />
          <Route
            path="/supervisor"
            element={
              <ProtectedRoute role="supervisor">
                <PageFade><Supervisor /></PageFade>
              </ProtectedRoute>
            }
          />
          <Route
            path="/supervisor/flags"
            element={
              <ProtectedRoute role="supervisor">
                <PageFade><SupervisorFlags /></PageFade>
              </ProtectedRoute>
            }
          />
          <Route
            path="/supervisor/settings"
            element={
              <ProtectedRoute role="supervisor">
                <PageFade><SupervisorSettings /></PageFade>
              </ProtectedRoute>
            }
          />
          <Route
            path="/supervisor/content"
            element={
              <ProtectedRoute role="supervisor">
                <PageFade><ContentManager /></PageFade>
              </ProtectedRoute>
            }
          />
          <Route
            path="/supervisor/agent/:id"
            element={
              <ProtectedRoute role="supervisor">
                <PageFade><SupervisorAgent /></PageFade>
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
