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

// Selected-pin override. Tailwind blue-500 — chosen to stand out against the
// warm category colors above so the user can find the active pin at a glance.
const SELECTED_PIN_COLOR = "#3B82F6";

function buildMapHtml(
  apiKey: string,
  lat: number,
  lng: number,
  mountId: number,
): string {
  // markers are intentionally NOT inlined into the HTML — they are injected
  // via webViewRef.injectJavaScript(updateMarkers(...)) from a useEffect on
  // the React side. Inlining them here would change the html string every
  // time `markers` changes, which would change WebView's `source` prop and
  // force a page reload — wiping the user's pan/zoom and snapping the map
  // back to initialLatitude/Longitude (= GPS). Keeping the HTML independent
  // of markers makes the map carry its camera state across data updates.

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
    /* Selected-pin treatment. Larger + thicker border so the active pin is
       obvious among the warm-toned category pins. The background-color
       inline-style is overridden per-marker from RN with SELECTED_PIN_COLOR. */
    .custom-pin.selected {
      width: 38px; height: 38px;
      border-width: 3px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.45);
      z-index: 10;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    // Stable-per-mount identifier injected by the RN side. Every event
    // this page ships back to RN includes this value so the RN handler
    // can drop messages that belong to a superseded mount whose
    // native WebView hasn't been torn down yet.
    var __mountId = ${mountId};
    var map = null;
    var mapLoaded = false;
    var pendingMarkers = null;
    var currentMarkers = [];

    // Post-mount relayout+setCenter latch. WebView frames on iOS
    // WKWebView (and some Android setups) are 0x0 at the moment
    // kakao.maps.load fires — the map is created against a degenerate
    // viewport and later idles report a ~886m-off center. The
    // ResizeObserver registered further below waits for the frame to
    // reach a valid size, then calls relayout() + setCenter(req) once
    // to align the SDK's internal coordinate system with the real
    // frame. All state is local to this HTML instance so a remount
    // starts clean; RN's mountId gate on the resulting idle is unchanged.
    // correctionApplied is the one-shot execution latch — do not
    // confuse it with anything else that once shared the name.
    var initialW = 0, initialH = 0;
    var correctionApplied = false;
    var userInteracted = false;

    kakao.maps.load(function() {
      var container = document.getElementById('map');
      map = new kakao.maps.Map(container, {
        center: new kakao.maps.LatLng(${lat}, ${lng}),
        level: 5
      });

      // Capture container size at map creation time and, only
      // if either dimension is 0, register a ResizeObserver that
      // waits for the frame to become valid, then applies one-shot
      // relayout+setCenter to realign the SDK's internal viewport.
      // reqLat/reqLng are the SAME template-substituted values the
      // Map was constructed with — DO NOT reach for RN state here,
      // the mount that created this HTML has ownership of that
      // coordinate for its lifetime.
      initialW = container.offsetWidth;
      initialH = container.offsetHeight;
      if (initialW === 0 || initialH === 0) {
        var _reqLat = ${lat};
        var _reqLng = ${lng};
        var ro = new ResizeObserver(function() {
          if (correctionApplied) return;
          if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
          if (userInteracted) {
            // User already started driving the map — do NOT snap the
            // camera back to the mount's requested coord. Latch and
            // disconnect to close out this mount's correction cycle.
            correctionApplied = true;
            ro.disconnect();
            return;
          }
          // Latch BEFORE the mutation so an exception inside the try
          // can never let a subsequent observer tick re-enter and
          // double-apply the correction. Observer is also disconnected
          // synchronously so no callback is queued after this point.
          correctionApplied = true;
          ro.disconnect();
          try {
            // Order matters: relayout() reconciles the SDK's internal
            // tile grid with the current container size FIRST, then
            // setCenter() reapplies the requested coordinate on top
            // of the corrected grid. Reversing the order would move
            // the center within the still-degenerate grid.
            map.relayout();
            map.setCenter(new kakao.maps.LatLng(_reqLat, _reqLng));
          } catch (e) {}
        });
        ro.observe(document.documentElement);
      }

      mapLoaded = true;

      // 지도 이동/줌 완료 → RN에 중심 + 뷰포트 bounds 전송.
      // bounds는 RN 쪽 viewport-based 검색 반경 계산의 유일한 입력이므로
      // idle마다 반드시 실을 것. Kakao level 등 SDK-specific 값은 안 넘긴다.
      kakao.maps.event.addListener(map, 'idle', function() {
        var c = map.getCenter();
        var b = map.getBounds();
        var sw = b.getSouthWest();
        var ne = b.getNorthEast();
        sendToRN({
          type: 'regionChange',
          mountId: __mountId,
          lat: c.getLat(),
          lng: c.getLng(),
          bounds: {
            sw: { lat: sw.getLat(), lng: sw.getLng() },
            ne: { lat: ne.getLat(), lng: ne.getLng() },
          },
        });
      });

      // 지도 빈 곳 클릭 → RN에 알려서 미니 카드를 닫게 함
      kakao.maps.event.addListener(map, 'click', function() {
        sendToRN({ type: 'mapClick' });
      });

      // 사용자 조작 시작 신호. Kakao의 idle 이벤트는 사용자 팬과 SDK 정착을
      // 구분하지 않으므로, "사용자가 지금 지도를 직접 움직이기 시작했다"는
      // 신호는 오직 dragstart/zoom_start에서만 얻을 수 있다. RN 쪽은 이걸
      // 받아 검색 좌표 소스를 GPS → viewport로 전환한다.
      kakao.maps.event.addListener(map, 'dragstart', function() {
        userInteracted = true;
        sendToRN({
          type: 'userInteractionStart',
          interactionType: 'drag',
          mountId: __mountId,
        });
      });
      kakao.maps.event.addListener(map, 'zoom_start', function() {
        userInteracted = true;
        sendToRN({
          type: 'userInteractionStart',
          interactionType: 'zoom',
          mountId: __mountId,
        });
      });

      // markers are never inlined; they arrive via injectJavaScript after the
      // page is ready. If injectJavaScript landed before kakao.maps.load
      // resolved, the call queued data into pendingMarkers — drain it now.
      if (pendingMarkers !== null) {
        var queued = pendingMarkers;
        pendingMarkers = null;
        if (queued.length > 0) _renderMarkers(queued);
      }

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

      markersData.forEach(function(data) {
        var position = new kakao.maps.LatLng(data.latitude, data.longitude);
        var cls = data.highlighted ? 'custom-pin selected' : 'custom-pin';
        var bg = data.highlighted ? '${SELECTED_PIN_COLOR}' : data.color;
        var content = '<div class="' + cls + '" data-marker-id="' + data.id
          + '" style="background:' + bg + ';"></div>';

        var overlay = new kakao.maps.CustomOverlay({
          position: position,
          content: content,
          yAnchor: 1,
          zIndex: data.highlighted ? 5 : 3
        });
        overlay.setMap(map);
        currentMarkers.push({ overlay: overlay, data: data, position: position });
      });
    }

    // 마커 DOM이 추가되면 클릭 이벤트 바인딩 — RN으로만 알려주고, 강조/
    // 미니 카드는 모두 RN 측이 처리한다. (예전엔 여기서 말풍선까지 띄웠지만
    // 미니 카드가 그 자리를 대체하므로 제거.)
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
  { initialLatitude, initialLongitude, mountId, markers, onMarkerPress, onRegionChange, onMapPress, onUserInteractionStart },
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
        highlighted: m.highlighted ?? false,
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
        if (msg.type === "regionChange") {
          onRegionChange({
            lat: msg.lat,
            lng: msg.lng,
            bounds: msg.bounds,
            // Pass through so the RN caller can gate stale idles from
            // a superseded MapView instance. The value is the mountId
            // this HTML was built with — different mounts produce
            // different HTML and therefore different embedded mountId.
            mountId: msg.mountId,
          });
        }
        if (msg.type === "mapClick") onMapPress?.();
        if (msg.type === "userInteractionStart") {
          onUserInteractionStart?.({
            interactionType: msg.interactionType,
            mountId: msg.mountId,
          });
        }
      } catch {}
    },
    [onMarkerPress, onRegionChange, onMapPress, onUserInteractionStart]
  );

  // html is a function of (apiKey, initialLatitude, initialLongitude,
  // mountId). markers are injected separately so marker updates don't
  // trigger a WebView reload (which used to snap the camera back to
  // initialLatitude/Longitude). mountId is baked in at build time so
  // every idle sent from this HTML carries the same fixed id.
  const html = buildMapHtml(apiKey, initialLatitude, initialLongitude, mountId);

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
