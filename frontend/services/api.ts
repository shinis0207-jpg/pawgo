import axios, { AxiosError } from "axios";
import * as SecureStore from "expo-secure-store";
import {
  PlaceFilter,
  PlaceListResponse,
  Place,
  Pet,
  Review,
  User,
  CorrectionRequest,
  CorrectionRequestCreatePayload,
  CorrectionRequestStatus,
} from "@/types";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync("auth_token");
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  register: (data: { email: string; name: string; password: string; language?: string }) =>
    apiClient.post("/auth/register", data),

  login: (email: string, password: string) =>
    apiClient.post("/auth/login", { email, password }),

  oauthLogin: (provider: string, access_token: string) =>
    apiClient.post("/auth/oauth", { provider, access_token }),

  getMe: () => apiClient.get<User>("/auth/me"),
};

// Pets
export const petsApi = {
  list: () => apiClient.get<Pet[]>("/pets"),

  create: (data: Partial<Pet>) => apiClient.post<Pet>("/pets", data),

  get: (id: number) => apiClient.get<Pet>(`/pets/${id}`),

  update: (id: number, data: Partial<Pet>) => apiClient.patch<Pet>(`/pets/${id}`, data),

  delete: (id: number) => apiClient.delete(`/pets/${id}`),
};

// Places
export const placesApi = {
  getNearby: (
    lat: number,
    lng: number,
    filters: PlaceFilter & { lang?: string; page?: number; size?: number }
  ) =>
    apiClient.get<PlaceListResponse>("/places/nearby", {
      params: { lat, lng, ...filters },
    }),

  get: (id: number, lang?: string) =>
    apiClient.get<Place>(`/places/${id}`, { params: { lang } }),

  create: (data: Partial<Place> & { latitude: number; longitude: number }) =>
    apiClient.post<Place>("/places", data),

  update: (id: number, data: Partial<Place>) => apiClient.patch<Place>(`/places/${id}`, data),

  getEmergencyVets: (lat: number, lng: number, radius_km?: number, lang?: string) =>
    apiClient.get<Place[]>("/places/emergency-vets", {
      params: { lat, lng, radius_km, lang },
    }),
};

// Reviews
export const reviewsApi = {
  listForPlace: (place_id: number, page?: number) =>
    apiClient.get<Review[]>(`/reviews/place/${place_id}`, { params: { page } }),

  create: (data: {
    place_id: number;
    pet_id?: number;
    rating: number;
    content?: string;
    visit_date?: string;
  }) => apiClient.post<Review>("/reviews", data),

  update: (id: number, data: { rating?: number; content?: string }) =>
    apiClient.patch<Review>(`/reviews/${id}`, data),

  delete: (id: number) => apiClient.delete(`/reviews/${id}`),
};

// AI
export const aiApi = {
  chat: (message: string, pet_info?: object, location?: object, conversation_history?: object[]) =>
    apiClient.post<{ response: string }>("/ai/chat", {
      message,
      pet_info,
      location,
      conversation_history,
    }),

  travelTips: (destination: string, pet_type: string, pet_weight?: number) =>
    apiClient.post<{ tips: string }>("/ai/travel-tips", {
      destination,
      pet_type,
      pet_weight,
    }),
};

// Correction requests (user side). admin queue lives at /admin/correction-requests
// and is consumed by a future admin UI, not from the mobile app.
export const correctionRequestsApi = {
  submit: (data: CorrectionRequestCreatePayload) =>
    apiClient.post<CorrectionRequest>("/correction-requests", data),

  listMine: (params?: {
    status?: CorrectionRequestStatus;
    page?: number;
    page_size?: number;
  }) =>
    apiClient.get<{
      items: CorrectionRequest[];
      total: number;
      page: number;
      page_size: number;
    }>("/correction-requests", { params }),
};
