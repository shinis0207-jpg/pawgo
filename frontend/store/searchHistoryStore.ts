import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { Place } from "@/types";

// authStore.ts의 storage 헬퍼와 동일한 모양. 프로젝트에 공용 유틸이 없어
// (persist 미들웨어도 쓰지 않는 관례) 각 store가 로컬로 정의하는 방식을 따른다.
// 웹 환경에서는 SecureStore가 동작하지 않으므로 localStorage로 fallback.
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

// Storage key kept the same ("search_history") even though the shape
// changed from queries to viewed places — same slot, new payload. The
// load() sanitizer drops any legacy string-array payload so the switch
// is safe without an explicit migration.
const STORAGE_KEY = "search_history";
const MAX_ITEMS = 10;

// Persisted view of a place the user opened from search. Only the three
// fields the history UI needs are stored — no photos, coordinates, or
// pet-policy blobs — so the SecureStore payload stays small and immune
// to backend schema churn.
export interface HistoryItem {
  id: number;
  name: string;
  address: string;
}

async function persist(history: HistoryItem[]): Promise<void> {
  try {
    await storage.setItemAsync(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Storage failures are non-fatal. In-memory state stays correct; the
    // next successful write will re-sync. Never let this crash the app.
  }
}

interface SearchHistoryState {
  history: HistoryItem[];
  load: () => Promise<void>;
  add: (place: Place) => Promise<void>;
  touch: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clear: () => Promise<void>;
}

export const useSearchHistoryStore = create<SearchHistoryState>((set, get) => ({
  history: [],

  load: async () => {
    try {
      const raw = await storage.getItemAsync(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      // Sanitize on read: drop rows without a numeric id and non-empty
      // name; coerce a missing/non-string address to "" so the UI's
      // "hide address line when empty" rule stays truthful. Legacy
      // string entries (from the earlier search-query history format)
      // fail the object shape check and are dropped without a
      // migration attempt — the spec forbids trying to convert them.
      const clean: HistoryItem[] = [];
      for (const v of parsed) {
        if (v === null || typeof v !== "object") continue;
        const id = (v as { id?: unknown }).id;
        const name = (v as { name?: unknown }).name;
        const address = (v as { address?: unknown }).address;
        if (typeof id !== "number" || !Number.isFinite(id)) continue;
        if (typeof name !== "string" || name.trim() === "") continue;
        clean.push({
          id,
          name,
          address: typeof address === "string" ? address : "",
        });
        if (clean.length >= MAX_ITEMS) break;
      }
      set({ history: clean });
    } catch {
      // Corrupt JSON — leave in-memory list empty; next add() overwrites.
    }
  },

  add: async (place) => {
    // Trust the caller-supplied Place object (comes from a live API
    // response). Same id ⇒ move-to-front semantics, capped at MAX_ITEMS.
    const item: HistoryItem = {
      id: place.id,
      name: place.name,
      address: place.address,
    };
    const prev = get().history;
    const next = [item, ...prev.filter((h) => h.id !== item.id)].slice(0, MAX_ITEMS);
    set({ history: next });
    await persist(next);
  },

  touch: async (id) => {
    // Move-to-front only. No new item is fabricated — this is meant for
    // re-tapping a row already in history, so we deliberately do NOT
    // accept a Place object here (the stored name/address are what the
    // UI is currently showing, and we trust that snapshot).
    const prev = get().history;
    const idx = prev.findIndex((h) => h.id === id);
    if (idx <= 0) return; // not found, or already at front
    const item = prev[idx];
    const next = [item, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
    set({ history: next });
    await persist(next);
  },

  remove: async (id) => {
    const next = get().history.filter((h) => h.id !== id);
    set({ history: next });
    await persist(next);
  },

  clear: async () => {
    set({ history: [] });
    await persist([]);
  },
}));
