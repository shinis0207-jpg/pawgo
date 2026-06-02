import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { differenceInMonths, differenceInYears, parseISO } from "date-fns";
import { Pet } from "@/types";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";

interface Props {
  pet: Pet;
  onPress?: () => void;
  selected?: boolean;
  // Optional action handlers. Callsites that own a Pet (e.g. the pets list
  // screen) pass these to render edit / delete affordances on the right edge.
  // Callsites that use PetCard as a pure selectable chip (future review-write
  // flow, correction-with-pet flow) omit them — combined with the !selected
  // guard below, the actions never compete with the selection UI.
  onEdit?: () => void;
  onDelete?: () => void;
}

const PET_ICONS: Record<string, string> = {
  dog: "🐶",
  cat: "🐱",
  bird: "🐦",
  rabbit: "🐰",
  other: "🐾",
};

export function PetCard({ pet, onPress, selected, onEdit, onDelete }: Props) {
  const { t } = useTranslation();

  const getAge = () => {
    if (!pet.birth_date) return null;
    const birth = parseISO(pet.birth_date);
    const months = differenceInMonths(new Date(), birth);
    if (months < 12) return t("pets.months", { months });
    return t("pets.age", { age: differenceInYears(new Date(), birth) });
  };

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.avatarContainer, selected && styles.avatarSelected]}>
        {pet.photo_url ? (
          <Image source={{ uri: pet.photo_url }} style={styles.avatar} />
        ) : (
          <Text style={styles.emoji}>{PET_ICONS[pet.type] ?? "🐾"}</Text>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.name}>{pet.name}</Text>
        <Text style={styles.breed}>
          {pet.breed ? `${pet.breed}` : t(`pets.${pet.type}`, { defaultValue: pet.type })}
          {getAge() ? ` · ${getAge()}` : ""}
        </Text>
        {pet.weight_kg && (
          <View style={styles.weightBadge}>
            <Ionicons name="scale-outline" size={10} color={Colors.textSecondary} />
            <Text style={styles.weight}>{pet.weight_kg}kg</Text>
          </View>
        )}
      </View>

      {selected ? (
        <View style={styles.checkmark}>
          <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
        </View>
      ) : (onEdit || onDelete) ? (
        <View style={styles.actions}>
          {onEdit && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={onEdit}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="edit"
            >
              <Ionicons name="create-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={onDelete}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="delete"
            >
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  cardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "08",
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarSelected: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  avatar: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  emoji: {
    fontSize: 28,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...Typography.h3,
    color: Colors.text,
  },
  breed: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  weightBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  weight: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  checkmark: {
    marginLeft: "auto",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginLeft: "auto",
  },
  actionBtn: {
    padding: Spacing.xs,
  },
});
