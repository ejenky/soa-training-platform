// Rule-based grading. No AI APIs.

// Required keyword rubrics per objection category. Each entry has a list of
// keyword groups; the agent's answer earns a point for every group where at
// least one synonym appears (case-insensitive).
const RUBRICS = {
  'Intro/SOA': [
    ['licensed', 'license', 'agent', 'certified'],
    ['monitored', 'recorded', 'recording', 'protection'],
    ['medicare advantage', 'advantage plan', 'part d', 'medicare-approved'],
    ['permission', 'okay', 'is it ok', 'may i', 'do i have your permission'],
    ['government', 'government program', 'medicare.gov'],
  ],
  'RWB Card': [
    ['protect', 'safe', 'secure', 'security', 'protected'],
    ['licensed', 'license', 'certified', 'credentials'],
    ['won\'t need', 'don\'t need', 'not required', 'not right now', 'no pressure'],
    ['verify', 'confirm', 'later', 'when you\'re ready', 'your choice'],
    ['recorded', 'recording', 'monitored', 'your protection'],
  ],
  'SEP': [
    ['qualify', 'eligible', 'eligibility'],
    ['enrollment period', 'special enrollment', 'initial enrollment', 'annual enrollment'],
    ['deadline', 'window', 'timeframe', 'time frame'],
    ['change', 'switch', 'enroll', 'sign up'],
    ['moved', 'lost coverage', 'extra help', 'medicaid', 'dual eligible'],
  ],
  'No Value': [
    ['benefits', 'extra benefits', 'additional benefits'],
    ['savings', 'save', 'no cost', 'no additional', 'zero premium', 'no extra cost'],
    ['dental', 'vision', 'hearing', 'otc', 'over-the-counter', 'prescription'],
    ['compare', 'review', 'check', 'see what\'s available', 'options in your area'],
    ['help', 'assist', 'here to help', 'no obligation', 'no commitment'],
  ],
  default: [
    ['medicare', 'plan', 'medicare advantage'],
    ['help', 'assist', 'review', 'here to help'],
    ['licensed', 'agent', 'certified'],
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
