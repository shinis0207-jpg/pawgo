import { CorrectionRequestStatus } from "@/types";

/**
 * Status-badge palette for "my correction requests" list.
 *
 * Isolated from theme.ts (same convention as verification.ts) so this
 * palette can be retuned independently of the trust-badge colors.
 */
export interface CorrectionStatusBadgeConfig {
  color: string;
  i18nKey: string;
}

export const CORRECTION_STATUS_BADGE_CONFIG: Record<
  CorrectionRequestStatus,
  CorrectionStatusBadgeConfig
> = {
  pending: {
    color: "#6B7280", // grey — Colors.textSecondary tone, "waiting"
    i18nKey: "correction.status.pending",
  },
  reviewing: {
    color: "#F59E0B", // amber — Colors.warning, "admin actively looking"
    i18nKey: "correction.status.reviewing",
  },
  approved: {
    color: "#10B981", // green — Colors.success, "applied"
    i18nKey: "correction.status.approved",
  },
  rejected: {
    color: "#EF4444", // red — Colors.error, "not applied"
    i18nKey: "correction.status.rejected",
  },
};
