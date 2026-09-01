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
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
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
import { useSearchHistoryStore } from "@/store/searchHistoryStore";

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
  const tabBarHeight = useBottomTabBarHeight();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<PlaceFilter>({ radius_km: 10 });
  const [showFilter, setShowFilter] = useState(false);

  // Search history is stored locally via SecureStore. Only Enter-submits
  // land in the store — typing-through-debounce doesn't record, so users
  // aren't nagged with every keystroke they explored.
  const history = useSearchHistoryStore((s) => s.history);
  const loadHistory = useSearchHistoryStore((s) => s.load);
  const addHistory = useSearchHistoryStore((s) => s.add);
  const touchHistory = useSearchHistoryStore((s) => s.touch);
  const removeHistory = useSearchHistoryStore((s) => s.remove);
  const clearHistory = useSearchHistoryStore((s) => s.clear);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const debouncedQuery = useDebounced(query.trim(), 300);
  // Empty input bypasses the debounce — clearing the field returns to the
  // hint state instantly, not 300ms later. Only non-empty input waits.
  const effectiveQuery = query.trim() === "" ? "" : debouncedQuery;

  // Search runs name-only across the whole dataset (backend skips radius
  // when q is set), so we don't gate on the GPS fix. lat/lng still go up
  // for distance ordering; Seoul is the fallback when location is null.
  const lat = location?.latitude ?? 37.5665;
  const lng = location?.longitude ?? 126.978;

  // TODO(policy 2.5): once owner_claims / user reports introduce rows with
  // verification_status='unknown', send include_unverified=true here AND
  // surface a "동반 정보 없음" label on PlaceCard for those rows. Today every
  // row is official_verified, so the flag would be a no-op.
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery<PlaceListResponse>({
    queryKey: ["search", effectiveQuery, filters, lat, lng, i18n.language],
    queryFn: ({ pageParam = 1 }) =>
      placesApi
        .getNearby(lat, lng, {
          ...filters,
          q: effectiveQuery,
          lang: i18n.language,
          page: pageParam as number,
          size: PAGE_SIZE,
        })
        .then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.size < lastPage.total ? lastPage.page + 1 : undefined,
    enabled: !!effectiveQuery,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => v !== undefined && !(k === "radius_km" && v === 10)
  ).length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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
              onPress={() => {
                // Record BEFORE navigating so a slow SecureStore write
                // doesn't race with the screen transition. Fire-and-
                // forget — the store swallows write failures itself.
                addHistory(item);
                router.push(`/place/${item.id}`);
              }}
            />
          )}
          ListEmptyComponent={
            debouncedQuery ? (
              <View style={styles.center}>
                <Ionicons name="search-outline" size={48} color={Colors.textLight} />
                <Text style={styles.emptyTitle}>
                  {t("search.empty_match_title")}
                </Text>
                <Text style={styles.emptyHint}>
                  {t("search.empty_match_hint")}
                </Text>
              </View>
            ) : history.length > 0 ? (
              <View style={styles.historyContainer}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>
                    {t("search.recent_searches")}
                  </Text>
                  <TouchableOpacity onPress={clearHistory}>
                    <Text style={styles.historyClear}>
                      {t("search.clear_all")}
                    </Text>
                  </TouchableOpacity>
                </View>
                {history.map((h) => (
                  <View key={h.id} style={styles.historyItem}>
                    <TouchableOpacity
                      style={styles.historyItemLabel}
                      onPress={() => {
                        // Fire-and-forget: bubble the tapped row to the
                        // top of the history (no re-fetch, no fabrication)
                        // then navigate. touch() is a no-op if the row
                        // isn't found or already at index 0.
                        touchHistory(h.id);
                        router.push(`/place/${h.id}`);
                      }}
                    >
                      <Text style={styles.historyItemText}>{h.name}</Text>
                      {h.address !== "" && (
                        <Text style={styles.historyItemAddress}>{h.address}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.historyRemove}
                      onPress={() => removeHistory(h.id)}
                    >
                      <Ionicons
                        name="close"
                        size={18}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.center}>
                <Ionicons name="search-outline" size={48} color={Colors.textLight} />
                <Text style={styles.emptyTitle}>
                  {t("search.empty_no_query")}
                </Text>
              </View>
            )
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
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + Spacing.md }]}
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
  hint: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  hintText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 16,
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
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyHint: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  list: {
    paddingVertical: Spacing.md,
  },
  footerLoader: {
    paddingVertical: Spacing.lg,
  },
  historyContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: Spacing.sm,
  },
  historyTitle: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  historyClear: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  historyItemLabel: {
    flex: 1,
    paddingVertical: Spacing.xs,
  },
  historyItemText: {
    ...Typography.body,
    color: Colors.text,
  },
  historyItemAddress: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  historyRemove: {
    padding: Spacing.sm,
  },
});
