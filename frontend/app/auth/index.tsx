import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/store/authStore";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";
import { MVP_SHOW_SOCIAL_LOGIN } from "@/constants/mvp";
import { PRIVACY_POLICY_URL } from "@/constants/links";

type Mode = "login" | "register";

export default function AuthScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login, register, isLoading } = useAuthStore();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) return;
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        if (!name) return;
        await register({ email, password, name });
      }
      router.replace("/(tabs)");
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? t("common.error");
      Alert.alert(t("common.error"), msg);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.inner}
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <Text style={styles.logo}>🐾</Text>
          <Text style={styles.appName}>PawGo</Text>
          <Text style={styles.tagline}>{t("auth.subtitle")}</Text>
        </View>

        {/* Toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === "login" && styles.modeBtnActive]}
            onPress={() => setMode("login")}
          >
            <Text style={[styles.modeBtnText, mode === "login" && styles.modeBtnTextActive]}>
              {t("auth.login")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === "register" && styles.modeBtnActive]}
            onPress={() => setMode("register")}
          >
            <Text style={[styles.modeBtnText, mode === "register" && styles.modeBtnTextActive]}>
              {t("auth.register")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {mode === "register" && (
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t("auth.name")}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={t("auth.email")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={t("auth.password")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword((p) => !p)} style={styles.eyeBtn}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.surface} />
            ) : (
              <Text style={styles.submitBtnText}>
                {mode === "login" ? t("auth.login") : t("auth.register")}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* OAuth — hidden in MVP. Both buttons have no onPress yet, so
            ship email-only. Styles below are kept so flipping the flag
            in Phase 5+ restores the section as-is. */}
        {MVP_SHOW_SOCIAL_LOGIN && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t("auth.or_divider")}</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity style={styles.kakaoBtn}>
              <Text style={styles.kakaoBtnText}>💬 {t("auth.kakao_login")}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.googleBtn}>
              <Text style={styles.googleBtnText}>G  {t("auth.google_login")}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Privacy policy link — surfaced before the user signs up so they
            can read what they're agreeing to. Same skipText tone (subdued,
            centered) — it's a footer, not a CTA. */}
        <TouchableOpacity
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          style={styles.privacyBtn}
        >
          <Text style={styles.privacyText}>{t("profile.privacy")}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.skipBtn}>
          <Text style={styles.skipText}>{t("auth.skip_for_now")}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  inner: { flex: 1, padding: Spacing.xl },
  logoSection: { alignItems: "center", marginBottom: Spacing.xl },
  logo: { fontSize: 60 },
  appName: { ...Typography.h1, color: Colors.primary, marginTop: Spacing.sm },
  tagline: { ...Typography.body, color: Colors.textSecondary, marginTop: Spacing.xs },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: Spacing.md - 2,
    alignItems: "center",
    borderRadius: Radius.md,
  },
  modeBtnActive: { backgroundColor: Colors.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  modeBtnText: { ...Typography.button, color: Colors.textSecondary },
  modeBtnTextActive: { color: Colors.text },
  form: { gap: Spacing.md, marginBottom: Spacing.xl },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  inputIcon: { marginRight: Spacing.sm },
  input: { flex: 1, paddingVertical: Spacing.md, ...Typography.body, color: Colors.text },
  eyeBtn: { padding: Spacing.sm },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { ...Typography.button, color: Colors.surface },
  divider: { flexDirection: "row", alignItems: "center", gap: Spacing.md, marginBottom: Spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { ...Typography.bodySmall, color: Colors.textSecondary },
  kakaoBtn: {
    backgroundColor: "#FEE500",
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  kakaoBtnText: { ...Typography.button, color: "#3A1D1D" },
  googleBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  googleBtnText: { ...Typography.button, color: Colors.text },
  skipBtn: { alignItems: "center" },
  skipText: { ...Typography.bodySmall, color: Colors.textSecondary },
  privacyBtn: { alignItems: "center", marginBottom: Spacing.sm },
  privacyText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textDecorationLine: "underline",
  },
});
