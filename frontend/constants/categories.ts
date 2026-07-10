/**
 * Flat multi-tag category codes surfaced in the main category chip bar.
 *
 * Order matches the backend seed's sort_order (see
 * backend/migrations/versions/place_categories_multitag.py::_SEED_ROWS
 * and the categories table): food (9) → coffee_dessert (5) → drink (5)
 * → space_tag (4) = 23 codes total.
 *
 * These codes are what the app sends to `GET /places/nearby?category=`.
 * "cafe" is intentionally shared with the legacy PlaceCategory enum —
 * the backend routes "cafe" / "restaurant" through the legacy scalar
 * column while every other code goes through place_categories tags.
 *
 * The group tag isn't rendered yet (chips are one flat scrollable row),
 * but keeping it here means we don't have to reshape the constant when
 * grouped filter UI lands later.
 */
export type CategoryGroup = "food" | "coffee_dessert" | "drink" | "space_tag";

export interface CategoryChip {
  code: string;
  group: CategoryGroup;
}

export const CATEGORY_CHIPS: readonly CategoryChip[] = [
  { code: "korean", group: "food" },
  { code: "japanese", group: "food" },
  { code: "chinese", group: "food" },
  { code: "western", group: "food" },
  { code: "asian", group: "food" },
  { code: "bbq_grill", group: "food" },
  { code: "seafood", group: "food" },
  { code: "bunsik", group: "food" },
  { code: "burger_pizza_fastfood", group: "food" },
  { code: "cafe", group: "coffee_dessert" },
  { code: "bakery", group: "coffee_dessert" },
  { code: "dessert", group: "coffee_dessert" },
  { code: "brunch", group: "coffee_dessert" },
  { code: "traditional_tea", group: "coffee_dessert" },
  { code: "bar_hof", group: "drink" },
  { code: "izakaya", group: "drink" },
  { code: "wine_bar", group: "drink" },
  { code: "cocktail_bar", group: "drink" },
  { code: "pub_brewpub", group: "drink" },
  { code: "rooftop_terrace", group: "space_tag" },
  { code: "large_group", group: "space_tag" },
  { code: "fine_dining", group: "space_tag" },
  { code: "pet_specialized", group: "space_tag" },
] as const;

export const CATEGORY_CODES: readonly string[] = CATEGORY_CHIPS.map(
  (c) => c.code,
);
