import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
	RefreshControl,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { formatMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

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
	expired: { bg: colors.secondary[3], text: colors.secondary[1], label: "Expired" },
	exhausted: { bg: "#FEF3C7", text: "#D97706", label: "Exhausted" },
	cancelled: { bg: colors.secondary[3], text: colors.secondary[1], label: "Cancelled" },
	pending: { bg: "#FEF3C7", text: "#D97706", label: "Pending" },
};

function SkeletonCard() {
	return (
		<View
			className="mb-3 overflow-hidden rounded-2xl"
			style={{
				backgroundColor: colors.primary[2],
				borderWidth: 1,
				borderColor: colors.secondary[3],
			}}
		>
			<View className="p-4">
				<View className="flex-row items-start justify-between">
					<View>
						<View
							className="mb-1 h-12 w-20 rounded"
							style={{ backgroundColor: colors.secondary[3] }}
						/>
						<View
							className="h-3 w-24 rounded"
							style={{ backgroundColor: colors.secondary[3] }}
						/>
					</View>
					<View>
						<View
							className="mb-1.5 h-4 w-24 rounded"
							style={{ backgroundColor: colors.secondary[3] }}
						/>
						<View
							className="h-5 w-16 self-end rounded-full"
							style={{ backgroundColor: colors.secondary[3] }}
						/>
					</View>
				</View>
				<View className="mt-3">
					<View
						className="h-0.5 rounded-full"
						style={{ backgroundColor: colors.secondary[3] }}
					/>
				</View>
			</View>
			<View
				className="flex-row items-center justify-between px-4 py-2.5"
				style={{
					borderTopWidth: 1,
					borderTopColor: colors.secondary[3],
				}}
			>
				<View
					className="h-4 w-16 rounded"
					style={{ backgroundColor: colors.secondary[3] }}
				/>
				<View
					className="h-3 w-20 rounded"
					style={{ backgroundColor: colors.secondary[3] }}
				/>
			</View>
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
		status: inst.status ?? "active",
		price: inst.totalPrice ?? 0,
		category: inst.package?.appointmentType ?? "",
		expiresAt: inst.expiresAt,
		startsAt: inst.startsAt,
		assignedTrainerName: inst.assignedTrainerName ?? null,
		installmentsPaid: inst.installmentsPaid ?? null,
		installmentsTotal: inst.installmentsTotal ?? null,
		paymentPlanType: inst.paymentPlanType ?? "full",
	}));

	const getExpiryLabel = (expiresAt: string | null) => {
		if (!expiresAt) return null;
		const expiry = new Date(expiresAt);
		return expiry.toLocaleDateString("en-US", {
			month: "short",
			year: "numeric",
		});
	};

	const isExpiredStatus = (status: string) =>
		status === "expired" || status === "cancelled";

	return (
		<Container>
			<ScrollView
				className="flex-1"
				style={{ backgroundColor: colors.primary[3] }}
				contentContainerStyle={{ paddingBottom: 32 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{/* Header */}
				<View className="px-4 pt-4 pb-4">
					<View className="flex-row items-center">
						<TouchableOpacity
							onPress={() => router.back()}
							className="mr-2.5 h-9 w-9 items-center justify-center"
							activeOpacity={0.7}
						>
							<Ionicons
								name="chevron-back"
								size={24}
								color={colors.primary[1]}
							/>
						</TouchableOpacity>
						<Text
							className="flex-1"
							style={{
								fontFamily: fonts.heading,
								fontSize: 24,
								fontWeight: "700",
								color: colors.primary[1],
							}}
						>
							My Packages
						</Text>
					</View>
				</View>

				{/* Tab Filter */}
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					className="mb-4"
					contentContainerStyle={{ paddingHorizontal: 16 }}
				>
					<View className="flex-row gap-2">
						{STATUS_TABS.map((tab) => (
							<TouchableOpacity
								key={tab.key}
								onPress={() => setStatusFilter(tab.key)}
								className="rounded-full px-4 py-2"
								activeOpacity={0.7}
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
									style={{
										fontFamily: fonts.body,
										fontSize: 13,
										fontWeight: "500",
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
					<View className="px-4">
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
						const expiryLabel = getExpiryLabel(pkg.expiresAt);
						const isExpired = isExpiredStatus(pkg.status);
						const isPending = pkg.status === "pending";

						// Determine progress bar fill color + track
						const progressFillColor = isPending
							? "#D97706"
							: isExpired
								? colors.secondary[1]
								: colors.primary[1];
						const progressTrackColor = isPending
							? "#FEF3C7"
							: colors.secondary[3];

						// Installment info
						const hasInstallments =
							pkg.paymentPlanType !== "full" &&
							pkg.installmentsTotal != null &&
							pkg.installmentsTotal > 0;
						const installmentLabel = hasInstallments
							? `${pkg.installmentsPaid ?? 0}/${pkg.installmentsTotal} installments paid`
							: null;

						return (
							<TouchableOpacity
								key={pkg.id}
								activeOpacity={0.7}
								onPress={() => {
									router.push({
										pathname: "/dashboard/packages/[id]" as never,
										params: { id: pkg.id },
									});
								}}
								className="mx-4 mb-3 overflow-hidden rounded-2xl"
								style={{
									backgroundColor: colors.primary[2],
									borderWidth: 1,
									borderColor: colors.secondary[3],
									opacity: isExpired ? 0.55 : 1,
								}}
							>
								{/* Card inner */}
								<View className="p-4">
									{/* Top row: big number + name/badge */}
									<View className="flex-row items-start justify-between mb-2">
										{/* Left: metric number */}
										<View>
											<View className="flex-row items-baseline">
												<Text
													style={{
														fontFamily: fonts.heading,
														fontSize: 48,
														fontWeight: "800",
														color: isPending
															? "#D97706"
															: isExpired
																? colors.secondary[1]
																: colors.primary[1],
														lineHeight: 52,
													}}
												>
													{pkg.remainingCredits}
												</Text>
												<Text
													style={{
														fontFamily: fonts.body,
														fontSize: 16,
														color: colors.secondary[1],
														marginLeft: 3,
													}}
												>
													/ {pkg.totalCredits}
												</Text>
											</View>
											<Text
												style={{
													fontFamily: fonts.body,
													fontSize: 12,
													color: colors.secondary[1],
													marginTop: 2,
												}}
											>
												{isExpired
													? "credits used"
													: isPending
														? "credits ready"
														: "credits remaining"}
											</Text>
										</View>

										{/* Right: name + badge */}
										<View className="items-end ml-3" style={{ maxWidth: 130 }}>
											<Text
												style={{
													fontFamily: fonts.heading,
													fontSize: 15,
													fontWeight: "700",
													color: isExpired
														? colors.secondary[1]
														: colors.primary[1],
													textAlign: "right",
													lineHeight: 18,
													marginBottom: 6,
												}}
												numberOfLines={2}
											>
												{pkg.packageName}
											</Text>
											<View
												className="rounded-full px-2.5 py-0.5"
												style={{ backgroundColor: badge.bg }}
											>
												<Text
													style={{
														fontFamily: fonts.body,
														fontSize: 11,
														fontWeight: "600",
														color: badge.text,
													}}
												>
													{badge.label}
												</Text>
											</View>
										</View>
									</View>

									{/* Meta chips */}
									<View className="flex-row items-center gap-3 mb-2.5">
										{expiryLabel && !isPending && (
											<View className="flex-row items-center gap-1">
												<Ionicons
													name="calendar-outline"
													size={12}
													color={colors.secondary[1]}
												/>
												<Text
													style={{
														fontFamily: fonts.body,
														fontSize: 11,
														color: isExpired
															? colors.secondary[1]
															: colors.secondary[1],
													}}
												>
													{isExpired
														? `Expired ${expiryLabel}`
														: expiryLabel}
												</Text>
											</View>
										)}
										{pkg.assignedTrainerName && !isExpired && (
											<View className="flex-row items-center gap-1">
												<Ionicons
													name="person-outline"
													size={12}
													color={colors.secondary[1]}
												/>
												<Text
													style={{
														fontFamily: fonts.body,
														fontSize: 11,
														color: colors.secondary[1],
													}}
												>
													{pkg.assignedTrainerName}
												</Text>
											</View>
										)}
										{isPending && (
											<View className="flex-row items-center gap-1">
												<Ionicons
													name="alert-circle-outline"
													size={12}
													color="#D97706"
												/>
												<Text
													style={{
														fontFamily: fonts.body,
														fontSize: 11,
														color: "#D97706",
													}}
												>
													Awaiting trainer
												</Text>
											</View>
										)}
										{hasInstallments &&
											!isExpired &&
											!isPending &&
											pkg.installmentsPaid === pkg.installmentsTotal && (
												<Text
													style={{
														fontFamily: fonts.body,
														fontSize: 11,
														color: "#16A34A",
														fontWeight: "600",
													}}
												>
													Fully paid
												</Text>
											)}
									</View>

									{/* Thin progress bar */}
									<View
										className="overflow-hidden rounded-full"
										style={{
											height: 2,
											backgroundColor: progressTrackColor,
										}}
									>
										<View
											className="rounded-full"
											style={{
												height: "100%",
												width: `${isExpired ? 100 : Math.min(progressPercent, 100)}%`,
												backgroundColor: progressFillColor,
											}}
										/>
									</View>
								</View>

								{/* Card footer */}
								<View
									className="flex-row items-center justify-between px-4 py-2.5"
									style={{
										borderTopWidth: 1,
										borderTopColor: colors.secondary[3],
									}}
								>
									{!isExpired ? (
										<Text
											style={{
												fontFamily: fonts.heading,
												fontSize: 14,
												fontWeight: "600",
												color: colors.primary[1],
											}}
										>
											{formatMoney(pkg.price)}
										</Text>
									) : (
										<Text
											style={{
												fontFamily: fonts.body,
												fontSize: 11,
												color: colors.secondary[1],
											}}
										>
											Package expired
										</Text>
									)}

									{installmentLabel && !isExpired && (
										<Text
											style={{
												fontFamily: fonts.body,
												fontSize: 11,
												color: colors.secondary[1],
											}}
										>
											{installmentLabel}
										</Text>
									)}

									<View className="flex-row items-center gap-0.5">
										<Text
											style={{
												fontFamily: fonts.body,
												fontSize: 12,
												fontWeight: "500",
												color: isExpired
													? colors.secondary[1]
													: colors.primary[1],
											}}
										>
											View
										</Text>
										<Ionicons
											name="chevron-forward"
											size={14}
											color={
												isExpired
													? colors.secondary[1]
													: colors.primary[1]
											}
										/>
									</View>
								</View>
							</TouchableOpacity>
						);
					})}

				{/* Empty State */}
				{!isLoading && packages.length === 0 && (
					<View
						className="mx-4 rounded-2xl p-8"
						style={{
							backgroundColor: colors.primary[2],
							borderWidth: 1,
							borderColor: colors.secondary[3],
						}}
					>
						<View className="items-center">
							<Ionicons
								name="cube-outline"
								size={48}
								color={colors.secondary[1]}
							/>
							<Text
								className="mt-4 mb-2 text-center"
								style={{
									fontFamily: fonts.heading,
									fontSize: 18,
									fontWeight: "700",
									color: colors.primary[1],
								}}
							>
								No Packages Yet
							</Text>
							<Text
								className="mb-6 text-center"
								style={{
									fontFamily: fonts.body,
									fontSize: 14,
									color: colors.secondary[1],
								}}
							>
								Purchase a package to get started with your fitness journey
							</Text>
							<TouchableOpacity
								onPress={() =>
									router.push("/dashboard/buy-package/setup" as never)
								}
								className="rounded-xl px-6 py-3"
								activeOpacity={0.7}
								style={{ backgroundColor: colors.primary[1] }}
							>
								<Text
									style={{
										fontFamily: fonts.heading,
										fontSize: 15,
										fontWeight: "700",
										color: colors.primary[2],
									}}
								>
									Buy Package
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				)}
			</ScrollView>
		</Container>
	);
}
