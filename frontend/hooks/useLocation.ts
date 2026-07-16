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
      // eslint-disable-next-line no-console
      console.log(
        `[loc] final=(${DEFAULT_LOCATION.latitude.toFixed(6)},${DEFAULT_LOCATION.longitude.toFixed(6)}) source=default (permission-denied)`,
      );
      // eslint-disable-next-line no-console
      console.log(`[loc] refreshLocation done`);
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
    // DEBUG: temporary local mirror of Stage 1's coord so the catch
    // block below can log the "cached-kept" fallback source without
    // reaching outside the try scope. No behavior change.
    let stage1Coord: Coordinates | null = null;
    // eslint-disable-next-line no-console
    console.log(`[loc] stage1 requesting (maxAge=15s, accuracy<=50m)`);
    try {
      const cached = await Location.getLastKnownPositionAsync({
        maxAge: 15_000,
        requiredAccuracy: 50,
      });
      if (cached) {
        const ageMs = Date.now() - cached.timestamp;
        // eslint-disable-next-line no-console
        console.log(
          `[loc] stage1 cached=(${cached.coords.latitude.toFixed(6)},${cached.coords.longitude.toFixed(6)}) age=${ageMs}ms accuracy=${cached.coords.accuracy}m`,
        );
        setLocation({
          latitude: cached.coords.latitude,
          longitude: cached.coords.longitude,
        });
        stage1Coord = {
          latitude: cached.coords.latitude,
          longitude: cached.coords.longitude,
        };
        hasCachedFix = true;
      } else {
        // eslint-disable-next-line no-console
        console.log(`[loc] stage1 no-cached (returned null)`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(
        `[loc] stage1 no-cached (exception name=${err instanceof Error ? err.name : String(err)})`,
      );
      // ignore — fall through to stage 2
    }

    // Stage 2 — precise fix, raced against a 10s timeout because
    // getCurrentPositionAsync has no native timeout option. High
    // accuracy: the my-location button is worth the extra fix time
    // to avoid the "close but wrong" pin outdoors.
    // eslint-disable-next-line no-console
    console.log(`[loc] stage2 requesting (accuracy=High, timeout=10s)`);
    const stage2StartAt = Date.now();
    try {
      const loc = await Promise.race<Location.LocationObject>([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }),
        new Promise<Location.LocationObject>((_, reject) =>
          setTimeout(() => reject(new Error("location_timeout")), 10_000),
        ),
      ]);
      const elapsed = Date.now() - stage2StartAt;
      // eslint-disable-next-line no-console
      console.log(
        `[loc] stage2 success=(${loc.coords.latitude.toFixed(6)},${loc.coords.longitude.toFixed(6)}) accuracy=${loc.coords.accuracy}m elapsed=${elapsed}ms`,
      );
      setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      // eslint-disable-next-line no-console
      console.log(
        `[loc] final=(${loc.coords.latitude.toFixed(6)},${loc.coords.longitude.toFixed(6)}) source=precise`,
      );
    } catch (err) {
      const elapsed = Date.now() - stage2StartAt;
      const errName = err instanceof Error ? err.name : String(err);
      // eslint-disable-next-line no-console
      console.log(`[loc] stage2 fail err=${errName} elapsed=${elapsed}ms`);
      if (!hasCachedFix) {
        setLocation(DEFAULT_LOCATION);
        setError(t("map.location_error"));
        // eslint-disable-next-line no-console
        console.log(
          `[loc] final=(${DEFAULT_LOCATION.latitude.toFixed(6)},${DEFAULT_LOCATION.longitude.toFixed(6)}) source=default`,
        );
      } else if (stage1Coord) {
        // eslint-disable-next-line no-console
        console.log(
          `[loc] final=(${stage1Coord.latitude.toFixed(6)},${stage1Coord.longitude.toFixed(6)}) source=cached-kept`,
        );
      }
      // If we had a cached fix, leave it as the displayed location.
    } finally {
      setIsLoading(false);
      // eslint-disable-next-line no-console
      console.log(`[loc] refreshLocation done`);
    }
  }, [t]);

  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  return { location, permissionGranted, isLoading, error, refreshLocation };
}
