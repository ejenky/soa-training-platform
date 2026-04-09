import PocketBase from 'pocketbase'

export const pb = new PocketBase('http://159.65.184.35:8090')

// Disable autocancellation so concurrent requests don't trip each other up
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
