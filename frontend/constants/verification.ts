import { VerificationStatus } from "@/types";

/**
 * VerificationBadge configuration.
 *
 * Mapping is isolated here (instead of in theme.ts) so the trust-badge
 * palette stays separate from general UI colors and can be retuned per
 * design feedback without touching the theme.
 *
 * `kind` distinguishes the four visual treatments the badge renders:
 *   - "strong"        : filled badge, solid border — official/owner/admin_verified
 *   - "supplementary" : outlined badge with dashed border — user_reported
 *                       (a hint, NOT a confirmation; carries a "참고" tag)
 *   - "review"        : filled warning badge with explicit call-first note
 *   - "unknown"       : neutral grey badge with "방문 전 확인 권장" note
 *
 * `i18nKey` is the i18next path for the label (ko/en provided).
 * `noteI18nKey` is an optional secondary line that appears under or beside
 * the badge for the supplementary / review / unknown treatments.
 */
export type VerificationBadgeKind =
  | "strong"
  | "supplementary"
  | "review"
  | "unknown";

export interface VerificationBadgeConfig {
  color: string;
  i18nKey: string;
  noteI18nKey?: string;
  kind: VerificationBadgeKind;
}

export const VERIFICATION_BADGE_CONFIG: Record<
  VerificationStatus,
  VerificationBadgeConfig
> = {
  official_verified: {
    color: "#2563EB", // deep blue — the strongest signal
    i18nKey: "verification.official_verified",
    kind: "strong",
  },
  owner_verified: {
    color: "#059669", // emerald — owner-attested
    i18nKey: "verification.owner_verified",
    kind: "strong",
  },
  admin_verified: {
    color: "#3B82F6", // lighter blue, distinct from official_verified
    i18nKey: "verification.admin_verified",
    kind: "strong",
  },
  user_reported: {
    color: "#EAB308", // yellow-500 — readable on white at small sizes
    i18nKey: "verification.user_reported",
    noteI18nKey: "verification.note_supplementary",
    kind: "supplementary",
  },
  under_review: {
    color: "#F59E0B", // matches Colors.warning — under correction triage
    i18nKey: "verification.under_review",
    noteI18nKey: "verification.note_call_first",
    kind: "review",
  },
  unknown: {
    color: "#6B7280", // matches Colors.textSecondary — neutral grey
    i18nKey: "verification.unknown",
    noteI18nKey: "verification.note_check_before_visit",
    kind: "unknown",
  },
};
