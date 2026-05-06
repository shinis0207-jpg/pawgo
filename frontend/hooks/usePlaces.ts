import { useQuery } from "@tanstack/react-query";
import { placesApi } from "@/services/api";
import { PlaceFilter, Coordinates } from "@/types";
import { useTranslation } from "react-i18next";

export function useNearbyPlaces(
  location: Coordinates | null,
  filters: PlaceFilter,
  page = 1
) {
  const { i18n } = useTranslation();

  return useQuery({
    queryKey: ["places", "nearby", location, filters, page, i18n.language],
    queryFn: () =>
      placesApi
        .getNearby(location!.latitude, location!.longitude, {
          ...filters,
          lang: i18n.language,
          page,
        })
        .then((r) => r.data),
    enabled: !!location,
    staleTime: 2 * 60 * 1000,
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
