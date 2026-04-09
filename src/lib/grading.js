// Rule-based grading. No AI APIs.

// Required keyword rubrics per objection category. Each entry has a list of
// keyword groups; the agent's answer earns a point for every group where at
// least one synonym appears (case-insensitive).
const RUBRICS = {
  intro_soa: [
    ['licensed', 'license', 'agent'],
    ['monitored', 'recorded', 'recording'],
    ['medicare advantage', 'advantage plan', 'part d'],
    ['medicare contract', 'contract renewal'],
    ['permission', 'okay', 'is it ok', 'may i'],
  ],
  trust: [
    ['licensed', 'license'],
    ['no cost', 'no obligation', 'free'],
    ['medicare', 'cms'],
    ['help', 'assist', 'review'],
  ],
  benefits: [
    ['plan', 'plans'],
    ['benefits', 'coverage'],
    ['carriers', 'companies', 'organizations'],
    ['area', 'zip', 'county'],
  ],
  cost: [
    ['no cost', 'no charge', 'free', 'zero'],
    ['premium', 'monthly'],
    ['eligible', 'qualify'],
  ],
  default: [
    ['medicare', 'plan'],
    ['help', 'assist', 'review'],
    ['licensed', 'agent'],
  ],
}

export function gradeFreeText(text, category) {
  const rubric = RUBRICS[category] || RUBRICS.default
  const lower = (text || '').toLowerCase()
  let hits = 0
  const missing = []
  for (const group of rubric) {
    const matched = group.some((kw) => lower.includes(kw))
    if (matched) hits += 1
    else missing.push(group[0])
  }
  const max = rubric.length
  const score = hits
  const percent = max > 0 ? Math.round((hits / max) * 100) : 0
  let feedback
  if (percent >= 85) feedback = 'Strong response — you hit the key compliance points.'
  else if (percent >= 60) feedback = `Decent. Try to also mention: ${missing.join(', ')}.`
  else feedback = `Needs work. Missing required points: ${missing.join(', ')}.`
  return { score, max, percent, feedback }
}

export function gradeMultipleChoice(selectedIndex, correctIndex) {
  const correct = selectedIndex === correctIndex
  return {
    score: correct ? 1 : 0,
    max: 1,
    percent: correct ? 100 : 0,
    feedback: correct ? 'Correct.' : 'Incorrect — review the explanation.',
  }
}

// Convert raw 0-100 to a 4.0 scale used for certification thresholds
export function toGpa(percent) {
  return Math.round((percent / 25) * 10) / 10
}
