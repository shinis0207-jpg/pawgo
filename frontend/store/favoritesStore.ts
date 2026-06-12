import { create } from "zustand";
import { Favorite, Place } from "@/types";
import { favoritesApi } from "@/services/api";
import { useAuthStore } from "@/store/authStore";

/**
 * Favorites (saved places) store.
 *
 * Two parallel projections of the same set so callers don't pay for the
 * lookup they don't need:
 *   - favoritePlaceIds: Set<number> for O(1) "is this place favorited?" in
 *     the heart button — kept as a fresh Set on every mutation so React
 *     re-renders observe a new reference.
 *   - items: Favorite[] in newest-first order for the list screen — keeps
 *     the full hydrated place payload so PlaceCard renders without a
 *     second round-trip.
 *
 * toggle() is optimistic with rollback. Backend POST/DELETE are idempotent,
 * but UI feedback should still revert if the network call fails so the heart
 * doesn't lie about server state.
 */
interface FavoritesState {
  favoritePlaceIds: Set<number>;
  items: Favorite[];
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;

  fetchFavorites: (lang?: string) => Promise<void>;
  ensureLoaded: (lang?: string) => Promise<void>;
  toggle: (place: Place, lang?: string) => Promise<void>;
  clear: () => void;
}

const initialState = () => ({
  favoritePlaceIds: new Set<number>(),
  items: [] as Favorite[],
  isLoading: false,
  isLoaded: false,
  error: null as string | null,
});

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  ...initialState(),

  fetchFavorites: async (lang) => {
    set({ isLoading: true, error: null });
    try {
      const response = await favoritesApi.list({ lang });
      const items = response.data.items;
      set({
        items,
        favoritePlaceIds: new Set(items.map((f) => f.place_id)),
        isLoading: false,
        isLoaded: true,
      });
    } catch {
      set({ isLoading: false, error: "load_failed" });
    }
  },

  // De-duplicates fetches across multiple screens mounting concurrently —
  // the first caller actually hits the network, the rest are no-ops until
  // clear() (logout) flips isLoaded back to false.
  ensureLoaded: async (lang) => {
    const { isLoaded, isLoading } = get();
    if (isLoaded || isLoading) return;
    if (!useAuthStore.getState().token) return;
    await get().fetchFavorites(lang);
  },

  toggle: async (place, lang) => {
    const id = place.id;
    const wasFav = get().favoritePlaceIds.has(id);
    // Stash the removed row so rollback can restore it in-place — order matters
    // on the list screen, and re-fetching to recover would clobber other
    // optimistic state in flight.
    const removed = wasFav
      ? get().items.find((f) => f.place_id === id)
      : undefined;

    // Optimistic apply. Fresh Set reference so subscribed components re-render.
    set((state) => {
      const nextIds = new Set(state.favoritePlaceIds);
      if (wasFav) nextIds.delete(id);
      else nextIds.add(id);
      return {
        favoritePlaceIds: nextIds,
        items: wasFav
          ? state.items.filter((f) => f.place_id !== id)
          : state.items,
        error: null,
      };
    });

    try {
      if (wasFav) {
        await favoritesApi.remove(id);
      } else {
        const res = await favoritesApi.add(id, lang);
        // Server is the source of truth for id + created_at; prepend so the
        // list screen mirrors the newest-first order returned by GET.
        set((state) => ({ items: [res.data, ...state.items] }));
      }
    } catch (e) {
      // Rollback both projections so the UI returns to the truth before the
      // call. Caller is expected to surface a toast/alert via the thrown error.
      set((state) => {
        const nextIds = new Set(state.favoritePlaceIds);
        if (wasFav) nextIds.add(id);
        else nextIds.delete(id);
        return {
          favoritePlaceIds: nextIds,
          items: wasFav && removed
            ? [removed, ...state.items]
            : state.items,
          error: "toggle_failed",
        };
      });
      throw e;
    }
  },

  clear: () => set(initialState()),
}));
