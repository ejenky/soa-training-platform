/*
 * Spaced Repetition Engine (SM-2 simplified)
 *
 * PocketBase collection "review_queue" must be created manually in the admin UI.
 * Required fields:
 *   - agent_id      (text, required)
 *   - objection_id  (text, required)
 *   - next_review   (date, required)    — when this objection should appear again
 *   - interval      (number, required)  — current interval in days, starts at 1
 *   - ease_factor   (number, required)  — multiplier, starts at 2.5
 *   - repetitions   (number, required)  — how many times reviewed
 *   - last_score    (number)            — score from most recent attempt (0-100)
 *   - last_reviewed (date)              — when they last saw this objection
 *
 * API Rules:
 *   - List/Search: agent_id = @request.auth.id
 *   - Create: @request.auth.id != ""
 *   - Update: agent_id = @request.auth.id
 *   - Delete: agent_id = @request.auth.id
 */

/**
 * Calculate the next review parameters after an attempt.
 * @param {number} score        — percentage score 0-100
 * @param {number} interval     — current interval in days
 * @param {number} easeFactor   — current ease factor (min 1.3)
 * @param {number} repetitions  — current repetition count
 * @returns {{ interval, ease_factor, repetitions, next_review }}
 */
export function calculateNextReview(score, interval, easeFactor, repetitions) {
  let newInterval
  let newEase = easeFactor
  let newReps = repetitions

  if (score >= 80) {
    // Good — increase interval, slight ease boost
    newReps = repetitions + 1
    newInterval = Math.round(interval * easeFactor)
    newEase = easeFactor + 0.1
  } else if (score >= 60) {
    // OK — keep same interval, slight ease decrease
    newReps = repetitions + 1
    newInterval = Math.max(1, interval)
    newEase = easeFactor - 0.1
  } else {
    // Bad — reset to 1 day, significant ease decrease
    newReps = 0
    newInterval = 1
    newEase = easeFactor - 0.2
  }

  // Clamp ease factor
  newEase = Math.max(1.3, Math.round(newEase * 100) / 100)

  // Ensure interval is at least 1
  newInterval = Math.max(1, newInterval)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const nextReview = new Date(today)
  nextReview.setDate(nextReview.getDate() + newInterval)

  return {
    interval: newInterval,
    ease_factor: newEase,
    repetitions: newReps,
    next_review: nextReview.toISOString(),
  }
}

/**
 * Check if a review_queue record is due for review (next_review <= today end-of-day).
 * @param {object} record — review_queue record with next_review field
 * @returns {boolean}
 */
export function isDueForReview(record) {
  if (!record?.next_review) return false
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return new Date(record.next_review) <= today
}

/**
 * Create or update a review_queue record after an objection attempt.
 * Only adds to queue if the agent scored below 80 on first encounter.
 * @param {object} pb          — PocketBase instance
 * @param {string} agentId
 * @param {string} objectionId
 * @param {number} scorePercent — 0-100
 */
export async function updateReviewQueue(pb, agentId, objectionId, scorePercent) {
  if (!objectionId || !agentId) return

  try {
    // Check if a record already exists for this agent + objection
    const existing = await pb.collection('review_queue').getFullList({
      filter: `agent_id = "${agentId}" && objection_id = "${objectionId}"`,
    })

    if (existing.length > 0) {
      // Update existing record
      const rec = existing[0]
      const next = calculateNextReview(
        scorePercent,
        rec.interval || 1,
        rec.ease_factor || 2.5,
        rec.repetitions || 0,
      )
      await pb.collection('review_queue').update(rec.id, {
        ...next,
        last_score: scorePercent,
        last_reviewed: new Date().toISOString(),
      })
    } else if (scorePercent < 80) {
      // First encounter and they struggled — add to queue
      const next = calculateNextReview(scorePercent, 1, 2.5, 0)
      await pb.collection('review_queue').create({
        agent_id: agentId,
        objection_id: objectionId,
        ...next,
        last_score: scorePercent,
        last_reviewed: new Date().toISOString(),
      })
    }
    // If score >= 80 and no existing record, don't add — they got it right
  } catch (e) {
    // review_queue collection may not exist yet — fail silently
    console.warn('Spaced repetition update failed (review_queue collection may need to be created):', e.message)
  }
}

/**
 * Fetch all review_queue records due today for an agent.
 * @param {object} pb
 * @param {string} agentId
 * @returns {Promise<Array>}
 */
export async function fetchDueReviews(pb, agentId) {
  try {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const records = await pb.collection('review_queue').getFullList({
      filter: `agent_id = "${agentId}" && next_review <= "${today.toISOString()}"`,
      sort: 'next_review',
    })
    return records
  } catch {
    return []
  }
}

/**
 * Fetch all review_queue records for an agent (for stats).
 * @param {object} pb
 * @param {string} agentId
 * @returns {Promise<Array>}
 */
export async function fetchAllReviews(pb, agentId) {
  try {
    return await pb.collection('review_queue').getFullList({
      filter: `agent_id = "${agentId}"`,
      sort: 'next_review',
    })
  } catch {
    return []
  }
}
