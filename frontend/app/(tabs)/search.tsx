import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { PlaceListResponse } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { placesApi } from "@/services/api";
import { PlaceCard } from "@/components/PlaceCard";
import { FilterSheet } from "@/components/FilterSheet";
import { useLocation } from "@/hooks/useLocation";
import { PlaceFilter } from "@/types";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";

export default function SearchScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { location } = useLocation();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<PlaceFilter>({ radius_km: 10 });
  const [showFilter, setShowFilter] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useQuery<PlaceListResponse>({
    queryKey: ["search", query, filters, location, page, i18n.language],
    queryFn: () =>
      placesApi.getNearby(
        location?.latitude ?? 37.5665,
        location?.longitude ?? 126.978,
        { ...filters, lang: i18n.language, page }
      ).then((r) => r.data),
    enabled: !!location,
    placeholderData: keepPreviousData,
  });

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== 10
  ).length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={18} color={Colors.textSecondary} />
          <TextInput
            style={styles.input}
            placeholder={t("common.search")}
            placeholderTextColor={Colors.textLight}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilter(true)}>
          <Ionicons name="options-outline" size={20} color={Colors.text} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Results */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <PlaceCard
              place={item}
              onPress={() => router.push(`/place/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="search-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyText}>{t("map.no_places")}</Text>
            </View>
          }
          ListFooterComponent={
            data && data.total > (data.page * data.size) ? (
              <TouchableOpacity
                style={styles.loadMore}
                onPress={() => setPage((p) => p + 1)}
                disabled={isFetching}
              >
                {isFetching ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.loadMoreText}>더 보기</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
          contentContainerStyle={styles.list}
        />
      )}

      <FilterSheet
        visible={showFilter}
        filters={filters}
        onApply={(f) => { setFilters(f); setPage(1); }}
        onClose={() => setShowFilter(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  input: {
    flex: 1,
    ...Typography.body,
    color: Colors.text,
  },
  filterBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    position: "relative",
  },
  filterBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    ...Typography.caption,
    color: Colors.surface,
    fontWeight: "700",
    fontSize: 9,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  list: {
    paddingVertical: Spacing.md,
  },
  loadMore: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  loadMoreText: {
    ...Typography.button,
    color: Colors.primary,
  },
});
