import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import {
	ActivityIndicator,
	Image,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { orpc } from "@/utils/orpc";

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop";

export default function ServiceDetailScreen() {
	const navigation = useNavigation();
	const hideTabBarRef = useRef(false);
	const { organizationId } = useOrganization();
	const params = useLocalSearchParams<{ id: string }>();
	const serviceId = params.id;

	// Fetch service detail
	const {
		data: service,
		isLoading,
	} = useQuery({
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

	// Tab bar hiding
	const findTabsNavigator = useCallback((nav: unknown, depth = 0): unknown => {
		if (depth > 5) return null;
		const parent = (nav as { getParent?: () => unknown })?.getParent?.();
		if (!parent) return null;
		try {
			const state = (
				parent as {
					getState?: () => {
						type?: string;
						routes?: Array<{ name?: string }>;
					};
				}
			)?.getState?.();
			if (
				state?.type === "tab" ||
				state?.routes?.some(
					(r) =>
						r.name === "index" ||
						r.name === "explore" ||
						r.name === "bookings" ||
						r.name === "profile",
				)
			) {
				return parent;
			}
		} catch {
			// Continue searching
		}
		return findTabsNavigator(parent, depth + 1);
	}, []);

	const hideTabBar = useCallback(() => {
		const tabsNavigator = findTabsNavigator(navigation);
		if (tabsNavigator) {
			hideTabBarRef.current = true;
			(
				tabsNavigator as {
					setOptions?: (options: { tabBarStyle: { display: string } }) => void;
				}
			)?.setOptions?.({
				tabBarStyle: { display: "none" },
			});
		}
	}, [navigation, findTabsNavigator]);

	const showTabBar = useCallback(() => {
		const tabsNavigator = findTabsNavigator(navigation);
		if (tabsNavigator && hideTabBarRef.current) {
			hideTabBarRef.current = false;
			(
				tabsNavigator as {
					setOptions?: (options: {
						tabBarStyle: {
							backgroundColor: string;
							borderTopColor: string;
							borderTopWidth: number;
							height: number;
							paddingBottom: number;
							paddingTop: number;
						};
					}) => void;
				}
			)?.setOptions?.({
				tabBarStyle: {
					backgroundColor: colors.primary[2],
					borderTopColor: colors.secondary[3],
					borderTopWidth: 1,
					height: 80,
					paddingBottom: 8,
					paddingTop: 8,
				},
			});
		}
	}, [navigation, findTabsNavigator]);

	useFocusEffect(
		useCallback(() => {
			hideTabBar();
			const timer = setTimeout(() => hideTabBar(), 50);
			return () => {
				clearTimeout(timer);
				showTabBar();
			};
		}, [hideTabBar, showTabBar]),
	);

	useEffect(() => {
		hideTabBar();
		const timer = setTimeout(() => hideTabBar(), 100);
		return () => {
			clearTimeout(timer);
			showTabBar();
		};
	}, [hideTabBar, showTabBar]);

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
						className="mt-4 rounded-xl px-6 py-3"
						style={{ backgroundColor: "#2563EB" }}
					>
						<Text className="font-semibold text-white">Go Back</Text>
					</TouchableOpacity>
				</View>
			</Container>
		);
	}

	const svc = service as any;
	const duration = svc.duration
		? `${svc.duration} ${svc.durationUnitType ?? "minutes"}`
		: null;

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Header with Back Button */}
				<View className="px-4 pt-4 pb-2">
					<TouchableOpacity
						onPress={() => router.back()}
						className="mb-4 flex-row items-center"
					>
						<Ionicons
							name="arrow-back"
							size={24}
							color={colors.primary[1]}
						/>
					</TouchableOpacity>
				</View>

				{/* Service Image */}
				<View className="mb-4 px-4">
					<Image
						source={{ uri: svc.imageUrl ?? DEFAULT_IMAGE }}
						className="h-64 w-full rounded-2xl"
						resizeMode="cover"
					/>
				</View>

				<View className="px-4 pb-6">
					{/* Service Title and Price */}
					<View className="mb-4 flex-row items-start justify-between">
						<View className="mr-4 flex-1">
							<Text
								className="mb-2 font-bold text-2xl"
								style={{ color: colors.primary[1] }}
							>
								{svc.name}
							</Text>
							{svc.category?.name && (
								<Text
									className="mb-1 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									{svc.category.name}
								</Text>
							)}
						</View>
						<View className="items-end">
							<View className="flex-row items-baseline">
								<Text
									className="font-bold text-2xl"
									style={{ color: "#2563EB" }}
								>
									${svc.price ?? svc.pricePerSession ?? 0}
								</Text>
								<Text
									className="ml-1 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									/ {svc.type === "private" ? "session" : "class"}
								</Text>
							</View>
						</View>
					</View>

					{/* Service Info Cards */}
					<View className="mb-4 flex-row">
						{duration && (
							<View className="mr-2 flex-1 rounded-xl bg-white p-3">
								<View className="mb-1 flex-row items-center">
									<Ionicons
										name="time-outline"
										size={16}
										color={colors.secondary[1]}
									/>
									<Text
										className="ml-1 text-xs"
										style={{ color: colors.secondary[1] }}
									>
										Duration
									</Text>
								</View>
								<Text
									className="font-semibold text-sm"
									style={{ color: colors.primary[1] }}
								>
									{duration}
								</Text>
							</View>
						)}
						<View className={`${duration ? "ml-2" : ""} flex-1 rounded-xl bg-white p-3`}>
							<View className="mb-1 flex-row items-center">
								<Ionicons
									name="people-outline"
									size={16}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Type
								</Text>
							</View>
							<Text
								className="font-semibold text-sm"
								style={{ color: colors.primary[1] }}
							>
								{svc.type === "private" ? "Private" : "Semi-Private"}
							</Text>
						</View>
					</View>

					{/* Description */}
					{svc.description && (
						<View className="mb-4">
							<Text
								className="mb-2 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.secondary[1] }}
							>
								ABOUT
							</Text>
							<Text
								className="text-base leading-6"
								style={{ color: colors.primary[1] }}
							>
								{svc.description}
							</Text>
						</View>
					)}

					{/* Related Services */}
					{related.length > 0 && (
						<View className="mb-4">
							<Text
								className="mb-3 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.secondary[1] }}
							>
								RELATED SERVICES
							</Text>
							{related.map((relSvc: any) => (
								<TouchableOpacity
									key={relSvc.id}
									onPress={() => {
										router.push({
											pathname: "/dashboard/explore/[id]" as never,
											params: { id: relSvc.id },
										});
									}}
									className="mb-3 flex-row items-center rounded-xl bg-white p-3"
								>
									<Image
										source={{
											uri: relSvc.imageUrl ?? DEFAULT_IMAGE,
										}}
										className="mr-3 h-14 w-14 rounded-lg"
										resizeMode="cover"
									/>
									<View className="flex-1">
										<Text
											className="font-semibold text-base"
											style={{ color: colors.primary[1] }}
										>
											{relSvc.name}
										</Text>
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											${relSvc.price ?? relSvc.pricePerSession ?? 0} /{" "}
											{relSvc.type === "private" ? "session" : "class"}
										</Text>
									</View>
									<Ionicons
										name="chevron-forward"
										size={20}
										color={colors.secondary[1]}
									/>
								</TouchableOpacity>
							))}
						</View>
					)}
				</View>
			</ScrollView>

			{/* Action Buttons */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-gray-200 border-t bg-white"
			>
				<View className="flex-row gap-3 px-4 py-4">
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
						className="flex-1 items-center justify-center rounded-xl py-4"
						style={{ backgroundColor: "#2563EB" }}
					>
						<Text className="font-semibold text-base text-white">
							Book Now
						</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		</Container>
	);
}
