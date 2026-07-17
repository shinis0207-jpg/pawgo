import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";

// 지도 추상화 진입점 — provider가 바뀌어도 이 import는 절대 바뀌지 않는다.
import MapView from "@/components/map/MapView";
import { MapMarker, MapRegion } from "@/components/map/types";

import { useLocation } from "@/hooks/useLocation";
import { useNearbyPlaces, useEmergencyVets } from "@/hooks/usePlaces";
import { PlaceCard } from "@/components/PlaceCard";
import { FilterSheet } from "@/components/FilterSheet";
import { MiniPlaceCard } from "@/components/MiniPlaceCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Place, PlaceCategory, PlaceFilter, Coordinates } from "@/types";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";
import { MVP_SHOW_EMERGENCY_VET } from "@/constants/mvp";
import { CATEGORY_CHIPS, CategoryGroup } from "@/constants/categories";

// Viewport-driven search tuning.
// - VIEWPORT_MARGIN: multiplier on (diagonal/2) so places right at the
//   viewport edge don't fall outside the search circle.
// - MAX_RADIUS_KM: backend Query is `le=50.0`, we honor the same cap.
// - PAGE_SIZE: backend Query is `le=100`; combined with the hook's
//   parallel page fan-out (up to 5 pages) this covers ~500 items.
// - VIEWPORT_DEBOUNCE_MS: coalesces the burst of `idle` events that
//   Kakao emits during map mount / GPS settle so the first fetch
//   isn't aborted mid-flight by a follow-up idle. State-based
//   debounce — `viewport` state itself lags via useDebouncedValue,
//   so no callback re-captures a coord from an outer scope (that
//   would reintroduce the stale-closure bug fixed earlier).
// - IDLE_FALLBACK_MS + IDLE_FALLBACK_DRIFT_KM: safety net for when an
//   idle message from the WebView never lands (dropped bridge message,
//   provider bug). If no successful search happened within IDLE_FALLBACK_MS
//   and the current tracked viewport center has drifted more than
//   IDLE_FALLBACK_DRIFT_KM from the last searched center, force one
//   refetch. Keeps the app from getting stuck on stale results.
// - MY_LOCATION_HINT_KM: distance between GPS and current viewport
//   center at which the "내 위치" button appears.
const VIEWPORT_DEBOUNCE_MS = 250;
const VIEWPORT_MARGIN = 1.3;
const MIN_RADIUS_KM = 0.3;
const MAX_RADIUS_KM = 50;
// Fixed search radius applied when searchSource === 'location' (i.e.,
// the my-location button intent). Viewport mode still derives radius
// from bounds; this constant only governs the GPS-anchored path so
// tapping my-location doesn't inherit a tight zoom-in radius from the
// previous viewport and hide nearby places from the list.
const LOCATION_SEARCH_RADIUS_KM = 5;
const PAGE_SIZE = 100;
const IDLE_FALLBACK_MS = 10_000;
const IDLE_FALLBACK_DRIFT_KM = 0.5;
const MY_LOCATION_HINT_KM = 0.5;

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

// Diagonal(SW → NE) / 2 * margin, clamped to server bounds. RN-side so
// the same formula holds for any provider that reports SW/NE bounds.
function computeRadiusFromBounds(bounds: MapRegion["bounds"]): number {
  const sw = { latitude: bounds.sw.lat, longitude: bounds.sw.lng };
  const ne = { latitude: bounds.ne.lat, longitude: bounds.ne.lng };
  const diag = haversineKm(sw, ne);
  const raw = (diag / 2) * VIEWPORT_MARGIN;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, raw));
}

// Phase 2 chip bar is two-tier: 4 group chips on the top row, and — when
// a group is selected — the sub-codes belonging to that group on the
// second row. Both rows source from CATEGORY_CHIPS so ordering matches
// the backend seed's sort_order.
const GROUPS: readonly CategoryGroup[] = [
  "food",
  "coffee_dessert",
  "drink",
  "space_tag",
] as const;

// Group → sub-codes lookup, computed once from CATEGORY_CHIPS.
const GROUP_CODES: Record<CategoryGroup, readonly string[]> = {
  food: CATEGORY_CHIPS.filter((c) => c.group === "food").map((c) => c.code),
  coffee_dessert: CATEGORY_CHIPS.filter((c) => c.group === "coffee_dessert").map((c) => c.code),
  drink: CATEGORY_CHIPS.filter((c) => c.group === "drink").map((c) => c.code),
  space_tag: CATEGORY_CHIPS.filter((c) => c.group === "space_tag").map((c) => c.code),
};

// When the user picks a group but no sub-code, we still need to filter
// down to that group. food / coffee_dessert re-use the legacy scalar
// column path (which also keeps the 362 untagged legacy rows visible).
// drink / space_tag have no scalar analogue — we don't send `category`
// at all and instead intersect place.categories with the group's codes
// on the client. TODO: replace with a proper server-side group filter
// so pagination works correctly for drink / space_tag.
const GROUP_TO_LEGACY_SCALAR: Partial<Record<CategoryGroup, string>> = {
  food: "restaurant",
  coffee_dessert: "cafe",
};

// Module-scope monotonic counter for MapView mount identifiers. Each
// "current location" jump reads `++mapMountCounter` so the new
// MapView's mountId is guaranteed to differ from every mountId that
// any previous mount was ever built with. Module-scope (not state) so
// it survives component re-renders but resets on module reload, which
// only matters for Fast Refresh in dev. We start at 0 so the very
// first mount (initial app render, no jump yet) has mountId=0 — no
// older mount exists at that point, so a collision is impossible.
let mapMountCounter = 0;

// Place의 category → MapMarker의 category 변환표.
// 입력은 place.category(레거시 5종 스칼라, 백엔드가 계속 채워 보냄),
// 출력은 map/types.ts 고정 5종. 새 태그 도입 후에도 이 매핑은 무수정 —
// 마커는 여전히 레거시 스칼라에서만 파생되므로 보호영역 경계가 유지된다.
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

interface Viewport {
  center: Coordinates;
  radiusKm: number;
}

export default function MapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { location, refreshLocation, isLoading: locationLoading } = useLocation();
  const tabBarHeight = useBottomTabBarHeight();
  // filters no longer carries radius_km — the viewport supplies it.
  const [filters, setFilters] = useState<PlaceFilter>({});
  const [showFilter, setShowFilter] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CategoryGroup | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Latest reported viewport from the map's idle event (raw). Used
  // for UI concerns that need to reflect the live map position — the
  // debug log's "map" side, the idle fallback drift check, the
  // "내 위치" button visibility.
  const [viewport, setViewport] = useState<Viewport | null>(null);
  // Debounced copy — drives fetches. Coalesces the burst of idles
  // that fire during map mount / GPS settle so the first fetch has a
  // stable coord and isn't aborted mid-flight by a follow-up idle.
  // Kept as state (not a `useDebouncedValue` return) so that programmatic
  // "recenter jumps" (my-location button) can bypass the 250ms lag by
  // committing the confirmed target immediately — see bypassNextDebounceRef.
  const [debouncedViewport, setDebouncedViewport] = useState<Viewport | null>(null);
  // One-shot bypass flag for the debounce below. Set true when we
  // already know the definitive next viewport (my-location button:
  // location has been GPS-confirmed, so the settling idle sequence
  // doesn't get to move it). Consumed on the next `viewport` change
  // that is non-null. Ref rather than state so it never triggers a
  // render on its own and never leaks across renders.
  const bypassNextDebounceRef = useRef(false);
  // Stale-idle gate. `recenterSeq` doubles as the MapView's mountId
  // (see the `<MapView mountId={recenterSeq}>` prop below): the HTML
  // built for a given mount embeds this exact value and every idle
  // event it emits echoes it back. A message whose mountId is not
  // the CURRENT recenterSeq is coming from an older, superseded
  // MapView whose native side hasn't been fully torn down yet — drop
  // it. Ref lets the useCallback([])-stable handleRegionChange read
  // the fresh recenterSeq without re-closing over state.
  const recenterSeqRef = useRef<number>(0);
  // Debounce: viewport → debouncedViewport. Normally lags by
  // VIEWPORT_DEBOUNCE_MS (absorbs Kakao's post-mount idle burst).
  // When bypass is armed AND viewport is non-null, commits
  // immediately (still through setState → the timer callback still
  // does NOT reach for any coord from an outer scope — it commits
  // the exact `value` closed over by this effect's render, so no
  // stale-closure regression).
  useEffect(() => {
    if (viewport && bypassNextDebounceRef.current) {
      bypassNextDebounceRef.current = false;
      setDebouncedViewport(viewport);
      return;
    }
    const id = setTimeout(() => setDebouncedViewport(viewport), VIEWPORT_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [viewport]);

  // "내 위치" 클릭 시 증가 — MapView의 key로 사용해 WebView 재마운트 → 사용자 위치로 카메라 리셋
  const [recenterSeq, setRecenterSeq] = useState(0);
  // 핀 탭 → 미니 카드. 핀의 marker.id는 string이지만 Place.id는 number라 number로 저장.
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);

  // Search-coordinate SOURCE (intent, not timing). 'location' = GPS
  // anchored (my-location button intent). 'viewport' = whatever the
  // map is now showing (user-driven pan/zoom intent). Initial value
  // 'location' so the very first fetch after mount is GPS-based.
  // Transitions:
  //   'location' → 'viewport': when Kakao reports a user-initiated
  //     drag or zoom start on the CURRENT mount (mountId matches).
  //   * → 'location': my-location button.
  // No timers, no distance thresholds — pure event-driven.
  const [searchSource, setSearchSource] = useState<"location" | "viewport">(
    "location",
  );

  // SINGLE SOURCE OF TRUTH for "the confirmed search coordinate".
  // Selection is intent-based, not timing/distance:
  //   searchSource === 'location' → GPS. Guarantees my-location button
  //     always anchors search to real GPS, immune to Kakao's post-mount
  //     idle drift that used to yank searchCenter ~886m off.
  //   searchSource === 'viewport' → debouncedViewport (auto-search on
  //     user pan/zoom). Falls back to `location` if debouncedViewport
  //     is null (very first render before Kakao emits any idle).
  // Radius always tracks the visible viewport so the fetch radius
  // matches whatever the user is looking at.
  const searchCenter: Coordinates | null =
    searchSource === "location"
      ? (location ?? null)
      : (debouncedViewport?.center ?? location ?? null);
  // Radius mirrors the same source split as the center. In location
  // mode the fixed policy radius governs — the previous viewport's
  // tight zoom-in must NOT bleed into a GPS-anchored search (which
  // was the "my-location button hides nearby places" bug). Viewport
  // mode keeps deriving radius from bounds via computeRadiusFromBounds
  // (already clamped to [MIN_RADIUS_KM, MAX_RADIUS_KM]); the fallback
  // to LOCATION_SEARCH_RADIUS_KM covers the very first render when
  // debouncedViewport hasn't been seeded yet.
  const searchRadiusKm =
    searchSource === "location"
      ? LOCATION_SEARCH_RADIUS_KM
      : (debouncedViewport?.radiusKm ?? LOCATION_SEARCH_RADIUS_KM);

  // Defensive mirror of the confirmed search center in a ref. React
  // state drives `useNearbyPlaces` (via queryKey) so state is
  // authoritative for RQ; the ref exists so any *future* imperative
  // code path (idle fallback timer, refetch button, side-effect after
  // filter change) can read the latest confirmed coord synchronously
  // without a captured-closure risk. Update the ref via effect so its
  // value is always at least as fresh as the last committed render.
  const confirmedSearchCenterRef = useRef<Coordinates | null>(null);
  useEffect(() => {
    confirmedSearchCenterRef.current = searchCenter;
  }, [searchCenter]);

  // Echo recenterSeq into the ref so handleRegionChange's stale-idle
  // gate can read the current value without becoming a state-dependent
  // closure. Redundant with the synchronous write in handleMyLocation
  // (defensive invariant — do not remove).
  useEffect(() => {
    recenterSeqRef.current = recenterSeq;
  }, [recenterSeq]);

  // Filter-to-API mapping. Precedence:
  //   1. selectedCategory (sub-code) → send it verbatim
  //   2. selectedGroup with a legacy-scalar analogue (food/coffee_dessert)
  //      → re-use the scalar path so untagged legacy rows keep showing
  //   3. selectedGroup without an analogue (drink/space_tag) → no
  //      category param; we filter items client-side below
  const groupScalar =
    selectedGroup != null ? GROUP_TO_LEGACY_SCALAR[selectedGroup] : undefined;
  const activeFilters: PlaceFilter = useMemo(
    () => ({
      ...filters,
      radius_km: searchRadiusKm,
      ...(selectedCategory
        ? { category: selectedCategory }
        : groupScalar
          ? { category: groupScalar }
          : {}),
    }),
    [filters, searchRadiusKm, selectedCategory, groupScalar],
  );
  const {
    data,
    isLoading,
    isError,
    isFetching,
    isPlaceholderData,
    refetch,
  } = useNearbyPlaces(searchCenter, activeFilters, 1, PAGE_SIZE);
  const { data: emergencyVets } = useEmergencyVets(searchCenter);

  // Client-side group narrowing only kicks in for drink / space_tag when
  // no sub-code is picked — everything else already fell through the
  // server filter and shouldn't be re-filtered here.
  const needsClientGroupFilter =
    !showEmergency && selectedCategory == null && selectedGroup != null && groupScalar == null;
  const places = useMemo(() => {
    const raw = showEmergency ? (emergencyVets ?? []) : (data?.items ?? []);
    if (!needsClientGroupFilter) return raw;
    const codes = GROUP_CODES[selectedGroup!];
    return raw.filter((p) =>
      (p.categories ?? []).some((code) => codes.includes(code)),
    );
  }, [showEmergency, emergencyVets, data, needsClientGroupFilter, selectedGroup]);

  // Memoized marker list. Keeps reference stable across parent re-renders
  // caused by non-marker state (viewport updates, chip toggles that don't
  // affect places, etc.) so KakaoMapProvider's useEffect([markers]) doesn't
  // needlessly tear down and re-add overlays.
  const mapMarkers = useMemo(
    () => toMapMarkers(places, selectedPlaceId),
    [places, selectedPlaceId],
  );

  const selectedPlace = selectedPlaceId != null
    ? places.find((p) => p.id === selectedPlaceId) ?? null
    : null;

  // Chip / emergency / recenter changes are treated as "user context
  // switched" — always drop the mini card. Data updates are handled by
  // the effect below so panning around doesn't close the card unless
  // the selected place actually fell out of the result set.
  useEffect(() => {
    setSelectedPlaceId(null);
  }, [selectedGroup, selectedCategory, showEmergency, recenterSeq]);

  // On every new result set, keep the mini card open iff the currently
  // selected place is still in the fresh items[]. Otherwise close it.
  // Functional setState avoids a stale closure on selectedPlaceId while
  // still letting the effect depend only on `data`.
  useEffect(() => {
    const items = data?.items ?? [];
    setSelectedPlaceId((currentId) => {
      if (currentId == null) return currentId;
      return items.some((p) => p.id === currentId) ? currentId : null;
    });
  }, [data]);

  // Idle fallback: track (center, timestamp) of the last search whose
  // result actually landed. If more than IDLE_FALLBACK_MS pass and the
  // most recent viewport center has drifted, force one refetch. Timer
  // is armed once and polls at 2s cadence; the effect re-arms whenever
  // its dependencies change.
  const lastSearchRef = useRef<{ center: Coordinates; at: number } | null>(null);
  useEffect(() => {
    if (!data || !debouncedViewport) return;
    // Stamp with the coord the fetch actually used (debounced), not
    // the live raw viewport. The fallback timer below compares raw
    // vs stamped to decide whether a fresh idle has been "lost".
    lastSearchRef.current = {
      center: debouncedViewport.center,
      at: Date.now(),
    };
  }, [data, debouncedViewport]);

  useEffect(() => {
    const id = setInterval(() => {
      const last = lastSearchRef.current;
      if (!last || !viewport) return;
      if (Date.now() - last.at < IDLE_FALLBACK_MS) return;
      const drift = haversineKm(viewport.center, last.center);
      if (drift < IDLE_FALLBACK_DRIFT_KM) return;
      // Stamp before refetch so we don't reenter until the next cycle.
      lastSearchRef.current = { center: viewport.center, at: Date.now() };
      void refetch();
    }, 2000);
    return () => clearInterval(id);
  }, [viewport, refetch]);

  // "내 위치" 버튼은 지도의 현재 뷰포트 중심이 GPS에서 충분히 벗어났을 때 노출.
  const showMyLocationBtn =
    !!location && !!viewport && haversineKm(location, viewport.center) >= MY_LOCATION_HINT_KM;

  // ── MapView 콜백 ────────────────────────────────────────────────────────
  const handleMarkerPress = useCallback((marker: MapMarker) => {
    const id = Number(marker.id);
    if (!Number.isNaN(id)) setSelectedPlaceId(id);
  }, []);

  const handleMapPress = useCallback(() => {
    setSelectedPlaceId(null);
  }, []);

  // idle 시 (center, bounds)를 받아 viewport 상태에 실린 값이 실제로
  // 바뀔 때만 setViewport — 동일 값이면 참조를 유지해 debounce/queryKey
  // 흐름에서 불필요한 재발동을 막는다.
  const handleRegionChange = useCallback((region: MapRegion) => {
    // Stale-idle gate. Drop messages whose embedded mountId doesn't
    // match the current MapView instance's recenterSeq. This blocks
    // idle events emitted by a just-superseded old WebView whose
    // native side hasn't been fully destroyed yet — observed to
    // arrive within ~22-58ms after a recenter jump. Purely id-based,
    // no timing threshold, so a hand pan on the current mount (whose
    // mountId matches) always passes through.
    if (region.mountId !== recenterSeqRef.current) {
      return;
    }
    const nextCenter: Coordinates = { latitude: region.lat, longitude: region.lng };
    const nextRadius = computeRadiusFromBounds(region.bounds);
    setViewport((prev) => {
      if (
        prev &&
        prev.center.latitude === nextCenter.latitude &&
        prev.center.longitude === nextCenter.longitude &&
        prev.radiusKm === nextRadius
      ) {
        return prev;
      }
      return { center: nextCenter, radiusKm: nextRadius };
    });
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  // User-interaction-start handler. Kakao fires this on `dragstart`
  // or `zoom_start` — i.e., the user is now actively driving the map.
  // Gate on mountId so a late event from a just-destroyed WebView
  // can't flip our source (identical policy to handleRegionChange's
  // stale-idle gate). Once accepted, switch searchSource to viewport
  // so subsequent fetches follow whatever the user pans/zooms to.
  const handleUserInteractionStart = useCallback(
    (event: { interactionType: "drag" | "zoom"; mountId: number }) => {
      if (event.mountId !== recenterSeqRef.current) return;
      setSearchSource("viewport");
    },
    [],
  );

  const handleMyLocation = async () => {
    try {
      await refreshLocation();
    } catch {
      // Swallow — refreshLocation already handles its own error state.
    }
    // Intent switch: my-location button always means "search my GPS".
    // Setting this back to 'location' both on the very first click
    // (already the initial value, no-op) and on any later click after
    // a user pan (real transition). React batches this with the
    // recenterSeq bump below so MapView remounts and the searchCenter
    // derivation flips in the same commit — no intermediate viewport
    // fetch slips through.
    setSearchSource("location");
    // NOTE: seed A viewport is intentionally NOT set here anymore.
    // Setting it in this handler read `location` from the closure —
    // i.e., state.location as of the render this handler was created,
    // which is BEFORE `await refreshLocation()` could commit a fresh
    // GPS value. The MapView remount below opens at state.location AT
    // COMMIT (post-refreshLocation), so the two coords could diverge
    // and search would fire at a stale coord while the map showed
    // the fresh one. The seed A / bypass logic now lives in the
    // `[recenterSeq]` useEffect below, which reads state.location
    // AFTER commit — same source, same snapshot, no divergence.
    //
    // Pull the next mountId from the module-scope monotonic counter
    // rather than deriving from prev+1. Empirically `prev+1` still
    // let stale idles slip through the gate, either because two
    // remounts landed on the same value under some concurrency edge
    // case or because the ref hadn't refreshed by the time the OLD
    // WebView sent its last idle. This path removes both risks:
    //   1. `++mapMountCounter` is strictly monotonic across the whole
    //      module lifetime, so a new MapView can never share a mountId
    //      with any previous one.
    //   2. We write to recenterSeqRef SYNCHRONOUSLY here (before the
    //      setRecenterSeq commit) so the stale-idle gate compares
    //      against the new value from the very next JS tick — no
    //      window between commit and the useEffect that would echo it.
    const nextUid = ++mapMountCounter;
    recenterSeqRef.current = nextUid;
    setRecenterSeq(nextUid);
  };

  // Seed A via effect. Fires after the commit that bumped
  // recenterSeq, so `location` in this closure is the exact same
  // state.location value MapView used for its `initialLatitude`
  // prop (the "confirmed GPS" from the just-completed refreshLocation).
  // This guarantees seed A viewport and the map's initial camera
  // share a single source of truth — no closure staleness. Deps are
  // `[recenterSeq]` alone so hand-pan (which never changes
  // recenterSeq) never fires this, and viewport/radius are read
  // fresh at effect time from the current render scope.
  useEffect(() => {
    if (recenterSeq === 0) return;
    if (!location) {
      // Defensive: the button is gated on `location` being set, but
      // keep the state machine unstuck if it somehow lands null.
      setViewport(null);
      return;
    }
    bypassNextDebounceRef.current = true;
    setViewport({
      center: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      radiusKm: viewport?.radiusKm ?? 5,
    });
    // Intentionally omitted from deps — this effect must ONLY fire
    // on recenterSeq change (my-location button), never on a
    // location or viewport update by itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSeq]);

  // Group chip: switching to a different group clears any active
  // sub-code so we never keep a stale "korean" chip highlighted after
  // the user jumps to the drink row. Re-tapping the active group is the
  // full-reset gesture.
  const handleGroupPress = (g: CategoryGroup) => {
    setShowEmergency(false);
    if (selectedGroup === g) {
      setSelectedGroup(null);
      setSelectedCategory(null);
    } else {
      setSelectedGroup(g);
      setSelectedCategory(null);
    }
  };

  const handleCategoryPress = (cat: string) => {
    setShowEmergency(false);
    setSelectedCategory((prev) => (prev === cat ? null : cat));
  };

  // State 3-way, revised: `hasResults` (any items to render, including
  // stale placeholder) drives the header count and "updating" badge,
  // while `hasRealResults` (items came from a successful fetch of the
  // CURRENT queryKey) drives the loading / error / empty swaps. Under
  // `placeholderData: keepPreviousData`, the previous query's items
  // linger as placeholder while a new fetch is in-flight; the earlier
  // logic keyed everything off `hasResults`, so a failed refetch left
  // stale items on screen with no error / retry UI. Splitting the
  // predicates lets us keep the "don't blank the list while updating"
  // UX AND surface a real failure the moment it happens.
  const hasResults = places.length > 0;
  const hasRealResults = hasResults && !isPlaceholderData;
  const showLoading = isLoading && !hasRealResults;
  const showError = !isFetching && isError && !hasRealResults;
  const showEmpty = !isFetching && !isError && !isLoading && !hasRealResults;
  const showRefreshing = isFetching && hasResults;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* 지도 영역 — MapView 인터페이스만 사용하므로 provider 교체 영향 없음.
          GPS가 확정되기 전에는 Kakao 지도를 마운트하지 않는다: 옛 코드는
          location==null일 때 하드코딩된 (37.5665,126.978) 폴백으로 즉시
          마운트했고, 그 좌표에서 첫 idle이 발화 → viewport / searchCenter가
          시청 좌표에 고착되었다(사용자가 지도를 pan해도 서버 검색은 여전히
          시청 기준). location이 잡힌 뒤에 마운트하면 첫 idle이 곧바로
          실제 GPS에서 발화하므로 초기 검색과 이후 idle 검색이 같은
          viewport 소스를 공유하게 된다. */}
      <View style={styles.mapContainer}>
        {location ? (
          <ErrorBoundary fallbackLabel={t("map.render_error")}>
            <MapView
              key={`map-${recenterSeq}`}
              mountId={recenterSeq}
              initialLatitude={location.latitude}
              initialLongitude={location.longitude}
              markers={mapMarkers}
              onMarkerPress={handleMarkerPress}
              onRegionChange={handleRegionChange}
              onMapPress={handleMapPress}
              onUserInteractionStart={handleUserInteractionStart}
            />
          </ErrorBoundary>
        ) : (
          <View style={styles.mapLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}

        {/* 긴급 동물병원 버튼 — Phase 1 MVP에서는 hide. state/로직은 유지. */}
        {MVP_SHOW_EMERGENCY_VET && (
          <TouchableOpacity
            style={[styles.emergencyBtn, showEmergency && styles.emergencyBtnActive]}
            onPress={() => {
              setShowEmergency((p) => !p);
              setSelectedGroup(null);
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

        {/* 내 위치 버튼 — 현재 뷰포트가 사용자 GPS에서 충분히 벗어났을 때만. */}
        {showMyLocationBtn && (
          <TouchableOpacity
            style={styles.myLocationBtn}
            onPress={handleMyLocation}
            accessibilityLabel={t("map.my_location")}
            disabled={locationLoading}
          >
            {locationLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="locate" size={20} color={Colors.primary} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* 카테고리 탭 (2-tier) */}
      <View style={styles.categoryBar}>
        {/* 1행: 그룹 칩 4개. 필터 버튼과 나란히 배치. */}
        <View style={styles.groupRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {GROUPS.map((g) => {
              const active = selectedGroup === g;
              return (
                <TouchableOpacity
                  key={g}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => handleGroupPress(g)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      active && styles.categoryChipTextActive,
                    ]}
                  >
                    {t(`categoryGroups.${g}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilter(true)}>
            <Ionicons name="options-outline" size={20} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* 2행: 선택된 그룹의 세부 code 칩들 (수축된 스타일로 구분). */}
        {selectedGroup && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.categoryScroll,
              styles.subCategoryScroll,
            ]}
          >
            {GROUP_CODES[selectedGroup].map((code) => {
              const active = selectedCategory === code;
              return (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.subCategoryChip,
                    active && styles.subCategoryChipActive,
                  ]}
                  onPress={() => handleCategoryPress(code)}
                >
                  <Text
                    style={[
                      styles.subCategoryChipText,
                      active && styles.subCategoryChipTextActive,
                    ]}
                  >
                    {t(`categories.${code}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* 장소 목록 */}
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {showEmergency ? t("map.emergency_vet") : t("map.title")}
          </Text>
          <View style={styles.listHeaderRight}>
            {showRefreshing && (
              <View
                style={styles.updatingBadge}
                accessibilityLabel={t("map.updating")}
              >
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.updatingText}>{t("map.updating")}</Text>
              </View>
            )}
            <Text style={styles.listCount}>{t("map.results_count", { count: places.length })}</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.md }}
        >
          {showLoading && (
            <View style={styles.stateBlock}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.stateText}>{t("map.loading")}</Text>
            </View>
          )}
          {showError && (
            <View style={styles.stateBlock}>
              <Text style={styles.stateText}>{t("map.load_error")}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => refetch()}
                accessibilityRole="button"
              >
                <Ionicons name="refresh" size={14} color={Colors.surface} />
                <Text style={styles.retryText}>{t("map.retry")}</Text>
              </TouchableOpacity>
            </View>
          )}
          {showEmpty && (
            <View style={styles.stateBlock}>
              <Text style={styles.stateText}>{t("map.no_places_in_view")}</Text>
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
  // Full-container spinner shown while useLocation is still resolving
  // the first GPS fix. As soon as `location` becomes non-null we swap
  // in the real MapView. mapContainer supplies the gray background so
  // the loader looks like a placeholder rather than a blank void.
  mapLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
  categoryBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
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
  subCategoryScroll: {
    paddingTop: Spacing.sm,
  },
  // Sub-chip is visually softer than the group chip: no fill, thinner
  // vertical padding so the second row reads as "narrowing within the
  // group above" rather than a competing primary control.
  subCategoryChip: {
    paddingHorizontal: Spacing.md - 2,
    paddingVertical: Spacing.xs + 1,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subCategoryChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "15",
  },
  subCategoryChipText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  subCategoryChipTextActive: {
    color: Colors.primary,
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
  // Header-side background refresh indicator. Small enough that new
  // viewport churn doesn't feel intrusive, but visible enough that the
  // user knows why the pin layer is briefly out of date. Colors mirror
  // the loading-state palette (primary tint) so we don't introduce a
  // new accent.
  listHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  updatingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary + "12",
  },
  updatingText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: "600",
  },
  // Shared shell for the three exclusive list states (loading / error /
  // empty). Same alignment + spacing so switches between them don't
  // jump the layout.
  stateBlock: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  stateText: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  retryText: {
    ...Typography.button,
    color: Colors.surface,
  },
});
