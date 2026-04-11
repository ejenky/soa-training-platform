import PocketBase from 'pocketbase'

// Use Netlify proxy in production, direct connection in dev
const baseUrl = import.meta.env.DEV
  ? 'http://159.65.184.35:8090'
  : '/pb'

export const pb = new PocketBase(baseUrl)

pb.autoCancellation(false)

export function currentUser() {
  return pb.authStore.record || pb.authStore.model || null
}

export function isAuthenticated() {
  return pb.authStore.isValid
}

export async function login(email, password) {
  return await pb.collection('users').authWithPassword(email, password)
}

export function logout() {
  pb.authStore.clear()
}
