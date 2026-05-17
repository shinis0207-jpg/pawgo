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
