import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'

function Particles({ count = 20 }) {
  const dots = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
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

export default function AuthBackground() {
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

  return (
    <>
      <div className="lp-noise" aria-hidden />
      <motion.div className="lp-orb lp-orb-1" style={{ x: orbX, y: orbY }} aria-hidden />
      <motion.div className="lp-orb lp-orb-2" style={{ x: orbX, y: orbY }} aria-hidden />
      <Particles />
    </>
  )
}
