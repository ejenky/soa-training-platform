import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  motion,
  useMotionValue,
  useSpring,
  useScroll,
  useTransform,
  useInView,
} from 'motion/react'
import {
  ArrowRight,
  Target,
  Phone,
  ChartLine,
  Medal,
  Lightning,
  Users,
} from '@phosphor-icons/react'

/* ── Particles ─────────────────────────────────────────────────── */
function Particles({ count = 40 }) {
  const dots = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      dur: 12 + Math.random() * 20,
      delay: Math.random() * -20,
      opacity: 0.15 + Math.random() * 0.25,
    }))
  ).current

  return (
    <div className="lp-particles" aria-hidden>
      {dots.map((d) => (
        <span
          key={d.id}
          className="lp-particle"
          style={{
            left: `${d.x}%`,
            width: d.size,
            height: d.size,
            opacity: d.opacity,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

/* ── Animated counter ──────────────────────────────────────────── */
function Counter({ value, suffix = '', prefix = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    let frame
    const start = performance.now()
    const duration = 1600
    function tick(now) {
      const t = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 4)
      setDisplay(Math.round(ease * value))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, value])

  return <span ref={ref}>{prefix}{display}{suffix}</span>
}

/* ── Magnetic button ───────────────────────────────────────────── */
function MagneticButton({ children, href, className = '' }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 200, damping: 20 })
  const springY = useSpring(y, { stiffness: 200, damping: 20 })
  const ref = useRef(null)

  function handleMove(e) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    x.set((e.clientX - cx) * 0.2)
    y.set((e.clientY - cy) * 0.2)
  }

  function handleLeave() { x.set(0); y.set(0) }

  return (
    <motion.div style={{ x: springX, y: springY, display: 'inline-block' }}>
      <Link
        ref={ref}
        to={href}
        className={`lp-cta-btn ${className}`}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {children}
      </Link>
    </motion.div>
  )
}

/* ── Reveal wrapper ────────────────────────────────────────────── */
function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

/* ── Features data ─────────────────────────────────────────────── */
const FEATURES = [
  { Icon: Target, title: 'Live Objection Drills', desc: 'Practice real caller objections with instant grading and feedback — the same phrases your leads actually say.' },
  { Icon: Phone, title: 'Full Call Roleplay', desc: 'Simulate complete phone calls with distinct client personas, branching dialogue, and scored responses.' },
  { Icon: ChartLine, title: 'Real-Time Grading', desc: 'Rule-based keyword matching scores every response instantly — no AI APIs, no latency, no hallucinations.' },
  { Icon: Medal, title: '3-Tier Certification', desc: 'Foundations, Advanced, and Expert levels with clear requirements so agents always know their next milestone.' },
  { Icon: Lightning, title: 'Train Between Calls', desc: '5-minute sprint drills designed for the gap between calls. Spaced repetition resurfaces weak spots automatically.' },
  { Icon: Users, title: 'Supervisor Dashboard', desc: 'Real-time team overview with performance flags, export reports, and individual agent deep-dives.' },
]

const STEPS = [
  { num: '01', title: 'Read the script', desc: 'A teleprompter walks you through the compliant Intro and SOA verbatim — word by word, at your speed.' },
  { num: '02', title: 'Handle the interruption', desc: 'The simulated client interrupts with a real objection from the field. You respond in real time.' },
  { num: '03', title: 'Get instant feedback', desc: 'Every response is graded against a compliance rubric. See exactly what you nailed and what you missed.' },
  { num: '04', title: 'Level up your certification', desc: 'Hit quiz and GPA thresholds to advance through three certification tiers and unlock harder material.' },
]

/* ══════════════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════════════ */
export default function Landing() {
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.7], [1, 0.95])
  const heroY = useTransform(scrollYProgress, [0, 0.7], [0, -60])

  // Mouse-following orbs
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const orbX = useSpring(mouseX, { stiffness: 30, damping: 40 })
  const orbY = useSpring(mouseY, { stiffness: 30, damping: 40 })

  useEffect(() => {
    function onMove(e) {
      mouseX.set(e.clientX)
      mouseY.set(e.clientY)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [mouseX, mouseY])

  const WORDS = ['Stop', 'losing', 'leads', 'at\u00A0the\u00A0SOA.']

  return (
    <div className="lp">
      {/* Noise overlay */}
      <div className="lp-noise" aria-hidden />

      {/* Gradient orbs */}
      <motion.div className="lp-orb lp-orb-1" style={{ x: orbX, y: orbY }} aria-hidden />
      <motion.div className="lp-orb lp-orb-2" style={{ x: orbX, y: orbY }} aria-hidden />

      <Particles />

      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-nav-brand">
            <span className="health">health</span><span className="ins">insurance.com</span>
          </div>
          <Link to="/login" className="lp-nav-login">Log In <ArrowRight size={14} weight="bold" /></Link>
        </div>
      </nav>

      {/* Hero */}
      <motion.section
        ref={heroRef}
        className="lp-hero"
        style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
      >
        <motion.div
          className="lp-pulse-badge"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <span className="lp-pulse-dot" />
          Now training 100+ agents
        </motion.div>

        <h1 className="lp-hero-title">
          {WORDS.map((word, i) => (
            <motion.span
              key={i}
              className={i === WORDS.length - 1 ? 'lp-gradient-text' : ''}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              {word}{' '}
            </motion.span>
          ))}
        </h1>

        <motion.p
          className="lp-hero-sub"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.0 }}
        >
          The Intro/SOA step loses 15–20% of Medicare leads. This platform drills your agents on the exact objections they'll face — with real scripts, real grading, and real results.
        </motion.p>

        <motion.div
          className="lp-hero-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.2 }}
        >
          <MagneticButton href="/register">
            Start Training <ArrowRight size={16} weight="bold" />
          </MagneticButton>
          <a href="#how" className="lp-link-secondary">See how it works</a>
        </motion.div>

        <motion.div
          className="lp-scroll-indicator"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
        >
          <div className="lp-scroll-pill">
            <span className="lp-scroll-dot" />
          </div>
        </motion.div>
      </motion.section>

      {/* Stats */}
      <section className="lp-section lp-stats">
        <div className="lp-stats-grid">
          {[
            { val: 15, suffix: '%', label: 'of leads lost at SOA' },
            { val: 100, suffix: '+', label: 'agents trained' },
            { val: 10, suffix: '', label: 'objection categories' },
            { val: 85, suffix: '%', label: 'pass threshold' },
          ].map((s, i) => (
            <Reveal key={i} className="lp-stat" delay={i * 0.1}>
              <div className="lp-stat-num"><Counter value={s.val} suffix={s.suffix} /></div>
              <div className="lp-stat-label">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="lp-section">
        <Reveal><h2 className="lp-section-title">Everything agents need to stop losing leads</h2></Reveal>
        <div className="lp-features-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={i} className="lp-feature-card" delay={i * 0.08}>
              <div className="lp-feature-icon"><f.Icon size={24} weight="regular" /></div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="lp-section" id="how">
        <Reveal><h2 className="lp-section-title">How it works</h2></Reveal>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <Reveal
              key={i}
              className={`lp-step ${i % 2 === 1 ? 'lp-step-right' : ''}`}
              delay={i * 0.1}
            >
              <div className="lp-step-num">{s.num}</div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="lp-section lp-bottom-cta">
        <Reveal className="lp-cta-card">
          <h2>Ready to stop losing leads?</h2>
          <p>Get your team certified on the Intro/SOA in weeks, not months.</p>
          <MagneticButton href="/register">
            Start Training <ArrowRight size={16} weight="bold" />
          </MagneticButton>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-nav-brand">
          <span className="health">health</span><span className="ins">insurance.com</span>
        </div>
        <div className="lp-footer-sub">HIA Sales Training Platform</div>
      </footer>
    </div>
  )
}
