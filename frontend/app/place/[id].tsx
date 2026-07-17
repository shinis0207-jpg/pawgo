import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Image,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { reviewsApi } from "@/services/api";
import { usePlace } from "@/hooks/usePlaces";
import { Colors, Spacing, Radius, Typography, categoryColors } from "@/constants/theme";
import { Review } from "@/types";
import { CategoryPlaceholder } from "@/components/CategoryPlaceholder";
import { VerificationBadge } from "@/components/VerificationBadge";
import { CorrectionRequestModal } from "@/components/CorrectionRequestModal";
import { FavoriteButton } from "@/components/FavoriteButton";
import { useAuthStore } from "@/store/authStore";
import { MVP_SHOW_REVIEWS } from "@/constants/mvp";
import { isHiddenCategory } from "@/constants/categories";

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const placeId = parseInt(id);

  const { data: place, isLoading } = usePlace(placeId);
  const token = useAuthStore((s) => s.token);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);

  // Review fetch is wired up but gated behind MVP_SHOW_REVIEWS — Phase 1 ships
  // without a review system, so skip the request entirely (no spinner, no
  // backend call) when the flag is off. Flip MVP_SHOW_REVIEWS to true in
  // Phase 3 to re-enable both the query and the UI sections below.
  const { data: reviews } = useQuery({
    queryKey: ["reviews", placeId],
    queryFn: () => reviewsApi.listForPlace(placeId).then((r) => r.data),
    enabled: MVP_SHOW_REVIEWS && !!placeId,
  });

  if (isLoading || !place) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const handleCall = () => {
    if (place.phone) Linking.openURL(`tel:${place.phone}`);
  };

  const handleReportInfo = () => {
    if (!token) {
      Alert.alert(
        t("correction.auth_required_title"),
        t("correction.auth_required_body"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("correction.auth_required_cta"),
            onPress: () => router.push("/auth"),
          },
        ],
      );
      return;
    }
    setShowCorrectionModal(true);
  };

  const handleDirections = () => {
    const url = `kakaomap://route?ep=${place.latitude},${place.longitude}&by=CAR`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else
        Linking.openURL(
          `https://map.kakao.com/link/to/${place.name},${place.latitude},${place.longitude}`
        );
    });
  };

  const categoryColor = categoryColors[place.category] ?? Colors.primary;

  // Same badge policy as PlaceCard: prefer place.categories (multi-tag,
  // sort_order-ordered), fall back to the legacy scalar. Detail screen
  // has more horizontal room than a card, but we still cap the visible
  // count so a place with every possible tag doesn't take over the title.
  // Hidden codes stripped FIRST — same rationale as PlaceCard: filtering
  // after the slice would corrupt the +N overflow count.
  const DETAIL_MAX_TAGS = 3;
  const tagCodes = (place.categories ?? []).filter((c) => !isHiddenCategory(c));
  const badgeLabel =
    tagCodes.length > 0
      ? (() => {
          const shown = tagCodes
            .slice(0, DETAIL_MAX_TAGS)
            .map((c) => t(`categories.${c}`));
          const overflow = tagCodes.length - shown.length;
          return overflow > 0
            ? `${shown.join(" · ")} +${overflow}`
            : shown.join(" · ");
        })()
      : t(`categories.${place.category}`);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Hero image */}
        <View style={styles.heroContainer}>
          {place.thumbnail_url ? (
            <Image source={{ uri: place.thumbnail_url }} style={styles.hero} />
          ) : (
            <CategoryPlaceholder category={place.category} size="large" />
          )}
        </View>

        <View style={styles.content}>
          {/* Title */}
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.badges}>
                <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
                  <Text style={styles.categoryBadgeText} numberOfLines={1}>
                    {badgeLabel}
                  </Text>
                </View>
              </View>
              <Text style={styles.placeName}>{place.name}</Text>
              <Text style={styles.placeAddress}>{place.address}</Text>
              <View style={styles.verificationRow}>
                <VerificationBadge
                  status={place.pet_policy?.verification_status}
                />
              </View>
            </View>
            <FavoriteButton place={place} />
          </View>

          {/* Rating — hidden in MVP because place.rating / review_count are
              always 0 until Phase 3 reviews ship; showing "★★★★★ 0.0 (0개 리뷰)"
              implies user action that doesn't exist yet. */}
          {MVP_SHOW_REVIEWS && (
            <View style={styles.ratingRow}>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= Math.round(place.rating) ? "star" : "star-outline"}
                    size={18}
                    color={Colors.warning}
                  />
                ))}
              </View>
              <Text style={styles.ratingValue}>{place.rating.toFixed(1)}</Text>
              <Text style={styles.reviewCount}>({place.review_count}개 리뷰)</Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            {place.phone && (
              <ActionButton icon="call" label={t("place.call")} onPress={handleCall} primary />
            )}
            <ActionButton icon="navigate" label={t("place.directions")} onPress={handleDirections} />
          </View>

          {/* Info — hide the whole card when none of hours/phone/entrance_fee
              are present so we don't ship an empty white shadow box. MFDS seed
              data has hours=null + entrance_fee=null and phone is often null
              too, which used to leave just the InfoCard padding/shadow on
              screen. Same pattern as the pet-info IIFE below. */}
          {(() => {
            const showHours = place.hours != null;
            const showPhone = place.phone != null;
            const showFee = place.entrance_fee != null;
            if (!showHours && !showPhone && !showFee) return null;
            return (
              <InfoCard>
                {showHours && (
                  <InfoRow icon="time-outline" label={t("place.hours")}>
                    <Text style={styles.infoValue}>
                      {Object.entries(place.hours!).map(([day, h]) => `${day}: ${h}`).join("\n")}
                    </Text>
                  </InfoRow>
                )}
                {showPhone && (
                  <InfoRow icon="call-outline" label={t("place.phone")}>
                    <Text style={styles.infoValue}>{place.phone}</Text>
                  </InfoRow>
                )}
                {showFee && (
                  <InfoRow icon="ticket-outline" label={t("place.entrance_fee")}>
                    <Text style={styles.infoValue}>{place.entrance_fee}</Text>
                  </InfoRow>
                )}
              </InfoCard>
            );
          })()}

          {/* Pet info — show only fields where we actually have data.
              Hide the whole card when nothing is known so we never invent
              defaults like "체중 제한 없음" from a missing value. The block
              re-appears automatically as owner/admin input fills pet_policy. */}
          {(() => {
            const policy = place.pet_policy;
            const showIndoor = policy?.indoor_allowed != null;
            const showOutdoor = policy?.outdoor_allowed != null;
            const showWeight = policy?.max_weight_kg != null;
            // has_parking is NOT NULL on the backend, but `false` here can mean
            // either "no parking" or "we don't actually know" (MFDS doesn't say).
            // Surface only when affirmatively true.
            const showParking = place.has_parking === true;
            const anyVisible = showIndoor || showOutdoor || showParking || showWeight;
            if (!anyVisible) return null;
            return (
              <InfoCard title={t("place.pet_info_title")}>
                <View style={styles.petInfoGrid}>
                  {showIndoor && (
                    <PetInfoBadge
                      icon="home-outline"
                      label={t("filter.indoor")}
                      active={policy!.indoor_allowed === true}
                    />
                  )}
                  {showOutdoor && (
                    <PetInfoBadge
                      icon="leaf-outline"
                      label={t("filter.outdoor")}
                      active={policy!.outdoor_allowed === true}
                    />
                  )}
                  {showParking && (
                    <PetInfoBadge
                      icon="car-outline"
                      label={t("filter.parking")}
                      active
                    />
                  )}
                  {showWeight && (
                    <PetInfoBadge
                      icon="scale-outline"
                      label={t("place.kg_limit", { weight: policy!.max_weight_kg })}
                      active
                    />
                  )}
                </View>
              </InfoCard>
            );
          })()}

          {/* Description */}
          {place.description && (
            <View style={styles.description}>
              <Text style={styles.sectionTitle}>{t("place.about_title")}</Text>
              <Text style={styles.descriptionText}>{place.description}</Text>
            </View>
          )}

          {/* Reviews — hidden in MVP. The whole section (header, write-review
              button, empty state, list) lives behind MVP_SHOW_REVIEWS so we
              don't ship a "리뷰 작성" button that routes to nothing. */}
          {MVP_SHOW_REVIEWS && (
            <View style={styles.reviewSection}>
              <View style={styles.reviewHeader}>
                <Text style={styles.sectionTitle}>{t("place.reviews")}</Text>
                <TouchableOpacity style={styles.writeReviewBtn}>
                  <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
                  <Text style={styles.writeReviewText}>{t("place.write_review")}</Text>
                </TouchableOpacity>
              </View>

              {(reviews ?? []).length === 0 ? (
                <View style={styles.noReviews}>
                  <Text style={styles.noReviewsText}>{t("place.no_reviews")}</Text>
                </View>
              ) : (
                (reviews ?? []).map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))
              )}
            </View>
          )}

          {/* Report incorrect info — entry point for the correction-request flow. */}
          <TouchableOpacity
            style={styles.reportInfoBtn}
            onPress={handleReportInfo}
            accessibilityRole="button"
          >
            <Ionicons name="alert-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.reportInfoText}>
              {t("correction.report_info_button")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CorrectionRequestModal
        visible={showCorrectionModal}
        placeId={place.id}
        placeName={place.name}
        onClose={() => setShowCorrectionModal(false)}
      />
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, primary ? styles.actionBtnPrimary : styles.actionBtnSecondary]}
      onPress={onPress}
    >
      <Ionicons
        name={icon as any}
        size={18}
        color={primary ? Colors.surface : Colors.text}
      />
      <Text style={[styles.actionBtnText, primary && styles.actionBtnTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.infoCard}>
      {title && <Text style={styles.sectionTitle}>{title}</Text>}
      {children}
    </View>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={16} color={Colors.textSecondary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>{children}</View>
    </View>
  );
}

function PetInfoBadge({
  icon,
  label,
  active,
}: {
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <View style={[styles.petBadge, !active && styles.petBadgeInactive]}>
      <Ionicons
        name={icon as any}
        size={16}
        color={active ? Colors.primary : Colors.textLight}
      />
      <Text style={[styles.petBadgeText, !active && styles.petBadgeTextInactive]}>{label}</Text>
    </View>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewTop}>
        <View style={styles.reviewUser}>
          <View style={styles.reviewAvatar}>
            <Text style={styles.reviewAvatarText}>
              {review.user.name.charAt(0)}
            </Text>
          </View>
          <View>
            <Text style={styles.reviewUserName}>{review.user.name}</Text>
            {review.pet && (
              <Text style={styles.reviewPet}>🐾 {review.pet.name}</Text>
            )}
          </View>
        </View>
        <View style={styles.reviewStars}>
          {[1, 2, 3, 4, 5].map((s) => (
            <Ionicons
              key={s}
              name={s <= review.rating ? "star" : "star-outline"}
              size={12}
              color={Colors.warning}
            />
          ))}
        </View>
      </View>
      {review.content && (
        <Text style={styles.reviewContent}>{review.content}</Text>
      )}
      <Text style={styles.reviewDate}>
        {new Date(review.created_at).toLocaleDateString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroContainer: { height: 240 },
  hero: { width: "100%", height: "100%", resizeMode: "cover" },
  heroPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEmoji: { fontSize: 64 },
  content: { padding: Spacing.lg },
  titleRow: { flexDirection: "row", marginBottom: Spacing.md },
  badges: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.sm },
  categoryBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  categoryBadgeText: { ...Typography.caption, color: Colors.surface, fontWeight: "700" },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.success + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  verifiedText: { ...Typography.caption, color: Colors.success, fontWeight: "600" },
  verificationRow: { marginTop: Spacing.sm },
  reportInfoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  reportInfoText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  placeName: { ...Typography.h1, color: Colors.text, marginBottom: Spacing.xs },
  placeAddress: { ...Typography.body, color: Colors.textSecondary },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  stars: { flexDirection: "row", gap: 2 },
  ratingValue: { ...Typography.h3, color: Colors.text },
  reviewCount: { ...Typography.bodySmall, color: Colors.textSecondary },
  actions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  actionBtnPrimary: { backgroundColor: Colors.primary },
  actionBtnSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnText: { ...Typography.button, color: Colors.text },
  actionBtnTextPrimary: { color: Colors.surface },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: { ...Typography.bodySmall, color: Colors.textSecondary, width: 60 },
  infoValue: { ...Typography.bodySmall, color: Colors.text, textAlign: "right" },
  petInfoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  petBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.primary + "12",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  petBadgeInactive: {
    backgroundColor: Colors.background,
    borderColor: Colors.border,
  },
  petBadgeText: { ...Typography.bodySmall, color: Colors.primary, fontWeight: "600" },
  petBadgeTextInactive: { color: Colors.textLight },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  description: { marginBottom: Spacing.md },
  descriptionText: { ...Typography.body, color: Colors.textSecondary, lineHeight: 24 },
  reviewSection: { marginBottom: Spacing.xl },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  writeReviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary + "15",
  },
  writeReviewText: { ...Typography.bodySmall, color: Colors.primary, fontWeight: "600" },
  noReviews: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
  },
  noReviewsText: { ...Typography.body, color: Colors.textSecondary },
  reviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  reviewTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  reviewUser: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewAvatarText: { fontSize: 14, fontWeight: "700", color: Colors.surface },
  reviewUserName: { ...Typography.bodySmall, color: Colors.text, fontWeight: "600" },
  reviewPet: { ...Typography.caption, color: Colors.textSecondary },
  reviewStars: { flexDirection: "row", gap: 1 },
  reviewContent: { ...Typography.body, color: Colors.text, marginBottom: Spacing.sm, lineHeight: 22 },
  reviewDate: { ...Typography.caption, color: Colors.textLight },
});
