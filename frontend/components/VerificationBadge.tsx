import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { VerificationStatus } from "@/types";
import {
  VERIFICATION_BADGE_CONFIG,
  VerificationBadgeConfig,
} from "@/constants/verification";
import { Colors, Radius, Spacing, Typography } from "@/constants/theme";

interface Props {
  /**
   * `null`/`undefined`/empty falls back to "unknown" so the badge always
   * renders something rather than vanishing — the absence of a verdict is
   * itself a "방문 전 확인 권장" signal worth showing.
   */
  status?: VerificationStatus | null;
  /** Show the secondary note line where the config defines one. */
  showNote?: boolean;
}

const STATUS_ICONS: Record<VerificationStatus, keyof typeof Ionicons.glyphMap> = {
  official_verified: "shield-checkmark",
  owner_verified: "person-circle",
  admin_verified: "ribbon",
  user_reported: "chatbubble-ellipses",
  under_review: "alert-circle",
  unknown: "help-circle",
};

export function VerificationBadge({ status, showNote = true }: Props) {
  const { t } = useTranslation();
  const effective: VerificationStatus = status ?? "unknown";
  const config: VerificationBadgeConfig = VERIFICATION_BADGE_CONFIG[effective];
  const icon = STATUS_ICONS[effective];

  // Visual treatment forks per `kind` so callers don't have to think about
  // which status is supplementary vs. authoritative.
  const isStrong = config.kind === "strong";
  const isSupplementary = config.kind === "supplementary";
  const isReview = config.kind === "review";

  const badgeStyle = isStrong
    ? { ...styles.badge, ...styles.strong, backgroundColor: config.color }
    : isSupplementary
    ? {
        ...styles.badge,
        ...styles.supplementary,
        borderColor: config.color,
        borderStyle: "dashed" as const,
      }
    : isReview
    ? { ...styles.badge, ...styles.strong, backgroundColor: config.color }
    : { ...styles.badge, ...styles.unknown, backgroundColor: config.color };

  const labelStyle = isStrong || isReview || config.kind === "unknown"
    ? styles.labelOnFill
    : { ...styles.labelOnBorder, color: config.color };

  const iconColor = isStrong || isReview || config.kind === "unknown"
    ? Colors.surface
    : config.color;

  return (
    <View style={styles.wrapper}>
      <View style={badgeStyle}>
        <Ionicons name={icon} size={14} color={iconColor} />
        <Text style={labelStyle}>{t(config.i18nKey)}</Text>
        {isSupplementary && config.noteI18nKey && (
          <Text style={[styles.inlineNote, { color: config.color }]}>
            · {t(config.noteI18nKey)}
          </Text>
        )}
      </View>
      {showNote && !isSupplementary && config.noteI18nKey && (
        <Text
          style={[
            styles.note,
            isReview && styles.noteReview,
          ]}
        >
          {t(config.noteI18nKey)}
        </Text>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: Spacing.xs,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  strong: {
    // backgroundColor injected per-status; ensure text/icon legible on fill
  },
  supplementary: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
  },
  unknown: {
    // backgroundColor injected
  },
  labelOnFill: {
    ...Typography.caption,
    color: Colors.surface,
    fontWeight: "700",
  },
  labelOnBorder: {
    ...Typography.caption,
    fontWeight: "700",
  },
  inlineNote: {
    ...Typography.caption,
    fontWeight: "600",
  },
  note: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  noteReview: {
    color: Colors.warning,
    fontWeight: "600",
  },
});
