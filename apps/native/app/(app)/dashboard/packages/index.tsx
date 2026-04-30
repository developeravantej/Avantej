import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
	Image,
	RefreshControl,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop";

type StatusFilter = "all" | "active" | "expired" | "exhausted";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "active", label: "Active" },
	{ key: "expired", label: "Expired" },
	{ key: "exhausted", label: "Exhausted" },
];

const STATUS_BADGE: Record<
	string,
	{ bg: string; text: string; label: string }
> = {
	active: { bg: "#DCFCE7", text: "#16A34A", label: "Active" },
	expired: { bg: "#FEE2E2", text: "#DC2626", label: "Expired" },
	exhausted: { bg: "#FEF3C7", text: "#D97706", label: "Exhausted" },
	cancelled: { bg: "#F3F4F6", text: "#6B7280", label: "Cancelled" },
	pending: { bg: "#FEF3C7", text: "#D97706", label: "Pending Approval" },
};

function SkeletonCard() {
	return (
		<View className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
			<View className="mb-4 flex-row">
				<View
					className="mr-4 h-24 w-24 rounded-xl"
					style={{ backgroundColor: colors.secondary[3] }}
				/>
				<View className="flex-1">
					<View
						className="mb-2 h-5 w-3/4 rounded"
						style={{ backgroundColor: colors.secondary[3] }}
					/>
					<View
						className="mb-2 h-4 w-1/2 rounded"
						style={{ backgroundColor: colors.secondary[3] }}
					/>
					<View
						className="h-4 w-1/3 rounded"
						style={{ backgroundColor: colors.secondary[3] }}
					/>
				</View>
			</View>
			<View
				className="h-2 rounded-full"
				style={{ backgroundColor: colors.secondary[3] }}
			/>
		</View>
	);
}

export default function PackagesScreen() {
	const { organizationId } = useOrganization();
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [refreshing, setRefreshing] = useState(false);

	const {
		data: packageInstances,
		isLoading,
		refetch,
	} = useQuery({
		...orpc.packageInstances.listForClient.queryOptions({
			input: {
				organizationId,
				status: statusFilter === "all" ? undefined : statusFilter,
			},
		}),
	});

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	}, [refetch]);

	const packages = (packageInstances ?? []).map((inst: any) => ({
		id: inst.id,
		packageName: inst.package?.name ?? "Package",
		totalCredits: inst.creditsTotal ?? 0,
		remainingCredits: inst.creditsRemaining ?? 0,
		purchaseDate: inst.createdAt
			? new Date(inst.createdAt).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					year: "numeric",
				})
			: "",
		status: inst.status ?? "active",
		price: inst.totalPrice ?? 0,
		category: inst.package?.appointmentType ?? "",
		imageUrl: inst.package?.imageUrl ?? DEFAULT_IMAGE,
		expiresAt: inst.expiresAt,
		startsAt: inst.startsAt,
	}));

	const getExpiryText = (expiresAt: string | null) => {
		if (!expiresAt) return null;
		const now = new Date();
		const expiry = new Date(expiresAt);
		const diffMs = expiry.getTime() - now.getTime();
		const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
		if (diffDays < 0) return "Expired";
		if (diffDays === 0) return "Expires today";
		if (diffDays === 1) return "Expires tomorrow";
		if (diffDays <= 30) return `Expires in ${diffDays} days`;
		return null;
	};

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
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

					{/* Tab Filter */}
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						className="mb-4"
					>
						<View className="flex-row gap-2">
							{STATUS_TABS.map((tab) => (
								<TouchableOpacity
									key={tab.key}
									onPress={() => setStatusFilter(tab.key)}
									className="rounded-full px-4 py-2"
									style={{
										backgroundColor:
											statusFilter === tab.key
												? colors.primary[1]
												: colors.primary[2],
										borderWidth: 1,
										borderColor:
											statusFilter === tab.key
												? colors.primary[1]
												: colors.secondary[3],
									}}
								>
									<Text
										className="font-medium text-sm"
										style={{
											color:
												statusFilter === tab.key
													? colors.primary[2]
													: colors.primary[1],
										}}
									>
										{tab.label}
									</Text>
								</TouchableOpacity>
							))}
						</View>
					</ScrollView>

					{/* Loading State */}
					{isLoading && (
						<View>
							<SkeletonCard />
							<SkeletonCard />
							<SkeletonCard />
						</View>
					)}

					{/* Package Cards */}
					{!isLoading &&
						packages.map((pkg) => {
							const badge = STATUS_BADGE[pkg.status] ?? STATUS_BADGE.active;
							const usedCredits = pkg.totalCredits - pkg.remainingCredits;
							const progressPercent =
								pkg.totalCredits > 0
									? (usedCredits / pkg.totalCredits) * 100
									: 0;
							const expiryText = getExpiryText(pkg.expiresAt);

							return (
								<View
									key={pkg.id}
									className="mb-4 rounded-2xl bg-white p-4 shadow-sm"
								>
									{/* Image and Details Row */}
									<View className="mb-4 flex-row">
										<Image
											source={{ uri: pkg.imageUrl }}
											className="mr-4 h-24 w-24 rounded-xl"
											resizeMode="cover"
										/>
										<View className="flex-1">
											<View className="mb-2 flex-row items-start justify-between">
												<Text
													className="flex-1 font-bold text-lg"
													style={{ color: colors.primary[1] }}
												>
													{pkg.packageName}
												</Text>
												<View
													className="ml-2 rounded-full px-3 py-1"
													style={{ backgroundColor: badge.bg }}
												>
													<Text
														className="font-semibold text-xs"
														style={{ color: badge.text }}
													>
														{badge.label}
													</Text>
												</View>
											</View>

											{pkg.category && (
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
											)}

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
													{formatMoney(pkg.price)}
												</Text>
											</View>
										</View>
									</View>

									{/* Progress Bar */}
									<View className="mb-2">
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
												{usedCredits} / {pkg.totalCredits}
											</Text>
										</View>
										<View
											className="h-2 rounded-full"
											style={{ backgroundColor: colors.secondary[3] }}
										>
											<View
												className="h-full rounded-full"
												style={{
													width: `${progressPercent}%`,
													backgroundColor: "#2563EB",
												}}
											/>
										</View>
									</View>

									{/* Expiry Countdown */}
									{expiryText && pkg.status === "active" && (
										<View className="mb-2">
											<Text
												className="text-xs"
												style={{
													color:
														expiryText.includes("Expires") &&
														!expiryText.includes("30")
															? "#D97706"
															: colors.secondary[1],
												}}
											>
												{expiryText}
											</Text>
										</View>
									)}

									{/* Action Button */}
									<TouchableOpacity
										onPress={() => {
											router.push({
												pathname: "/dashboard/packages/[id]" as never,
												params: { id: pkg.id },
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
							);
						})}

					{/* Empty State */}
					{!isLoading && packages.length === 0 && (
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
