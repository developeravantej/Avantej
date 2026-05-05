import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
	FlatList,
	Modal,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { WeeklyTimetable } from "@/components/weekly-timetable";
import { usePurchaseFlow } from "@/contexts/purchase-flow-context";
import { useOrganizationContext } from "@/contexts/organization-context";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { orpc } from "@/utils/orpc";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Trainer", active: true },
	{ number: 3, label: "Schedule", active: false },
	{ number: 4, label: "Info", active: false },
	{ number: 5, label: "Review", active: false },
	{ number: 6, label: "Sign", active: false },
	{ number: 7, label: "Pay", active: false },
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

function getMondayOfWeek(offsetWeeks = 0): string {
	const d = new Date();
	const day = d.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	d.setDate(d.getDate() + diff + offsetWeeks * 7);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getSundayOfWeek(offsetWeeks = 0): string {
	const d = new Date();
	const day = d.getDay();
	const diff = day === 0 ? 0 : 7 - day;
	d.setDate(d.getDate() + diff + offsetWeeks * 7);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TrainerScreen() {
	const { organizationId } = useOrganization();
	const { organizations } = useOrganizationContext();
	const { state, update } = usePurchaseFlow();

	const currentStep = 2;
	const totalSteps = 7;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	const currentOrg = organizations.find((o) => o.id === organizationId);
	const customerHierarchyScopeId =
		currentOrg?.hierarchy?.member?.hierarchyScopeId ?? undefined;

	const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(
		state.preferredTrainerId ?? null,
	);
	const [weekOffset, setWeekOffset] = useState(0);
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const trainersQuery = useQuery(
		orpc.trainerAvailability.listByBranch.queryOptions({
			input: {
				organizationId,
				...(customerHierarchyScopeId
					? { branchId: customerHierarchyScopeId }
					: {}),
			},
		}),
	);

	const isLoading = trainersQuery.isLoading;

	const trainers = (trainersQuery.data as Array<{
		trainerId: string;
		trainerName: string;
		trainerEmail: string;
		slots: Array<{
			dayOfWeek: string;
			startTime: string;
			endTime: string;
		}>;
	}> | undefined) ?? [];

	const intakeQuery = useQuery({
		...orpc.coachIntake.getOpenSlots.queryOptions({
			input: {
				organizationId,
				trainerId: selectedTrainerId ?? "",
				startDate: getMondayOfWeek(weekOffset),
				endDate: getSundayOfWeek(weekOffset),
			},
		}),
		enabled: !!selectedTrainerId && !!organizationId,
		staleTime: 60_000,
	});

	const selectedTrainer = trainers.find((t) => t.trainerId === selectedTrainerId);

	const timetableSlots = useMemo(() => {
		const days =
			(intakeQuery.data as
				| Array<{
						date: string;
						dayOfWeek: string;
						windows: Array<{ startTime: string; endTime: string }>;
				  }>
				| undefined) ?? [];
		return days.flatMap((day) =>
			day.windows.map((w) => ({
				dayOfWeek: day.dayOfWeek,
				startTime: w.startTime,
				endTime: w.endTime,
			})),
		);
	}, [intakeQuery.data]);

	const handleSelect = (trainer: { id: string; name: string }) => {
		update({
			preferredTrainerId: trainer.id,
			preferredTrainerName: trainer.name,
		});
		setSelectedTrainerId(trainer.id);
	};

	const handleSkip = () => {
		update({ preferredTrainerId: null, preferredTrainerName: null });
		router.push("./schedule");
	};

	const handleContinue = () => {
		router.push("./schedule");
	};

	return (
		<Container>
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header */}
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
							Select Trainer
						</Text>
					</View>
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
									left: "10%",
									right: "10%",
									top: "24%",
									height: 2,
									backgroundColor: colors.secondary[2],
									zIndex: 0,
								}}
							/>
							<View className="absolute inset-0 flex-row items-center justify-between">
								{steps.map((step) => {
									const isCompleted = step.number < currentStep;
									const isActive = step.active;

									return (
										<View
											key={step.number}
											className="items-center justify-center"
											style={{ flex: 1, zIndex: 1 }}
										>
											{isCompleted ? (
												<View className="mb-1 items-center justify-center">
													<View
														className="h-6 w-6 items-center justify-center rounded-full border-2 border-primary-1"
														style={{
															backgroundColor: colors.primary[1],
															zIndex: 2,
														}}
													>
														<Ionicons
															name="checkmark"
															size={12}
															color={colors.primary[2]}
														/>
													</View>
												</View>
											) : isActive ? (
												<View className="mb-1 items-center justify-center">
													<View
														className="h-6 w-6 items-center justify-center rounded-full border-2 border-primary-1"
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
														className="h-6 w-6 items-center justify-center rounded-full border-2 border-secondary-2 bg-primary-2"
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
													isActive ? "font-bold" : "font-medium"
												}`}
												style={{
													color:
														isActive || isCompleted
															? colors.primary[1]
															: colors.secondary[1],
												}}
											>
												{step.label}
											</Text>
										</View>
									);
								})}
							</View>
						</View>
					</View>

					{/* Trainer Selector Dropdown */}
					<View className="mb-4">
						<Text
							className="mb-2 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							CHOOSE YOUR PREFERRED TRAINER
						</Text>
						<Text className="mb-4 text-base" style={{ color: colors.primary[1] }}>
							Select a trainer to view their intake availability for new clients.
						</Text>

						{isLoading ? (
							<View className="h-12 rounded-xl bg-secondary-3" />
						) : (
							<TouchableOpacity
								onPress={() => setDropdownOpen(true)}
								activeOpacity={0.8}
								className="flex-row items-center justify-between rounded-xl border border-secondary-3 bg-primary-2 px-4 py-3"
							>
								<Text
									style={{
										color: selectedTrainerId
											? colors.primary[1]
											: colors.secondary[1],
									}}
								>
									{selectedTrainer?.trainerName ?? "Select a trainer..."}
								</Text>
								<Ionicons
									name="chevron-down"
									size={16}
									color={colors.secondary[1]}
								/>
							</TouchableOpacity>
						)}
					</View>

					{/* Week Navigation + Timetable */}
					<View className="mb-4">
						<View className="mb-3 flex-row items-center justify-between">
							<TouchableOpacity
								onPress={() => setWeekOffset(0)}
								disabled={weekOffset === 0}
								className="h-8 w-8 items-center justify-center"
							>
								<Ionicons
									name="chevron-back"
									size={20}
									color={weekOffset > 0 ? colors.primary[1] : colors.secondary[2]}
								/>
							</TouchableOpacity>
							<Text
								className="font-semibold text-sm"
								style={{ color: colors.primary[1] }}
							>
								{weekOffset === 0 ? "This Week" : "Next Week"}
							</Text>
							<TouchableOpacity
								onPress={() => setWeekOffset(1)}
								disabled={weekOffset === 1}
								className="h-8 w-8 items-center justify-center"
							>
								<Ionicons
									name="chevron-forward"
									size={20}
									color={weekOffset < 1 ? colors.primary[1] : colors.secondary[2]}
								/>
							</TouchableOpacity>
						</View>

						{!selectedTrainerId ? (
							<View className="items-center rounded-2xl border border-secondary-3 bg-card py-8">
								<Ionicons
									name="calendar-outline"
									size={32}
									color={colors.secondary[1]}
								/>
								<Text className="mt-2 text-sm" style={{ color: colors.secondary[1] }}>
									Select a trainer to view their schedule
								</Text>
							</View>
						) : intakeQuery.isLoading ? (
							<View className="items-center rounded-2xl border border-secondary-3 bg-card py-8">
								<Text className="text-sm" style={{ color: colors.secondary[1] }}>
									Loading schedule...
								</Text>
							</View>
						) : (
							<View className="rounded-2xl border border-secondary-3 bg-card overflow-hidden">
								<WeeklyTimetable slots={timetableSlots} />
							</View>
						)}
					</View>

					{/* Confirm Selection Button */}
					{selectedTrainerId ? (
						<TouchableOpacity
							onPress={() => {
								if (selectedTrainer) {
									handleSelect({
										id: selectedTrainer.trainerId,
										name: selectedTrainer.trainerName,
									});
								}
							}}
							className="mb-4 items-center justify-center rounded-xl py-3"
							style={{
								backgroundColor:
									state.preferredTrainerId === selectedTrainerId
										? "#22C55E"
										: colors.primary[1],
							}}
						>
							<Text className="font-semibold text-sm text-primary-2">
								{state.preferredTrainerId === selectedTrainerId
									? "✓ Trainer Selected"
									: "Confirm Selection"}
							</Text>
						</TouchableOpacity>
					) : null}

					{/* Trainer Dropdown Modal */}
					<Modal
						visible={dropdownOpen}
						transparent
						animationType="fade"
						onRequestClose={() => setDropdownOpen(false)}
					>
						<TouchableOpacity
							style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
							activeOpacity={1}
							onPress={() => setDropdownOpen(false)}
						>
							<View className="mx-4 mt-32 rounded-2xl bg-primary-2 p-4">
								<Text
									className="mb-3 font-bold text-base"
									style={{ color: colors.primary[1] }}
								>
									Select a Trainer
								</Text>
								<FlatList
									data={trainers}
									keyExtractor={(item) => item.trainerId}
									renderItem={({ item }) => (
										<TouchableOpacity
											onPress={() => {
												setSelectedTrainerId(item.trainerId);
												setDropdownOpen(false);
											}}
											className="border-b border-secondary-3 py-3"
										>
											<Text
												style={{ color: colors.primary[1] }}
												className="font-medium text-base"
											>
												{item.trainerName}
											</Text>
											{item.trainerEmail ? (
												<Text
													style={{ color: colors.secondary[1] }}
													className="text-xs"
												>
													{item.trainerEmail}
												</Text>
											) : null}
										</TouchableOpacity>
									)}
								/>
								<TouchableOpacity
									onPress={() => setDropdownOpen(false)}
									className="mt-3 items-center py-3"
								>
									<Text style={{ color: colors.secondary[1] }}>Cancel</Text>
								</TouchableOpacity>
							</View>
						</TouchableOpacity>
					</Modal>
				</View>
			</ScrollView>

			{/* Footer Actions */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-secondary-3 border-t bg-primary-2"
			>
				<View className="flex-row gap-3 px-4 py-4">
					<TouchableOpacity
						onPress={handleSkip}
						className="flex-1 items-center justify-center rounded-xl border border-primary-1 bg-primary-2 py-4"
					>
						<Text
							className="font-semibold text-base"
							style={{ color: colors.primary[1] }}
						>
							Skip
						</Text>
					</TouchableOpacity>
					<TouchableOpacity
						onPress={handleContinue}
						className="flex-1 items-center justify-center rounded-xl bg-primary-1 py-4"
					>
						<Text className="font-semibold text-base text-primary-2">
							Continue
						</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		</Container>
	);
}
