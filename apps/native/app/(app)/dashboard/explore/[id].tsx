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
import { SafeAreaView } from "react-native-safe-area-context";
import { useHideTabBar } from "@/hooks/useHideTabBar";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop";

function typeLabel(type: string | undefined | null): string {
	if (type === "semi_private" || type === "semi-private") return "Semi-Private";
	if (type === "private") return "Private";
	if (type === "both") return "All Types";
	return "Class";
}

// ── Local presentational helpers ─────────────────────────────────────────────

function MetaTile({
	icon,
	label,
	value,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	value: string;
}) {
	return (
		<View className="flex-1 rounded-xl bg-primary-2 p-3">
			<View className="mb-1 flex-row items-center">
				<Ionicons name={icon} size={14} color={colors.secondary[1]} />
				<Text
					className="ml-1 text-xs"
					style={{ color: colors.secondary[1] }}
				>
					{label}
				</Text>
			</View>
			<Text
				className="font-semibold text-sm"
				style={{ color: colors.primary[1] }}
			>
				{value}
			</Text>
		</View>
	);
}

function SectionHeader({ children }: { children: React.ReactNode }) {
	return (
		<Text
			className="mb-3 font-bold text-xs uppercase tracking-wider"
			style={{ color: colors.secondary[1] }}
		>
			{children}
		</Text>
	);
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ServiceDetailScreen() {
	useHideTabBar();
	const { organizationId } = useOrganization();
	const params = useLocalSearchParams<{ id: string }>();
	const serviceId = params.id;

	// Fetch service detail
	const { data: service, isLoading } = useQuery({
		...orpc.services.getById.queryOptions({
			input: { organizationId, id: serviceId! },
		}),
		enabled: !!serviceId,
	});

	// Fetch related services in same category
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
		.slice(0, 4);

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
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" color={colors.primary[1]} />
				</View>
			</Container>
		);
	}

	if (!service) {
		return (
			<Container>
				<View className="flex-1 items-center justify-center p-6">
					<Text
						className="mb-2 font-bold text-xl"
						style={{ color: colors.primary[1] }}
					>
						Service not found
					</Text>
					<TouchableOpacity
						onPress={() => router.back()}
						className="mt-4 items-center justify-center rounded-xl bg-primary-1 px-6 py-3"
					>
						<Text className="font-semibold text-primary-2">Go Back</Text>
					</TouchableOpacity>
				</View>
			</Container>
		);
	}

	const svc = service as any;
	const isPackage = svc.sessionCount != null && svc.sessionCount > 0;
	const duration = svc.duration
		? `${svc.duration} ${svc.durationUnitType ?? "minutes"}`
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
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Hero image with floating back button */}
				<View className="relative">
					<Image
						source={{ uri: svc.imageUrl ?? DEFAULT_IMAGE }}
						className="h-72 w-full"
						resizeMode="cover"
					/>
					<TouchableOpacity
						onPress={() => router.back()}
						className="absolute left-4 top-12 size-10 items-center justify-center rounded-full"
						style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
					>
						<Ionicons name="arrow-back" size={22} color={colors.primary[1]} />
					</TouchableOpacity>
				</View>

				<View className="px-4 pt-5 pb-6">
					{/* Title row */}
					<View className="mb-2 flex-row items-start justify-between">
						<Text
							className="mr-3 flex-1 font-bold text-2xl"
							style={{ color: colors.primary[1] }}
						>
							{svc.name}
						</Text>
						<View className="flex-row gap-1">
							{svc.isRecommended && (
								<View className="flex-row items-center rounded-full bg-primary-1 px-2 py-1">
									<Ionicons
										name="star"
										size={10}
										color={colors.primary[2]}
									/>
									<Text className="ml-1 font-medium text-xs text-primary-2">
										Recommended
									</Text>
								</View>
							)}
							<View
								className="rounded-full px-2 py-1"
								style={{ backgroundColor: colors.secondary[3] }}
							>
								<Text
									className="font-medium text-xs"
									style={{ color: colors.primary[1] }}
								>
									{typeLabel(svc.type)}
								</Text>
							</View>
						</View>
					</View>

					{svc.category?.name && (
						<Text
							className="mb-3 text-sm"
							style={{ color: colors.secondary[1] }}
						>
							{svc.category.name}
						</Text>
					)}

					{/* Price row */}
					<View className="mb-5 flex-row items-baseline">
						<Text
							className="font-bold text-3xl"
							style={{ color: colors.primary[1] }}
						>
							{formatMoney(svc.price)}
						</Text>
						<Text
							className="ml-1 text-sm"
							style={{ color: colors.secondary[1] }}
						>
							/ {perUnit}
						</Text>
					</View>

					{/* Highlights */}
					<SectionHeader>Highlights</SectionHeader>
					<View className="mb-3 flex-row gap-2">
						{duration && (
							<MetaTile
								icon="time-outline"
								label="Duration"
								value={duration}
							/>
						)}
						<MetaTile
							icon="people-outline"
							label="Capacity"
							value={
								svc.maxAttendees != null
									? `Up to ${svc.maxAttendees}`
									: "Flexible"
							}
						/>
					</View>

					{(isPackage || svc.expirable || svc.schedulingType) && (
						<View className="mb-5 flex-row gap-2">
							{isPackage && (
								<MetaTile
									icon="star-outline"
									label="Sessions"
									value={`${svc.sessionCount} included`}
								/>
							)}
							{svc.expirable && svc.expiryDays && (
								<MetaTile
									icon="calendar-outline"
									label="Validity"
									value={`${svc.expiryDays} days`}
								/>
							)}
							{!isPackage && !svc.expirable && svc.schedulingType && (
								<MetaTile
									icon="calendar-outline"
									label="Booking"
									value={
										svc.schedulingType === "class_slot"
											? "Class slot"
											: "Appointment"
									}
								/>
							)}
						</View>
					)}

					{/* Description */}
					{svc.description && (
						<>
							<SectionHeader>About</SectionHeader>
							<View className="mb-5 rounded-2xl bg-primary-2 p-4">
								<Text
									className="text-base leading-6"
									style={{ color: colors.primary[1] }}
								>
									{svc.description}
								</Text>
							</View>
						</>
					)}

					{/* Features */}
					{Array.isArray(svc.features) && svc.features.length > 0 && (
						<>
							<SectionHeader>What's included</SectionHeader>
							<View className="mb-5 rounded-2xl bg-primary-2 p-4">
								{(svc.features as string[]).map((f, i) => (
									<View
										key={`${i}-${f}`}
										className="mb-2 flex-row items-start last:mb-0"
									>
										<Ionicons
											name="checkmark-circle"
											size={18}
											color={colors.primary[1]}
										/>
										<Text
											className="ml-2 flex-1 text-sm"
											style={{ color: colors.primary[1] }}
										>
											{f}
										</Text>
									</View>
								))}
							</View>
						</>
					)}

					{/* Location */}
					{svc.location && (
						<>
							<SectionHeader>Location</SectionHeader>
							<View className="mb-5 flex-row items-center rounded-2xl bg-primary-2 p-4">
								<Ionicons
									name="location-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 flex-1 text-sm"
									style={{ color: colors.primary[1] }}
								>
									{svc.location}
								</Text>
							</View>
						</>
					)}

					{/* Related */}
					{related.length > 0 && (
						<>
							<SectionHeader>Related Services</SectionHeader>
							{related.map((relSvc: any) => (
								<TouchableOpacity
									key={relSvc.id}
									onPress={() => {
										router.push({
											pathname: "/dashboard/explore/[id]" as never,
											params: { id: relSvc.id },
										});
									}}
									className="mb-3 flex-row items-center rounded-2xl bg-primary-2 p-3"
								>
									<Image
										source={{ uri: relSvc.imageUrl ?? DEFAULT_IMAGE }}
										className="mr-3 size-14 rounded-lg"
										resizeMode="cover"
									/>
									<View className="flex-1">
										<View className="mb-1 flex-row items-center justify-between">
											<Text
												className="flex-1 font-semibold text-base"
												style={{ color: colors.primary[1] }}
												numberOfLines={1}
											>
												{relSvc.name}
											</Text>
											<View
												className="ml-2 rounded-full px-2 py-0.5"
												style={{ backgroundColor: colors.secondary[3] }}
											>
												<Text
													className="font-medium text-xs"
													style={{ color: colors.primary[1] }}
												>
													{typeLabel(relSvc.type)}
												</Text>
											</View>
										</View>
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											{formatMoney(relSvc.price)} /{" "}
											{relSvc.priceUnit === "package"
												? "package"
												: relSvc.type === "private"
													? "session"
													: "class"}
										</Text>
									</View>
									<Ionicons
										name="chevron-forward"
										size={20}
										color={colors.secondary[1]}
									/>
								</TouchableOpacity>
							))}
						</>
					)}
				</View>
			</ScrollView>

			{/* Action Buttons */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-secondary-3 border-t bg-primary-2"
			>
				<View className="flex-row gap-3 p-4">
					<TouchableOpacity
						onPress={handleBuyPackage}
						className="flex-1 items-center justify-center rounded-xl border border-primary-1 bg-primary-2 py-4"
					>
						<Text className="font-semibold text-base text-primary-1">
							Buy Package
						</Text>
					</TouchableOpacity>
					<TouchableOpacity
						onPress={handleBookNow}
						className="flex-1 items-center justify-center rounded-xl bg-primary-1 py-4"
					>
						<Text className="font-semibold text-base text-primary-2">
							Book Now
						</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		</Container>
	);
}
