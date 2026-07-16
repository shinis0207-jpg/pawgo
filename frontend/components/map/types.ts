export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  category: "cafe" | "hotel" | "park" | "hospital" | "restaurant";
  // When true, the pin draws in an enlarged "selected" style so the user can
  // see which pin matches the floating mini card. Optional — providers that
  // don't render a selection state simply ignore it.
  highlighted?: boolean;
}

export interface MapRegion {
  lat: number;
  lng: number;
  // Geographic bounds of the visible viewport at idle time. Used by the
  // caller to translate "what the user is looking at" into a search
  // radius without leaking provider-specific concepts (Kakao level,
  // Google zoom) across the interface.
  bounds: {
    sw: { lat: number; lng: number };
    ne: { lat: number; lng: number };
  };
  // Identifies which MapView instance produced this idle. The provider
  // embeds the `MapViewProps.mountId` it was rendered with into the
  // web layer / HTML and echoes it back on every idle. The caller
  // compares this against the CURRENT expected mountId to spot idle
  // events emitted by an about-to-be-destroyed old instance whose
  // native side hasn't been torn down yet.
  mountId: number;
}

export interface MapViewProps {
  initialLatitude: number;
  initialLongitude: number;
  // Stable-per-mount identifier supplied by the caller. The provider
  // must embed this value into any layer that outlives a render
  // (WebView HTML, native subview state) and echo it back on
  // `onRegionChange` so the caller can gate out stale idles from a
  // previous mount. Value doesn't need to be globally unique — just
  // different from any concurrently-alive previous mount. In practice
  // the caller uses its own remount-sequence counter.
  mountId: number;
  markers: MapMarker[];
  onMarkerPress: (marker: MapMarker) => void;
  // Fires on the map's idle event (pan or zoom settle). Delivers the
  // new center AND the visible viewport bounds so the caller can drive
  // viewport-based search behavior on top of the same channel.
  onRegionChange: (region: MapRegion) => void;
  // Fired when the user taps the map background (not a pin). Used to dismiss
  // the mini card. Optional so providers/callers that don't need it can skip.
  onMapPress?: () => void;
  // Fires the moment the SDK reports a user-initiated interaction has
  // begun (drag or zoom). This is the ONLY reliable "user is now
  // driving the map" signal we get from Kakao — `idle` fires for both
  // SDK settling and user gestures indistinguishably, so callers that
  // need to know "search intent switched from GPS to what-user-sees"
  // subscribe here. `mountId` mirrors the same stale-idle-gate value
  // carried by regionChange so late events from a superseded mount
  // can be dropped identically.
  onUserInteractionStart?: (event: {
    interactionType: "drag" | "zoom";
    mountId: number;
  }) => void;
}

export type MapProvider = "kakao" | "google";
