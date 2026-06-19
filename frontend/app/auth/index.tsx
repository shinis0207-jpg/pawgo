import React, { useEffect, useState } from "react";
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
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/store/authStore";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";
import { MVP_SHOW_SOCIAL_LOGIN } from "@/constants/mvp";
import { PRIVACY_POLICY_URL } from "@/constants/links";

type Mode = "login" | "register" | "verify";

// Map of known backend `detail` strings → i18n keys for friendly Korean
// messages. login's 403 EMAIL_NOT_VERIFIED is handled separately because
// its detail is already a structured dict (not a string).
const VERIFY_ERROR_MAP: Record<string, string> = {
  "Invalid verification code": "auth.error_code_invalid",
  "Invalid email or code": "auth.error_code_invalid",
  "Invalid email": "auth.error_code_invalid",
  "Verification code expired. Please request a new one.": "auth.error_code_expired",
  "Too many attempts. Please request a new code.": "auth.error_code_used_up",
  "No active verification code. Please request a new one.": "auth.error_code_none",
  "Email already verified. Please log in.": "auth.error_already_verified",
  "Email already verified": "auth.error_already_verified",
  "Failed to send verification email. Please try /resend-code.": "auth.error_send_failed",
  "Failed to send verification email. Please try again.": "auth.error_send_failed",
};

function verifyErrorKey(detail: unknown): string {
  if (typeof detail === "string" && detail in VERIFY_ERROR_MAP) {
    return VERIFY_ERROR_MAP[detail];
  }
  return "common.error";
}

export default function AuthScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    login,
    register,
    verifyEmail,
    resendCode,
    isLoading,
  } = useAuthStore();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Verify-mode state. `pendingEmail` is the email the backend confirmed
  // it sent a code to (after register, or after login returned the 403
  // EMAIL_NOT_VERIFIED dict). `code` is the 6-digit input.
  // `resendCooldown` ticks down each second from up to 60.
  const [pendingEmail, setPendingEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const handleSubmit = async () => {
    try {
      if (mode === "login") {
        if (!email || !password) return;
        await login(email, password);
        router.replace("/(tabs)");
      } else if (mode === "register") {
        if (!email || !password || !name) return;
        const { email: sentTo } = await register({ email, password, name });
        setPendingEmail(sentTo);
        setCode("");
        setResendCooldown(60);
        setMode("verify");
      } else {
        // mode === "verify"
        if (code.length !== 6) return;
        await verifyEmail(pendingEmail, code);
        router.replace("/(tabs)");
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      // login's email-verification gate → switch to verify mode rather
      // than show an error. Works whether the user just registered and
      // closed the app, or has been bounced out of verify earlier.
      if (
        mode === "login" &&
        status === 403 &&
        detail &&
        typeof detail === "object" &&
        detail.code === "EMAIL_NOT_VERIFIED"
      ) {
        setPendingEmail(detail.email ?? email);
        setCode("");
        setResendCooldown(0);
        setMode("verify");
        return;
      }

      let msg: string;
      if (mode === "verify") {
        msg = t(verifyErrorKey(detail));
      } else if (typeof detail === "string") {
        msg = detail;
      } else {
        msg = t("common.error");
      }
      Alert.alert(t("common.error"), msg);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      const { cooldown_sec } = await resendCode(pendingEmail);
      setCode("");
      setResendCooldown(cooldown_sec);
      Alert.alert(t("auth.verify_resend"), t("auth.verify_resend_sent"));
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      // Server-truth cooldown — if 429 with "Retry after N seconds" in
      // detail, mirror it locally so the button label matches reality.
      if (status === 429 && typeof detail === "string") {
        const m = detail.match(/(\d+)\s*seconds/);
        if (m) {
          setResendCooldown(parseInt(m[1], 10));
          return;
        }
      }
      Alert.alert(t("common.error"), t(verifyErrorKey(detail)));
    }
  };

  const submitLabel =
    mode === "login"
      ? t("auth.login")
      : mode === "register"
        ? t("auth.register")
        : t("auth.verify_submit");

  const submitDisabled =
    isLoading || (mode === "verify" && code.length !== 6);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.inner}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        {/* Logo */}
        <View style={styles.logoSection}>
          <Text style={styles.logo}>🐾</Text>
          <Text style={styles.appName}>PawGo</Text>
          <Text style={styles.tagline}>{t("auth.subtitle")}</Text>
        </View>

        {/* Toggle — hidden in verify mode (verify is an intermediate step) */}
        {mode !== "verify" && (
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
        )}

        {/* Login / register form */}
        {(mode === "login" || mode === "register") && (
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
              style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitDisabled}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.surface} />
              ) : (
                <Text style={styles.submitBtnText}>{submitLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Verify form */}
        {mode === "verify" && (
          <View style={styles.form}>
            <Text style={styles.verifyTitle}>{t("auth.verify_title")}</Text>
            <Text style={styles.verifySubtitle}>{t("auth.verify_subtitle")}</Text>
            <Text style={styles.verifySentTo}>
              {t("auth.verify_code_sent_to", { email: pendingEmail })}
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="key-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder={t("auth.verify_code_placeholder")}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitDisabled}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.surface} />
              ) : (
                <Text style={styles.submitBtnText}>{submitLabel}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.resendBtn, resendCooldown > 0 && styles.resendBtnDisabled]}
              onPress={handleResend}
              disabled={resendCooldown > 0}
            >
              <Text
                style={[
                  styles.resendBtnText,
                  resendCooldown > 0 && styles.resendBtnTextDisabled,
                ]}
              >
                {resendCooldown > 0
                  ? t("auth.verify_resend_cooldown", { seconds: resendCooldown })
                  : t("auth.verify_resend")}
              </Text>
            </TouchableOpacity>

            <Text style={styles.spamHint}>{t("auth.verify_spam_hint")}</Text>

            <TouchableOpacity
              onPress={() => {
                setMode("login");
                setCode("");
              }}
              style={styles.skipBtn}
            >
              <Text style={styles.skipText}>{t("auth.verify_back_to_login")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* OAuth — hidden in MVP and also hidden in verify mode. */}
        {mode !== "verify" && MVP_SHOW_SOCIAL_LOGIN && (
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

        {/* Privacy + skip — surfaced only on the login/register surfaces
            where users haven't started a verify flow. */}
        {mode !== "verify" && (
          <>
            <TouchableOpacity
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              style={styles.privacyBtn}
            >
              <Text style={styles.privacyText}>{t("profile.privacy")}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={styles.skipBtn}>
              <Text style={styles.skipText}>{t("auth.skip_for_now")}</Text>
            </TouchableOpacity>
          </>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  inner: { flex: 1, padding: Spacing.xl },
  scrollContent: { flexGrow: 1 },
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
  codeInput: {
    fontSize: 22,
    letterSpacing: 8,
    textAlign: "center",
    fontWeight: "600",
  },
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
  verifyTitle: {
    ...Typography.h2,
    color: Colors.text,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  verifySubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  verifySentTo: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  resendBtn: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  resendBtnDisabled: {},
  resendBtnText: {
    ...Typography.body,
    color: Colors.primary,
  },
  resendBtnTextDisabled: {
    color: Colors.textSecondary,
  },
  spamHint: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
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
