import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Switch,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";
import { SupportedLanguage, supportedLanguages } from "@/i18n";

const LANGUAGE_LABELS: Record<string, string> = {
  ko: "한국어",
  en: "English",
};

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLanguageChange = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang);
  };

  const handleLogout = () => {
    Alert.alert(
      t("profile.logout"),
      t("auth.logout") + "하시겠습니까?",
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("profile.logout"), style: "destructive", onPress: logout },
      ]
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loginPrompt}>
          <Ionicons name="person-circle-outline" size={80} color={Colors.textLight} />
          <Text style={styles.loginTitle}>{t("auth.welcome")}</Text>
          <Text style={styles.loginSubtitle}>{t("auth.subtitle")}</Text>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => router.push("/auth")}
          >
            <Text style={styles.loginBtnText}>{t("auth.login")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.registerBtn}
            onPress={() => router.push("/auth")}
          >
            <Text style={styles.registerBtnText}>{t("auth.register")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* User info */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            {user.is_verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                <Text style={styles.verifiedText}>인증됨</Text>
              </View>
            )}
          </View>
          <TouchableOpacity>
            <Ionicons name="pencil-outline" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Language */}
        <Section title={t("profile.language")}>
          <View style={styles.languageGrid}>
            {supportedLanguages.map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[
                  styles.langChip,
                  i18n.language === lang && styles.langChipActive,
                ]}
                onPress={() => handleLanguageChange(lang)}
              >
                <Text
                  style={[
                    styles.langChipText,
                    i18n.language === lang && styles.langChipTextActive,
                  ]}
                >
                  {LANGUAGE_LABELS[lang]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* Menu */}
        <Section title="설정">
          <MenuItem icon="notifications-outline" label={t("profile.notifications")} />
          <MenuItem icon="document-text-outline" label={t("profile.terms")} />
          <MenuItem icon="shield-outline" label={t("profile.privacy")} />
          <MenuItem icon="information-circle-outline" label={`${t("profile.version")} 1.0.0`} />
        </Section>

        <Section title="계정">
          <TouchableOpacity style={styles.logoutRow} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={Colors.error} />
            <Text style={styles.logoutText}>{t("profile.logout")}</Text>
          </TouchableOpacity>
        </Section>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function MenuItem({ icon, label, onPress }: { icon: string; label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon as any} size={20} color={Colors.textSecondary} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textLight} style={{ marginLeft: "auto" }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 24, fontWeight: "700", color: Colors.surface },
  userInfo: { flex: 1, gap: 2 },
  userName: { ...Typography.h3, color: Colors.text },
  userEmail: { ...Typography.bodySmall, color: Colors.textSecondary },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  verifiedText: { ...Typography.caption, color: Colors.success, fontWeight: "600" },
  section: { marginBottom: Spacing.md },
  sectionTitle: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  languageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  langChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  langChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "15" },
  langChipText: { ...Typography.body, color: Colors.textSecondary },
  langChipTextActive: { color: Colors.primary, fontWeight: "700" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuLabel: { ...Typography.body, color: Colors.text },
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  logoutText: { ...Typography.body, color: Colors.error, fontWeight: "600" },
  loginPrompt: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  loginTitle: { ...Typography.h2, color: Colors.text },
  loginSubtitle: { ...Typography.body, color: Colors.textSecondary, textAlign: "center" },
  loginBtn: {
    width: "100%",
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: Radius.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  loginBtnText: { ...Typography.button, color: Colors.surface },
  registerBtn: {
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: Radius.md,
    alignItems: "center",
  },
  registerBtnText: { ...Typography.button, color: Colors.primary },
});
