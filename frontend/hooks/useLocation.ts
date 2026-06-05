import { useState, useEffect } from "react";
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

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermissionGranted(false);
        setLocation(DEFAULT_LOCATION);
        setIsLoading(false);
        return;
      }
      setPermissionGranted(true);
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
        setLocation(DEFAULT_LOCATION);
        setError(t("map.location_error"));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return { location, permissionGranted, isLoading, error };
}
