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

export interface MapViewProps {
  initialLatitude: number;
  initialLongitude: number;
  markers: MapMarker[];
  onMarkerPress: (marker: MapMarker) => void;
  onRegionChange: (lat: number, lng: number) => void;
  // Fired when the user taps the map background (not a pin). Used to dismiss
  // the mini card. Optional so providers/callers that don't need it can skip.
  onMapPress?: () => void;
}

export type MapProvider = "kakao" | "google";
