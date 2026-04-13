import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Timer,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  CheckCircle,
  Pause,
  Play,
  SkipForward,
  UserCircle,
  Warning,
  Speedometer,
} from '@phosphor-icons/react'
import { useAuth } from '../contexts/AuthContext'
import { pb } from '../lib/pb'
import { gradeFreeText, gradeMultipleChoice } from '../lib/grading'
import { updateReviewQueue, fetchDueReviews } from '../lib/spacedRepetition'

/* ── Script blocks ─────────────────────────────────────────────── */
const SCRIPT_BLOCKS = [
  {
    step: 1,
    label: 'YOU · Agent Script',
    text: 'Hi (Client Name), my name is (Agent First and Last Name). I am a licensed agent with HealthInsurance.com. Can you hear me okay?',
  },
  {
    step: 1,
    label: 'YOU · Agent Script',
    text: 'Alright, now I understand what you\'re looking for is (Specific Concern or General Benefit Review) and I\'ll be able to help you with that today. I just want to confirm, I have your zip code as (Member Zip Code). Is that correct?',
  },
  {
    step: 2,
    label: 'YOU · Verbatim Script — Required',
    text: 'Before we begin, I do need to review a couple of required Medicare disclosures. For your protection, this call may be monitored, recorded, and may also be shared with insurance companies who administer plans we offer. Plans are insured or covered by a Medicare Advantage organization with a Medicare contract and/or a Medicare approved Part D sponsor. Enrollment in the plan depends on contract renewal with Medicare. Now to confirm, I have your number as (Client Phone Number) and If we get disconnected (Client Name) do I have your permission to call you back at this number? Thank you.',
  },
  {
    step: 2,
    label: 'YOU · Verbatim Script — Required',
    text: 'And I do want to let you know that HealthInsurance.com offers Medicare Advantage plans and Stand-Alone Prescription Drug plan options. We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer in your area. Currently we represent (# of carriers) organizations which offer (# of plans) plans in your area. Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program to get information on all of your options. Do I have your permission to discuss all plan types that HealthInsurance.com offers to find the benefits that fit your needs?',
  },
]

/* ── Hardcoded fallback objections ─────────────────────────────── */
const FALLBACK_OBJECTIONS = [
  // Intro/SOA — objections about the intro script, recorded calls, disclosures
  { id: 'fb1', text: "I didn't know that this was insurance related. I thought this was from the government.", category: 'Intro/SOA', difficulty: 1, call_stage: 'intro_soa' },
  { id: 'fb2', text: 'I thought this was through Social Security, but this is another supplemental insurance thing.', category: 'Intro/SOA', difficulty: 2, call_stage: 'intro_soa' },
  { id: 'fb3', text: "I can't understand — if it's supposed to be Social Security benefits, what do I gotta go through insurance for?", category: 'Intro/SOA', difficulty: 3, call_stage: 'intro_soa' },
  // RWB Card — objections about sharing their red/white/blue Medicare card
  { id: 'fb4', text: "I'm not giving you my red, white, and blue card number.", category: 'RWB Card', difficulty: 2, call_stage: 'intro_soa' },
  { id: 'fb5', text: "My daughter told me to never give my Medicare number to anyone over the phone.", category: 'RWB Card', difficulty: 3, call_stage: 'intro_soa' },
  { id: 'fb6', text: "How do I know you're not going to steal my identity with my card number?", category: 'RWB Card', difficulty: 3, call_stage: 'intro_soa' },
  // SEP — objections about enrollment periods and eligibility
  { id: 'fb7', text: "I already missed the enrollment period so I can't do anything until next year right?", category: 'SEP', difficulty: 2, call_stage: 'intro_soa' },
  { id: 'fb8', text: 'I just turned 65 last month, am I even eligible for any of this?', category: 'SEP', difficulty: 1, call_stage: 'intro_soa' },
  // No Value — objections from clients who see no value or don't want it
  { id: 'fb9', text: "I don't need any kind of insurance. I've got life insurance and supplemental insurance.", category: 'No Value', difficulty: 1, call_stage: 'intro_soa' },
  { id: 'fb10', text: 'No, I was calling about that Medicare help for groceries and stuff, but I already have insurance.', category: 'No Value', difficulty: 1, call_stage: 'intro_soa' },
  { id: 'fb11', text: "I think we'll end this right now. We're just going through a bunch of bullshit.", category: 'No Value', difficulty: 3, call_stage: 'intro_soa' },
  { id: 'fb12', text: "I'm not looking to change my plan. What I'm looking for is benefits.", category: 'No Value', difficulty: 2, call_stage: 'intro_soa' },
]

/* ── Hardcoded MC options per fallback objection ───────────────── */
const FALLBACK_MC = {
  // Intro/SOA
  fb1: {
    question: 'How should you handle this misunderstanding?',
    options: [
      'Well, it is related to insurance. That\'s just how it works.',
      'It technically is from the government — Medicare is a government program.',
      'I completely understand the confusion. The benefits you heard about are available through Medicare Advantage plans. These are Medicare-approved plans — Medicare is indeed a government program — and we help you find the best plan options in your area at no cost to you.',
      'The government doesn\'t give out free stuff. This is an insurance plan.',
    ],
    correct: 2,
    explanation: 'Bridge the gap between their expectation and reality by connecting government Medicare to Medicare Advantage plans, emphasizing the plans are Medicare-approved.',
  },
  fb2: {
    question: 'Choose the best response:',
    options: [
      'I understand the confusion. The benefits you heard about are actually available through Medicare, which is a government program. We help connect you with Medicare Advantage plans that include those extra benefits — dental, vision, OTC allowances — often at no additional premium to you.',
      'No, this has nothing to do with Social Security.',
      'It is related to Social Security in a way. Let me explain.',
      'Would you like me to transfer you to Social Security instead?',
    ],
    correct: 0,
    explanation: 'Connect the dots between their expectations and Medicare, validate the government connection, and pivot to specific benefits.',
  },
  fb3: {
    question: 'What\'s the best response?',
    options: [
      'Social Security and Medicare are related but different.',
      'I can see why that\'s confusing. Here\'s the connection: Medicare is a government program — just like Social Security — and the extra benefits you heard about are available through Medicare Advantage plans. I\'m a licensed agent who helps you find the best Medicare plan in your area, at no cost to you. It\'s all connected to your government benefits.',
      'It\'s not Social Security benefits. It\'s Medicare.',
      'Let me transfer you to someone who can explain it better.',
    ],
    correct: 1,
    explanation: 'Connect Medicare to Social Security as familiar government programs, validate their confusion, and clearly explain the relationship.',
  },
  // RWB Card
  fb4: {
    question: 'How do you handle this trust concern?',
    options: [
      'I totally understand your caution, and I appreciate that. I won\'t ask for your Medicare number right now. I\'m a licensed agent, and everything we discuss is protected. Let me first just review what plan options are available in your area — no commitment required.',
      'I need that number to look up your plan options.',
      'Fine, we can skip that part. What\'s your zip code?',
      'Everyone gives us their card number. It\'s totally safe.',
    ],
    correct: 0,
    explanation: 'Validate their caution, emphasize you\'re licensed, remove pressure by not requiring the number immediately, and redirect to a low-commitment next step.',
  },
  fb5: {
    question: 'How should you respond to this family-influenced concern?',
    options: [
      'Your daughter is giving you good advice to be careful. I\'m a licensed and certified agent, and I won\'t need your Medicare number until you\'ve decided you want to enroll. Right now, I just want to review what benefits are available in your area.',
      'We\'re a legitimate company. Your daughter doesn\'t understand how this works.',
      'I promise we won\'t do anything bad with it.',
      'That\'s fine, we can\'t help you without it though.',
    ],
    correct: 0,
    explanation: 'Validate the family member\'s advice, establish your credentials, and defer the card request to reduce pressure.',
  },
  fb6: {
    question: 'What\'s the best way to address this identity theft concern?',
    options: [
      'I completely understand — protecting your identity is important. I\'m a licensed agent with (company name), and this call is recorded for your protection. I don\'t need your Medicare number to review plan options. We can discuss benefits first, and you\'ll only share information if you choose to move forward.',
      'We would never steal your identity. We\'re a real company.',
      'That\'s a fair concern. Just give me your zip code instead.',
      'I\'m required by law to keep your information safe, so you have nothing to worry about.',
    ],
    correct: 0,
    explanation: 'Acknowledge the concern seriously, reference the call recording as protection, and remove the pressure to share sensitive information.',
  },
  // SEP
  fb7: {
    question: 'How should you address this enrollment period concern?',
    options: [
      'You\'re right, you\'ll have to wait until the Annual Enrollment Period.',
      'Actually, there are Special Enrollment Periods that may apply to you. If you\'ve had certain changes — like moving, losing coverage, or qualifying for Extra Help — you may be eligible to enroll right now. Let me ask a few questions to see if you qualify.',
      'Don\'t worry about enrollment periods, we can get you signed up anytime.',
      'When does your current plan end? That\'s when we can make changes.',
    ],
    correct: 1,
    explanation: 'Educate about SEPs without making promises. Ask qualifying questions to determine if they have a valid enrollment opportunity.',
  },
  fb8: {
    question: 'What\'s the best response for a new Medicare beneficiary?',
    options: [
      'Yes! Since you recently turned 65, you\'re in your Initial Enrollment Period. This is actually the best time to look at your options. You have a 7-month window around your 65th birthday to choose a Medicare Advantage plan. Let me help you understand what\'s available in your area.',
      'You need to sign up for Original Medicare first before we can talk.',
      'I\'m not sure about the age requirements. Let me check.',
      'Call Medicare.gov to find out if you\'re eligible.',
    ],
    correct: 0,
    explanation: 'Confirm their eligibility enthusiastically, explain the IEP window, and position yourself as helpful during this important decision period.',
  },
  // No Value
  fb9: {
    question: 'Choose the best response:',
    options: [
      'This isn\'t life insurance or supplemental — this is a Medicare Advantage plan. It\'s different from what you have now.',
      'Great that you have coverage! Medicare Advantage is different from life or supplemental insurance — it\'s your primary Medicare coverage that can include extra benefits like dental, vision, and prescription drugs, often at no additional premium.',
      'You need this too though, it\'s important.',
      'That\'s fine, I\'ll just mark you down as not interested.',
    ],
    correct: 1,
    explanation: 'Validate their existing coverage, then clearly differentiate Medicare Advantage from other insurance types while highlighting unique benefits.',
  },
  fb10: {
    question: 'How should you respond to this client?',
    options: [
      'I understand — many of our callers say the same thing! What we actually offer are Medicare Advantage plans that can include grocery and OTC benefits. Since you already have insurance, I can see if there\'s a plan with even more benefits at no extra cost.',
      'That\'s not what this call is about. Let me explain what Medicare Advantage is.',
      'If you already have insurance then I can\'t help you. Have a nice day.',
      'The groceries program is separate. Let me transfer you to that department.',
    ],
    correct: 0,
    explanation: 'Acknowledge their expectation, validate it, then bridge to what you actually offer while highlighting potential additional benefits.',
  },
  fb11: {
    question: 'What\'s the best approach here?',
    options: [
      'I\'m sorry you feel that way. Let me just quickly explain what we offer.',
      'I understand this may not be what you expected when you called. I apologize for any frustration. I\'m here to help, and if you give me just 60 seconds, I can explain exactly what benefits may be available to you at no cost. If it\'s not for you, no problem at all.',
      'There\'s no need for that kind of language.',
      'Okay, have a nice day.',
    ],
    correct: 1,
    explanation: 'De-escalate with empathy, acknowledge their frustration, make a small time-bound ask, and give them an easy out to reduce pressure.',
  },
  fb12: {
    question: 'Select the best response:',
    options: [
      'Well, this is about changing your plan to get more benefits.',
      'That\'s exactly what I\'m here to help with! Many Medicare Advantage plans include extra benefits like dental, vision, hearing, and over-the-counter allowances — and switching may not cost you anything additional. Let me see what\'s available in your area.',
      'You can\'t get extra benefits without changing your plan.',
      'I understand. Have a great day then.',
    ],
    correct: 1,
    explanation: 'Reframe "changing plans" as "getting more benefits" — align with what they want rather than contradicting them.',
  },
}

const CLIENT_NAMES = [
  'Margaret Johnson', 'Robert Williams', 'Dorothy Smith', 'James Brown',
  'Helen Davis', 'Thomas Wilson', 'Patricia Moore', 'Charles Taylor',
  'Barbara Anderson', 'William Jackson', 'Nancy Martin', 'Richard Thompson',
]

const DIFFICULTY_LABELS = ['', 'Warm-up', 'Standard', 'Tough', 'Brutal']
const DIFFICULTY_COLORS = ['', 'var(--success)', 'var(--blue)', 'var(--warn)', 'var(--error)']
const BASE_WPM = 160

/* ── Objection count per difficulty ────────────────────────────── */
function objectionCountForLevel(level) {
  if (level === 1) return 1
  if (level === 2) return 2
  if (level === 3) return 3 + Math.round(Math.random())  // 3-4
  return 5 + Math.round(Math.random() * 2)               // 5-7
}

/* ── Pick random interrupt positions within the script ─────────── */
function pickInterruptPositions(totalWords, count, level) {
  const positions = []
  if (count === 0) return positions

  // For level 1: only in step 2 (roughly second half)
  const minStart = level === 1 ? Math.floor(totalWords * 0.45) : Math.floor(totalWords * 0.1)
  const maxEnd = Math.floor(totalWords * 0.9)
  const range = maxEnd - minStart

  if (count === 1) {
    positions.push(minStart + Math.floor(range * (0.3 + Math.random() * 0.4)))
    return positions
  }

  // Spread evenly with some jitter
  const spacing = range / (count + 1)
  for (let i = 1; i <= count; i++) {
    const base = minStart + Math.floor(spacing * i)
    const jitter = Math.floor((Math.random() - 0.5) * spacing * 0.4)
    positions.push(Math.max(minStart + 5, Math.min(maxEnd - 5, base + jitter)))
  }
  return positions.sort((a, b) => a - b)
}

/* ── Tokenize script into words with metadata ──────────────────── */
function tokenizeBlocks(blocks) {
  const tokens = [] // { word, blockIdx, isPlaceholder, isFirst, step, label }
  blocks.forEach((block, bIdx) => {
    // Split into words preserving whitespace intention
    const words = block.text.split(/\s+/).filter(Boolean)
    let insidePlaceholder = false
    let placeholderParts = []

    words.forEach((w, wIdx) => {
      // Handle placeholders like (Client Name)
      if (w.startsWith('(') && !w.endsWith(')')) {
        insidePlaceholder = true
        placeholderParts = [w]
        return
      }
      if (insidePlaceholder) {
        placeholderParts.push(w)
        if (w.endsWith(')')) {
          insidePlaceholder = false
          tokens.push({
            word: placeholderParts.join(' '),
            blockIdx: bIdx,
            isPlaceholder: true,
            isFirst: tokens.length === 0 || tokens[tokens.length - 1].blockIdx !== bIdx,
            step: block.step,
            label: block.label,
          })
          placeholderParts = []
        }
        return
      }

      // Check for single-word placeholders like (#)
      const isPlaceholder = w.startsWith('(') && w.endsWith(')')

      tokens.push({
        word: w,
        blockIdx: bIdx,
        isPlaceholder,
        isFirst: wIdx === 0,
        step: block.step,
        label: block.label,
      })
    })
  })
  return tokens
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function labelStage(s) {
  return { intro_soa: 'Intro / SOA', qualifying: 'Qualifying', presenting: 'Presenting', closing: 'Closing' }[s] || s
}

/* ── Shuffle array ─────────────────────────────────────────────── */
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ══════════════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════════════ */
export default function PracticeSession() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const stage = params.get('stage') || 'intro_soa'
  const sessionType = params.get('type') || 'multiple_choice'
  const difficulty = parseInt(params.get('difficulty') || '2', 10)
  const isReviewMode = params.get('mode') === 'review'

  /* ── Core state ────────────────────────────────────────────── */
  const [loading, setLoading] = useState(true)
  const [objections, setObjections] = useState([])
  const [interruptPositions, setInterruptPositions] = useState([])
  const [currentObjIdx, setCurrentObjIdx] = useState(0)

  // Teleprompter
  const tokens = useMemo(() => tokenizeBlocks(SCRIPT_BLOCKS), [])
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [paused, setPaused] = useState(false)
  const [speedMultiplier, setSpeedMultiplier] = useState(1)
  const [interrupted, setInterrupted] = useState(false)

  // Objection interaction
  const [phase, setPhase] = useState('loading') // loading | teleprompter | objection | responding | feedback | summary
  const [selected, setSelected] = useState(null)
  const [text, setText] = useState('')
  const [showFeedback, setShowFeedback] = useState(null)

  // Session tracking
  const [responses, setResponses] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [savingFinal, setSavingFinal] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(Date.now())
  const itemStartedAt = useRef(Date.now())
  const teleprompterRef = useRef(null)
  const activeWordRef = useRef(null)

  /* ── Timer ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (phase === 'summary') return
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [phase])

  /* ── Load objections ───────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false
    async function load() {
      let list = []

      if (isReviewMode) {
        // Review mode: fetch due objections from review_queue
        try {
          const dueRecords = await fetchDueReviews(pb, user.id)
          if (dueRecords.length > 0) {
            const objIds = dueRecords.map((r) => r.objection_id)
            const filter = objIds.map((id) => `id = "${id}"`).join(' || ')
            list = await pb.collection('objections').getFullList({ filter })
            list = shuffle(list)
          }
        } catch (e) {
          console.error('Failed to load review queue', e)
        }
        if (list.length === 0) {
          // No due reviews — fall back to normal mode
          list = shuffle(FALLBACK_OBJECTIONS.filter((o) => o.difficulty <= difficulty))
        }
      } else {
        try {
          const filterParts = ['active = true']
          if (stage) filterParts.push(`call_stage = "${stage}"`)
          const baseFilter = filterParts.join(' && ')

          const fetched = await pb.collection('objections').getFullList({
            filter: `${baseFilter} && difficulty <= ${difficulty}`,
            sort: '@random',
          })
          list = fetched
        } catch (e) {
          console.error('Failed to fetch objections, using fallbacks', e)
        }

        if (list.length === 0) {
          list = shuffle(FALLBACK_OBJECTIONS.filter((o) => o.difficulty <= difficulty))
        }
      }

      const count = isReviewMode ? list.length : objectionCountForLevel(difficulty)
      // Ensure we have enough — repeat if needed
      while (list.length < count) {
        list = [...list, ...shuffle(list)]
      }
      if (!isReviewMode) list = list.slice(0, count)

      if (cancelled) return

      // For each objection, load MC data if needed
      const built = await Promise.all(
        list.map(async (o) => {
          let mode = sessionType === 'mixed'
            ? Math.random() < 0.5 ? 'multiple_choice' : 'free_text'
            : sessionType
          let mcData = null

          if (mode === 'multiple_choice') {
            // Try PocketBase quiz_questions first
            if (!o.id.startsWith('fb')) {
              try {
                const qs = await pb.collection('quiz_questions').getFullList({ filter: `objection_id = "${o.id}"` })
                if (qs.length > 0) {
                  const q = qs[0]
                  let options = q.options
                  if (typeof options === 'string') {
                    try { options = JSON.parse(options) } catch { options = [] }
                  }
                  mcData = { question: q.question_text, options: options || [], correct: q.correct_index, explanation: q.explanation }
                }
              } catch { /* fall through */ }
            }
            // Fallback to hardcoded MC
            if (!mcData && FALLBACK_MC[o.id]) {
              mcData = FALLBACK_MC[o.id]
            }
            // If still no MC data, switch to free text
            if (!mcData) mode = 'free_text'
          }

          return { objection: o, mode, mcData, clientName: CLIENT_NAMES[Math.floor(Math.random() * CLIENT_NAMES.length)] }
        }),
      )

      if (cancelled) return

      const positions = pickInterruptPositions(tokens.length, built.length, difficulty)
      setObjections(built)
      setInterruptPositions(positions)

      // Create session in PocketBase
      try {
        const created = await pb.collection('practice_sessions').create({
          agent_id: user.id,
          session_type: sessionType,
          difficulty_level: difficulty,
          call_stage: stage,
          total_score: 0,
          max_score: 0,
          passed: false,
        })
        if (!cancelled) setSessionId(created.id)
      } catch (e) {
        console.error('Failed to create session', e)
      }

      if (!cancelled) {
        setLoading(false)
        setPhase('teleprompter')
        startedAt.current = Date.now()
      }
    }
    if (user?.id) load()
    return () => { cancelled = true }
  }, [user?.id, stage, sessionType, difficulty, tokens.length, isReviewMode])

  /* ── Teleprompter word advance ─────────────────────────────── */
  useEffect(() => {
    if (phase !== 'teleprompter' || paused) return

    const msPerWord = (60 / BASE_WPM / speedMultiplier) * 1000

    const timer = setInterval(() => {
      setHighlightIdx((prev) => {
        const next = prev + 1
        if (next >= tokens.length) {
          // Script finished
          clearInterval(timer)
          if (currentObjIdx >= objections.length) {
            // All objections done, finish
            setTimeout(() => finalize(), 300)
          }
          return tokens.length - 1
        }
        // Check if we should interrupt
        if (interruptPositions.includes(next) && currentObjIdx < objections.length) {
          clearInterval(timer)
          setTimeout(() => {
            setInterrupted(true)
            setPhase('objection')
            itemStartedAt.current = Date.now()
          }, 200)
          return next
        }
        return next
      })
    }, msPerWord)

    return () => clearInterval(timer)
  }, [phase, paused, speedMultiplier, interruptPositions, currentObjIdx, objections.length, tokens.length])

  /* ── Auto-scroll to active word ────────────────────────────── */
  useEffect(() => {
    if (activeWordRef.current && teleprompterRef.current) {
      const container = teleprompterRef.current
      const word = activeWordRef.current
      const containerRect = container.getBoundingClientRect()
      const wordRect = word.getBoundingClientRect()
      const offset = wordRect.top - containerRect.top - containerRect.height / 2 + wordRect.height / 2
      if (Math.abs(offset) > 40) {
        container.scrollBy({ top: offset, behavior: 'smooth' })
      }
    }
  }, [highlightIdx])

  /* ── Submit response ───────────────────────────────────────── */
  const submitCurrent = useCallback(() => {
    const obj = objections[currentObjIdx]
    if (!obj) return
    const sec = Math.round((Date.now() - itemStartedAt.current) / 1000)
    let grade
    let payload = {
      session_id: sessionId,
      objection_id: obj.objection.id?.startsWith('fb') ? null : obj.objection.id,
      response_type: obj.mode,
      time_seconds: sec,
    }

    if (obj.mode === 'multiple_choice' && obj.mcData) {
      grade = gradeMultipleChoice(selected, obj.mcData.correct)
      payload = { ...payload, selected_option: selected, score: grade.score, max_score: grade.max, feedback: grade.feedback, response_text: '' }
    } else {
      grade = gradeFreeText(text, obj.objection.category)
      payload = { ...payload, response_text: text, selected_option: null, score: grade.score, max_score: grade.max, feedback: grade.feedback }
    }

    setResponses((r) => [...r, { ...payload, _grade: grade, _objection: obj }])
    setShowFeedback({ ...grade, mode: obj.mode, mcData: obj.mcData })
    setPhase('feedback')

    if (sessionId && payload.objection_id) {
      pb.collection('session_responses').create(payload).catch((e) => console.error('Failed to save response', e))
    }

    // Update spaced repetition queue
    const objId = obj.objection.id?.startsWith('fb') ? null : obj.objection.id
    if (objId) {
      const pct = grade.max > 0 ? Math.round((grade.score / grade.max) * 100) : 0
      updateReviewQueue(pb, user.id, objId, pct)
    }
  }, [objections, currentObjIdx, sessionId, selected, text, user?.id])

  /* ── Continue after feedback ───────────────────────────────── */
  const continueAfterFeedback = useCallback(() => {
    setShowFeedback(null)
    setSelected(null)
    setText('')
    setInterrupted(false)
    const nextObj = currentObjIdx + 1
    setCurrentObjIdx(nextObj)

    if (highlightIdx >= tokens.length - 1 && nextObj >= objections.length) {
      finalize()
    } else {
      setPhase('teleprompter')
    }
  }, [currentObjIdx, highlightIdx, tokens.length, objections.length])

  /* ── Finalize session ──────────────────────────────────────── */
  async function finalize() {
    setSavingFinal(true)
    try {
      const total = responses.reduce((a, r) => a + (r.score || 0), 0) +
        (showFeedback ? (showFeedback.score || 0) : 0)
      const max = responses.reduce((a, r) => a + (r.max_score || 0), 0) +
        (showFeedback ? (showFeedback.max || 0) : 0)
      const passed = max > 0 ? (total / max) * 100 >= 75 : false
      if (sessionId) {
        await pb.collection('practice_sessions').update(sessionId, { total_score: total, max_score: max, passed })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSavingFinal(false)
      setPhase('summary')
    }
  }

  /* ── Computed values ───────────────────────────────────────── */
  const summary = useMemo(() => {
    const total = responses.reduce((a, r) => a + (r.score || 0), 0)
    const max = responses.reduce((a, r) => a + (r.max_score || 0), 0)
    const percent = max > 0 ? Math.round((total / max) * 100) : 0
    const gpa = ((percent / 100) * 4).toFixed(1)
    const xp = responses.reduce((a, r) => a + 10 + (r.max_score > 0 && r.score === r.max_score ? 5 : 0), 0)
    return { total, max, percent, gpa, xp, passed: percent >= 75 }
  }, [responses])

  const runningScore = useMemo(() => responses.reduce((a, r) => a + (r.score || 0), 0), [responses])
  const runningMax = useMemo(() => responses.reduce((a, r) => a + (r.max_score || 0), 0), [responses])

  const currentObj = objections[currentObjIdx]

  /* ── Loading state ─────────────────────────────────────────── */
  if (loading) {
    return <div className="tp-shell"><div className="loader">Building your session…</div></div>
  }

  /* ── Summary screen ────────────────────────────────────────── */
  if (phase === 'summary') {
    return (
      <div className="tp-shell">
        <motion.div className="tp-summary" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <div className="summary-head">
            <CheckCircle size={48} weight="regular" color={summary.passed ? 'var(--success)' : 'var(--warn)'} />
            <h2>Drill Complete</h2>
            <p>{summary.passed ? 'Nice work — your streak lives on.' : 'Keep at it — every rep sharpens the pitch.'}</p>
          </div>

          <div className="stats-strip">
            <div className="stat">
              <div className="label"><span className="dot green" />Score</div>
              <div className="value">{summary.percent}%</div>
              <div className="meta">{summary.total}/{summary.max} pts</div>
            </div>
            <div className="stat">
              <div className="label"><span className="dot blue" />GPA</div>
              <div className="value">{summary.gpa}</div>
              <div className="meta">out of 4.0</div>
            </div>
            <div className="stat">
              <div className="label"><span className="dot green" />XP earned</div>
              <div className="value">+{summary.xp}</div>
              <div className="meta">accuracy bonuses</div>
            </div>
            <div className="stat">
              <div className="label"><span className="dot amber" />Time</div>
              <div className="value">{formatTime(elapsed)}</div>
              <div className="meta">total elapsed</div>
            </div>
          </div>

          <h3 style={{ marginTop: 28 }}>Per-objection breakdown</h3>
          <div className="activity">
            {responses.map((r, i) => {
              const pct = r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0
              const t = pct >= 85 ? 'success' : pct >= 50 ? 'warn' : 'error'
              return (
                <div key={i} className="tp-breakdown-row">
                  <div className="tp-breakdown-score-ring" data-tone={t}>{pct}</div>
                  <div className="tp-breakdown-content">
                    <div className="tp-breakdown-objection">"{r._objection?.objection?.text?.slice(0, 80)}{r._objection?.objection?.text?.length > 80 ? '…' : ''}"</div>
                    <div className="tp-breakdown-feedback">{r.feedback}</div>
                  </div>
                  <div className="tp-breakdown-pts">{r.score}/{r.max_score}</div>
                </div>
              )
            })}
          </div>

          <div className="row" style={{ marginTop: 24, gap: 12 }}>
            <button className="primary lg" onClick={() => navigate('/practice')}>Back to Practice</button>
            <button onClick={() => navigate('/progress')}>View progress</button>
          </div>
        </motion.div>
      </div>
    )
  }

  /* ── Main teleprompter UI ──────────────────────────────────── */

  // Build rendered blocks
  let lastBlockIdx = -1
  let lastStep = -1
  const renderedBlocks = []

  tokens.forEach((token, i) => {
    if (token.blockIdx !== lastBlockIdx) {
      // Start new block
      const showStepHeader = token.step !== lastStep
      lastStep = token.step
      lastBlockIdx = token.blockIdx
      renderedBlocks.push({
        blockIdx: token.blockIdx,
        step: token.step,
        label: token.label,
        showStepHeader,
        words: [],
      })
    }
    const block = renderedBlocks[renderedBlocks.length - 1]
    let cls = 'tp-word'
    if (i < highlightIdx) cls += ' tp-word-past'
    else if (i === highlightIdx) cls += ' tp-word-active'
    else cls += ' tp-word-upcoming'
    if (token.isPlaceholder) cls += ' tp-word-placeholder'

    block.words.push({ token, index: i, cls })
  })

  return (
    <div className="tp-shell">
      {/* ── Top bar ──────────────────────────────────────────── */}
      <div className="tp-topbar">
        <Link to="/practice" className="tp-exit-btn">
          <ArrowLeft size={14} weight="bold" /> Exit
        </Link>
        <div className="tp-title">
          {labelStage(stage)} Drill
          <span className="tp-level-badge" style={{ background: DIFFICULTY_COLORS[difficulty] }}>
            Lvl {difficulty}
          </span>
        </div>
        <div className="tp-progress-dots">
          {objections.map((_, i) => (
            <div
              key={i}
              className={`tp-dot ${i < currentObjIdx ? 'done' : i === currentObjIdx && (phase === 'objection' || phase === 'responding' || phase === 'feedback') ? 'current' : ''}`}
            />
          ))}
        </div>
        <div className="tp-topbar-meta">
          <Timer size={14} weight="regular" />
          <span>{formatTime(elapsed)}</span>
        </div>
        <div className="tp-topbar-meta tp-score-meta">
          <span>{runningScore}{runningMax > 0 ? `/${runningMax}` : ''} pts</span>
        </div>
      </div>

      {/* ── Teleprompter body ────────────────────────────────── */}
      <div className="tp-body" ref={teleprompterRef}>
        {renderedBlocks.map((block, bIdx) => (
          <div key={bIdx} className="tp-block">
            {block.showStepHeader && (
              <div className="tp-step-header">
                <span className="tp-step-num">Step {block.step}</span>
                <span className="tp-step-line" />
              </div>
            )}
            <div className="tp-block-label">{block.label}</div>
            <div className="tp-text">
              {block.words.map(({ token, index, cls }) => (
                <span
                  key={index}
                  className={cls}
                  ref={index === highlightIdx ? activeWordRef : null}
                >
                  {token.word}{' '}
                </span>
              ))}
            </div>
          </div>
        ))}

        {/* Script finished indicator */}
        {highlightIdx >= tokens.length - 1 && phase === 'teleprompter' && currentObjIdx >= objections.length && (
          <motion.div
            className="tp-script-done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <CheckCircle size={20} weight="regular" color="var(--success)" />
            Script complete
          </motion.div>
        )}
      </div>

      {/* ── Objection overlay ────────────────────────────────── */}
      <AnimatePresence>
        {(phase === 'objection' || phase === 'responding' || phase === 'feedback') && currentObj && (
          <motion.div
            className="tp-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <motion.div
              className="tp-objection-panel"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              {phase !== 'feedback' ? (
                <>
                  {/* Interrupt badge */}
                  <motion.div
                    className="tp-interrupt-badge"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Warning size={14} weight="bold" /> CLIENT INTERRUPTS
                  </motion.div>

                  {/* Client info */}
                  <div className="tp-client-row">
                    <UserCircle size={36} weight="regular" color="var(--text-muted)" />
                    <div>
                      <div className="tp-client-name">{currentObj.clientName}</div>
                      <div className="tp-client-context">Medicare lead • Inbound call</div>
                    </div>
                  </div>

                  {/* Objection text */}
                  <div className="tp-objection-text">
                    <span className="tp-quote-mark">"</span>
                    {currentObj.objection.text}
                    <span className="tp-quote-mark">"</span>
                  </div>

                  {/* Tags */}
                  <div className="tp-objection-tags">
                    {currentObj.objection.category && (
                      <span className="badge info">{currentObj.objection.category}</span>
                    )}
                    <span className="badge" style={{ background: DIFFICULTY_COLORS[currentObj.objection.difficulty] + '22', color: DIFFICULTY_COLORS[currentObj.objection.difficulty], border: `1px solid ${DIFFICULTY_COLORS[currentObj.objection.difficulty]}44` }}>
                      {DIFFICULTY_LABELS[currentObj.objection.difficulty] || `Level ${currentObj.objection.difficulty}`}
                    </span>
                  </div>

                  {/* Response area */}
                  {phase === 'objection' && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <button
                        className="primary lg"
                        onClick={() => setPhase('responding')}
                        style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                      >
                        Respond <ArrowRight size={14} weight="bold" />
                      </button>
                    </motion.div>
                  )}

                  {phase === 'responding' && currentObj.mode === 'multiple_choice' && currentObj.mcData && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                      <h3 style={{ marginBottom: 12, fontSize: 14 }}>{currentObj.mcData.question}</h3>
                      <div className="mc-options">
                        {currentObj.mcData.options.map((opt, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`mc-option ${selected === i ? 'selected' : ''}`}
                            onClick={() => setSelected(i)}
                          >
                            <span className="letter">{String.fromCharCode(65 + i)}</span>
                            <span className="opt-text">{opt}</span>
                          </button>
                        ))}
                      </div>
                      <button
                        className="cta lg"
                        disabled={selected === null}
                        onClick={submitCurrent}
                        style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                      >
                        Submit answer
                      </button>
                    </motion.div>
                  )}

                  {phase === 'responding' && currentObj.mode === 'free_text' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                      <h3 style={{ marginBottom: 12, fontSize: 14 }}>Your live rebuttal</h3>
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Type your response…"
                        autoFocus
                        style={{ minHeight: 100 }}
                      />
                      <button
                        className="cta lg"
                        disabled={text.trim().length < 10}
                        onClick={submitCurrent}
                        style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                      >
                        Submit response
                      </button>
                    </motion.div>
                  )}
                </>
              ) : (
                /* ── Feedback panel ──────────────────────────── */
                <motion.div
                  className="tp-feedback"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  {(() => {
                    const pct = showFeedback?.percent ?? 0
                    const tone = pct >= 85 ? 'green' : pct >= 50 ? 'amber' : 'red'
                    const toneColor = pct >= 85 ? 'var(--success)' : pct >= 50 ? 'var(--warn)' : 'var(--error)'
                    return (
                      <>
                        <div className="tp-feedback-score-row">
                          <div className="tp-score-circle" style={{ borderColor: toneColor, color: toneColor }}>
                            {pct}
                          </div>
                          <div>
                            <div className="tp-feedback-label" style={{ color: toneColor }}>
                              {pct >= 85 ? 'Strong response' : pct >= 50 ? 'Decent — room to grow' : 'Needs work'}
                            </div>
                            <div className="tp-feedback-sub">{showFeedback?.score}/{showFeedback?.max} points</div>
                          </div>
                        </div>

                        <div className="tp-feedback-section">
                          <div className="tp-feedback-section-label">Feedback</div>
                          <div className="tp-feedback-section-body">{showFeedback?.feedback}</div>
                        </div>

                        {showFeedback?.mode === 'multiple_choice' && showFeedback?.mcData?.explanation && (
                          <div className="tp-feedback-section">
                            <div className="tp-feedback-section-label">Recommended response</div>
                            <div className="tp-feedback-section-body">{showFeedback.mcData.explanation}</div>
                          </div>
                        )}

                        {showFeedback?.mode === 'multiple_choice' && currentObj?.mcData && (
                          <div className="tp-feedback-section">
                            <div className="tp-feedback-section-label">Correct answer</div>
                            <div className="tp-feedback-section-body" style={{ color: 'var(--success)' }}>
                              {String.fromCharCode(65 + currentObj.mcData.correct)}. {currentObj.mcData.options[currentObj.mcData.correct]}
                            </div>
                          </div>
                        )}

                        <button
                          className="primary lg"
                          onClick={continueAfterFeedback}
                          disabled={savingFinal}
                          style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}
                        >
                          Continue <ArrowRight size={14} weight="bold" />
                        </button>
                      </>
                    )
                  })()}
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom bar ───────────────────────────────────────── */}
      <div className="tp-bottombar">
        <div className="tp-speed-controls">
          <Speedometer size={14} weight="regular" />
          {[0.5, 1, 1.5, 2].map((s) => (
            <button
              key={s}
              className={`tp-speed-btn ${speedMultiplier === s ? 'active' : ''}`}
              onClick={() => setSpeedMultiplier(s)}
            >
              {s}x
            </button>
          ))}
        </div>
        <div className="tp-bottom-center">
          <span className="tp-mode-indicator">
            {sessionType === 'multiple_choice' ? 'MC' : sessionType === 'free_text' ? 'Free Text' : 'Mixed'}
          </span>
        </div>
        <div className="tp-bottom-actions">
          <button
            className="tp-action-btn-lg"
            onClick={() => setPaused((p) => !p)}
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? <Play size={20} weight="fill" /> : <Pause size={20} weight="fill" />}
            <span className="tp-action-label">{paused ? 'Play' : 'Pause'}</span>
          </button>
          <button
            className="tp-action-btn-lg"
            onClick={() => {
              // Skip to next interrupt or end
              const nextInterrupt = interruptPositions.find((p) => p > highlightIdx)
              if (nextInterrupt != null && currentObjIdx < objections.length) {
                setHighlightIdx(nextInterrupt)
                setInterrupted(true)
                setPhase('objection')
                itemStartedAt.current = Date.now()
              } else {
                setHighlightIdx(tokens.length - 1)
                if (currentObjIdx >= objections.length) {
                  finalize()
                }
              }
            }}
            title="Skip"
          >
            <SkipForward size={20} weight="fill" />
            <span className="tp-action-label">Skip</span>
          </button>
        </div>
      </div>
    </div>
  )
}
