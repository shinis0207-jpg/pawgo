import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Place } from "@/types";
import { Colors, Spacing, Radius, Typography, categoryColors } from "@/constants/theme";

interface Props {
  place: Place;
  onPress: () => void;
}

export function PlaceCard({ place, onPress }: Props) {
  const { t } = useTranslation();
  const categoryColor = categoryColors[place.category] ?? Colors.primary;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageContainer}>
        {place.thumbnail_url ? (
          <Image source={{ uri: place.thumbnail_url }} style={styles.image} />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: categoryColor + "20" }]}>
            <CategoryIcon category={place.category} color={categoryColor} size={32} />
          </View>
        )}
        <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
          <Text style={styles.categoryText}>{t(`categories.${place.category}`)}</Text>
        </View>
        {place.is_verified && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.address} numberOfLines={1}>{place.address}</Text>

        <View style={styles.meta}>
          <View style={styles.rating}>
            <Ionicons name="star" size={12} color={Colors.warning} />
            <Text style={styles.ratingText}>{place.rating.toFixed(1)}</Text>
            <Text style={styles.reviewCount}>({place.review_count})</Text>
          </View>

          {place.distance_km !== null && (
            <Text style={styles.distance}>{place.distance_km}km</Text>
          )}
        </View>

        <View style={styles.tags}>
          {place.allows_indoor && (
            <Tag icon="home-outline" label={t("filter.indoor")} />
          )}
          {place.allows_outdoor && (
            <Tag icon="leaf-outline" label={t("filter.outdoor")} />
          )}
          {place.max_weight_kg ? (
            <Tag icon="scale-outline" label={`~${place.max_weight_kg}kg`} />
          ) : (
            <Tag icon="scale-outline" label={t("place.no_limit")} />
          )}
          {place.has_parking && (
            <Tag icon="car-outline" label={t("filter.parking")} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function Tag({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.tag}>
      <Ionicons name={icon as any} size={10} color={Colors.textSecondary} />
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

function CategoryIcon({ category, color, size }: { category: string; color: string; size: number }) {
  const iconMap: Record<string, string> = {
    accommodation: "bed-outline",
    restaurant: "restaurant-outline",
    cafe: "cafe-outline",
    park: "leaf-outline",
    vet: "medkit-outline",
  };
  return <Ionicons name={(iconMap[category] ?? "location-outline") as any} size={size} color={color} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  imageContainer: {
    position: "relative",
    height: 160,
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryBadge: {
    position: "absolute",
    top: Spacing.sm,
    left: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  categoryText: {
    ...Typography.caption,
    color: Colors.surface,
    fontWeight: "600",
  },
  verifiedBadge: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    padding: 2,
  },
  content: {
    padding: Spacing.md,
  },
  name: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  address: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  rating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    ...Typography.bodySmall,
    color: Colors.text,
    fontWeight: "600",
  },
  reviewCount: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  distance: {
    ...Typography.bodySmall,
    color: Colors.primary,
    fontWeight: "600",
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  tagText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
});
