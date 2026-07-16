// TODO: Google Maps API 키 설정 후 활성화
// EXPO_PUBLIC_GOOGLE_MAPS_KEY=your-key 를 .env에 추가하고
// 아래 stub 코드를 실제 구현으로 교체하세요.
//
// 활성화 체크리스트:
//   1. Google Cloud Console에서 Maps SDK for Android/iOS 활성화
//   2. .env 에 EXPO_PUBLIC_GOOGLE_MAPS_KEY 추가
//   3. app.json android.config.googleMaps.apiKey 설정
//   4. EXPO_PUBLIC_MAP_PROVIDER=google 으로 변경
//   5. 아래 주석 해제

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MapViewProps } from "../types";

// ── 실제 구현 시 아래 import로 교체 ──────────────────────────────────────
// import RNMapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
// ─────────────────────────────────────────────────────────────────────────

export default function GoogleMapProvider(_props: MapViewProps) {
  // ── 실제 구현 시 이 블록으로 교체 ────────────────────────────────────────
  // const { initialLatitude, initialLongitude, markers, onMarkerPress, onRegionChange } = _props;
  // return (
  //   <RNMapView
  //     provider={PROVIDER_GOOGLE}
  //     style={styles.map}
  //     initialRegion={{
  //       latitude: initialLatitude,
  //       longitude: initialLongitude,
  //       latitudeDelta: 0.05,
  //       longitudeDelta: 0.05,
  //     }}
  //     onRegionChangeComplete={(r) => {
  //       // rn-maps supplies latitudeDelta/longitudeDelta; derive SW/NE from those.
  //       const sw = { lat: r.latitude - r.latitudeDelta / 2, lng: r.longitude - r.longitudeDelta / 2 };
  //       const ne = { lat: r.latitude + r.latitudeDelta / 2, lng: r.longitude + r.longitudeDelta / 2 };
  //       onRegionChange({ lat: r.latitude, lng: r.longitude, bounds: { sw, ne } });
  //     }}
  //   >
  //     {markers.map((marker) => (
  //       <Marker
  //         key={marker.id}
  //         coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
  //         title={marker.title}
  //         pinColor={CATEGORY_COLORS[marker.category]}
  //         onPress={() => onMarkerPress(marker)}
  //       />
  //     ))}
  //   </RNMapView>
  // );
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.stub}>
      <Text style={styles.stubText}>🗺️ Google Maps</Text>
      <Text style={styles.stubSub}>
        EXPO_PUBLIC_MAP_PROVIDER=google 으로 전환 후{"\n"}
        GoogleMapProvider.tsx의 stub 코드를 활성화하세요.
      </Text>
    </View>
  );
}

// const CATEGORY_COLORS: Record<string, string> = {
//   cafe: "#8B5CF6",
//   hotel: "#6366F1",
//   restaurant: "#F59E0B",
//   park: "#10B981",
//   hospital: "#EF4444",
// };

const styles = StyleSheet.create({
  stub: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f4f8",
    gap: 8,
  },
  stubText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#4A5568",
  },
  stubSub: {
    fontSize: 13,
    color: "#718096",
    textAlign: "center",
    lineHeight: 20,
  },
});
