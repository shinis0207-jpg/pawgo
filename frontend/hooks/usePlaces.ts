import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { placesApi } from "@/services/api";
import { PlaceFilter, Coordinates, PlaceListResponse } from "@/types";
import { useTranslation } from "react-i18next";

// Hard cap on how many pages we fan out in parallel after page 1. With
// size=100 and MAX_PAGES=5, one search can pull up to ~500 places —
// enough for a wide zoom-out around a dense city center without turning
// the map into a wall of pins. Bumping the cap further would fight
// clustering, not help it.
const MAX_PAGES = 5;

export function useNearbyPlaces(
  location: Coordinates | null,
  filters: PlaceFilter,
  page = 1,
  size = 20,
) {
  const { i18n } = useTranslation();

  return useQuery({
    // signal + size are part of the network shape so both belong in
    // the key. React Query passes an AbortSignal into queryFn and
    // aborts it the moment the next fetch begins for the same key
    // family — that is the abort-on-new-fetch policy we want.
    queryKey: ["places", "nearby", location, filters, page, size, i18n.language],
    // Fan-out pagination. Page 1 is fetched first to learn `total`;
    // remaining pages (up to MAX_PAGES total) are fired in parallel
    // with the SAME AbortSignal so a viewport change tears down the
    // whole family in one shot. Partial failures don't blank the map —
    // we merge whatever succeeded and warn to the console for the
    // dev-tools user.
    queryFn: async ({ signal }): Promise<PlaceListResponse> => {
      const baseFilters = {
        ...filters,
        lang: i18n.language,
        size,
      };
      const lat = location!.latitude;
      const lng = location!.longitude;
      const rKm = filters.radius_km;
      // DEBUG (temporary — remove after fetch lifecycle is verified on
      // device). Prefixed `[nearby]` so a single grep removes all of
      // them together.
      // eslint-disable-next-line no-console
      console.log(
        `[nearby] fetch start (${lat.toFixed(6)},${lng.toFixed(6)}) r=${rKm}`,
      );
      try {
        const first = await placesApi.getNearby(
          lat,
          lng,
          { ...baseFilters, page },
          signal,
        );
        const firstBody = first.data;
        const total = firstBody.total ?? 0;
        const totalPages = Math.max(1, Math.ceil(total / size));
        const endPage = Math.min(MAX_PAGES, totalPages);
        if (endPage <= page) {
          // eslint-disable-next-line no-console
          console.log(
            `[nearby] fetch success items=${firstBody.items.length} total=${total}`,
          );
          return firstBody;
        }

        const restPages: number[] = [];
        for (let p = page + 1; p <= endPage; p += 1) restPages.push(p);
        const rest = await Promise.allSettled(
          restPages.map((p) =>
            placesApi.getNearby(
              lat,
              lng,
              { ...baseFilters, page: p },
              signal,
            ),
          ),
        );

        const failedPages: number[] = [];
        const mergedItems = [...firstBody.items];
        rest.forEach((r, i) => {
          const pageNum = restPages[i];
          if (r.status === "fulfilled") {
            mergedItems.push(...r.value.data.items);
          } else {
            // Aborted requests are expected during viewport churn and
            // shouldn't be logged as failures — RQ will start the next
            // fetch immediately. Only warn on other rejection reasons.
            const reason: unknown = r.reason;
            const isAbort =
              reason instanceof Error &&
              (reason.name === "CanceledError" ||
                reason.name === "AbortError" ||
                /canceled/i.test(reason.message ?? ""));
            if (!isAbort) failedPages.push(pageNum);
          }
        });
        if (failedPages.length > 0) {
          console.warn(
            `[useNearbyPlaces] partial fetch: pages ${failedPages.join(", ")} failed; ` +
              `showing ${mergedItems.length}/${total} places.`,
          );
        }
        // eslint-disable-next-line no-console
        console.log(
          `[nearby] fetch success items=${mergedItems.length} total=${total}`,
        );
        return {
          ...firstBody,
          items: mergedItems,
          // `total` stays the server's ground truth even if we couldn't
          // collect all pages — the header count means "in this radius"
          // not "in what we rendered".
          total,
        };
      } catch (err) {
        const isAbort =
          err instanceof Error &&
          (err.name === "CanceledError" ||
            err.name === "AbortError" ||
            /canceled/i.test(err.message ?? ""));
        if (isAbort) {
          // eslint-disable-next-line no-console
          console.log(
            `[nearby] fetch abort (${lat.toFixed(6)},${lng.toFixed(6)})`,
          );
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.log(
            `[nearby] fetch error (${lat.toFixed(6)},${lng.toFixed(6)}) msg=${msg}`,
          );
        }
        throw err;
      }
    },
    enabled: !!location,
    staleTime: 2 * 60 * 1000,
    // keepPreviousData: don't blank the pin layer / list while a new
    // viewport is being fetched. The map keeps whatever was last
    // rendered; the caller flips a subtle "updating" indicator using
    // `isFetching` until the fresh response replaces it.
    placeholderData: keepPreviousData,
  });
}

export function usePlace(id: number) {
  const { i18n } = useTranslation();

  return useQuery({
    queryKey: ["place", id, i18n.language],
    queryFn: () => placesApi.get(id, i18n.language).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useEmergencyVets(location: Coordinates | null) {
  const { i18n } = useTranslation();

  return useQuery({
    queryKey: ["vets", "emergency", location, i18n.language],
    queryFn: () =>
      placesApi
        .getEmergencyVets(location!.latitude, location!.longitude, 10, i18n.language)
        .then((r) => r.data),
    enabled: !!location,
    staleTime: 60 * 1000,
  });
}
