import React, { useEffect, useRef, useCallback, forwardRef } from "react";
import { StyleSheet, View, Text } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { MapViewProps, MapMarker } from "../types";

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
      width: 30px; height: 30px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      cursor: pointer;
    }
    .info-bubble {
      background: white;
      border-radius: 8px;
      padding: 7px 13px;
      font-size: 12px;
      font-weight: 700;
      font-family: -apple-system, sans-serif;
      white-space: nowrap;
      max-width: 170px;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 3px 10px rgba(0,0,0,0.22);
      position: relative;
      color: #111;
    }
    .info-bubble::after {
      content: '';
      position: absolute;
      bottom: -7px;
      left: 50%;
      transform: translateX(-50%);
      width: 0; height: 0;
      border-left: 7px solid transparent;
      border-right: 7px solid transparent;
      border-top: 7px solid white;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = null;
    var mapLoaded = false;
    var pendingMarkers = null;
    var currentMarkers = [];
    var currentTooltip = null;

    kakao.maps.load(function() {
      var container = document.getElementById('map');
      map = new kakao.maps.Map(container, {
        center: new kakao.maps.LatLng(${lat}, ${lng}),
        level: 5
      });

      mapLoaded = true;

      // 지도 이동 완료 → RN에 중심 좌표 전송
      kakao.maps.event.addListener(map, 'idle', function() {
        var c = map.getCenter();
        sendToRN({ type: 'regionChange', lat: c.getLat(), lng: c.getLng() });
      });

      // 지도 빈 곳 클릭 → 말풍선 닫기
      kakao.maps.event.addListener(map, 'click', function() {
        hideTooltip();
      });

      // RN이 먼저 주입한 마커가 있으면 우선 사용, 없으면 초기 데이터 사용
      var initial = ${markersJson};
      var toRender = (pendingMarkers !== null) ? pendingMarkers : initial;
      pendingMarkers = null;
      if (toRender.length > 0) _renderMarkers(toRender);

      sendToRN({ type: 'mapReady' });
    });

    function sendToRN(data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }

    function updateMarkers(markersData) {
      if (!mapLoaded) {
        // 맵 준비 전이면 큐에 저장 — kakao.maps.load 완료 시 처리
        pendingMarkers = markersData;
        return;
      }
      _renderMarkers(markersData);
    }

    function _renderMarkers(markersData) {
      // 기존 마커 제거
      currentMarkers.forEach(function(item) { item.overlay.setMap(null); });
      currentMarkers = [];
      hideTooltip();

      markersData.forEach(function(data) {
        var position = new kakao.maps.LatLng(data.latitude, data.longitude);
        var content = '<div class="custom-pin" data-marker-id="' + data.id
          + '" style="background:' + data.color + ';"></div>';

        var overlay = new kakao.maps.CustomOverlay({
          position: position,
          content: content,
          yAnchor: 1,
          zIndex: 3
        });
        overlay.setMap(map);
        currentMarkers.push({ overlay: overlay, data: data, position: position });
      });
    }

    function showTooltip(data, position) {
      hideTooltip();
      var el = document.createElement('div');
      el.className = 'info-bubble';
      el.textContent = data.title;

      currentTooltip = new kakao.maps.CustomOverlay({
        content: el,
        position: position,
        yAnchor: 2.3,
        zIndex: 10
      });
      currentTooltip.setMap(map);
    }

    function hideTooltip() {
      if (currentTooltip) { currentTooltip.setMap(null); currentTooltip = null; }
    }

    // 마커 DOM이 추가되면 클릭 이벤트 바인딩
    var observer = new MutationObserver(function() {
      document.querySelectorAll('.custom-pin:not([data-bound])').forEach(function(el) {
        el.setAttribute('data-bound', 'true');
        el.addEventListener('click', function(e) {
          e.stopPropagation();
          var markerId = el.getAttribute('data-marker-id');
          var item = currentMarkers.find(function(m) {
            return String(m.data.id) === String(markerId);
          });
          if (!item) return;
          showTooltip(item.data, item.position);
          sendToRN({ type: 'markerPress', marker: item.data });
        });
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

  // 빌드 시점에 환경변수 인라인이 실패하면 apiKey가 빈 문자열로 들어와 SDK URL이 깨진다.
  // 그 경우 WebView를 시도조차 하지 말고 진단 정보를 화면에 표시한다.
  if (!apiKey) {
    return (
      <View style={styles.diagnostic}>
        <Text style={styles.diagnosticTitle}>지도를 로드할 수 없습니다</Text>
        <Text style={styles.diagnosticBody}>
          EXPO_PUBLIC_KAKAO_MAP_JS_KEY가 빌드에 주입되지 않았습니다.
          {"\n"}eas.json의 build.&lt;profile&gt;.env를 확인하세요.
        </Text>
      </View>
    );
  }

  const injectMarkers = useCallback(
    (markerList: MapMarker[]) => {
      const markersWithColor = markerList.map((m) => ({
        ...m,
        color: CATEGORY_COLORS[m.category] ?? "#FF6B35",
      }));
      webViewRef.current?.injectJavaScript(
        `updateMarkers(${JSON.stringify(markersWithColor)}); true;`
      );
    },
    []
  );

  // 마커 변경 시 WebView에 주입
  useEffect(() => {
    injectMarkers(markers);
  }, [markers, injectMarkers]);

  // 페이지 로드 완료 후 현재 마커 재주입 (SDK 로드 전 injection 대비)
  const handleLoadEnd = useCallback(() => {
    if (markers.length > 0) injectMarkers(markers);
  }, [markers, injectMarkers]);

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

  const setRef = (node: WebView | null) => {
    (webViewRef as React.MutableRefObject<WebView | null>).current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={setRef}
        // baseUrl을 명시하면 inline HTML의 origin이 null/about:blank이 아니라
        // 이 도메인으로 인식되어 카카오 JS SDK의 도메인 검증을 통과한다.
        // (카카오 콘솔 Web 플랫폼에 http://localhost 가 등록되어 있어야 한다.)
        source={{ html, baseUrl: "https://localhost" }}
        style={styles.webview}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
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
  diagnostic: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "#FEF3C7",
    gap: 8,
  },
  diagnosticTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E",
  },
  diagnosticBody: {
    fontSize: 12,
    color: "#78350F",
    textAlign: "center",
    lineHeight: 18,
  },
});

export default KakaoMapProvider;
