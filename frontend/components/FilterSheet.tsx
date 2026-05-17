import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { PlaceCategory, PlaceFilter } from "@/types";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";
import { MVP_VISIBLE_CATEGORIES } from "@/constants/mvp";

interface Props {
  visible: boolean;
  filters: PlaceFilter;
  onApply: (filters: PlaceFilter) => void;
  onClose: () => void;
}

// Phase 1: only MVP_VISIBLE_CATEGORIES appears in the filter UI.
// The full enum remains in @/types so we never have to widen it back later.
const CATEGORIES: readonly PlaceCategory[] = MVP_VISIBLE_CATEGORIES;
const WEIGHT_OPTIONS = [
  { label: "filter.under_5kg", value: 5 },
  { label: "filter.under_10kg", value: 10 },
  { label: "filter.large_dog", value: undefined },
];
const RADIUS_OPTIONS = [1, 3, 5, 10, 20];

export function FilterSheet({ visible, filters, onApply, onClose }: Props) {
  const { t } = useTranslation();
  const [local, setLocal] = useState<PlaceFilter>(filters);

  const toggle = <K extends keyof PlaceFilter>(key: K, value: PlaceFilter[K]) => {
    setLocal((prev) => ({ ...prev, [key]: prev[key] === value ? undefined : value }));
  };

  const handleApply = () => {
    onApply(local);
    onClose();
  };

  const handleReset = () => {
    setLocal({});
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("filter.title")}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Section label={t("categories.accommodation").replace("숙박", "") + "카테고리"}>
              <View style={styles.row}>
                {CATEGORIES.map((cat) => (
                  <Chip
                    key={cat}
                    label={t(`categories.${cat}`)}
                    active={local.category === cat}
                    onPress={() => toggle("category", cat)}
                  />
                ))}
              </View>
            </Section>

            <Section label={t("filter.weight_limit")}>
              <View style={styles.row}>
                {WEIGHT_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.label}
                    label={t(opt.label)}
                    active={local.max_weight_kg === opt.value}
                    onPress={() => toggle("max_weight_kg", opt.value)}
                  />
                ))}
              </View>
            </Section>

            <Section label={t("filter.pet_allowed")}>
              <View style={styles.row}>
                <Chip
                  label={t("filter.indoor")}
                  active={local.allows_indoor === true}
                  onPress={() => toggle("allows_indoor", true)}
                />
                <Chip
                  label={t("filter.outdoor")}
                  active={local.allows_indoor === false}
                  onPress={() => toggle("allows_indoor", false)}
                />
              </View>
            </Section>

            <Section label={t("filter.radius")}>
              <View style={styles.row}>
                {RADIUS_OPTIONS.map((r) => (
                  <Chip
                    key={r}
                    label={`${r}km`}
                    active={local.radius_km === r}
                    onPress={() => toggle("radius_km", r)}
                  />
                ))}
              </View>
            </Section>

            <Section label={t("filter.parking")}>
              <Chip
                label={t("filter.parking")}
                active={local.has_parking === true}
                onPress={() =>
                  setLocal((p) => ({ ...p, has_parking: p.has_parking ? undefined : true }))
                }
              />
            </Section>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
              <Text style={styles.resetText}>{t("filter.reset")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
              <Text style={styles.applyText}>{t("filter.apply")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: "80%",
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    ...Typography.h3,
    color: Colors.text,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "15",
  },
  chipText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primary,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  resetText: {
    ...Typography.button,
    color: Colors.textSecondary,
  },
  applyBtn: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: "center",
  },
  applyText: {
    ...Typography.button,
    color: Colors.surface,
  },
});
