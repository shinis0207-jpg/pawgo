import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PlaceCategory } from "@/types";

interface Props {
  category: PlaceCategory;
  size?: "small" | "large";
}

const CATEGORY_CONFIG: Record<
  PlaceCategory,
  { bg: string; accent: string; icon: string }
> = {
  cafe: {
    bg: "#F5F0FF",
    accent: "#8B5CF6",
    icon: "cafe",
  },
  restaurant: {
    bg: "#FFF7ED",
    accent: "#F97316",
    icon: "restaurant",
  },
  accommodation: {
    bg: "#EEF2FF",
    accent: "#6366F1",
    icon: "bed",
  },
  park: {
    bg: "#F0FDF4",
    accent: "#22C55E",
    icon: "leaf",
  },
  vet: {
    bg: "#FFF1F2",
    accent: "#F43F5E",
    icon: "medkit",
  },
};

export function CategoryPlaceholder({ category, size = "small" }: Props) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.vet;
  const iconSize = size === "large" ? 52 : 32;
  const circleScale = size === "large" ? 1.6 : 1;

  return (
    <View style={[styles.container, { backgroundColor: cfg.bg }]}>
      {/* 배경 장식 원 */}
      <View
        style={[
          styles.circle1,
          {
            backgroundColor: cfg.accent + "25",
            width: 100 * circleScale,
            height: 100 * circleScale,
            borderRadius: 50 * circleScale,
            top: -20 * circleScale,
            right: -20 * circleScale,
          },
        ]}
      />
      <View
        style={[
          styles.circle2,
          {
            backgroundColor: cfg.accent + "18",
            width: 70 * circleScale,
            height: 70 * circleScale,
            borderRadius: 35 * circleScale,
            bottom: -14 * circleScale,
            left: -10 * circleScale,
          },
        ]}
      />
      <View
        style={[
          styles.circle3,
          {
            backgroundColor: cfg.accent + "12",
            width: 44 * circleScale,
            height: 44 * circleScale,
            borderRadius: 22 * circleScale,
            top: "30%",
            left: "10%",
          },
        ]}
      />
      {/* 아이콘 */}
      <View style={[styles.iconWrap, { backgroundColor: cfg.accent + "20" }]}>
        <Ionicons name={cfg.icon as any} size={iconSize} color={cfg.accent} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  circle1: { position: "absolute" },
  circle2: { position: "absolute" },
  circle3: { position: "absolute" },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
