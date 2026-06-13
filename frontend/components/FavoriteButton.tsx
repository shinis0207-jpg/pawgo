import React, { useEffect } from "react";
import { TouchableOpacity, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Place } from "@/types";
import { useFavoritesStore } from "@/store/favoritesStore";
import { useAuthStore } from "@/store/authStore";
import { Colors } from "@/constants/theme";

interface Props {
  place: Place;
  size?: number;
}

/**
 * Heart toggle for a single place. Reads two slices from the favorites store
 * (favoritePlaceIds for the fill state, toggle for the action) so a single
 * mutation re-renders just the relevant heart, not every detail screen.
 *
 * First-mount calls ensureLoaded so a cold-open detail screen paints with the
 * correct fill even if the user hasn't visited the saved-places tab yet.
 * That call is cheap and a no-op when there's no token or when the list is
 * already in memory — see favoritesStore.ensureLoaded.
 */
export function FavoriteButton({ place, size = 28 }: Props) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const isFav = useFavoritesStore((s) => s.favoritePlaceIds.has(place.id));
  const toggle = useFavoritesStore((s) => s.toggle);
  const ensureLoaded = useFavoritesStore((s) => s.ensureLoaded);

  useEffect(() => {
    ensureLoaded(i18n.language);
  }, [ensureLoaded, i18n.language]);

  const handlePress = async () => {
    if (!token) {
      // Mirror correction's auth-required flow — same modal copy structure,
      // same routing target. Don't optimistically toggle the heart; users
      // who cancel out of /auth should land back on a non-favorited state.
      Alert.alert(
        t("favorites.auth_required_title"),
        t("favorites.auth_required_body"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("favorites.auth_required_cta"),
            onPress: () => router.push("/auth"),
          },
        ],
      );
      return;
    }
    try {
      await toggle(place, i18n.language);
    } catch {
      // Store already rolled the heart back to its pre-toggle state — the
      // snap is the feedback. Swallow so a network blip doesn't crash the
      // detail screen.
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t("favorites.my_list_title")}
    >
      <Ionicons
        name={isFav ? "heart" : "heart-outline"}
        size={size}
        color={isFav ? Colors.error : Colors.textSecondary}
      />
    </TouchableOpacity>
  );
}
