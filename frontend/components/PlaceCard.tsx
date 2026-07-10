import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Place } from "@/types";
import { Colors, Spacing, Radius, Typography, categoryColors } from "@/constants/theme";
import { CategoryPlaceholder } from "@/components/CategoryPlaceholder";

interface Props {
  place: Place;
  onPress: () => void;
}

// Cap on how many tag labels a card badge renders inline. Overflow
// collapses into a " +N" suffix so long tag lists (e.g. korean +
// bbq_grill + pet_specialized …) don't blow past the card width.
const CARD_MAX_TAGS = 3;

export function PlaceCard({ place, onPress }: Props) {
  const { t } = useTranslation();
  const categoryColor = categoryColors[place.category] ?? Colors.primary;

  // Multi-tag badge label. Uses place.categories when the backend
  // populated it; falls back to the legacy scalar category label so
  // pre-migration rows still render something meaningful.
  const tagCodes = place.categories ?? [];
  const badgeLabel =
    tagCodes.length > 0
      ? (() => {
          const shown = tagCodes.slice(0, CARD_MAX_TAGS).map((c) => t(`categories.${c}`));
          const overflow = tagCodes.length - shown.length;
          return overflow > 0
            ? `${shown.join(" · ")} +${overflow}`
            : shown.join(" · ");
        })()
      : t(`categories.${place.category}`);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageContainer}>
        {place.thumbnail_url ? (
          <Image source={{ uri: place.thumbnail_url }} style={styles.image} />
        ) : (
          <CategoryPlaceholder category={place.category} size="small" />
        )}
        <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
          <Text style={styles.categoryText} numberOfLines={1}>
            {badgeLabel}
          </Text>
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

        {/* Pet info tags — same policy as place detail: data-driven only.
            "체중 제한 없음" was a misleading default for cards where weight
            was simply unknown, so it's gone. Tags re-appear automatically
            when pet_policy values get filled in. */}
        <View style={styles.tags}>
          {place.pet_policy?.indoor_allowed === true && (
            <Tag icon="home-outline" label={t("filter.indoor")} />
          )}
          {place.pet_policy?.outdoor_allowed === true && (
            <Tag icon="leaf-outline" label={t("filter.outdoor")} />
          )}
          {place.pet_policy?.max_weight_kg != null && (
            <Tag icon="scale-outline" label={`~${place.pet_policy.max_weight_kg}kg`} />
          )}
          {place.has_parking === true && (
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
