import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

// Dummy data for packages/credits
const packages = [
	{
		id: 101,
		packageName: "2×12-Week Personal Training",
		totalCredits: 24,
		remainingCredits: 18,
		purchaseDate: "March 1, 2024",
		status: "active" as const,
		price: 1200,
		category: "Private",
		imageUrl:
			"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop",
	},
	{
		id: 102,
		packageName: "4-Week Nutrition Plan",
		totalCredits: 8,
		remainingCredits: 8,
		purchaseDate: "March 10, 2024",
		status: "pending process" as const,
		price: 299,
		category: "Nutrition",
		imageUrl:
			"https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&h=300&fit=crop",
	},
	{
		id: 103,
		packageName: "Monthly Recovery Package",
		totalCredits: 8,
		remainingCredits: 3,
		purchaseDate: "February 15, 2024",
		status: "active" as const,
		price: 199,
		category: "Recovery",
		imageUrl:
			"https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop",
	},
	{
		id: 104,
		packageName: "3-Month Online Program",
		totalCredits: 36,
		remainingCredits: 36,
		purchaseDate: "March 12, 2024",
		status: "pending process" as const,
		price: 499,
		category: "Online",
		imageUrl:
			"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop",
	},
];

export default function PackagesScreen() {
	const navigation = useNavigation();

	useFocusEffect(
		useCallback(() => {
			// Hide tab bar when this screen is focused
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
								r.name === "notifications" ||
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
			// Don't restore in cleanup - layout handles it when leaving the entire stack
		}, [navigation]),
	);

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
			>
				<View className="px-4 pt-4">
					{/* Header Section */}
					<View className="mb-6">
						<View className="mb-2 flex-row items-center">
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
							<Text
								className="flex-1 font-bold text-2xl"
								style={{ color: colors.primary[1] }}
							>
								My Packages & Credits
							</Text>
						</View>
						<Text className="text-sm" style={{ color: colors.secondary[1] }}>
							Manage your purchased packages and track your credits
						</Text>
					</View>

					{/* ACTIVE PACKAGES Section */}
					<Text
						className="mb-4 font-bold text-sm uppercase tracking-wide"
						style={{ color: colors.secondary[1] }}
					>
						ACTIVE PACKAGES
					</Text>

					{packages
						.filter((pkg) => pkg.status === "active")
						.map((pkg) => (
							<View
								key={pkg.id}
								className="mb-4 rounded-2xl bg-white p-4 shadow-sm"
							>
								{/* Image and Details Row */}
								<View className="mb-4 flex-row">
									{/* Image */}
									<Image
										source={{ uri: pkg.imageUrl }}
										className="mr-4 h-24 w-24 rounded-xl"
										resizeMode="cover"
									/>

									{/* Details */}
									<View className="flex-1">
										{/* Package Name and Status */}
										<View className="mb-2 flex-row items-start justify-between">
											<Text
												className="flex-1 font-bold text-lg"
												style={{ color: colors.primary[1] }}
											>
												{pkg.packageName}
											</Text>
											<View
												className="ml-2 rounded-full px-3 py-1"
												style={{
													backgroundColor: "#DCFCE7",
												}}
											>
												<Text
													className="font-semibold text-xs"
													style={{
														color: "#16A34A",
													}}
												>
													Active
												</Text>
											</View>
										</View>

										{/* Category */}
										<View className="mb-2 flex-row items-center">
											<Ionicons
												name="cube-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 text-sm"
												style={{ color: colors.secondary[1] }}
											>
												{pkg.category}
											</Text>
										</View>

										{/* Credits Info */}
										<View className="mb-1 flex-row items-center">
											<Ionicons
												name="star-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 text-sm"
												style={{ color: colors.secondary[1] }}
											>
												{pkg.remainingCredits} / {pkg.totalCredits} credits
												remaining
											</Text>
										</View>

										{/* Purchase Date */}
										<View className="mb-1 flex-row items-center">
											<Ionicons
												name="calendar-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 text-sm"
												style={{ color: colors.secondary[1] }}
											>
												Purchased: {pkg.purchaseDate}
											</Text>
										</View>

										{/* Price */}
										<View className="flex-row items-center">
											<Ionicons
												name="cash-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 font-semibold text-sm"
												style={{ color: colors.primary[1] }}
											>
												${pkg.price.toFixed(2)}
											</Text>
										</View>
									</View>
								</View>

								{/* Progress Bar */}
								<View className="mb-4">
									<View className="mb-1 flex-row items-center justify-between">
										<Text
											className="text-xs"
											style={{ color: colors.secondary[1] }}
										>
											Credits Used
										</Text>
										<Text
											className="font-semibold text-xs"
											style={{ color: colors.primary[1] }}
										>
											{pkg.totalCredits - pkg.remainingCredits} /{" "}
											{pkg.totalCredits}
										</Text>
									</View>
									<View
										className="h-2 rounded-full"
										style={{ backgroundColor: colors.secondary[3] }}
									>
										<View
											className="h-full rounded-full"
											style={{
												width: `${
													((pkg.totalCredits - pkg.remainingCredits) /
														pkg.totalCredits) *
													100
												}%`,
												backgroundColor: "#2563EB",
											}}
										/>
									</View>
								</View>

								{/* Action Button */}
								<TouchableOpacity
									onPress={() => {
										router.push({
											pathname: "/dashboard/bookings/[id]" as never,
											params: { id: pkg.id.toString() },
										});
									}}
									className="items-center justify-center rounded-xl bg-white py-3"
									style={{
										borderWidth: 1,
										borderColor: colors.secondary[2],
									}}
								>
									<Text
										className="font-medium text-base"
										style={{ color: colors.primary[1] }}
									>
										View Package Details
									</Text>
								</TouchableOpacity>
							</View>
						))}

					{/* PENDING PACKAGES Section */}
					<Text
						className="mt-2 mb-4 font-bold text-sm uppercase tracking-wide"
						style={{ color: colors.secondary[1] }}
					>
						PENDING PROCESS
					</Text>

					{packages
						.filter((pkg) => pkg.status === "pending process")
						.map((pkg) => (
							<View
								key={pkg.id}
								className="mb-4 rounded-2xl bg-white p-4 shadow-sm"
							>
								{/* Image and Details Row */}
								<View className="mb-4 flex-row">
									{/* Image */}
									<Image
										source={{ uri: pkg.imageUrl }}
										className="mr-4 h-24 w-24 rounded-xl"
										resizeMode="cover"
									/>

									{/* Details */}
									<View className="flex-1">
										{/* Package Name and Status */}
										<View className="mb-2 flex-row items-start justify-between">
											<Text
												className="flex-1 font-bold text-lg"
												style={{ color: colors.primary[1] }}
											>
												{pkg.packageName}
											</Text>
											<View
												className="ml-2 rounded-full px-3 py-1"
												style={{
													backgroundColor: "#FEF3C7",
												}}
											>
												<Text
													className="font-semibold text-xs"
													style={{
														color: "#D97706",
													}}
												>
													Pending
												</Text>
											</View>
										</View>

										{/* Category */}
										<View className="mb-2 flex-row items-center">
											<Ionicons
												name="cube-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 text-sm"
												style={{ color: colors.secondary[1] }}
											>
												{pkg.category}
											</Text>
										</View>

										{/* Credits Info */}
										<View className="mb-1 flex-row items-center">
											<Ionicons
												name="star-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 text-sm"
												style={{ color: colors.secondary[1] }}
											>
												{pkg.totalCredits} credits
											</Text>
										</View>

										{/* Purchase Date */}
										<View className="mb-1 flex-row items-center">
											<Ionicons
												name="calendar-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 text-sm"
												style={{ color: colors.secondary[1] }}
											>
												Purchased: {pkg.purchaseDate}
											</Text>
										</View>

										{/* Price */}
										<View className="flex-row items-center">
											<Ionicons
												name="cash-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 font-semibold text-sm"
												style={{ color: colors.primary[1] }}
											>
												${pkg.price.toFixed(2)}
											</Text>
										</View>
									</View>
								</View>

								{/* Pending Status Message */}
								<View
									className="mb-4 rounded-xl p-3"
									style={{ backgroundColor: "#FEF3C7" }}
								>
									<View className="flex-row items-center">
										<Ionicons name="time-outline" size={16} color="#D97706" />
										<Text
											className="ml-2 flex-1 text-xs"
											style={{ color: "#D97706" }}
										>
											Your package is being processed. Credits will be available
											soon.
										</Text>
									</View>
								</View>

								{/* Action Button */}
								<TouchableOpacity
									onPress={() => {
										router.push({
											pathname: "/dashboard/bookings/[id]" as never,
											params: { id: pkg.id.toString() },
										});
									}}
									className="items-center justify-center rounded-xl bg-white py-3"
									style={{
										borderWidth: 1,
										borderColor: colors.secondary[2],
									}}
								>
									<Text
										className="font-medium text-base"
										style={{ color: colors.primary[1] }}
									>
										View Package Details
									</Text>
								</TouchableOpacity>
							</View>
						))}

					{/* Empty State for No Packages */}
					{packages.length === 0 && (
						<View className="mb-4 rounded-2xl bg-white p-8 shadow-sm">
							<View className="items-center">
								<Ionicons
									name="cube-outline"
									size={48}
									color={colors.secondary[1]}
								/>
								<Text
									className="mt-4 mb-2 text-center font-semibold text-lg"
									style={{ color: colors.primary[1] }}
								>
									No Packages Yet
								</Text>
								<Text
									className="mb-6 text-center text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Purchase a package to get started with your fitness journey
								</Text>
								<TouchableOpacity
									onPress={() =>
										router.push("/dashboard/buy-package/setup" as never)
									}
									className="rounded-xl px-6 py-3"
									style={{ backgroundColor: "#2563EB" }}
								>
									<Text className="font-semibold text-base text-white">
										Buy Package
									</Text>
								</TouchableOpacity>
							</View>
						</View>
					)}
				</View>
			</ScrollView>
		</Container>
	);
}
