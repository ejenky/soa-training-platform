import { useState } from 'react'
import { motion } from 'motion/react'

const STORAGE_KEY = 'hia-supervisor-settings'

const DEFAULTS = {
  quizPassThreshold: 85,
  practicePassThreshold: 75,
  certGpaThreshold: 3.0,
  flagQuizRedThreshold: 70,
  flagQuizAmberThreshold: 85,
  flagGpaRedThreshold: 2.0,
  flagGpaAmberThreshold: 3.0,
  flagInactivityAmberDays: 7,
  flagInactivityRedDays: 14,
  flagMinSessionsWeek: 3,
  recertPeriodDays: 90,
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return { ...DEFAULTS, ...stored }
  } catch { return { ...DEFAULTS } }
}

function saveSettings(settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* ignore */ }
}

export default function SupervisorSettings() {
  const [settings, setSettings] = useState(loadSettings)
  const [saved, setSaved] = useState(false)

  function update(key, value) {
    setSettings((s) => ({ ...s, [key]: value }))
    setSaved(false)
  }

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    setSettings({ ...DEFAULTS })
    saveSettings(DEFAULTS)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="page settings-page">
      <div className="page-header">
        <h1>Settings</h1>
        <p className="lede">Configure performance thresholds and certification requirements.</p>
      </div>

      <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h2>Pass Thresholds</h2>
        <div className="form-grid">
          <SettingField label="Quiz Pass Threshold (%)" value={settings.quizPassThreshold} onChange={(v) => update('quizPassThreshold', v)} type="number" min={0} max={100} />
          <SettingField label="Practice Pass Threshold (%)" value={settings.practicePassThreshold} onChange={(v) => update('practicePassThreshold', v)} type="number" min={0} max={100} />
          <SettingField label="Certification GPA Threshold" value={settings.certGpaThreshold} onChange={(v) => update('certGpaThreshold', v)} type="number" min={0} max={4} step={0.1} />
          <SettingField label="Recertification Period (days)" value={settings.recertPeriodDays} onChange={(v) => update('recertPeriodDays', v)} type="number" min={1} />
        </div>
      </motion.div>

      <motion.div className="card" style={{ marginTop: 18 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
        <h2>Flag Thresholds</h2>
        <div className="form-grid">
          <SettingField label="Quiz Red Flag Below (%)" value={settings.flagQuizRedThreshold} onChange={(v) => update('flagQuizRedThreshold', v)} type="number" min={0} max={100} />
          <SettingField label="Quiz Amber Flag Below (%)" value={settings.flagQuizAmberThreshold} onChange={(v) => update('flagQuizAmberThreshold', v)} type="number" min={0} max={100} />
          <SettingField label="GPA Red Flag Below" value={settings.flagGpaRedThreshold} onChange={(v) => update('flagGpaRedThreshold', v)} type="number" min={0} max={4} step={0.1} />
          <SettingField label="GPA Amber Flag Below" value={settings.flagGpaAmberThreshold} onChange={(v) => update('flagGpaAmberThreshold', v)} type="number" min={0} max={4} step={0.1} />
        </div>
      </motion.div>

      <motion.div className="card" style={{ marginTop: 18 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
        <h2>Inactivity Flags</h2>
        <div className="form-grid">
          <SettingField label="Amber Inactivity (days)" value={settings.flagInactivityAmberDays} onChange={(v) => update('flagInactivityAmberDays', v)} type="number" min={1} />
          <SettingField label="Red Inactivity (days)" value={settings.flagInactivityRedDays} onChange={(v) => update('flagInactivityRedDays', v)} type="number" min={1} />
          <SettingField label="Min Sessions Per Week" value={settings.flagMinSessionsWeek} onChange={(v) => update('flagMinSessionsWeek', v)} type="number" min={0} />
        </div>
      </motion.div>

      <motion.div className="settings-actions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
        <button className="primary" onClick={handleSave}>Save Settings</button>
        <button onClick={handleReset}>Reset to Defaults</button>
        {saved && <span className="inline-success">Saved</span>}
      </motion.div>
    </div>
  )
}

function SettingField({ label, value, onChange, type = 'number', ...props }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        {...props}
      />
    </div>
  )
}
