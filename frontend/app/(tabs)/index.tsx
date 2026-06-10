import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
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
import { MiniPlaceCard } from "@/components/MiniPlaceCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Place, PlaceCategory, PlaceFilter, Coordinates } from "@/types";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";
import { MVP_VISIBLE_CATEGORIES, MVP_SHOW_EMERGENCY_VET } from "@/constants/mvp";

// 지도 중심이 검색 좌표에서 이 거리(km) 이상 벗어나면 "이 지역 재검색" 버튼 표시
const RESEARCH_THRESHOLD_KM = 0.5;

function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

// Phase 1: full enum kept in types/, but only MVP_VISIBLE_CATEGORIES is surfaced
// in the UI. accommodation / park / vet are still routable but not advertised.
const CATEGORIES: readonly PlaceCategory[] = MVP_VISIBLE_CATEGORIES;

// Place의 category → MapMarker의 category 변환표
const CATEGORY_MAP: Record<PlaceCategory, MapMarker["category"]> = {
  accommodation: "hotel",
  restaurant: "restaurant",
  cafe: "cafe",
  park: "park",
  vet: "hospital",
};

function toMapMarkers(places: Place[], selectedId: number | null): MapMarker[] {
  return places.map((p) => ({
    id: String(p.id),
    latitude: p.latitude,
    longitude: p.longitude,
    title: p.name,
    category: CATEGORY_MAP[p.category],
    highlighted: p.id === selectedId,
  }));
}

export default function MapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { location } = useLocation();
  const tabBarHeight = useBottomTabBarHeight();
  const [filters, setFilters] = useState<PlaceFilter>({ radius_km: 5 });
  const [showFilter, setShowFilter] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategory | null>(null);

  // 검색 좌표 override — null이면 사용자 위치 사용. "이 지역 재검색" 시 mapCenter로 세팅됨
  const [searchOverride, setSearchOverride] = useState<Coordinates | null>(null);
  // 지도가 현재 보고 있는 중심 (사용자 드래그/줌 결과)
  const [mapCenter, setMapCenter] = useState<Coordinates | null>(null);
  // "내 위치" 클릭 시 증가 — MapView의 key로 사용해 WebView 재마운트 → 사용자 위치로 카메라 리셋
  const [recenterSeq, setRecenterSeq] = useState(0);
  // 핀 탭 → 미니 카드. 핀의 marker.id는 string이지만 Place.id는 number라 number로 저장.
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);

  const searchCenter = searchOverride ?? location;
  const activeFilters = selectedCategory ? { ...filters, category: selectedCategory } : filters;
  const { data } = useNearbyPlaces(searchCenter, activeFilters);
  const { data: emergencyVets } = useEmergencyVets(searchCenter);

  const places = showEmergency ? (emergencyVets ?? []) : (data?.items ?? []);
  const mapMarkers = toMapMarkers(places, selectedPlaceId);
  const selectedPlace = selectedPlaceId != null
    ? places.find((p) => p.id === selectedPlaceId) ?? null
    : null;

  // 화면 컨텍스트(카테고리·긴급·재센터·재검색)가 바뀌면 미니 카드는 stale.
  // 보수적으로 명시한 트리거만 해제하고, 단순 페이지네이션이나 위치 미세
  // 변화에는 카드를 유지한다.
  useEffect(() => {
    setSelectedPlaceId(null);
  }, [selectedCategory, showEmergency, recenterSeq, searchOverride]);

  // 지도 중심이 검색 좌표에서 충분히 떨어졌는지
  const showResearchBtn =
    !!mapCenter && !!searchCenter && haversineKm(mapCenter, searchCenter) >= RESEARCH_THRESHOLD_KM;
  // 검색 좌표가 사용자 위치에서 떨어졌는지 (내 위치 버튼 표시 여부)
  const showMyLocationBtn =
    !!location && !!searchOverride && haversineKm(location, searchOverride) >= RESEARCH_THRESHOLD_KM;

  // ── MapView 콜백 ────────────────────────────────────────────────────────
  // 핀을 누르면 바로 상세로 가지 않고 미니 카드를 띄운다. 상세 진입은 카드의
  // [상세보기] 버튼 또는 카드 본문 탭에서 router.push로 일어난다.
  const handleMarkerPress = useCallback((marker: MapMarker) => {
    const id = Number(marker.id);
    if (!Number.isNaN(id)) setSelectedPlaceId(id);
  }, []);

  // 지도 빈 곳 탭 → 미니 카드 닫기. WebView 측에서 'mapClick' 메시지를 보낸다.
  const handleMapPress = useCallback(() => {
    setSelectedPlaceId(null);
  }, []);

  const handleRegionChange = useCallback((lat: number, lng: number) => {
    setMapCenter({ latitude: lat, longitude: lng });
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  const handleSearchThisArea = () => {
    if (mapCenter) setSearchOverride(mapCenter);
  };

  const handleMyLocation = () => {
    setSearchOverride(null);
    setMapCenter(null);
    setRecenterSeq((n) => n + 1);
  };

  const handleCategoryPress = (cat: PlaceCategory) => {
    setSelectedCategory((prev) => (prev === cat ? null : cat));
    setShowEmergency(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 지도 영역 — MapView 인터페이스만 사용하므로 provider 교체 영향 없음 */}
      <View style={styles.mapContainer}>
        <ErrorBoundary fallbackLabel={t("map.render_error")}>
          <MapView
            key={`map-${recenterSeq}`}
            initialLatitude={location?.latitude ?? 37.5665}
            initialLongitude={location?.longitude ?? 126.978}
            markers={mapMarkers}
            onMarkerPress={handleMarkerPress}
            onRegionChange={handleRegionChange}
            onMapPress={handleMapPress}
          />
        </ErrorBoundary>

        {/* 긴급 동물병원 버튼 — Phase 1 MVP에서는 hide. state/로직은 유지. */}
        {MVP_SHOW_EMERGENCY_VET && (
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
        )}

        {/* 내 위치 버튼 — 검색이 사용자 위치에서 벗어났을 때만 */}
        {showMyLocationBtn && (
          <TouchableOpacity
            style={styles.myLocationBtn}
            onPress={handleMyLocation}
            accessibilityLabel={t("map.my_location")}
          >
            <Ionicons name="locate" size={20} color={Colors.primary} />
          </TouchableOpacity>
        )}

        {/* 이 지역 재검색 버튼 — 지도를 드래그해 멀어졌을 때만 */}
        {showResearchBtn && (
          <TouchableOpacity style={styles.researchBtn} onPress={handleSearchThisArea}>
            <Ionicons name="refresh" size={14} color={Colors.surface} />
            <Text style={styles.researchText}>{t("map.search_this_area")}</Text>
          </TouchableOpacity>
        )}
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
          <Text style={styles.listCount}>{t("map.results_count", { count: places.length })}</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.md }}
        >
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
        </ScrollView>

        {/* 핀 탭 → 미니 카드. 리스트 영역 위에 floating으로 떠서 리스트 일부를
            잠깐 가린다. listContainer 안의 absolute라 카테고리바·지도는 안 가린다. */}
        {selectedPlace && (
          <MiniPlaceCard
            place={selectedPlace}
            onDetail={() => router.push(`/place/${selectedPlace.id}`)}
            onClose={() => setSelectedPlaceId(null)}
          />
        )}
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
    backgroundColor: "#E5E7EB",
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
  myLocationBtn: {
    position: "absolute",
    bottom: Spacing.md,
    right: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  researchBtn: {
    position: "absolute",
    bottom: Spacing.md,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.text,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  researchText: {
    ...Typography.caption,
    color: Colors.surface,
    fontWeight: "600",
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
