import { pb } from './pb'

export const ELEVENLABS_KEY = 'sk_9e00befdda5dd8362fee194e70d4046539fbb49b017fe483'

export const VOICE_MAP = {
  'Intro/SOA': { id: '5u41aNhyCU6hXOcjPPv0', name: 'Carol (Grandma)' },
  'RWB Card': { id: 'YHcCpa6SBWnKDaCPZJQR', name: 'Mora (Skeptical)' },
  'SEP': { id: 'GtvrBPZOsCHv7plFvX8i', name: 'Grandpa (Warm)' },
  'No Value': { id: 's2wvuS7SwITYg8dqsJdn', name: 'Antonio (Grumpy)' },
}

export function getVoiceForCategory(category) {
  return VOICE_MAP[category] || VOICE_MAP['Intro/SOA']
}

export function getAllVoices() {
  return Object.entries(VOICE_MAP).map(([category, voice]) => ({
    category,
    ...voice,
  }))
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
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`ElevenLabs error ${res.status}: ${err}`)
  }
  return await res.blob()
}

export async function generateObjectionAudio(objection) {
  const voice = getVoiceForCategory(objection.category)
  const blob = await generateAudio(objection.text, voice.id)
  const formData = new FormData()
  formData.append('audio_file', blob, `objection_${objection.id}.mp3`)
  const updated = await pb.collection('objections').update(objection.id, formData)
  return updated
}

export async function bulkGenerateObjectionAudio(onProgress) {
  const all = await pb.collection('objections').getFullList({
    filter: 'active = true && audio_file = ""',
    sort: '-created',
  })
  const results = { success: 0, failed: 0, failures: [] }
  for (let i = 0; i < all.length; i++) {
    try {
      await generateObjectionAudio(all[i])
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
