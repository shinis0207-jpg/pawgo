import React, { useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useFavoritesStore } from "@/store/favoritesStore";
import { PlaceCard } from "@/components/PlaceCard";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";

/**
 * Saved places list. Mirrors the layout of profile/corrections.tsx (header +
 * back + state-branched body) but sources data from the favorites store
 * instead of react-query — toggles on the place-detail heart need to reflect
 * here instantly, and the store is the single source of truth for the heart
 * fill anyway.
 *
 * Not-logged-in falls through to the same empty state as no-favorites:
 * ensureLoaded no-ops without a token, so items stays [] and the body reads
 * as "tap the heart to save places", which is the correct CTA either way.
 */
export default function MyFavoritesScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const items = useFavoritesStore((s) => s.items);
  const isLoading = useFavoritesStore((s) => s.isLoading);
  const error = useFavoritesStore((s) => s.error);
  const fetchFavorites = useFavoritesStore((s) => s.fetchFavorites);
  const ensureLoaded = useFavoritesStore((s) => s.ensureLoaded);

  useEffect(() => {
    ensureLoaded(i18n.language);
  }, [ensureLoaded, i18n.language]);

  // Error is only "interesting" when we have nothing to show — once items
  // are on screen, a transient retry failure shouldn't blank them out.
  const showError = error !== null && items.length === 0;
  const showEmpty = !isLoading && !showError && items.length === 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("favorites.my_list_title")}</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : showError ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>
            {t("favorites.my_list_load_error")}
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => fetchFavorites(i18n.language)}
            disabled={isLoading}
          >
            <Text style={styles.retryText}>{t("favorites.my_list_retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : showEmpty ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>💛</Text>
          <Text style={styles.emptyTitle}>
            {t("favorites.my_list_empty_title")}
          </Text>
          <Text style={styles.emptyBody}>
            {t("favorites.my_list_empty_body")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <PlaceCard
              place={item.place}
              onPress={() => router.push(`/place/${item.place_id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => fetchFavorites(i18n.language)}
              tintColor={Colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3, color: Colors.text },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.xl,
  },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { ...Typography.h3, color: Colors.textSecondary },
  emptyBody: {
    ...Typography.body,
    color: Colors.textLight,
    textAlign: "center",
    paddingHorizontal: Spacing.md,
  },
  retryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
  },
  retryText: { ...Typography.button, color: Colors.surface },
  list: { paddingVertical: Spacing.sm },
});
