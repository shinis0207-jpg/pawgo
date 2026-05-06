import React, { lazy, Suspense } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { MapViewProps, MapProvider } from "./types";

// 환경변수로 provider 선택. 빌드 타임에 결정되므로 조건 분기가 tree-shake됨.
const provider = (process.env.EXPO_PUBLIC_MAP_PROVIDER ?? "kakao") as MapProvider;

// React.lazy를 사용하지 않고 정적 import + 조건 분기로 처리.
// Metro bundler는 동적 import를 완전히 지원하지 않으므로 이 방식이 안전하다.
import KakaoMapProvider from "./providers/KakaoMapProvider";
import GoogleMapProvider from "./providers/GoogleMapProvider";

const ProviderMap: Record<MapProvider, React.ComponentType<MapViewProps>> = {
  kakao: KakaoMapProvider,
  google: GoogleMapProvider,
};

/**
 * 지도 단일 진입점.
 *
 * MAP_PROVIDER 환경변수(기본: kakao)에 따라 구현체를 자동 선택한다.
 * 이 파일 외부에서는 provider를 알 필요가 없다.
 *
 * @example
 * import MapView from '@/components/map/MapView'
 * <MapView initialLatitude={37.5665} initialLongitude={126.9780} ... />
 */
export default function MapView(props: MapViewProps) {
  const Provider = ProviderMap[provider] ?? KakaoMapProvider;
  return (
    <Suspense fallback={<MapLoadingFallback />}>
      <Provider {...props} />
    </Suspense>
  );
}

function MapLoadingFallback() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#FF6B35" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8F9FA",
  },
});
