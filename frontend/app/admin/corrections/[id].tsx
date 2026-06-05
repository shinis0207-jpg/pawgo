import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";

import { adminCorrectionsApi } from "@/services/api";
import { CorrectionRequest } from "@/types";
import { CorrectionRequestStatusBadge } from "@/components/CorrectionRequestStatusBadge";
import { useIsAdmin } from "@/store/authStore";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";
import { ADMIN_QUEUE_QUERY_KEY } from "@/app/admin/corrections";

const MAX_ADMIN_NOTE = 2000;

type QueueData = { items: CorrectionRequest[]; total: number; page: number; page_size: number };

export default function AdminCorrectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const requestId = Number(id);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Belt-and-suspenders gate (same as queue screen).
  useEffect(() => {
    if (!isAdmin) router.replace("/(tabs)");
  }, [isAdmin, router]);

  // Single-item endpoint doesn't exist on the backend (intentional — admin
  // queue is the only entry point). Look the item up in the queue cache;
  // if the deep link bypassed the queue, refetch once and try again.
  const [item, setItem] = useState<CorrectionRequest | null>(() => {
    const cached = queryClient.getQueryData<QueueData>(ADMIN_QUEUE_QUERY_KEY);
    return cached?.items.find((i) => i.id === requestId) ?? null;
  });
  const [resolving, setResolving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (item || !isAdmin || Number.isNaN(requestId)) return;
    // Cache miss — fetch the queue once and try again. If still missing,
    // the id is bogus or stale; pop back to the queue.
    let cancelled = false;
    (async () => {
      try {
        const fresh = await queryClient.fetchQuery({
          queryKey: ADMIN_QUEUE_QUERY_KEY,
          queryFn: () => adminCorrectionsApi.listQueue().then((r) => r.data),
        });
        if (cancelled) return;
        const found = fresh.items.find((i) => i.id === requestId);
        if (found) setItem(found);
        else router.back();
      } catch {
        if (!cancelled) router.back();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item, isAdmin, requestId, queryClient, router]);

  const resolveMutation = useMutation({
    mutationFn: (payload: { action: "approve" | "reject"; admin_note?: string }) =>
      adminCorrectionsApi.resolve(requestId, payload).then((r) => r.data),
    onSuccess: () => {
      // Every cache that may have referenced the now-changed request or the
      // place it touched. Admin queue first so the user lands on a fresh list.
      queryClient.invalidateQueries({ queryKey: ADMIN_QUEUE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["correction-requests", "mine"] });
      if (item) {
        queryClient.invalidateQueries({ queryKey: ["place", item.place_id] });
      }
      queryClient.invalidateQueries({ queryKey: ["places", "nearby"] });
      router.back();
    },
    onError: (err) => {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const msg =
        status === 409
          ? t("admin.error_already_resolved")
          : status === 422
          ? t("admin.error_validation")
          : t("admin.error_generic");
      Alert.alert(t("common.error"), msg);
    },
    onSettled: () => {
      setResolving(false);
      setRejecting(false);
    },
  });

  const requestedEntries = useMemo<[string, unknown][]>(
    () => Object.entries(item?.requested_info ?? {}),
    [item],
  );
  const currentEntries = useMemo<[string, unknown][]>(
    () => Object.entries(item?.current_info ?? {}),
    [item],
  );

  if (!isAdmin) return null;
  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isResolved =
    item.status === "approved" || item.status === "rejected";

  const handleApprove = () => {
    Alert.alert(
      t("admin.confirm_approve_title"),
      t("admin.confirm_approve_body"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("admin.confirm_approve_cta"),
          onPress: () => {
            setResolving(true);
            resolveMutation.mutate({ action: "approve" });
          },
        },
      ],
    );
  };

  const handleOpenReject = () => {
    setAdminNote("");
    setShowRejectModal(true);
  };

  const handleConfirmReject = () => {
    setRejecting(true);
    resolveMutation.mutate({
      action: "reject",
      admin_note: adminNote.trim() ? adminNote.trim() : undefined,
    });
    setShowRejectModal(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("admin.detail_title")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Place card — tap to inspect the place itself */}
        <TouchableOpacity
          style={styles.placeCard}
          onPress={() => router.push(`/place/${item.place_id}`)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.placeName} numberOfLines={1}>
              {item.place?.name ?? `#${item.place_id}`}
            </Text>
            <Text style={styles.placeCategory}>
              {item.place?.category
                ? t(`categories.${item.place.category}`)
                : `#${item.place_id}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
        </TouchableOpacity>

        {/* Meta: status + submitted_at + category */}
        <View style={styles.metaRow}>
          <CorrectionRequestStatusBadge status={item.status} />
          <Text style={styles.metaText}>
            {t("admin.submitted_at")}: {formatDate(item.created_at, i18n.language)}
          </Text>
        </View>
        <View style={styles.categoryChip}>
          <Text style={styles.categoryChipText}>
            {t(`correction.category.${item.request_category}`)}
          </Text>
        </View>

        {/* Submitter */}
        <Section title={t("admin.submitted_by")}>
          <Text style={styles.body1}>
            {item.user_id != null
              ? t("admin.user_label", { id: item.user_id })
              : t("admin.anonymous")}
          </Text>
        </Section>

        {/* User description */}
        {item.description && (
          <Section title={t("admin.description_label")}>
            <Text style={styles.body1}>{item.description}</Text>
          </Section>
        )}

        {/* Requested changes */}
        <Section title={t("admin.requested_info_label")}>
          {requestedEntries.length === 0 ? (
            <Text style={styles.muted}>{t("admin.requested_info_empty")}</Text>
          ) : (
            <View style={styles.kvList}>
              {requestedEntries.map(([k, v]) => (
                <KV key={k} k={k} v={v} />
              ))}
            </View>
          )}
        </Section>

        {/* Current info (user-reported snapshot) — only when present */}
        {currentEntries.length > 0 && (
          <Section title={t("admin.current_info_label")}>
            <View style={styles.kvList}>
              {currentEntries.map(([k, v]) => (
                <KV key={k} k={k} v={v} />
              ))}
            </View>
          </Section>
        )}

        {/* Resolved admin_note */}
        {isResolved && item.admin_note && (
          <Section title="admin_note">
            <Text style={styles.body1}>{item.admin_note}</Text>
          </Section>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* Action footer — hidden once resolved */}
      {!isResolved && (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, Spacing.md) },
          ]}
        >
          <TouchableOpacity
            style={[styles.rejectBtn, resolving && styles.btnDisabled]}
            onPress={handleOpenReject}
            disabled={resolving}
          >
            <Text style={styles.rejectBtnText}>{t("admin.reject")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.approveBtn, resolving && styles.btnDisabled]}
            onPress={handleApprove}
            disabled={resolving}
          >
            {resolving ? (
              <ActivityIndicator size="small" color={Colors.surface} />
            ) : (
              <Text style={styles.approveBtnText}>{t("admin.approve")}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Reject modal — reuses the backdrop / KAV / flexShrink pattern
          from CorrectionRequestModal (1b2fe4b + ff8887c + 5fc2255). */}
      <Modal
        visible={showRejectModal}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowRejectModal(false)}
      >
        <View style={styles.backdrop} pointerEvents="none" />
        <KeyboardAvoidingView
          style={styles.kavContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.md },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t("admin.reject_modal_title")}</Text>
              <TouchableOpacity
                onPress={() => setShowRejectModal(false)}
                accessibilityLabel={t("common.close")}
              >
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalBody}>{t("admin.reject_modal_body")}</Text>
              <TextInput
                style={styles.textarea}
                value={adminNote}
                onChangeText={setAdminNote}
                placeholder={t("admin.reject_modal_placeholder")}
                placeholderTextColor={Colors.textLight}
                multiline
                numberOfLines={5}
                maxLength={MAX_ADMIN_NOTE}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>
                {adminNote.length} / {MAX_ADMIN_NOTE}
              </Text>

              <TouchableOpacity
                style={[styles.modalRejectBtn, rejecting && styles.btnDisabled]}
                onPress={handleConfirmReject}
                disabled={rejecting}
              >
                {rejecting ? (
                  <ActivityIndicator size="small" color={Colors.surface} />
                ) : (
                  <Text style={styles.modalRejectBtnText}>{t("admin.reject_cta")}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {children}
    </View>
  );
}

function KV({ k, v }: { k: string; v: unknown }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvKey}>{k}</Text>
      <Text style={styles.kvVal} numberOfLines={2}>
        {formatValue(v)}
      </Text>
    </View>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string" || typeof v === "number") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function formatDate(iso: string, language: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(language === "en" ? "en-US" : "ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3, color: Colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.lg, gap: Spacing.md },
  placeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  placeName: { ...Typography.body, color: Colors.text, fontWeight: "700" },
  placeCategory: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  metaText: { ...Typography.caption, color: Colors.textLight },
  categoryChip: {
    alignSelf: "flex-start",
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  categoryChipText: { ...Typography.bodySmall, color: Colors.primary, fontWeight: "700" },
  section: { gap: Spacing.xs },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  body1: { ...Typography.body, color: Colors.text },
  muted: { ...Typography.bodySmall, color: Colors.textLight, fontStyle: "italic" },
  kvList: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  kvRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  kvKey: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: "600",
    minWidth: 120,
  },
  kvVal: { ...Typography.bodySmall, color: Colors.text, flex: 1 },
  footer: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  rejectBtnText: { ...Typography.button, color: Colors.textSecondary },
  approveBtn: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: "center",
  },
  approveBtnText: { ...Typography.button, color: Colors.surface },
  btnDisabled: { opacity: 0.5 },

  // Reject modal — same backdrop + KAV + flexShrink invariants the
  // correction-request modal shipped after the 1b2fe4b/ff8887c fixes.
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.overlay,
  },
  kavContainer: {
    flex: 1,
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
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
    flexShrink: 0,
  },
  sheetTitle: { ...Typography.h3, color: Colors.text },
  sheetScroll: { flexShrink: 1 },
  sheetScrollContent: { paddingBottom: Spacing.md },
  modalBody: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
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
  modalRejectBtn: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.error,
    alignItems: "center",
  },
  modalRejectBtnText: { ...Typography.button, color: Colors.surface },
});
