import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { PlaceListResponse } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { placesApi } from "@/services/api";
import { PlaceCard } from "@/components/PlaceCard";
import { FilterSheet } from "@/components/FilterSheet";
import { useLocation } from "@/hooks/useLocation";
import { PlaceFilter } from "@/types";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";

const PAGE_SIZE = 20;

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function SearchScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { location } = useLocation();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<PlaceFilter>({ radius_km: 10 });
  const [showFilter, setShowFilter] = useState(false);

  const debouncedQuery = useDebounced(query.trim(), 300);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery<PlaceListResponse>({
    queryKey: ["search", debouncedQuery, filters, location, i18n.language],
    queryFn: ({ pageParam = 1 }) =>
      placesApi
        .getNearby(location!.latitude, location!.longitude, {
          ...filters,
          q: debouncedQuery || undefined,
          lang: i18n.language,
          page: pageParam as number,
          size: PAGE_SIZE,
        })
        .then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.size < lastPage.total ? lastPage.page + 1 : undefined,
    enabled: !!location,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => v !== undefined && !(k === "radius_km" && v === 10)
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
            autoCorrect={false}
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

      {/* Results header */}
      {!isLoading && total > 0 && (
        <View style={styles.resultHeader}>
          <Text style={styles.resultCount}>
            {debouncedQuery
              ? t("search.results_for", { query: debouncedQuery, count: total })
              : t("search.results_count", { count: total })}
          </Text>
        </View>
      )}

      {/* Results */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
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
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : null
          }
          contentContainerStyle={styles.list}
        />
      )}

      <FilterSheet
        visible={showFilter}
        filters={filters}
        onApply={setFilters}
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
  resultHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  resultCount: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
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
  footerLoader: {
    paddingVertical: Spacing.lg,
  },
});
