import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { User } from "@/types";
import { authApi } from "@/services/api";
import { useFavoritesStore } from "@/store/favoritesStore";

// 웹 환경에서는 SecureStore가 동작하지 않으므로 localStorage로 fallback
const storage = {
  getItemAsync: (key: string): Promise<string | null> => {
    if (Platform.OS === "web") {
      return Promise.resolve(localStorage.getItem(key));
    }
    return SecureStore.getItemAsync(key);
  },
  setItemAsync: (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
  deleteItemAsync: (key: string): Promise<void> => {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  // Phase 2-B: register no longer auto-logs the user in. It returns the
  // email the backend confirmed it sent a code to so the caller can
  // transition to a verify screen and pass that email back into
  // verifyEmail() below.
  register: (
    data: { email: string; name: string; password: string },
  ) => Promise<{ email: string }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<{ cooldown_sec: number }>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    try {
      const token = await storage.getItemAsync("auth_token");
      if (token) {
        const response = await authApi.getMe();
        set({ user: response.data, token, isInitialized: true });
      } else {
        set({ isInitialized: true });
      }
    } catch {
      await storage.deleteItemAsync("auth_token");
      set({ user: null, token: null, isInitialized: true });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login(email, password);
      const { access_token, user } = response.data;
      await storage.setItemAsync("auth_token", access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (data) => {
    set({ isLoading: true });
    try {
      const response = await authApi.register(data);
      set({ isLoading: false });
      return { email: response.data.email };
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  verifyEmail: async (email, code) => {
    set({ isLoading: true });
    try {
      const response = await authApi.verifyEmail(email, code);
      const { access_token, user } = response.data;
      await storage.setItemAsync("auth_token", access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  resendCode: async (email) => {
    // No isLoading toggle here — the verify screen drives the resend
    // button's enabled/cooldown state from the returned cooldown_sec, so
    // the global spinner shouldn't flash for what is effectively a
    // background re-send.
    const response = await authApi.resendCode(email);
    return { cooldown_sec: response.data.cooldown_sec };
  },

  logout: async () => {
    await storage.deleteItemAsync("auth_token");
    set({ user: null, token: null });
    // User-scoped caches must drop with the session — otherwise the next
    // user to sign in on this device sees the previous account's hearts
    // until ensureLoaded refetches. Safe across the cyclic import because
    // both stores only touch each other at call time, not at module load.
    useFavoritesStore.getState().clear();
  },

  updateUser: (partial) => {
    const current = get().user;
    if (current) set({ user: { ...current, ...partial } });
  },
}));

// Single source of truth for the admin gate. Used by the profile entry point
// and the /admin route guard so a typo can't open the admin UI to non-admins.
export const useIsAdmin = () =>
  useAuthStore((s) => s.user?.role === "admin");
