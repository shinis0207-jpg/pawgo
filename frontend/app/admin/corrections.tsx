import React, { useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { adminCorrectionsApi } from "@/services/api";
import { CorrectionRequest } from "@/types";
import { CorrectionRequestStatusBadge } from "@/components/CorrectionRequestStatusBadge";
import { useIsAdmin } from "@/store/authStore";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";

// Shared queryKey so the detail screen (and resolve mutation) can read/invalidate
// the same cache. Keep the structure stable — tests and the [id] route depend on it.
export const ADMIN_QUEUE_QUERY_KEY = ["admin", "queue"] as const;

export default function AdminCorrectionsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isAdmin = useIsAdmin();

  // Belt-and-suspenders gate. The real authorization is server-side
  // (require_admin → 403), but bounce non-admins immediately so they don't
  // hit a flash of admin chrome.
  useEffect(() => {
    if (!isAdmin) router.replace("/(tabs)");
  }, [isAdmin, router]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ADMIN_QUEUE_QUERY_KEY,
    queryFn: () => adminCorrectionsApi.listQueue().then((r) => r.data),
    enabled: isAdmin,
  });

  const items = data?.items ?? [];

  if (!isAdmin) return null;

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
        <Text style={styles.headerTitle}>{t("admin.queue_title")}</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>{t("admin.load_error")}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => refetch()}
            disabled={isFetching}
          >
            <Text style={styles.retryText}>{t("admin.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>{t("admin.empty_queue")}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <Row
              item={item}
              language={i18n.language}
              onPress={() => router.push(`/admin/corrections/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

function Row({
  item,
  language,
  onPress,
}: {
  item: CorrectionRequest;
  language: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const submitted = formatDate(item.created_at, language);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.rowHeader}>
        <Text style={styles.placeName} numberOfLines={1}>
          {item.place?.name ?? `#${item.place_id}`}
        </Text>
        <CorrectionRequestStatusBadge status={item.status} />
      </View>
      <Text style={styles.categoryLabel} numberOfLines={1}>
        {t(`correction.category.${item.request_category}`)}
      </Text>
      {item.description && (
        <Text style={styles.description} numberOfLines={2}>
          {item.description}
        </Text>
      )}
      <View style={styles.rowFooter}>
        <Text style={styles.submittedAt}>{submitted}</Text>
        {item.admin_note && (
          <Text style={styles.adminNote} numberOfLines={1}>
            · {item.admin_note}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.xl,
  },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { ...Typography.h3, color: Colors.textSecondary, textAlign: "center" },
  retryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
  },
  retryText: { ...Typography.button, color: Colors.surface },
  list: { paddingVertical: Spacing.sm },
  separator: { height: 1, backgroundColor: Colors.border },
  row: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 4,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  placeName: { ...Typography.body, color: Colors.text, fontWeight: "700", flex: 1 },
  categoryLabel: { ...Typography.bodySmall, color: Colors.primary, fontWeight: "600" },
  description: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  rowFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: 4,
  },
  submittedAt: { ...Typography.caption, color: Colors.textLight },
  adminNote: {
    ...Typography.caption,
    color: Colors.textLight,
    flex: 1,
  },
});
