import { useState, useEffect, useCallback } from "react";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { Coordinates } from "@/types";

const DEFAULT_LOCATION: Coordinates = { latitude: 37.5665, longitude: 126.9780 }; // Seoul

export function useLocation() {
  const { t } = useTranslation();
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mount-time measurement AND the "my location" button both go through
  // this one path so a flag-flip / accuracy bump only needs to land once.
  // Re-checks permission every call so a user who revoked it via the OS
  // settings mid-session falls back to the default location cleanly.
  //
  // Two-stage measurement to hide first-fix latency (up to 30s on a cold
  // GPS): (1) read the OS's cached last-known fix and surface it
  // immediately, (2) then run a precise fix with a 10s race timeout. If
  // the precise fix fails we keep whatever stage 1 produced; if there was
  // no cached fix either, we fall back to DEFAULT_LOCATION and surface an
  // error so the next button tap can retry from a clean state.
  const refreshLocation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setPermissionGranted(false);
      setLocation(DEFAULT_LOCATION);
      setIsLoading(false);
      return;
    }
    setPermissionGranted(true);

    // Stage 1 — cheap cached fix (~tens of ms). Tight thresholds: only
    // adopt a cached fix that's genuinely fresh (≤15s) and genuinely
    // precise (≤50m). Older/looser thresholds let a "nearby but wrong"
    // last-known fix win the race when stage 2 then times out on a cold
    // GPS, stranding the camera on that stale point. Best-effort;
    // failure or ineligible cache falls through to stage 2 silently.
    let hasCachedFix = false;
    try {
      const cached = await Location.getLastKnownPositionAsync({
        maxAge: 15_000,
        requiredAccuracy: 50,
      });
      if (cached) {
        setLocation({
          latitude: cached.coords.latitude,
          longitude: cached.coords.longitude,
        });
        hasCachedFix = true;
      }
    } catch {
      // ignore — fall through to stage 2
    }

    // Stage 2 — precise fix, raced against a 10s timeout because
    // getCurrentPositionAsync has no native timeout option. High
    // accuracy: the my-location button is worth the extra fix time
    // to avoid the "close but wrong" pin outdoors.
    try {
      const loc = await Promise.race<Location.LocationObject>([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }),
        new Promise<Location.LocationObject>((_, reject) =>
          setTimeout(() => reject(new Error("location_timeout")), 10_000),
        ),
      ]);
      setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch {
      if (!hasCachedFix) {
        setLocation(DEFAULT_LOCATION);
        setError(t("map.location_error"));
      }
      // If we had a cached fix, leave it as the displayed location.
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  return { location, permissionGranted, isLoading, error, refreshLocation };
}
