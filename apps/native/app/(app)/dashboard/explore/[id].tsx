import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHideTabBar } from "@/hooks/useHideTabBar";
import { Container } from "@/components/container";
import {
	RelatedServices,
	ServiceFeaturesList,
} from "./_components/related-services";
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

// react-doctor-disable-next-line react-doctor/no-giant-component -- extracted RelatedServices + ServiceFeaturesList; remaining 303-line body is hero image + meta tiles + description/location sections tied to a single svc value; needs further refactor PR
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
					<Pressable
						onPress={() => router.back()}
						className="mt-4 items-center justify-center rounded-xl bg-primary-1 px-6 py-3"
					>
						<Text className="font-semibold text-primary-2">Go Back</Text>
					</Pressable>
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
						contentFit="cover"
					/>
					<Pressable
						onPress={() => router.back()}
						className="absolute left-4 top-12 size-10 items-center justify-center rounded-full"
						style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
					>
						<Ionicons name="arrow-back" size={22} color={colors.primary[1]} />
					</Pressable>
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
					{/* react-doctor-disable-next-line react-doctor/rn-no-raw-text -- string child wrapped internally by SectionHeader's <Text> */}
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
							{/* react-doctor-disable-next-line react-doctor/rn-no-raw-text -- string child wrapped internally by SectionHeader's <Text> */}
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
					<ServiceFeaturesList features={svc.features as string[]} />

					{/* Location */}
					{svc.location && (
						<>
							{/* react-doctor-disable-next-line react-doctor/rn-no-raw-text -- string child wrapped internally by SectionHeader's <Text> */}
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
					<RelatedServices services={related} />
				</View>
			</ScrollView>

			{/* Action Buttons */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-secondary-3 border-t bg-primary-2"
			>
				<View className="flex-row gap-3 p-4">
					<Pressable
						onPress={handleBuyPackage}
						className="flex-1 items-center justify-center rounded-xl border border-primary-1 bg-primary-2 py-4"
					>
						<Text className="font-semibold text-base text-primary-1">
							Buy Package
						</Text>
					</Pressable>
					<Pressable
						onPress={handleBookNow}
						className="flex-1 items-center justify-center rounded-xl bg-primary-1 py-4"
					>
						<Text className="font-semibold text-base text-primary-2">
							Book Now
						</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		</Container>
	);
}
