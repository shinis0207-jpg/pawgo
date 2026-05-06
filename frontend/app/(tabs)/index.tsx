import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";

// 지도 추상화 진입점 — provider가 바뀌어도 이 import는 절대 바뀌지 않는다.
import MapView from "@/components/map/MapView";
import { MapMarker } from "@/components/map/types";

import { useLocation } from "@/hooks/useLocation";
import { useNearbyPlaces, useEmergencyVets } from "@/hooks/usePlaces";
import { PlaceCard } from "@/components/PlaceCard";
import { FilterSheet } from "@/components/FilterSheet";
import { Place, PlaceCategory, PlaceFilter } from "@/types";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";

const CATEGORIES: PlaceCategory[] = ["accommodation", "restaurant", "cafe", "park", "vet"];

// Place의 category → MapMarker의 category 변환표
const CATEGORY_MAP: Record<PlaceCategory, MapMarker["category"]> = {
  accommodation: "hotel",
  restaurant: "restaurant",
  cafe: "cafe",
  park: "park",
  vet: "hospital",
};

function toMapMarkers(places: Place[]): MapMarker[] {
  return places.map((p) => ({
    id: String(p.id),
    latitude: p.latitude,
    longitude: p.longitude,
    title: p.name,
    category: CATEGORY_MAP[p.category],
  }));
}

export default function MapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { location } = useLocation();
  const [filters, setFilters] = useState<PlaceFilter>({ radius_km: 5 });
  const [showFilter, setShowFilter] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategory | null>(null);

  const activeFilters = selectedCategory ? { ...filters, category: selectedCategory } : filters;
  const { data } = useNearbyPlaces(location, activeFilters);
  const { data: emergencyVets } = useEmergencyVets(location);

  const places = showEmergency ? (emergencyVets ?? []) : (data?.items ?? []);
  const mapMarkers = toMapMarkers(places);

  // ── MapView 콜백 ────────────────────────────────────────────────────────
  const handleMarkerPress = useCallback(
    (marker: MapMarker) => {
      router.push(`/place/${marker.id}`);
    },
    [router]
  );

  const handleRegionChange = useCallback((_lat: number, _lng: number) => {
    // 필요 시 서버에 새 좌표 기반 검색 요청
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  const handleCategoryPress = (cat: PlaceCategory) => {
    setSelectedCategory((prev) => (prev === cat ? null : cat));
    setShowEmergency(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 지도 영역 — MapView 인터페이스만 사용하므로 provider 교체 영향 없음 */}
      <View style={styles.mapContainer}>
        <MapView
          initialLatitude={location?.latitude ?? 37.5665}
          initialLongitude={location?.longitude ?? 126.978}
          markers={mapMarkers}
          onMarkerPress={handleMarkerPress}
          onRegionChange={handleRegionChange}
        />

        {/* 긴급 동물병원 버튼 */}
        <TouchableOpacity
          style={[styles.emergencyBtn, showEmergency && styles.emergencyBtnActive]}
          onPress={() => {
            setShowEmergency((p) => !p);
            setSelectedCategory(null);
          }}
        >
          <Ionicons
            name="medkit"
            size={16}
            color={showEmergency ? Colors.surface : Colors.error}
          />
          <Text style={[styles.emergencyText, showEmergency && styles.emergencyTextActive]}>
            {t("map.emergency_vet")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 카테고리 탭 */}
      <View style={styles.categoryBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => handleCategoryPress(cat)}
              >
                <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                  {t(`categories.${cat}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilter(true)}>
          <Ionicons name="options-outline" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* 장소 목록 */}
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {showEmergency ? t("map.emergency_vet") : t("map.title")}
          </Text>
          <Text style={styles.listCount}>{places.length}개</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {places.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t("map.no_places")}</Text>
            </View>
          )}
          {places.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              onPress={() => router.push(`/place/${place.id}`)}
            />
          ))}
          <View style={{ height: Spacing.xl }} />
        </ScrollView>
      </View>

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
  mapContainer: {
    height: 260,
    position: "relative",
  },
  emergencyBtn: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.error,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emergencyBtnActive: {
    backgroundColor: Colors.error,
  },
  emergencyText: {
    ...Typography.caption,
    color: Colors.error,
    fontWeight: "600",
  },
  emergencyTextActive: {
    color: Colors.surface,
  },
  categoryBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  categoryScroll: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm - 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryChipText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  categoryChipTextActive: {
    color: Colors.surface,
    fontWeight: "700",
  },
  filterBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  listContainer: {
    flex: 1,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  listTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  listCount: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  empty: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
});
