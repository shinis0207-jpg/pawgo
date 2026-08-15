import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { authApi } from "@/services/api";
import { useAuthStore } from "@/store/authStore";
import { usePetStore } from "@/store/petStore";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";

/**
 * Account deletion screen. Layout mirrors profile/favorites.tsx and
 * profile/corrections.tsx (SafeAreaView + back header + body). Backed by
 * DELETE /auth/me which returns 204 and lets the DB FK rules cascade
 * pets/favorites and null out correction_requests.user_id.
 */
export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const pets = usePetStore((s) => s.pets);
  const fetchPets = usePetStore((s) => s.fetchPets);

  const [deleting, setDeleting] = useState(false);

  // Load pets so the item line can show the names the user will lose.
  // Silent on failure — the list line then just omits the names, which
  // is exactly the "no pets registered" wording anyway.
  useEffect(() => {
    fetchPets();
  }, [fetchPets]);

  const petNames = pets.map((p) => p.name).join(", ");
  const petsLine = petNames
    ? t("delete_account.item_pets_with_names", { names: petNames })
    : t("delete_account.item_pets");

  const runDelete = async () => {
    setDeleting(true);
    try {
      await authApi.deleteMe();
      // 완료 알림을 먼저 띄우고, "확인"을 눌러야 로그아웃·이동한다.
      // 순서를 뒤집으면 프로필이 로그인 프롬프트로 튀어 알림이 그 위에
      // 뜨게 되어 어색하다.
      Alert.alert("", t("delete_account.done_body"), [
        {
          text: t("delete_account.done_ok"),
          onPress: async () => {
            await logout();
            router.replace("/auth");
          },
        },
      ]);
    } catch {
      Alert.alert("", t("delete_account.error_body"));
      setDeleting(false);
    }
    // 성공 경로에서는 alert 콜백이 logout+replace 하므로 setDeleting(false)
    // 하지 않는다. 화면이 언마운트될 때까지 버튼은 disabled 유지.
  };

  const handleDelete = () => {
    if (deleting) return;
    Alert.alert(
      t("delete_account.confirm_title"),
      t("delete_account.confirm_body"),
      [
        { text: t("delete_account.confirm_cancel"), style: "cancel" },
        {
          text: t("delete_account.confirm_submit"),
          style: "destructive",
          onPress: runDelete,
        },
      ]
    );
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
        <Text style={styles.headerTitle}>{t("delete_account.title")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.intro}>{t("delete_account.intro")}</Text>

        <View style={styles.list}>
          <BulletItem label={t("delete_account.item_account")} />
          <BulletItem label={petsLine} />
          <BulletItem label={t("delete_account.item_favorites")} />
        </View>

        <Text style={styles.footer}>{t("delete_account.footer_correction")}</Text>
      </ScrollView>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={() => router.back()}
          disabled={deleting}
        >
          <Text style={styles.btnSecondaryText}>{t("delete_account.cancel")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnDanger, deleting && styles.btnDisabled]}
          onPress={handleDelete}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={Colors.surface} />
          ) : (
            <Text style={styles.btnDangerText}>{t("delete_account.submit")}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function BulletItem({ label }: { label: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.bulletText}>{label}</Text>
    </View>
  );
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
  body: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  intro: {
    ...Typography.body,
    color: Colors.text,
    lineHeight: 22,
  },
  list: {
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  bullet: {
    ...Typography.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  bulletText: {
    ...Typography.body,
    color: Colors.text,
    flex: 1,
    lineHeight: 22,
  },
  footer: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  btn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondary: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnSecondaryText: {
    ...Typography.button,
    color: Colors.text,
  },
  btnDanger: {
    backgroundColor: Colors.error,
  },
  btnDangerText: {
    ...Typography.button,
    color: Colors.surface,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
