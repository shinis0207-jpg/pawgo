import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { usePetStore } from "@/store/petStore";
import { useAuthStore } from "@/store/authStore";
import { PetCard } from "@/components/PetCard";
import { Colors, Spacing, Radius, Typography } from "@/constants/theme";
import { Pet } from "@/types";

const PET_TYPES = ["dog", "cat", "bird", "rabbit", "other"];

export default function PetsScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { pets, isLoading, fetchPets, addPet, deletePet } = usePetStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<Partial<Pet>>({ type: "dog" });

  useEffect(() => {
    if (user) fetchPets();
  }, [user]);

  const handleAdd = async () => {
    if (!form.name || !form.type) return;
    try {
      await addPet(form);
      setShowAddModal(false);
      setForm({ type: "dog" });
    } catch {
      Alert.alert(t("common.error"), t("common.error"));
    }
  };

  const handleDelete = (pet: Pet) => {
    Alert.alert(
      t("common.delete"),
      t("pets.delete_confirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deletePet(pet.id),
        },
      ]
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="paw-outline" size={64} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>{t("auth.login")}</Text>
          <Text style={styles.emptySubtitle}>반려동물 관리를 위해 로그인하세요</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("pets.title")}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={20} color={Colors.surface} />
          <Text style={styles.addBtnText}>{t("pets.add")}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={styles.loader} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {pets.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🐾</Text>
              <Text style={styles.emptyTitle}>{t("pets.no_pets")}</Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => setShowAddModal(true)}
              >
                <Text style={styles.emptyAddText}>{t("pets.add")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            pets.map((pet) => (
              <View key={pet.id} style={styles.petRow}>
                <PetCard pet={pet} />
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(pet)}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add Pet Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("pets.add")}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.formGroup}>
                <Text style={styles.label}>{t("pets.name")} *</Text>
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                  placeholder={t("pets.name")}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>{t("pets.type")} *</Text>
                <View style={styles.typeRow}>
                  {PET_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.typeChip, form.type === type && styles.typeChipActive]}
                      onPress={() => setForm((p) => ({ ...p, type }))}
                    >
                      <Text style={[styles.typeChipText, form.type === type && styles.typeChipTextActive]}>
                        {t(`pets.${type}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>{t("pets.breed")}</Text>
                <TextInput
                  style={styles.input}
                  value={form.breed ?? ""}
                  onChangeText={(v) => setForm((p) => ({ ...p, breed: v }))}
                  placeholder={t("pets.breed")}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>{t("pets.weight")}</Text>
                  <TextInput
                    style={styles.input}
                    value={form.weight_kg?.toString() ?? ""}
                    onChangeText={(v) => setForm((p) => ({ ...p, weight_kg: parseFloat(v) || undefined }))}
                    keyboardType="decimal-pad"
                    placeholder="0.0"
                  />
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>{t("pets.chip_id")}</Text>
                  <TextInput
                    style={styles.input}
                    value={form.chip_id ?? ""}
                    onChangeText={(v) => setForm((p) => ({ ...p, chip_id: v }))}
                    placeholder="000.000.000"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>{t("pets.notes")}</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={form.notes ?? ""}
                  onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))}
                  multiline
                  numberOfLines={3}
                  placeholder={t("pets.notes")}
                />
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitBtn, !form.name && styles.submitBtnDisabled]}
              onPress={handleAdd}
              disabled={!form.name}
            >
              <Text style={styles.submitBtnText}>{t("common.save")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { ...Typography.h2, color: Colors.text },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  addBtnText: { ...Typography.button, color: Colors.surface },
  loader: { marginTop: Spacing.xxl },
  list: { padding: Spacing.md },
  petRow: { flexDirection: "row", alignItems: "center" },
  deleteBtn: {
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  empty: { alignItems: "center", paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { ...Typography.h3, color: Colors.textSecondary },
  emptySubtitle: { ...Typography.body, color: Colors.textSecondary },
  emptyAddBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  emptyAddText: { ...Typography.button, color: Colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.md },
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: "90%",
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: { ...Typography.h2, color: Colors.text },
  formGroup: { marginBottom: Spacing.md },
  label: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: Spacing.xs, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  textarea: { height: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: Spacing.md },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  typeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "15" },
  typeChipText: { ...Typography.bodySmall, color: Colors.textSecondary },
  typeChipTextActive: { color: Colors.primary, fontWeight: "600" },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { ...Typography.button, color: Colors.surface },
});
