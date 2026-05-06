export type Language = "ko" | "en" | "ja" | "zh";

export type PlaceCategory = "accommodation" | "restaurant" | "cafe" | "park" | "vet";

export interface User {
  id: number;
  email: string;
  name: string;
  language: Language;
  profile_image_url: string | null;
  is_verified: boolean;
  created_at: string;
}

export interface Pet {
  id: number;
  user_id: number;
  name: string;
  type: string;
  breed: string | null;
  weight_kg: number | null;
  birth_date: string | null;
  chip_id: string | null;
  photo_url: string | null;
  vaccination_records: VaccinationRecord[] | null;
  notes: string | null;
  created_at: string;
}

export interface VaccinationRecord {
  name: string;
  date: string;
  next_due: string | null;
  vet_name: string | null;
}

export interface PlacePhoto {
  id: number;
  url: string;
  caption: string | null;
  is_primary: boolean;
}

export interface Place {
  id: number;
  name: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  address: string;
  city: string | null;
  phone: string | null;
  website: string | null;
  hours: Record<string, string> | null;
  max_weight_kg: number | null;
  allows_indoor: boolean;
  allows_outdoor: boolean;
  has_parking: boolean;
  entrance_fee: string | null;
  description: string | null;
  thumbnail_url: string | null;
  rating: number;
  review_count: number;
  is_verified: boolean;
  photos: PlacePhoto[];
  distance_km: number | null;
  created_at: string;
}

export interface PlaceListResponse {
  items: Place[];
  total: number;
  page: number;
  size: number;
}

export interface Review {
  id: number;
  place_id: number;
  user: {
    id: number;
    name: string;
    profile_image_url: string | null;
  };
  pet: {
    id: number;
    name: string;
    type: string;
    photo_url: string | null;
  } | null;
  rating: number;
  content: string | null;
  visit_date: string | null;
  is_helpful_count: number;
  photos: { id: number; url: string }[];
  created_at: string;
}

export interface PlaceFilter {
  category?: PlaceCategory;
  max_weight_kg?: number;
  allows_indoor?: boolean;
  has_parking?: boolean;
  radius_km?: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}
