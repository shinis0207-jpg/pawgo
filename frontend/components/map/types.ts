export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  category: "cafe" | "hotel" | "park" | "hospital" | "restaurant";
}

export interface MapViewProps {
  initialLatitude: number;
  initialLongitude: number;
  markers: MapMarker[];
  onMarkerPress: (marker: MapMarker) => void;
  onRegionChange: (lat: number, lng: number) => void;
}

export type MapProvider = "kakao" | "google";
