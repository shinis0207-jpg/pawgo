import { PlaceCategory } from "@/types";

/**
 * Phase 1 MVP scope.
 *
 * Only restaurant and cafe are surfaced in the UI right now. accommodation /
 * park / vet (+ the emergency-vet shortcut) remain implemented in code and
 * routable, but no UI entry point lists them. To bring a category back into
 * the MVP, add it here — the components below source category chips and
 * filter options from this single list.
 */
export const MVP_VISIBLE_CATEGORIES: readonly PlaceCategory[] = [
  "restaurant",
  "cafe",
] as const;

/**
 * Phase 1 emergency-vet shortcut is hidden. Toggle this back to `true` once
 * vet / emergency-vet flows re-enter scope (Phase 2+).
 */
export const MVP_SHOW_EMERGENCY_VET = false;

/**
 * Review system is fully implemented in code (reviewsApi, ReviewCard,
 * write-review button, rating row, no-reviews empty state) but not in
 * Phase 1 MVP scope. Hide it so we don't ship a "리뷰 작성" button that
 * routes to nothing and a "0.0 ★★★★★ (0개 리뷰)" line that the user
 * can't act on. Flip to `true` when Phase 3 review flow lands.
 */
export const MVP_SHOW_REVIEWS = false;

/**
 * Social login buttons (Kakao + Google) are rendered as styled UI but
 * carry no onPress handlers — i.e. they're decorative until the OAuth
 * flow is wired up. Hide them (along with the "또는" divider that only
 * makes sense above OAuth options) so the auth screen ships as
 * email-only. Flip to `true` once Kakao/Google OAuth is implemented in
 * Phase 5+ (Apple sign-in is a separate workstream).
 */
export const MVP_SHOW_SOCIAL_LOGIN = false;

/**
 * Notifications settings menu lives in the profile tab but has no
 * destination yet (no push permission flow, no preferences screen).
 * Hide it so we don't ship a tap-and-do-nothing item. Same MVP_SHOW_*
 * pattern as the rest. Flip when push notifications are wired up.
 */
export const MVP_SHOW_NOTIFICATIONS_MENU = false;

/**
 * Profile edit (pencil) button on the user card has no onPress and no
 * destination route — there's no /profile/edit screen and no PATCH
 * /auth/me endpoint yet. Hide the icon so it doesn't look interactive.
 * Flip when the edit screen + backend update endpoint land.
 */
export const MVP_SHOW_PROFILE_EDIT = false;

/**
 * Which FilterSheet sections are surfaced.
 *
 * The MFDS seed (384 Seoul places) carries verified+allowed status only —
 * indoor_allowed / outdoor_allowed / max_weight_kg are NULL across the
 * board and has_parking is false across the board. Filtering on those
 * fields would either return an empty result (parking) or be a no-op
 * (indoor/outdoor/weight, since the backend doesn't even accept those
 * query params).
 *
 * Hide them until owner_claims / admin input fill in real data, then flip
 * the relevant flag back to `true` here — no other file needs to change.
 */
export const MVP_VISIBLE_FILTERS = {
  category: true,
  radius: true,
  weight: false,
  indoor_outdoor: false,
  parking: false,
} as const;

/**
 * Email verification flow (verify screen, resend cooldown, login gate) is
 * fully implemented but disabled until a working transactional email
 * provider replaces SMTP — Railway blocks outbound SMTP ports so Gmail App
 * Password is unusable. When OFF, the backend's /auth/register returns a
 * Token immediately and authStore.register auto-logs the user in. Flip to
 * `true` once Resend (or equivalent) is wired up in
 * backend/app/services/email.py AND the backend env flips
 * EMAIL_VERIFICATION_ENABLED=true.
 *
 * Kept as a named constant for convention parity with the rest of this
 * file even though the runtime branch in app/auth/index.tsx keys off the
 * response shape (access_token present vs absent) rather than this flag.
 */
export const MVP_SHOW_EMAIL_VERIFICATION = false;
