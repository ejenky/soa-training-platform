import { pb } from './pb'

export const ELEVENLABS_KEY = 'sk_9e00befdda5dd8362fee194e70d4046539fbb49b017fe483'

export const ALL_VOICES = [
  { id: 't2tJr8MN6AIfbzUUE541', name: 'Earl', description: 'Confused Southern old man', gender: 'male', tone: 'confused' },
  { id: 'GECbjUfLvoVBDyhR8pWM', name: 'Betty', description: 'Sweet slow Southern grandma', gender: 'female', tone: 'sweet' },
  { id: 'T9J0wF5BgF3eZwAx4dV9', name: 'Donna', description: 'Sharp skeptical New Yorker', gender: 'female', tone: 'skeptical' },
  { id: 'h9OyU8Dh5dCWBZRcvIje', name: 'Ruth', description: 'Anxious worrier', gender: 'female', tone: 'anxious' },
  { id: '0ZFASVAMXmotWEyECymj', name: 'Linda', description: 'Stubborn Midwestern woman', gender: 'female', tone: 'stubborn' },
  { id: 'Ob9WqcxQ03W2kV4X9pPa', name: 'Patsy', description: 'Chatty Texas rambler', gender: 'female', tone: 'chatty' },
  { id: 'TsioVYhWd4Sac89W1NjX', name: 'Frank', description: 'Angry been-scammed veteran', gender: 'male', tone: 'angry' },
  { id: 'IMQsC4B6JKZIxlmoTxiA', name: 'Walter', description: 'Quiet confused gentleman', gender: 'male', tone: 'confused' },
  { id: 'fdBWqKPtgRvaHU8f6bqE', name: 'Harold', description: 'Know-it-all arguer', gender: 'male', tone: 'argumentative' },
  { id: 'BdCTAYIxmT6ptMVsY8Pa', name: 'Bobby', description: 'Laid-back doesnt care', gender: 'male', tone: 'indifferent' },
]

const DIFFICULTY_TONES = {
  1: ['sweet', 'confused', 'chatty', 'indifferent'],
  2: null, // any tone
  3: ['skeptical', 'stubborn', 'argumentative', 'anxious'],
  4: ['angry', 'skeptical', 'argumentative', 'stubborn'],
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function getRandomVoice() {
  return pickRandom(ALL_VOICES)
}

export function getVoiceByDifficulty(difficulty) {
  const tones = DIFFICULTY_TONES[difficulty]
  if (!tones) return pickRandom(ALL_VOICES)
  const matches = ALL_VOICES.filter((v) => tones.includes(v.tone))
  return matches.length > 0 ? pickRandom(matches) : pickRandom(ALL_VOICES)
}

export function getVoiceNameFromFilename(filename) {
  if (!filename) return null
  // filename format: objection_{id}_{VoiceName}.mp3
  const match = filename.match(/_([A-Za-z]+)\.mp3$/)
  return match ? match[1] : null
}

export async function generateAudio(text, voiceId) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.3,
        similarity_boost: 0.5,
        style: 0.7,
        use_speaker_boost: true,
      },
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`ElevenLabs error ${res.status}: ${err}`)
  }
  return await res.blob()
}

export async function generateObjectionAudio(objection, voiceId) {
  const voice = voiceId
    ? (ALL_VOICES.find((v) => v.id === voiceId) || { id: voiceId, name: 'Custom' })
    : getVoiceByDifficulty(objection.difficulty || 2)
  const blob = await generateAudio(objection.text, voice.id)
  const formData = new FormData()
  formData.append('audio_file', blob, `objection_${objection.id}_${voice.name}.mp3`)
  const updated = await pb.collection('objections').update(objection.id, formData)
  return updated
}

export async function bulkGenerateObjectionAudio(onProgress, includeExisting = false, defaultVoice = ALL_VOICES[0]) {
  const filter = includeExisting ? 'active = true' : 'active = true && audio_file = ""'
  const all = await pb.collection('objections').getFullList({ filter })
  const results = { success: 0, failed: 0, failures: [] }
  const voiceId = defaultVoice?.id || ALL_VOICES[0].id
  for (let i = 0; i < all.length; i++) {
    try {
      await generateObjectionAudio(all[i], voiceId)
      results.success++
    } catch (e) {
      results.failed++
      results.failures.push({ id: all[i].id, text: all[i].text?.slice(0, 60), error: e.message })
    }
    if (onProgress) onProgress(i + 1, all.length, results)
  }
  return results
}

export function getAudioUrl(record, collectionName = 'objections') {
  if (!record?.audio_file) return null
  return pb.files.getURL(record, record.audio_file)
}

export function playAudio(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    audio.addEventListener('ended', resolve)
    audio.addEventListener('error', reject)
    audio.play().catch(reject)
  })
}
