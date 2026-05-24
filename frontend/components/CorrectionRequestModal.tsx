import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import axios from "axios";

import { correctionRequestsApi } from "@/services/api";
import { CorrectionRequestCategory } from "@/types";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";

const CATEGORIES: CorrectionRequestCategory[] = [
  "pet_allowed_wrong",
  "closed_down",
  "address_changed",
  "phone_changed",
  "info_outdated",
  "other",
];

const MAX_DESCRIPTION = 2000;
const MIN_DESCRIPTION = 5;

interface Props {
  visible: boolean;
  placeId: number;
  placeName: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function CorrectionRequestModal({
  visible,
  placeId,
  placeName,
  onClose,
  onSubmitted,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<CorrectionRequestCategory | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const trimmed = description.trim();
  const canSubmit =
    !!category && trimmed.length >= MIN_DESCRIPTION && !submitting;

  const reset = () => {
    setCategory(null);
    setDescription("");
    setError(null);
    setSubmitted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit || !category) return;
    setSubmitting(true);
    setError(null);
    try {
      await correctionRequestsApi.submit({
        place_id: placeId,
        request_category: category,
        description: trimmed,
      });
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      // Surface a clean message; the apiClient request interceptor already
      // strips the Bearer header when auth_token is missing, so a 401 here
      // means the saved token is stale.
      const msg =
        axios.isAxiosError(err) && err.response?.status === 401
          ? t("correction.error_auth")
          : t("correction.error_generic");
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.md },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t("correction.modal_title")}</Text>
            <TouchableOpacity onPress={handleClose} accessibilityLabel={t("common.close")}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {submitted ? (
            <View style={styles.successWrap}>
              <Ionicons
                name="checkmark-circle"
                size={56}
                color={Colors.success}
              />
              <Text style={styles.successTitle}>
                {t("correction.success_title")}
              </Text>
              <Text style={styles.successBody}>
                {t("correction.success_body")}
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>{t("common.close")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.placeContext} numberOfLines={1}>
                {placeName}
              </Text>

              <Text style={styles.sectionLabel}>
                {t("correction.category_label")}
              </Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map((cat) => {
                  const active = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryChip,
                        active && styles.categoryChipActive,
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          active && styles.categoryChipTextActive,
                        ]}
                      >
                        {t(`correction.category.${cat}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>
                {t("correction.description_label")}
              </Text>
              <TextInput
                style={styles.textarea}
                value={description}
                onChangeText={setDescription}
                placeholder={t("correction.description_placeholder")}
                placeholderTextColor={Colors.textLight}
                multiline
                numberOfLines={5}
                maxLength={MAX_DESCRIPTION}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>
                {trimmed.length} / {MAX_DESCRIPTION}
              </Text>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  !canSubmit && styles.primaryBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={Colors.surface} />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {t("correction.submit")}
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={styles.disclaimer}>
                {t("correction.disclaimer")}
              </Text>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: { ...Typography.h3, color: Colors.text },
  placeContext: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    ...Typography.bodySmall,
    color: Colors.text,
    fontWeight: "700",
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm - 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryChipText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  categoryChipTextActive: {
    color: Colors.surface,
    fontWeight: "700",
  },
  formScroll: { flex: 1 },
  formScrollContent: { paddingBottom: Spacing.md },
  textarea: {
    ...Typography.body,
    color: Colors.text,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    minHeight: 120,
  },
  charCount: {
    ...Typography.caption,
    color: Colors.textLight,
    alignSelf: "flex-end",
    marginTop: 4,
  },
  errorText: {
    ...Typography.bodySmall,
    color: Colors.error,
    marginTop: Spacing.md,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  primaryBtnDisabled: {
    backgroundColor: Colors.border,
  },
  primaryBtnText: {
    ...Typography.button,
    color: Colors.surface,
  },
  disclaimer: {
    ...Typography.caption,
    color: Colors.textLight,
    textAlign: "center",
    marginTop: Spacing.md,
  },
  successWrap: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  successTitle: {
    ...Typography.h3,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  successBody: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
  },
});
