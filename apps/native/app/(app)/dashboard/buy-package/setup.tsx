import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { router, useNavigation } from "expo-router";
import { useCallback, useState } from "react";
import {
	Image,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { usePurchaseFlow } from "@/contexts/purchase-flow-context";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { orpc } from "@/utils/orpc";

const steps = [
	{ number: 1, label: "Setup", active: true },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Info", active: false },
	{ number: 4, label: "Review", active: false },
	{ number: 5, label: "Sign", active: false },
	{ number: 6, label: "Pay", active: false },
	{ number: 7, label: "Done", active: false },
];

function SkeletonCard() {
	return (
		<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
			<View
				className="mb-2 h-5 w-3/4 rounded"
				style={{ backgroundColor: colors.secondary[3] }}
			/>
			<View
				className="h-4 w-1/2 rounded"
				style={{ backgroundColor: colors.secondary[3] }}
			/>
		</View>
	);
}

export default function SetupScreen() {
	const navigation = useNavigation();
	const { organizationId } = useOrganization();
	const { state, update } = usePurchaseFlow();

	useFocusEffect(
		useCallback(() => {
			const findTabsNavigator = (nav: unknown, depth = 0): unknown => {
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
			};

			const tabsNavigator = findTabsNavigator(navigation);
			if (tabsNavigator) {
				(
					tabsNavigator as {
						setOptions?: (options: {
							tabBarStyle: { display: string };
						}) => void;
					}
				)?.setOptions?.({
					tabBarStyle: { display: "none" },
				});
			}
		}, [navigation]),
	);

	const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
		state.categoryId,
	);
	const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
		state.serviceId,
	);
	const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
		state.packageId,
	);

	const currentStep = 1;
	const totalSteps = 7;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	// Fetch categories
	const { data: categories, isLoading: categoriesLoading } = useQuery(
		orpc.serviceCategories.list.queryOptions({
			input: { organizationId },
		}),
	);

	// Fetch services for selected category
	const { data: services, isLoading: servicesLoading } = useQuery({
		...orpc.services.list.queryOptions({
			input: { organizationId, categoryId: selectedCategoryId! },
		}),
		enabled: !!selectedCategoryId,
	});

	const selectedService = services?.find((s: any) => s.id === selectedServiceId);
	const serviceType = selectedService?.type as "private" | "semi_private" | undefined;

	const { data: allServices, isLoading: packagesLoading } = useQuery({
		...orpc.services.list.queryOptions({
			input: { organizationId },
		}),
		enabled: !!selectedServiceId,
	});

	// Services with sessionCount are packages; filter to those compatible with the selected service type
	const availablePackages = allServices?.filter((s: any) =>
		s.sessionCount != null &&
		(!serviceType || s.type === serviceType || s.type === "both"),
	);

	const handleContinue = () => {
		const selectedCat = categories?.find(
			(c: any) => c.id === selectedCategoryId,
		);
		const selectedSvc = services?.find(
			(s: any) => s.id === selectedServiceId,
		);
		const selectedPkg = (availablePackages as any[])?.find(
			(p: any) => p.id === selectedPackageId,
		);

		update({
			categoryId: selectedCategoryId,
			categoryName: selectedCat?.name ?? null,
			serviceId: selectedServiceId,
			serviceName: selectedSvc?.name ?? null,
			serviceType: (serviceType as "private" | "semi_private") ?? null,
			packageId: selectedPackageId,
			packageName: selectedPkg?.name ?? null,
			creditsTotal: selectedPkg?.sessionCount ?? null,
			price: selectedPkg?.price ?? null,
			validityDays: selectedPkg?.expiryDays ?? null,
			availablePaymentPlans: (selectedSvc as any)?.availablePaymentPlans ?? [],
			installmentIntervalDays: (selectedSvc as any)?.installmentIntervalDays ?? 30,
		});
		router.push("./schedule");
	};

	return (
		<Container>
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header with Title */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<TouchableOpacity
							onPress={() => router.back()}
							className="mr-3 h-10 w-10 items-center justify-center"
						>
							<Ionicons
								name="arrow-back"
								size={24}
								color={colors.primary[1]}
							/>
						</TouchableOpacity>
						<Text className="flex-1 font-bold text-2xl text-black">
							Buy Package
						</Text>
					</View>
				</View>

				{/* Header Image */}
				<View className="relative mx-4 mb-4 h-64 w-full overflow-hidden rounded-2xl">
					<Image
						source={{
							uri: "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800",
						}}
						className="h-full w-full"
						resizeMode="cover"
					/>
				</View>

				<View className="px-4 pb-6">
					{/* Progress Indicator */}
					<View className="mb-6">
						<View className="mb-2 flex-row items-center justify-between">
							<Text className="font-semibold text-primary-1 text-sm">
								Step {currentStep} of {totalSteps}
							</Text>
							<Text className="font-semibold text-primary-1 text-sm">
								{progressPercentage}%
							</Text>
						</View>

						<View
							className="mb-4 h-2 overflow-hidden rounded-full"
							style={{ backgroundColor: colors.secondary[2] }}
						>
							<View
								className="h-full rounded-full"
								style={{
									width: `${progressPercentage}%`,
									backgroundColor: colors.primary[1],
								}}
							/>
						</View>

						{/* Step Navigation */}
						<View className="relative" style={{ height: 50 }}>
							<View
								className="absolute rounded-full"
								style={{
									left: "15%",
									right: "14%",
									top: "24%",
									height: 2,
									backgroundColor: colors.secondary[2],
									zIndex: 0,
								}}
							/>
							<View className="absolute inset-0 flex-row items-center justify-between">
								{steps.map((step) => (
									<View
										key={step.number}
										className="items-center justify-center"
										style={{ flex: 1, zIndex: 1 }}
									>
										{step.active ? (
											<View className="mb-1 items-center justify-center">
												<View
													className="h-7 w-7 items-center justify-center rounded-full border-2 border-primary-1"
													style={{
														backgroundColor: colors.primary[1],
														zIndex: 2,
													}}
												>
													<View
														className="h-2 w-2 rounded-full"
														style={{ backgroundColor: colors.primary[2] }}
													/>
												</View>
											</View>
										) : (
											<View className="mb-1 items-center justify-center">
												<View
													className="h-7 w-7 items-center justify-center rounded-full border-2 border-secondary-2 bg-primary-2"
													style={{ zIndex: 2 }}
												>
													<Text className="font-semibold text-primary-1 text-xs">
														{step.number}
													</Text>
												</View>
											</View>
										)}
										<Text
											className={`mt-1 text-center text-xs ${
												step.active ? "font-bold" : "font-medium"
											}`}
											style={{
												color: step.active
													? colors.primary[1]
													: colors.secondary[1],
											}}
										>
											{step.label}
										</Text>
									</View>
								))}
							</View>
						</View>
					</View>

					{/* Category Selection Section */}
					<View className="mb-4">
						<Text
							className="mb-2 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							SELECT CATEGORY
						</Text>
						<Text
							className="mb-4 text-base"
							style={{ color: colors.primary[1] }}
						>
							Choose a category to explore available services
						</Text>

						{categoriesLoading ? (
							<>
								<SkeletonCard />
								<SkeletonCard />
								<SkeletonCard />
							</>
						) : (
							(categories ?? []).map((category: any) => (
								<TouchableOpacity
									key={category.id}
									onPress={() => {
										setSelectedCategoryId(category.id);
										setSelectedServiceId(null);
										setSelectedPackageId(null);
									}}
									className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
										selectedCategoryId === category.id
											? "border-primary-1"
											: "border-secondary-3"
									} shadow-sm`}
								>
									<View className="mb-2 flex-row items-start justify-between">
										<Text
											className="flex-1 font-bold text-lg"
											style={{ color: colors.primary[1] }}
										>
											{category.name}
										</Text>
									</View>
									{category.description && (
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											{category.description}
										</Text>
									)}
								</TouchableOpacity>
							))
						)}
					</View>

					{/* Service Selection Section */}
					<View className="mb-4">
						<Text
							className="mb-2 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							SELECT SERVICE
						</Text>
						<Text
							className="mb-4 text-base"
							style={{ color: colors.primary[1] }}
						>
							What would you like to focus on today?
						</Text>

						{!selectedCategoryId ? (
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
								<Text
									className="text-center text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Please select a category first
								</Text>
							</View>
						) : servicesLoading ? (
							<>
								<SkeletonCard />
								<SkeletonCard />
							</>
						) : (services ?? []).length === 0 ? (
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
								<Text
									className="text-center text-sm"
									style={{ color: colors.secondary[1] }}
								>
									No services available in this category
								</Text>
							</View>
						) : (
							(services ?? []).map((service: any) => (
								<TouchableOpacity
									key={service.id}
									onPress={() => {
										setSelectedServiceId(service.id);
										setSelectedPackageId(null);
									}}
									className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
										selectedServiceId === service.id
											? "border-primary-1"
											: "border-secondary-3"
									} shadow-sm`}
								>
									<View className="mb-2 flex-row items-start justify-between">
										<Text
											className="flex-1 font-bold text-lg"
											style={{ color: colors.primary[1] }}
										>
											{service.name}
										</Text>
										{service.type && (
											<View
												className="ml-2 rounded-full px-2 py-1"
												style={{ backgroundColor: colors.secondary[3] }}
											>
												<Text
													className="font-medium text-xs"
													style={{ color: colors.primary[1] }}
												>
													{service.type === "semi_private"
														? "Semi-Private"
														: "Private"}
												</Text>
											</View>
										)}
									</View>
									{service.description && (
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											{service.description}
										</Text>
									)}
								</TouchableOpacity>
							))
						)}
					</View>

					{/* Package Selection Section */}
					{selectedServiceId && (
						<View className="mb-4">
							<Text
								className="mb-2 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.primary[1] }}
							>
								SELECT PACKAGE
							</Text>
							<Text
								className="mb-4 text-base"
								style={{ color: colors.primary[1] }}
							>
								Choose a package that suits your needs
							</Text>

							{packagesLoading ? (
								<>
									<SkeletonCard />
									<SkeletonCard />
								</>
							) : (availablePackages as any[] ?? []).length === 0 ? (
								<View className="mb-3 rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
									<Text
										className="text-center text-sm"
										style={{ color: colors.secondary[1] }}
									>
										No packages available for this service type
									</Text>
								</View>
							) : (
								(availablePackages as any[] ?? []).map((pkg: any) => {
									const totalPrice = pkg.price ?? 0;

									return (
										<TouchableOpacity
											key={pkg.id}
											onPress={() => setSelectedPackageId(pkg.id)}
											className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
												selectedPackageId === pkg.id
													? "border-primary-1"
													: "border-secondary-3"
											} shadow-sm`}
										>
											<View className="mb-2 flex-row items-start justify-between">
												<Text
													className="flex-1 font-bold text-lg"
													style={{ color: colors.primary[1] }}
												>
													{pkg.name}
												</Text>
												{pkg.sessionCount && (
													<View
														className="ml-2 rounded-full px-2 py-1"
														style={{
															backgroundColor: colors.secondary[3],
														}}
													>
														<Text
															className="font-medium text-xs"
															style={{ color: colors.primary[1] }}
														>
															{pkg.sessionCount} credits
														</Text>
													</View>
												)}
											</View>
											{pkg.description && (
												<Text
													className="mb-2 text-sm"
													style={{ color: colors.secondary[1] }}
												>
													{pkg.description}
												</Text>
											)}
											<View className="flex-row items-center justify-between">
												<Text
													className="font-semibold text-base"
													style={{ color: colors.primary[1] }}
												>
													${totalPrice.toFixed(2)}
												</Text>
												{pkg.expiryDays && (
													<Text
														className="text-xs"
														style={{ color: colors.secondary[1] }}
													>
														Valid for {pkg.expiryDays} days
													</Text>
												)}
											</View>
										</TouchableOpacity>
									);
								})
							)}
						</View>
					)}
				</View>
			</ScrollView>

			{/* Continue Button */}
			{selectedCategoryId && selectedServiceId && selectedPackageId && (
				<SafeAreaView
					edges={["bottom"]}
					className="border-secondary-3 border-t bg-primary-2"
				>
					<View className="px-4 py-4">
						<TouchableOpacity
							onPress={handleContinue}
							className="items-center justify-center rounded-xl bg-primary-1 py-4"
						>
							<Text className="font-semibold text-base text-primary-2">
								Continue
							</Text>
						</TouchableOpacity>
					</View>
				</SafeAreaView>
			)}
		</Container>
	);
}
