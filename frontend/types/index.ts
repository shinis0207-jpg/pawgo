export type Language = "ko" | "en" | "ja" | "zh";

// Mirrors backend/app/models/user.py::UserRole. Admin role is granted via the
// ADMIN_EMAILS allowlist at register/login time — see services/auth.py.
export type UserRole = "user" | "admin";

export type PlaceCategory = "accommodation" | "restaurant" | "cafe" | "park" | "vet";

// Phase 2A backend enum — DB stores lowercase; matches values_callable on the
// model. Keep this in sync with backend/app/models/pet_policy.py::VerificationStatus.
export type VerificationStatus =
  | "official_verified"
  | "owner_verified"
  | "admin_verified"
  | "user_reported"
  | "under_review"
  | "unknown";

export type PetAllowedStatus = "allowed" | "limited" | "not_allowed" | "unknown";

export type PolicySource =
  | "mfds"
  | "owner"
  | "admin"
  | "user_report"
  | "external"
  | "unknown";

export type CorrectionRequestCategory =
  | "pet_allowed_wrong"
  | "closed_down"
  | "address_changed"
  | "phone_changed"
  | "info_outdated"
  | "other";

export type CorrectionRequestStatus =
  | "pending"
  | "reviewing"
  | "approved"
  | "rejected";

export interface CorrectionRequestPlaceMini {
  id: number;
  name: string;
  category: PlaceCategory;
}

export interface CorrectionRequest {
  id: number;
  place_id: number;
  /** Phase 2D backend projection: minimal embedded place. */
  place: CorrectionRequestPlaceMini;
  user_id: number | null;
  request_category: CorrectionRequestCategory;
  description: string;
  current_info: Record<string, unknown> | null;
  requested_info: Record<string, unknown> | null;
  evidence_image_url: string | null;
  visit_date: string | null;
  status: CorrectionRequestStatus;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface CorrectionRequestCreatePayload {
  place_id: number;
  request_category: CorrectionRequestCategory;
  description: string;
  // requested_info is intentionally omitted in the v1 mobile form — admins
  // read the free-text description and propose the change themselves.
  visit_date?: string;
}

export interface PetPolicy {
  pet_allowed_status: PetAllowedStatus;
  verification_status: VerificationStatus;
  indoor_allowed: boolean | null;
  outdoor_allowed: boolean | null;
  dog_allowed: boolean | null;
  cat_allowed: boolean | null;
  max_weight_kg: number | null;
  leash_required: boolean | null;
  carrier_required: boolean | null;
  vaccination_required: boolean | null;
  notes: string | null;
  policy_source: PolicySource;
  confidence_score: number;
  last_verified_at: string | null;
}

export interface User {
  id: number;
  email: string;
  name: string;
  language: Language;
  profile_image_url: string | null;
  is_verified: boolean;
  // Backend already includes role in every /auth/* response (login, register,
  // /me, oauth). Gates the admin-only entry point in the profile tab.
  role: UserRole;
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
  // Phase 2A: backend exposes a nested pet_policy block on the place
  // response. Optional here because legacy callers may not select it.
  pet_policy?: PetPolicy | null;
  distance_km: number | null;
  created_at: string;
}

export interface PlaceListResponse {
  items: Place[];
  total: number;
  page: number;
  size: number;
}

export interface Favorite {
  id: number;
  place_id: number;
  created_at: string;
  /** Backend hydrates the full place payload so list screens reuse PlaceCard. */
  place: Place;
}

export interface FavoriteListResponse {
  items: Favorite[];
  total: number;
  page: number;
  page_size: number;
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
  q?: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}
