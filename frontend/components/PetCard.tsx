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
}

const PET_ICONS: Record<string, string> = {
  dog: "🐶",
  cat: "🐱",
  bird: "🐦",
  rabbit: "🐰",
  other: "🐾",
};

export function PetCard({ pet, onPress, selected }: Props) {
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

      {selected && (
        <View style={styles.checkmark}>
          <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
        </View>
      )}
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
});
