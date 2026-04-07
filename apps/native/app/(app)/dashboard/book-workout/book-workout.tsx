import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { router, useNavigation } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
	Image,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { useBookingFlow } from "@/contexts/booking-flow-context";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { orpc } from "@/utils/orpc";

const steps = [
	{ number: 1, label: "Setup", active: true },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Review", active: false },
	{ number: 4, label: "Done", active: false },
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

export default function BookWorkoutScreen() {
	const navigation = useNavigation();
	const { organizationId } = useOrganization();
	const { state, update } = useBookingFlow();

	const [selectedPackageInstanceId, setSelectedPackageInstanceId] = useState<
		string | null
	>(state.packageInstanceId);
	const [selectedTrainer, setSelectedTrainer] = useState<
		string | "auto" | null
	>(state.trainerId ?? null);

	const currentStep = 1;
	const totalSteps = 4;
	const progressPercentage = 25;

	// Fetch user's active package instances
	const { data: packageInstances, isLoading: packagesLoading } = useQuery(
		orpc.packageInstances.listForClient.queryOptions({
			input: { organizationId, status: "active" },
		}),
	);

	const selectedPackage = useMemo(() => {
		if (!selectedPackageInstanceId || !packageInstances) return null;
		return (packageInstances as any[]).find(
			(inst) => inst.id === selectedPackageInstanceId,
		);
	}, [packageInstances, selectedPackageInstanceId]);

	// Fetch trainers
	const { data: trainers, isLoading: trainersLoading } = useQuery({
		...orpc.members.list.queryOptions({
			input: { organizationId, role: "trainer", status: "active" },
		}),
		enabled: !!selectedPackageInstanceId,
	});

	const handleContinue = () => {
		const selectedTrn =
			selectedTrainer !== "auto"
				? trainers?.find((t: any) => t.id === selectedTrainer)
				: null;

		const apptType = selectedPackage?.package?.appointmentType;
		const serviceType: "private" | "semi-private" =
			apptType === "semi-private" ? "semi-private" : "private";

		update({
			packageInstanceId: selectedPackageInstanceId,
			packageName: selectedPackage?.package?.name ?? null,
			categoryId: null,
			categoryName: null,
			serviceId: null,
			serviceName: null,
			serviceType,
			serviceDuration: 60,
			trainerId: selectedTrainer === "auto" ? null : selectedTrainer,
			trainerName:
				selectedTrainer === "auto"
					? "Auto-assign"
					: (selectedTrn?.user?.name ?? null),
			branchId: null,
		});
		router.push("./schedule");
	};

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
								r.name === "calendar" ||
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
			// Don't restore in cleanup - layout handles it
		}, [navigation]),
	);

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
							<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
						</TouchableOpacity>
						<Text className="flex-1 font-bold text-2xl text-primary-1">
							Book Workout
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
					{/* Progress Indicator - high contrast for visibility */}
					<View className="mb-6">
						<View className="mb-2 flex-row items-center justify-between">
							<Text className="font-semibold text-primary-1 text-sm">
								Step {currentStep} of {totalSteps}
							</Text>
							<Text className="font-semibold text-primary-1 text-sm">
								{progressPercentage}%
							</Text>
						</View>

						{/* Progress Bar - visible track and fill */}
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
							{/* Connector line - visible against background */}
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
							{/* Steps - positioned on top of line */}
							<View className="absolute inset-0 flex-row items-center justify-between">
								{steps.map((step) => (
									<View
										key={step.number}
										className="items-center justify-center"
										style={{ flex: 1, zIndex: 1 }}
									>
										{step.active ? (
											<View className="mb-1 items-center justify-center">
												{/* Active step: filled circle with white dot */}
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
												{/* Inactive step: bordered circle, dark number */}
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

					{/* Package Selection Section */}
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
							Choose a package to book from
						</Text>

						{packagesLoading ? (
							<>
								<SkeletonCard />
								<SkeletonCard />
								<SkeletonCard />
							</>
						) : !packageInstances || packageInstances.length === 0 ? (
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
								<Text className="text-center text-secondary-1 text-sm">
									No active packages found. Purchase a package to book workouts.
								</Text>
							</View>
						) : (
							(packageInstances as any[]).map((inst) => (
								<TouchableOpacity
									key={inst.id}
									onPress={() => {
										setSelectedPackageInstanceId(inst.id);
										setSelectedTrainer(null);
									}}
									className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
										selectedPackageInstanceId === inst.id
											? "border-primary-1"
											: "border-secondary-3"
									} shadow-sm`}
								>
									<View className="mb-2 flex-row items-start justify-between">
										<Text
											className="flex-1 font-bold text-lg"
											style={{ color: colors.primary[1] }}
										>
											{inst.package?.name ?? "Package"}
										</Text>
										{inst.package?.appointmentType && (
											<View
												className="ml-2 rounded-full px-2 py-1"
												style={{ backgroundColor: colors.secondary[3] }}
											>
												<Text
													className="font-medium text-xs"
													style={{ color: colors.primary[1] }}
												>
													{inst.package.appointmentType === "semi-private"
														? "Semi-Private"
														: inst.package.appointmentType === "both"
															? "All Types"
															: "Private"}
												</Text>
											</View>
										)}
									</View>
									<Text
										className="mb-2 text-sm"
										style={{ color: colors.secondary[1] }}
									>
										{inst.creditsRemaining} / {inst.creditsTotal} sessions
										remaining
									</Text>
									{inst.expiresAt && (
										<Text
											className="text-xs"
											style={{ color: colors.secondary[1] }}
										>
											Expires{" "}
											{new Date(inst.expiresAt).toLocaleDateString("en-US", {
												month: "short",
												day: "numeric",
												year: "numeric",
											})}
										</Text>
									)}
								</TouchableOpacity>
							))
						)}
					</View>

					{/* Trainer Selection Section */}
					<View className="mb-4">
						<Text
							className="mb-2 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							SELECT PROVIDER
						</Text>

						{selectedPackageInstanceId ? (
							trainersLoading ? (
								<>
									<SkeletonCard />
									<SkeletonCard />
									<SkeletonCard />
								</>
							) : (
								<>
									{/* Auto-assign Option */}
									<TouchableOpacity
										onPress={() => setSelectedTrainer("auto")}
										className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
											selectedTrainer === "auto"
												? "border-primary-1"
												: "border-secondary-3"
										} relative shadow-sm`}
									>
										<View className="flex-row items-start justify-between">
											<View className="mr-2 flex-1">
												<Text
													className="mb-1 font-bold text-lg"
													style={{ color: colors.primary[1] }}
												>
													Auto-assign best available
												</Text>
												<Text
													className="text-sm"
													style={{ color: colors.secondary[1] }}
												>
													We'll match you with the best trainer for your needs
												</Text>
											</View>
											{selectedTrainer === "auto" && (
												<View className="h-6 w-6 items-center justify-center rounded-full bg-primary-1">
													<Ionicons
														name="checkmark"
														size={16}
														color={colors.primary[2]}
													/>
												</View>
											)}
										</View>
									</TouchableOpacity>

									{/* Trainer Cards */}
									{trainers?.map((trainer: any) => (
										<TouchableOpacity
											key={trainer.id}
											onPress={() => setSelectedTrainer(trainer.id)}
											className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
												selectedTrainer === trainer.id
													? "border-primary-1"
													: "border-secondary-3"
											} relative shadow-sm`}
										>
											<View className="flex-row items-start justify-between">
												<View className="mr-2 flex-1">
													<Text
														className="mb-1 font-bold text-lg"
														style={{ color: colors.primary[1] }}
													>
														{trainer.user?.name ?? "Unknown"}
													</Text>
													<Text
														className="text-sm"
														style={{ color: colors.secondary[1] }}
													>
														{trainer.role}
													</Text>
												</View>
												{selectedTrainer === trainer.id && (
													<View className="h-6 w-6 items-center justify-center rounded-full bg-primary-1">
														<Ionicons
															name="checkmark"
															size={16}
															color={colors.primary[2]}
														/>
													</View>
												)}
											</View>
										</TouchableOpacity>
									))}
								</>
							)
						) : (
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
								<Text className="text-center text-secondary-1 text-sm">
									Please select a package first
								</Text>
							</View>
						)}
					</View>
				</View>
			</ScrollView>

			{/* Continue Button - Only shows when category, service and trainer are selected */}
			{selectedPackageInstanceId && selectedTrainer && (
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
