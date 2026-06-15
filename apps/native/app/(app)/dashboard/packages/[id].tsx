import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop";

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

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return "—";
	}
}

function getExpiryText(expiresAt: Date | string | null | undefined) {
	if (!expiresAt) return null;
	const now = new Date();
	const expiry = new Date(expiresAt);
	const diffMs = expiry.getTime() - now.getTime();
	const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
	if (diffDays < 0) return "Expired";
	if (diffDays === 0) return "Expires today";
	if (diffDays === 1) return "Expires tomorrow";
	return `Expires in ${diffDays} days`;
}

function fmtMoneyCents(cents: number | null | undefined): string {
	if (cents == null) return "—";
	return formatMoney(cents);
}

// ── Local presentational helpers ──────────────────────────────────────────────

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
			<Text
				className="mb-3 font-bold text-sm uppercase tracking-wide"
				style={{ color: colors.primary[1] }}
			>
				{title}
			</Text>
			{children}
		</View>
	);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<View className="mb-3 last:mb-0">
			<Text className="mb-1 text-xs" style={{ color: colors.secondary[1] }}>
				{label}
			</Text>
			<View className="text-base">
				{typeof value === "string" || typeof value === "number" ? (
					<Text
						className="font-semibold text-base"
						style={{ color: colors.primary[1] }}
					>
						{value}
					</Text>
				) : (
					value
				)}
			</View>
		</View>
	);
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- package detail with credit summary, transactions history, status/expiry derivations, sub-queries, modal renew flow; needs further refactor PR
export default function PackageDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { organizationId } = useOrganization();

	const { data: instance, isLoading: instanceLoading } = useQuery({
		...orpc.packageInstances.getById.queryOptions({
			input: { organizationId, id: id! },
		}),
		enabled: !!id && !!organizationId,
	});

	const serviceId = (instance as any)?.serviceId ?? null;

	const { data: service } = useQuery({
		...orpc.services.getById.queryOptions({
			input: { organizationId, id: serviceId! },
		}),
		enabled: !!serviceId && !!organizationId,
	});

	const { data: preferredTimes } = useQuery({
		...orpc.preferredTimes.list.queryOptions({
			input: { organizationId, packageInstanceId: id! },
		}),
		enabled: !!id && !!organizationId,
	});

	const isLoading = instanceLoading;

	const inst = instance as any;
	const svc = service as any;

	const status: string = inst?.status ?? "active";
	const badge = STATUS_BADGE[status] ?? STATUS_BADGE.active;

	const totalCredits: number = inst?.creditsTotal ?? 0;
	const remainingCredits: number = inst?.creditsRemaining ?? 0;
	const usedCredits = Math.max(totalCredits - remainingCredits, 0);
	const progressPercent =
		totalCredits > 0 ? (usedCredits / totalCredits) * 100 : 0;

	const subtotal: number = inst?.totalPrice ?? 0;
	const taxAmount: number = inst?.taxAmount ?? 0;
	const total = subtotal + taxAmount;

	const schedulingType: "appointment" | "class_slot" =
		svc?.schedulingType === "class_slot" ? "class_slot" : "appointment";
	const timePresetConfig = svc?.timePresetConfig as
		| {
				recurringDays: string[];
				timeSlotsPerDay: Record<string, string[]>;
		  }
		| null
		| undefined;

	const expiryText = getExpiryText(inst?.expiresAt);

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 24 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Header */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<Pressable
							onPress={() => router.back()}
							className="mr-3 size-10 items-center justify-center"
						>
							<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
						</Pressable>
						<Text
							className="flex-1 font-bold text-2xl"
							style={{ color: colors.primary[1] }}
						>
							Package Details
						</Text>
					</View>
				</View>

				{/* Hero Image */}
				<View className="relative mx-4 mb-4 h-56 w-auto overflow-hidden rounded-2xl">
					<Image
						source={{ uri: DEFAULT_IMAGE }}
						className="h-full w-full"
						contentFit="cover"
					/>
				</View>

				<View className="px-4">
					{isLoading || !inst ? (
						<View className="rounded-2xl bg-primary-2 p-8 items-center">
							<Text className="text-sm" style={{ color: colors.secondary[1] }}>
								Loading…
							</Text>
						</View>
					) : (
						<>
							{/* Overview */}
							<Section title="Overview">
								<View className="mb-3 flex-row items-start justify-between">
									<Text
										className="flex-1 font-bold text-lg"
										style={{ color: colors.primary[1] }}
									>
										{svc?.name ?? "Package"}
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
								{svc?.description && (
									<Text
										className="text-sm"
										style={{ color: colors.secondary[1] }}
									>
										{svc.description}
									</Text>
								)}
								{inst.purchaseNumber && (
									<Text
										className="mt-2 text-xs"
										style={{ color: colors.secondary[1] }}
									>
										Purchase #{inst.purchaseNumber}
									</Text>
								)}
							</Section>

							{/* Credits */}
							<Section title="Credits">
								<View className="mb-2 flex-row items-center justify-between">
									<Text
										className="text-sm"
										style={{ color: colors.secondary[1] }}
									>
										{remainingCredits} of {totalCredits} remaining
									</Text>
									<Text
										className="font-semibold text-sm"
										style={{ color: colors.primary[1] }}
									>
										{usedCredits} used
									</Text>
								</View>
								<View
									className="mb-1 h-2 overflow-hidden rounded-full"
									style={{ backgroundColor: colors.secondary[3] }}
								>
									<View
										className="h-full rounded-full"
										style={{
											width: `${Math.min(progressPercent, 100)}%`,
											backgroundColor: "#2563EB",
										}}
									/>
								</View>
							</Section>

							{/* Validity */}
							<Section title="Validity">
								<View className="flex-row gap-4">
									<View className="flex-1">
										<Field label="Starts" value={formatDate(inst.startsAt)} />
									</View>
									<View className="flex-1">
										<Field label="Expires" value={formatDate(inst.expiresAt)} />
									</View>
								</View>
								{expiryText && status === "active" && (
									<Text
										className="mt-1 text-xs"
										style={{
											color: expiryText.includes("Expired")
												? "#DC2626"
												: "#D97706",
										}}
									>
										{expiryText}
									</Text>
								)}
							</Section>

							{/* Pricing */}
							<Section title="Pricing">
								<View className="mb-2 flex-row items-center justify-between">
									<Text
										className="text-sm"
										style={{ color: colors.secondary[1] }}
									>
										Subtotal
									</Text>
									<Text
										className="text-sm"
										style={{ color: colors.primary[1] }}
									>
										{fmtMoneyCents(subtotal)}
									</Text>
								</View>
								<View className="mb-2 flex-row items-center justify-between">
									<Text
										className="text-sm"
										style={{ color: colors.secondary[1] }}
									>
										Tax
									</Text>
									<Text
										className="text-sm"
										style={{ color: colors.primary[1] }}
									>
										{fmtMoneyCents(taxAmount)}
									</Text>
								</View>
								<View
									className="mt-2 flex-row items-center justify-between border-t pt-2"
									style={{ borderColor: colors.secondary[3] }}
								>
									<Text
										className="font-bold text-base"
										style={{ color: colors.primary[1] }}
									>
										Total
									</Text>
									<Text
										className="font-bold text-base"
										style={{ color: colors.primary[1] }}
									>
										{fmtMoneyCents(total)}
									</Text>
								</View>
								{inst.paymentPlanType && inst.paymentPlanType !== "full" && (
									<View
										className="mt-3 border-t pt-3"
										style={{ borderColor: colors.secondary[3] }}
									>
										<Field
											label="Payment plan"
											value={
												inst.paymentPlanType === "half"
													? "Half (2 installments)"
													: inst.paymentPlanType === "quarterly"
														? "Quarterly (4 installments)"
														: inst.paymentPlanType
											}
										/>
										{inst.installmentsTotal != null && (
											<Field
												label="Installments paid"
												value={`${inst.installmentsPaid ?? 0} / ${inst.installmentsTotal}`}
											/>
										)}
										{inst.nextDueDate && (
											<Field
												label="Next due"
												value={formatDate(inst.nextDueDate)}
											/>
										)}
									</View>
								)}
							</Section>

							{/* Schedule */}
							<Section
								title={
									schedulingType === "class_slot"
										? "Class Schedule"
										: "Preferred Times"
								}
							>
								{schedulingType === "class_slot" ? (
									timePresetConfig &&
									timePresetConfig.recurringDays.length > 0 ? (
										<View>
											{timePresetConfig.recurringDays.map((day) => {
												const slots =
													timePresetConfig.timeSlotsPerDay[day] ?? [];
												return (
													<View
														key={day}
														className="mb-3 last:mb-0 border-secondary-3 border-b pb-3 last:border-b-0 last:pb-0"
													>
														<Text
															className="mb-2 font-semibold text-sm uppercase tracking-wide"
															style={{ color: colors.primary[1] }}
														>
															{day}
														</Text>
														<View className="flex-row flex-wrap gap-2">
															{slots.length > 0 ? (
																slots.map((time) => (
																	<View
																		key={`${day}-${time}`}
																		className="rounded-full border border-secondary-3 bg-secondary-3 px-3 py-1.5"
																	>
																		<Text
																			className="font-medium text-xs"
																			style={{ color: colors.primary[1] }}
																		>
																			{time}
																		</Text>
																	</View>
																))
															) : (
																<Text
																	className="text-xs italic"
																	style={{ color: colors.secondary[1] }}
																>
																	No slots configured
																</Text>
															)}
														</View>
													</View>
												);
											})}
										</View>
									) : (
										<Text
											className="text-sm italic"
											style={{ color: colors.secondary[1] }}
										>
											No recurring schedule configured for this class.
										</Text>
									)
								) : preferredTimes && preferredTimes.length > 0 ? (
									<View className="flex-row flex-wrap gap-2">
										{(preferredTimes as any[]).map((pt: any) => (
											<View
												key={pt.id}
												className="rounded-xl border border-secondary-3 bg-secondary-3 px-4 py-3"
												style={{ minWidth: 140 }}
											>
												<Text
													className="font-semibold text-sm capitalize"
													style={{ color: colors.primary[1] }}
												>
													{pt.dayOfWeek}
												</Text>
												<Text
													className="mt-0.5 text-xs"
													style={{ color: colors.secondary[1] }}
												>
													{pt.time}
												</Text>
											</View>
										))}
									</View>
								) : (
									<Text
										className="text-sm italic"
										style={{ color: colors.secondary[1] }}
									>
										No preferred times set.
									</Text>
								)}
							</Section>

							{inst.remark && (
								<Section title="Notes">
									<Text
										className="text-sm"
										style={{ color: colors.primary[1] }}
									>
										{inst.remark}
									</Text>
								</Section>
							)}

							{/* Assigned Trainer — shown when a trainer has been assigned */}
							{inst.assignedTrainerName && status !== "pending" && (
								<Section title="Your Trainer">
									<View className="flex-row items-center">
										<View
											className="mr-3 size-10 items-center justify-center rounded-full"
											style={{ backgroundColor: "#DCFCE7" }}
										>
											<Ionicons name="person" size={20} color="#16A34A" />
										</View>
										<Text
											className="font-semibold text-base"
											style={{ color: colors.primary[1] }}
										>
											{inst.assignedTrainerName}
										</Text>
									</View>
								</Section>
							)}

							{/* Preferred Trainer — shown only when pending and no assigned trainer */}
							{status === "pending" &&
								inst.preferredTrainerName &&
								!inst.assignedTrainerName && (
									<Section title="Preferred Trainer">
										<View className="flex-row items-center">
											<View
												className="mr-3 size-10 items-center justify-center rounded-full"
												style={{ backgroundColor: "#E0E7FF" }}
											>
												<Ionicons
													name="person-outline"
													size={20}
													color="#4F46E5"
												/>
											</View>
											<View className="flex-1">
												<Text
													className="font-semibold text-base"
													style={{ color: colors.primary[1] }}
												>
													{inst.preferredTrainerName}
												</Text>
												<Text
													className="text-xs"
													style={{ color: colors.secondary[1] }}
												>
													Your preferred trainer
												</Text>
											</View>
										</View>
									</Section>
								)}

							{/* Pending Approval callout — shown instead of Book CTA */}
							{status === "pending" && (
								<View className="mt-2 mb-4 rounded-2xl border border-yellow-300 bg-yellow-50 p-4">
									<View className="flex-row items-start">
										<Ionicons
											name="hourglass-outline"
											size={20}
											color="#D97706"
											style={{ marginTop: 2 }}
										/>
										<View className="ml-3 flex-1">
											<Text
												className="mb-1 font-semibold text-sm"
												style={{ color: "#D97706" }}
											>
												Awaiting trainer assignment
											</Text>
											<Text
												className="text-xs leading-5"
												style={{ color: "#A16207" }}
											>
												You'll be notified once a trainer has been assigned to
												your package. After that you can start booking sessions.
											</Text>
										</View>
									</View>
								</View>
							)}

							{/* Rejected callout */}
							{status === "cancelled" && inst.cancellationReason && (
								<View className="mt-2 mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
									<View className="flex-row items-start">
										<Ionicons
											name="close-circle-outline"
											size={20}
											color="#DC2626"
											style={{ marginTop: 2 }}
										/>
										<View className="ml-3 flex-1">
											<Text
												className="mb-1 font-semibold text-sm"
												style={{ color: "#DC2626" }}
											>
												Package rejected
											</Text>
											<Text
												className="text-xs leading-5"
												style={{ color: "#991B1B" }}
											>
												{inst.cancellationReason}
											</Text>
										</View>
									</View>
								</View>
							)}

							{/* Action Buttons */}
							<View className="mt-2 mb-4">
								{status !== "pending" && (
									<Pressable
										onPress={() =>
											router.push(
												"/dashboard/book-workout/book-workout" as never,
											)
										}
										className="mb-3 items-center justify-center rounded-xl bg-primary-1 py-4"
									>
										<Text className="font-semibold text-base text-primary-2">
											Start Booking
										</Text>
									</Pressable>
								)}
								<Pressable
									onPress={() => router.back()}
									className="items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 py-4"
								>
									<Text
										className="font-semibold text-base"
										style={{ color: colors.primary[1] }}
									>
										Back
									</Text>
								</Pressable>
							</View>
						</>
					)}
				</View>
			</ScrollView>
		</Container>
	);
}
