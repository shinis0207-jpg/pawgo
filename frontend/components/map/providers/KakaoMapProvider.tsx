import React, { useEffect, useRef, useCallback, forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { MapViewProps, MapMarker } from "../types";

// 카테고리별 핀 색상
const CATEGORY_COLORS: Record<MapMarker["category"], string> = {
  cafe: "#8B5CF6",
  hotel: "#6366F1",
  restaurant: "#F59E0B",
  park: "#10B981",
  hospital: "#EF4444",
};

function buildMapHtml(
  apiKey: string,
  lat: number,
  lng: number,
  markers: MapMarker[]
): string {
  const markersJson = JSON.stringify(
    markers.map((m) => ({
      ...m,
      color: CATEGORY_COLORS[m.category] ?? "#FF6B35",
    }))
  );

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100vh; overflow: hidden; }
    .custom-pin {
      width: 32px; height: 32px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      cursor: pointer;
    }
    .custom-pin-inner {
      width: 100%; height: 100%;
      border-radius: 50% 50% 50% 0;
      display: flex; align-items: center; justify-content: center;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map, currentMarkers = [];

    kakao.maps.load(function() {
      var container = document.getElementById('map');
      map = new kakao.maps.Map(container, {
        center: new kakao.maps.LatLng(${lat}, ${lng}),
        level: 5
      });

      // 지도 이동 완료 시 중심 좌표 전송
      kakao.maps.event.addListener(map, 'idle', function() {
        var center = map.getCenter();
        sendToRN({ type: 'regionChange', lat: center.getLat(), lng: center.getLng() });
      });

      // 초기 마커 렌더
      updateMarkers(${markersJson});
    });

    function sendToRN(data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }

    function updateMarkers(markersData) {
      // 기존 마커 제거
      currentMarkers.forEach(function(item) { item.overlay.setMap(null); });
      currentMarkers = [];

      markersData.forEach(function(data) {
        var position = new kakao.maps.LatLng(data.latitude, data.longitude);

        // CustomOverlay로 카테고리별 색상 핀 생성
        var content = '<div class="custom-pin" style="background:' + data.color + ';">'
          + '<div class="custom-pin-inner"></div>'
          + '</div>';

        var overlay = new kakao.maps.CustomOverlay({
          position: position,
          content: content,
          yAnchor: 1,
          zIndex: 3
        });
        overlay.setMap(map);

        // 클릭 이벤트는 DOM 이벤트로 처리
        (function(markerData, el) {
          el.addEventListener('click', function() {
            sendToRN({ type: 'markerPress', marker: markerData });
          });
        })(data, overlay.getContent());

        currentMarkers.push({ overlay: overlay, data: data });
      });
    }

    // React Native에서 마커 업데이트 요청 수신
    function handleRNMessage(message) {
      var msg = JSON.parse(message);
      if (msg.type === 'updateMarkers') updateMarkers(msg.markers);
      if (msg.type === 'moveCamera') {
        map.setCenter(new kakao.maps.LatLng(msg.lat, msg.lng));
      }
    }

    // CustomOverlay content는 문자열이므로 동적 이벤트 바인딩을 위해
    // MutationObserver로 DOM 추가 감지
    var observer = new MutationObserver(function() {
      document.querySelectorAll('.custom-pin').forEach(function(el) {
        if (!el.dataset.bound) {
          el.dataset.bound = 'true';
          el.addEventListener('click', function(e) {
            var idx = Array.from(document.querySelectorAll('.custom-pin')).indexOf(el);
            if (currentMarkers[idx]) {
              sendToRN({ type: 'markerPress', marker: currentMarkers[idx].data });
            }
          });
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  </script>
</body>
</html>`;
}

const KakaoMapProvider = forwardRef<WebView, MapViewProps>(function KakaoMapProvider(
  { initialLatitude, initialLongitude, markers, onMarkerPress, onRegionChange },
  forwardedRef
) {
  const webViewRef = useRef<WebView>(null);
  const apiKey = process.env.EXPO_PUBLIC_KAKAO_MAP_JS_KEY ?? "";

  // 마커가 바뀔 때 WebView에 주입 (전체 리로드 없이 업데이트)
  useEffect(() => {
    const markersWithColor = markers.map((m) => ({
      ...m,
      color: CATEGORY_COLORS[m.category] ?? "#FF6B35",
    }));
    webViewRef.current?.injectJavaScript(
      `updateMarkers(${JSON.stringify(markersWithColor)}); true;`
    );
  }, [markers]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === "markerPress") onMarkerPress(msg.marker);
        if (msg.type === "regionChange") onRegionChange(msg.lat, msg.lng);
      } catch {}
    },
    [onMarkerPress, onRegionChange]
  );

  const html = buildMapHtml(apiKey, initialLatitude, initialLongitude, markers);

  // 내부 ref와 forwardedRef를 동시에 유지
  const setRef = (node: WebView | null) => {
    (webViewRef as React.MutableRefObject<WebView | null>).current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={setRef}
        source={{ html }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
        onShouldStartLoadWithRequest={() => true}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});

export default KakaoMapProvider;

