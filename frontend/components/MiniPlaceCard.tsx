import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Place } from "@/types";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";
import { VerificationBadge } from "@/components/VerificationBadge";

interface Props {
  place: Place;
  onDetail: () => void;
  onClose: () => void;
}

export function MiniPlaceCard({ place, onDetail, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const metaParts = [
    t(`categories.${place.category}`),
    place.city ?? null,
    place.distance_km != null ? `${place.distance_km}km` : null,
  ].filter(Boolean) as string[];

  return (
    <Pressable
      onPress={onDetail}
      style={[
        styles.card,
        { bottom: Math.max(insets.bottom, Spacing.md) + Spacing.md },
      ]}
      accessibilityRole="button"
      accessibilityLabel={place.name}
    >
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={1}>
          {place.name}
        </Text>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel={t("common.close")}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.meta} numberOfLines={1}>
        {metaParts.join(" · ")}
      </Text>

      <Text style={styles.address} numberOfLines={1}>
        {place.address}
      </Text>

      <View style={styles.footerRow}>
        <View style={styles.badgeWrap}>
          <VerificationBadge
            status={place.pet_policy?.verification_status}
            showNote={false}
          />
        </View>
        <TouchableOpacity
          style={styles.detailBtn}
          onPress={onDetail}
          accessibilityRole="button"
        >
          <Text style={styles.detailBtnText}>{t("place.detail")}</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.surface} />
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  name: {
    flex: 1,
    ...Typography.h3,
    color: Colors.text,
  },
  closeBtn: {
    padding: 2,
  },
  meta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  address: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  badgeWrap: {
    flexShrink: 1,
  },
  detailBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  detailBtnText: {
    ...Typography.button,
    color: Colors.surface,
  },
});
