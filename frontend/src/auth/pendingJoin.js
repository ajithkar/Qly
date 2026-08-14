/**
 * Carries a "join this queue" intent across the Google OAuth redirect.
 *
 * Joining a queue requires a signed-in end user, but discovery/browsing does
 * not. Rather than lose the customer's selection when they get bounced to
 * Google and back, the intent is stashed here and replayed once
 * GoogleCallback has a session.
 */
import { auth } from '@/api/endpoints';

export const PENDING_JOIN_KEY = 'qly_pending_join';

export async function signInWithGoogle(toast) {
  try {
    const { authorization_url: url } = await auth.googleLoginUrl();
    window.location.href = url;
  } catch (error) {
    toast.error(error.message ?? 'Google sign-in is not available right now.');
  }
}
