export const Colors = {
  primary: "#FF6B35",
  primaryLight: "#FF8C5A",
  primaryDark: "#E5521C",
  secondary: "#4ECDC4",
  accent: "#FFE66D",

  background: "#F8F9FA",
  surface: "#FFFFFF",
  border: "#E8ECEF",

  text: "#1A1A2E",
  textSecondary: "#6B7280",
  textLight: "#9CA3AF",

  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",

  categoryAccommodation: "#6366F1",
  categoryRestaurant: "#F59E0B",
  categoryCafe: "#8B5CF6",
  categoryPark: "#10B981",
  categoryVet: "#EF4444",

  overlay: "rgba(0, 0, 0, 0.5)",
  shadow: "rgba(0, 0, 0, 0.1)",
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Typography = {
  h1: { fontSize: 28, fontWeight: "700" as const, lineHeight: 36 },
  h2: { fontSize: 22, fontWeight: "700" as const, lineHeight: 30 },
  h3: { fontSize: 18, fontWeight: "600" as const, lineHeight: 26 },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: "400" as const, lineHeight: 20 },
  caption: { fontSize: 11, fontWeight: "400" as const, lineHeight: 16 },
  button: { fontSize: 15, fontWeight: "600" as const, lineHeight: 22 },
} as const;

export const categoryColors: Record<string, string> = {
  accommodation: Colors.categoryAccommodation,
  restaurant: Colors.categoryRestaurant,
  cafe: Colors.categoryCafe,
  park: Colors.categoryPark,
  vet: Colors.categoryVet,
};
