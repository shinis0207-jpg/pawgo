import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { CorrectionRequestStatus } from "@/types";
import { CORRECTION_STATUS_BADGE_CONFIG } from "@/constants/correctionRequestStatus";
import { Colors, Radius, Typography } from "@/constants/theme";

interface Props {
  status: CorrectionRequestStatus;
}

/**
 * Simpler than VerificationBadge — every status uses the same filled-pill
 * treatment; only the color and label vary. Designed to sit inline beside
 * the place name + category on a list row.
 */
export function CorrectionRequestStatusBadge({ status }: Props) {
  const { t } = useTranslation();
  const config = CORRECTION_STATUS_BADGE_CONFIG[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.color }]}>
      <Text style={styles.label}>{t(config.i18nKey)}</Text>
    </View>
  );
}


const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: "flex-start",
  },
  label: {
    ...Typography.caption,
    color: Colors.surface,
    fontWeight: "700",
  },
});
