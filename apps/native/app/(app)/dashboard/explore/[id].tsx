import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	Image,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useHideTabBar } from "@/hooks/useHideTabBar";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { formatMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop";

function schedulingLabel(type: string | undefined | null): string {
	if (type === "class_slot" || type === "class-slot") return "Class Slot";
	if (type === "appointment") return "Appointment";
	return type ?? "Service";
}

// ─── Stat Cell ───────────────────────────────────────────────────

function StatCell({
	icon,
	value,
	label,
	showBorder,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	value: string;
	label: string;
	showBorder?: boolean;
}) {
	return (
		<View
			className="flex-1 items-center py-3"
			style={
				showBorder
					? { borderLeftWidth: 1, borderLeftColor: colors.secondary[2] }
					: undefined
			}
		>
			<Ionicons
				name={icon}
				size={16}
				color={colors.secondary[1]}
				style={{ marginBottom: 4 }}
			/>
			<Text
				style={{
					fontFamily: fonts.heading,
					fontSize: 16,
					fontWeight: "800",
					color: colors.primary[1],
					letterSpacing: -0.4,
				}}
			>
				{value}
			</Text>
			<Text
				style={{
					fontFamily: fonts.body,
					fontSize: 10,
					fontWeight: "600",
					color: colors.secondary[1],
					letterSpacing: 0.6,
					textTransform: "uppercase",
					marginTop: 2,
				}}
			>
				{label}
			</Text>
		</View>
	);
}

// ─── Feature Item ────────────────────────────────────────────────

function FeatureItem({ text }: { text: string }) {
	return (
		<View className="flex-row items-center" style={{ gap: 7 }}>
			<View
				className="h-[18px] w-[18px] items-center justify-center rounded-full"
				style={{ backgroundColor: colors.primary[1] }}
			>
				<Ionicons name="checkmark" size={10} color={colors.primary[2]} />
			</View>
			<Text
				style={{
					fontFamily: fonts.subheading,
					fontSize: 12.5,
					color: colors.primary[1],
				}}
			>
				{text}
			</Text>
		</View>
	);
}

// ─── Screen ──────────────────────────────────────────────────────

export default function ServiceDetailScreen() {
	useHideTabBar();
	const { organizationId } = useOrganization();
	const params = useLocalSearchParams<{ id: string }>();
	const serviceId = params.id;

	const { data: service, isLoading } = useQuery({
		...orpc.services.getById.queryOptions({
			input: { organizationId, id: serviceId! },
		}),
		enabled: !!serviceId,
	});

	const { data: relatedServices } = useQuery({
		...orpc.services.list.queryOptions({
			input: {
				organizationId,
				categoryId: (service as any)?.categoryId,
				isActive: true,
			},
		}),
		enabled: !!(service as any)?.categoryId,
	});

	const related = (relatedServices ?? [])
		.filter((s: any) => s.id !== serviceId)
		.slice(0, 2);

	const handleBookNow = () => {
		if (!service) return;
		router.push({
			pathname: "/dashboard/book-workout/book-workout" as never,
			params: {
				preSelectedCategoryId: (service as any).categoryId,
				preSelectedServiceId: (service as any).id,
			},
		});
	};

	const handleBuyPackage = () => {
		if (!service) return;
		router.push({
			pathname: "/dashboard/buy-package/setup" as never,
			params: {
				preSelectedCategoryId: (service as any).categoryId,
				preSelectedServiceId: (service as any).id,
			},
		});
	};

	if (isLoading) {
		return (
			<Container>
				<View className="flex-1 items-center justify-center bg-secondary-3">
					<ActivityIndicator size="large" color={colors.primary[1]} />
				</View>
			</Container>
		);
	}

	if (!service) {
		return (
			<Container>
				<View className="flex-1 items-center justify-center bg-secondary-3 p-6">
					<Text
						style={{
							fontFamily: fonts.heading,
							fontSize: 18,
							color: colors.primary[1],
							marginBottom: 8,
						}}
					>
						Service not found
					</Text>
					<TouchableOpacity
						onPress={() => router.back()}
						className="mt-4 items-center justify-center rounded-xl bg-primary-1 px-6 py-3"
					>
						<Text
							style={{
								fontFamily: fonts.subheading,
								fontSize: 14,
								color: colors.primary[2],
							}}
						>
							Go Back
						</Text>
					</TouchableOpacity>
				</View>
			</Container>
		);
	}

	const svc = service as any;
	const isPackage = svc.sessionCount != null && svc.sessionCount > 0;
	const duration = svc.duration
		? `${svc.duration} ${svc.durationUnitType === "hours" ? "hr" : "min"}`
		: null;
	const perUnit =
		svc.priceUnit === "package"
			? "package"
			: svc.priceUnit === "class"
				? "class"
				: "session";

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 100 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Hero Image Header */}
				<View style={{ height: 290, position: "relative" }}>
					<Image
						source={{ uri: svc.imageUrl ?? DEFAULT_IMAGE }}
						style={{ width: "100%", height: "100%" }}
						resizeMode="cover"
					/>
					<LinearGradient
						colors={["transparent", "rgba(0,0,0,0.75)"]}
						locations={[0.3, 1]}
						style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
					/>

					{/* Back button */}
					<TouchableOpacity
						onPress={() => router.back()}
						activeOpacity={0.7}
						style={{
							position: "absolute",
							top: 54,
							left: 16,
							width: 40,
							height: 40,
							borderRadius: 20,
							backgroundColor: "rgba(0,0,0,0.55)",
							borderWidth: 1,
							borderColor: "rgba(255,255,255,0.25)",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<Ionicons name="chevron-back" size={20} color="#fff" />
					</TouchableOpacity>

					{/* Bottom overlay content */}
					<View
						style={{
							position: "absolute",
							bottom: 0,
							left: 0,
							right: 0,
							padding: 16,
						}}
					>
						{/* Title */}
						<Text
							style={{
								fontFamily: fonts.heading,
								fontSize: 26,
								color: "#fff",
								letterSpacing: -0.3,
								lineHeight: 29,
								marginBottom: 6,
							}}
						>
							{svc.name}
						</Text>

						{/* Tags */}
						<View className="flex-row flex-wrap" style={{ gap: 6 }}>
							<View
								style={{
									backgroundColor: "rgba(255,255,255,0.18)",
									borderRadius: 999,
									paddingHorizontal: 10,
									paddingVertical: 4,
								}}
							>
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 11,
										color: "rgba(255,255,255,0.9)",
									}}
								>
									{schedulingLabel(svc.schedulingType)}
								</Text>
							</View>
							{svc.category?.name && (
								<View
									style={{
										backgroundColor: "rgba(255,255,255,0.18)",
										borderRadius: 999,
										paddingHorizontal: 10,
										paddingVertical: 4,
									}}
								>
									<Text
										style={{
											fontFamily: fonts.body,
											fontSize: 11,
											color: "rgba(255,255,255,0.9)",
										}}
									>
										{svc.category.name}
									</Text>
								</View>
							)}
							{duration && (
								<View
									style={{
										backgroundColor: "rgba(255,255,255,0.18)",
										borderRadius: 999,
										paddingHorizontal: 10,
										paddingVertical: 4,
									}}
								>
									<Text
										style={{
											fontFamily: fonts.body,
											fontSize: 11,
											color: "rgba(255,255,255,0.9)",
										}}
									>
										{duration}
									</Text>
								</View>
							)}
						</View>
					</View>
				</View>

				{/* CTA Buttons */}
				<View className="flex-row px-5 pt-4" style={{ gap: 10 }}>
					<TouchableOpacity
						onPress={handleBuyPackage}
						activeOpacity={0.8}
						className="flex-1 flex-row items-center justify-center rounded-2xl"
						style={{
							height: 54,
							backgroundColor: colors.primary[2],
							borderWidth: 1,
							borderColor: colors.secondary[2],
							shadowColor: "#000",
							shadowOffset: { width: 0, height: 2 },
							shadowOpacity: 0.06,
							shadowRadius: 8,
							gap: 8,
						}}
					>
						<Ionicons name="cube-outline" size={18} color={colors.primary[1]} />
						<Text
							style={{
								fontFamily: fonts.heading,
								fontSize: 14,
								fontWeight: "700",
								color: colors.primary[1],
							}}
						>
							Buy Package
						</Text>
					</TouchableOpacity>
					<TouchableOpacity
						onPress={handleBookNow}
						activeOpacity={0.8}
						className="flex-1 flex-row items-center justify-center rounded-2xl"
						style={{
							height: 54,
							backgroundColor: colors.primary[1],
							shadowColor: "#000",
							shadowOffset: { width: 0, height: 4 },
							shadowOpacity: 0.15,
							shadowRadius: 12,
							gap: 8,
						}}
					>
						<Ionicons name="calendar-outline" size={18} color={colors.primary[2]} />
						<Text
							style={{
								fontFamily: fonts.heading,
								fontSize: 14,
								fontWeight: "700",
								color: colors.primary[2],
							}}
						>
							Book Now
						</Text>
					</TouchableOpacity>
				</View>

				{/* Content */}
				<View className="px-5 pt-4">
					{/* Price */}
					<View className="mb-4 flex-row items-baseline" style={{ gap: 5 }}>
						<Text
							style={{
								fontFamily: fonts.heading,
								fontSize: 34,
								fontWeight: "800",
								color: colors.primary[1],
								letterSpacing: -1,
							}}
						>
							{formatMoney(svc.price)}
						</Text>
						<Text
							style={{
								fontFamily: fonts.subheading,
								fontSize: 14,
								color: colors.secondary[1],
								letterSpacing: -0.2,
							}}
						>
							/{perUnit}
						</Text>
					</View>

					{/* Stats Strip */}
					<View
						className="mb-4 flex-row overflow-hidden rounded-[14px] border bg-primary-2"
						style={{ borderColor: colors.secondary[2] }}
					>
						{duration && (
							<StatCell icon="time-outline" value={duration} label="Duration" />
						)}
						<StatCell
							icon="people-outline"
							value={
								svc.maxAttendees != null
									? `Up to ${svc.maxAttendees}`
									: "Flexible"
							}
							label="Capacity"
							showBorder={!!duration}
						/>
						{isPackage && (
							<StatCell
								icon="repeat-outline"
								value={`${svc.sessionCount}`}
								label="Sessions"
								showBorder
							/>
						)}
					</View>

					{/* Description */}
					{svc.description && (
						<Text
							style={{
								fontFamily: fonts.body,
								fontSize: 13,
								lineHeight: 21,
								color: "#3A3A3A",
								marginBottom: 16,
							}}
						>
							{svc.description}
						</Text>
					)}

					{/* Features — 2×2 grid */}
					{Array.isArray(svc.features) && svc.features.length > 0 && (
						<>
							<Text
								style={{
									fontFamily: fonts.heading,
									fontSize: 13,
									fontWeight: "700",
									color: colors.primary[1],
									marginBottom: 10,
								}}
							>
								What's Included
							</Text>
							<View
								className="mb-4 flex-row flex-wrap"
								style={{ gap: 7, columnGap: 12 }}
							>
								{(svc.features as string[]).map((f, i) => (
									<View key={`${i}-${f}`} style={{ width: "47%" }}>
										<FeatureItem text={f} />
									</View>
								))}
							</View>
						</>
					)}

					{/* Divider */}
					<View
						className="my-3.5"
						style={{
							height: 1,
							backgroundColor: colors.secondary[2],
							opacity: 0.6,
						}}
					/>

					{/* Location */}
					{svc.location && (
						<View className="mb-2.5 flex-row items-center" style={{ gap: 10 }}>
							<View
								className="h-[34px] w-[34px] items-center justify-center rounded-[10px] border bg-primary-2"
								style={{ borderColor: colors.secondary[2] }}
							>
								<Ionicons
									name="location-outline"
									size={16}
									color={colors.secondary[1]}
								/>
							</View>
							<View className="flex-1">
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 11,
										fontWeight: "600",
										color: colors.secondary[1],
										letterSpacing: 0.4,
										textTransform: "uppercase",
										marginBottom: 2,
									}}
								>
									Location
								</Text>
								<Text
									style={{
										fontFamily: fonts.subheading,
										fontSize: 13,
										color: colors.primary[1],
									}}
								>
									{svc.location}
								</Text>
							</View>
						</View>
					)}

					{/* Validity */}
					{svc.expirable && svc.expiryDays && (
						<View className="mb-2.5 flex-row items-center" style={{ gap: 10 }}>
							<View
								className="h-[34px] w-[34px] items-center justify-center rounded-[10px] border bg-primary-2"
								style={{ borderColor: colors.secondary[2] }}
							>
								<Ionicons
									name="calendar-outline"
									size={16}
									color={colors.secondary[1]}
								/>
							</View>
							<View className="flex-1">
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 11,
										fontWeight: "600",
										color: colors.secondary[1],
										letterSpacing: 0.4,
										textTransform: "uppercase",
										marginBottom: 2,
									}}
								>
									Validity
								</Text>
								<Text
									style={{
										fontFamily: fonts.subheading,
										fontSize: 13,
										color: colors.primary[1],
									}}
								>
									{svc.expiryDays} days from purchase
								</Text>
							</View>
						</View>
					)}

					{/* Related Services */}
					{related.length > 0 && (
						<>
							<View
								className="my-3.5"
								style={{
									height: 1,
									backgroundColor: colors.secondary[2],
									opacity: 0.6,
								}}
							/>
							<View className="mb-2 flex-row items-center justify-between">
								<Text
									style={{
										fontFamily: fonts.heading,
										fontSize: 13,
										fontWeight: "700",
										color: colors.primary[1],
									}}
								>
									Related Services
								</Text>
								<Text
									style={{
										fontFamily: fonts.subheading,
										fontSize: 12,
										color: colors.secondary[1],
									}}
								>
									See all ›
								</Text>
							</View>
							<View className="flex-row" style={{ gap: 10 }}>
								{related.map((rel: any) => (
									<TouchableOpacity
										key={rel.id}
										className="flex-1 overflow-hidden rounded-[14px] border bg-primary-2"
										style={{ borderColor: colors.secondary[2] }}
										activeOpacity={0.7}
										onPress={() =>
											router.push({
												pathname: "/dashboard/explore/[id]" as never,
												params: { id: rel.id },
											})
										}
									>
										<Image
											source={{ uri: rel.imageUrl ?? DEFAULT_IMAGE }}
											className="h-[72px] w-full"
											resizeMode="cover"
										/>
										<View className="p-2.5">
											<Text
												numberOfLines={1}
												style={{
													fontFamily: fonts.heading,
													fontSize: 12,
													fontWeight: "700",
													color: colors.primary[1],
													letterSpacing: -0.2,
													marginBottom: 4,
												}}
											>
												{rel.name}
											</Text>
											<Text
												style={{
													fontFamily: fonts.heading,
													fontSize: 13,
													fontWeight: "800",
													color: colors.primary[1],
													letterSpacing: -0.3,
												}}
											>
												{formatMoney(rel.price)}
												<Text
													style={{
														fontFamily: fonts.body,
														fontSize: 11,
														fontWeight: "400",
														color: colors.secondary[1],
													}}
												>
													{" "}
													/{rel.priceUnit === "class" ? "class" : "session"}
												</Text>
											</Text>
										</View>
									</TouchableOpacity>
								))}
							</View>
						</>
					)}
				</View>
			</ScrollView>

		</Container>
	);
}
