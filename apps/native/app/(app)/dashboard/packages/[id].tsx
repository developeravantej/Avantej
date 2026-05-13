import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { formatMoney } from "@/lib/money";
import { client, orpc } from "@/utils/orpc";

const STATUS_BADGE: Record<
	string,
	{ bg: string; text: string; label: string }
> = {
	active: { bg: "#DCFCE7", text: "#16A34A", label: "Active" },
	expired: {
		bg: colors.secondary[3],
		text: colors.secondary[1],
		label: "Expired",
	},
	exhausted: { bg: "#FEF3C7", text: "#D97706", label: "Exhausted" },
	cancelled: {
		bg: colors.secondary[3],
		text: colors.secondary[1],
		label: "Cancelled",
	},
	pending: { bg: "#FEF3C7", text: "#D97706", label: "Pending" },
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

function getDaysLeft(expiresAt: Date | string | null | undefined): number | null {
	if (!expiresAt) return null;
	const now = new Date();
	const expiry = new Date(expiresAt);
	const diffMs = expiry.getTime() - now.getTime();
	const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
	return diffDays;
}

function fmtMoneyCents(cents: number | null | undefined): string {
	if (cents == null) return "—";
	return formatMoney(cents);
}

// ── Presentational helpers ──────────────────────────────────────────────────

function SectionBlock({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<View
			className="mx-4 mb-2.5 rounded-2xl p-4"
			style={{
				backgroundColor: colors.primary[2],
				borderWidth: 1,
				borderColor: colors.secondary[3],
			}}
		>
			<Text
				style={{
					fontFamily: fonts.body,
					fontSize: 10,
					fontWeight: "600",
					letterSpacing: 1.4,
					textTransform: "uppercase",
					color: colors.secondary[1],
					marginBottom: 12,
				}}
			>
				{title}
			</Text>
			{children}
		</View>
	);
}

function FieldLabel({ children }: { children: string }) {
	return (
		<Text
			style={{
				fontFamily: fonts.body,
				fontSize: 11,
				color: colors.secondary[1],
				marginBottom: 2,
			}}
		>
			{children}
		</Text>
	);
}

function FieldValue({
	children,
	color,
}: {
	children: string;
	color?: string;
}) {
	return (
		<Text
			style={{
				fontFamily: fonts.heading,
				fontSize: 14,
				fontWeight: "600",
				color: color ?? colors.primary[1],
			}}
		>
			{children}
		</Text>
	);
}

function StatTile({
	label,
	value,
	sub,
	valueFontSize,
}: {
	label: string;
	value: string;
	sub?: string;
	valueFontSize?: number;
}) {
	return (
		<View
			className="rounded-xl p-3.5"
			style={{
				backgroundColor: colors.primary[2],
				borderWidth: 1,
				borderColor: colors.secondary[3],
				flex: 1,
			}}
		>
			<Text
				style={{
					fontFamily: fonts.body,
					fontSize: 10,
					fontWeight: "600",
					letterSpacing: 1,
					textTransform: "uppercase",
					color: colors.secondary[1],
					marginBottom: 6,
				}}
			>
				{label}
			</Text>
			<Text
				style={{
					fontFamily: fonts.heading,
					fontSize: valueFontSize ?? 26,
					fontWeight: "800",
					color: colors.primary[1],
					lineHeight: (valueFontSize ?? 26) + 2,
				}}
			>
				{value}
			</Text>
			{sub && (
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 11,
						color: colors.secondary[1],
						marginTop: 3,
					}}
				>
					{sub}
				</Text>
			)}
		</View>
	);
}

function InstallmentRow({
	num,
	date,
	amount,
	statusLabel,
	statusType,
}: {
	num: number;
	date: string;
	amount: string;
	statusLabel: string;
	statusType: "paid" | "due" | "future";
}) {
	const statusColors = {
		paid: { bg: "#DCFCE7", text: "#16A34A" },
		due: { bg: "#FEF3C7", text: "#D97706" },
		future: { bg: colors.secondary[3], text: colors.secondary[1] },
	};
	const sc = statusColors[statusType];

	return (
		<View
			className="flex-row items-center py-2"
			style={{
				borderBottomWidth: 1,
				borderBottomColor: colors.secondary[3],
			}}
		>
			<Text
				style={{
					fontFamily: fonts.heading,
					fontSize: 13,
					fontWeight: "700",
					color: colors.primary[1],
					width: 22,
				}}
			>
				{num}
			</Text>
			<Text
				style={{
					fontFamily: fonts.body,
					fontSize: 12,
					color: colors.secondary[1],
					flex: 1,
				}}
			>
				{date}
			</Text>
			<Text
				style={{
					fontFamily: fonts.heading,
					fontSize: 13,
					fontWeight: "600",
					color: colors.primary[1],
				}}
			>
				{amount}
			</Text>
			<View
				className="ml-2 rounded-full px-2 py-0.5"
				style={{ backgroundColor: sc.bg }}
			>
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 10,
						fontWeight: "600",
						color: sc.text,
					}}
				>
					{statusLabel}
				</Text>
			</View>
		</View>
	);
}

export default function PackageDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { organizationId } = useOrganization();
	const queryClient = useQueryClient();
	const getByIdQueryOptions = orpc.packageInstances.getById.queryOptions({
		input: { organizationId, id: id! },
	});
	const getByIdQueryKey = getByIdQueryOptions.queryKey;
	const { data: instance, isLoading: instanceLoading } = useQuery({
		...getByIdQueryOptions,
		enabled: !!id && !!organizationId,
	});

	const togglePinMutation = useMutation({
		mutationFn: () =>
			client.packageInstances.togglePin({
				organizationId,
				packageInstanceId: id!,
			}),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: getByIdQueryKey });
			const previous = queryClient.getQueryData(getByIdQueryKey);
			queryClient.setQueryData(getByIdQueryKey, (old: any) =>
				old
					? {
							...old,
							pinnedAt: old.pinnedAt ? null : new Date().toISOString(),
						}
					: old,
			);
			return { previous };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.previous) {
				queryClient.setQueryData(getByIdQueryKey, ctx.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({
				predicate: (q) =>
					JSON.stringify(q.queryKey).includes("packageInstances"),
			});
		},
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

	const total: number = inst?.totalPrice ?? 0;
	const taxAmount: number = inst?.taxAmount ?? 0;
	const subtotal = Math.max(total - taxAmount, 0);

	const daysLeft = getDaysLeft(inst?.expiresAt);
	const perSessionCost =
		totalCredits > 0 ? Math.round(total / totalCredits) : 0;

	const hasInstallments =
		inst?.paymentPlanType &&
		inst.paymentPlanType !== "full" &&
		inst?.installmentsTotal != null &&
		inst.installmentsTotal > 0;

	const installmentsPaid: number = inst?.installmentsPaid ?? 0;
	const installmentsTotal: number = inst?.installmentsTotal ?? 0;
	const installmentAmount =
		installmentsTotal > 0 ? Math.round(total / installmentsTotal) : 0;

	const schedulingType: "appointment" | "class_slot" =
		svc?.schedulingType === "class_slot" ? "class_slot" : "appointment";
	const timePresetConfig = svc?.timePresetConfig as
		| {
				recurringDays: string[];
				timeSlotsPerDay: Record<string, string[]>;
		  }
		| null
		| undefined;

	return (
		<Container>
			<ScrollView
				className="flex-1"
				style={{ backgroundColor: colors.secondary[3] }}
				contentContainerStyle={{ paddingBottom: 32 }}
				showsVerticalScrollIndicator={false}
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
							Package Details
						</Text>
						{(() => {
							const isActive = (inst?.status ?? "") === "active";
							const isPinned = !!inst?.pinnedAt;
							return (
								<TouchableOpacity
									onPress={
										isActive && !togglePinMutation.isPending
											? () => togglePinMutation.mutate()
											: undefined
									}
									disabled={!isActive || togglePinMutation.isPending}
									className="ml-2.5 h-9 w-9 items-center justify-center"
									activeOpacity={0.7}
									style={{ opacity: isActive ? 1 : 0.4 }}
									accessibilityLabel={isPinned ? "Unpin package" : "Pin package"}
								>
									<Ionicons
										name={isPinned ? "bookmark" : "bookmark-outline"}
										size={22}
										color={colors.primary[1]}
									/>
								</TouchableOpacity>
							);
						})()}
					</View>
				</View>

				{isLoading || !inst ? (
					<View
						className="mx-4 rounded-2xl p-8 items-center"
						style={{
							backgroundColor: colors.primary[2],
							borderWidth: 1,
							borderColor: colors.secondary[3],
						}}
					>
						<Text
							style={{
								fontFamily: fonts.body,
								fontSize: 14,
								color: colors.secondary[1],
							}}
						>
							Loading...
						</Text>
					</View>
				) : (
					<>
						{/* Name + Status + Progress block */}
						<View
							className="mx-4 mb-2.5 rounded-2xl p-4"
							style={{
								backgroundColor: colors.primary[2],
								borderWidth: 1,
								borderColor: colors.secondary[3],
							}}
						>
							<Text
								style={{
									fontFamily: fonts.heading,
									fontSize: 20,
									fontWeight: "700",
									color: colors.primary[1],
									marginBottom: 4,
								}}
							>
								{svc?.name ?? "Package"}
							</Text>
							{inst.purchaseNumber && (
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 12,
										color: colors.secondary[1],
										marginBottom: 10,
									}}
								>
									Purchase #{inst.purchaseNumber}
									{inst.paymentPlanType && inst.paymentPlanType !== "full"
										? ` · ${inst.paymentPlanType === "half" ? "Half" : inst.paymentPlanType === "quarterly" ? "Quarterly" : inst.paymentPlanType} plan`
										: ""}
								</Text>
							)}
							<View className="flex-row gap-1.5 mb-2.5">
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
								{hasInstallments && (
									<View
										className="rounded-full px-2.5 py-0.5"
										style={{
											backgroundColor: colors.secondary[3],
										}}
									>
										<Text
											style={{
												fontFamily: fonts.body,
												fontSize: 11,
												fontWeight: "600",
												color: colors.primary[1],
											}}
										>
											{installmentsPaid}/{installmentsTotal} Installments
										</Text>
									</View>
								)}
							</View>

							{/* Progress bar */}
							<View
								className="overflow-hidden rounded-full"
								style={{
									height: 3,
									backgroundColor: colors.secondary[3],
									marginBottom: 4,
								}}
							>
								<View
									className="rounded-full"
									style={{
										height: "100%",
										width: `${Math.min(progressPercent, 100)}%`,
										backgroundColor: colors.primary[1],
									}}
								/>
							</View>
							<Text
								style={{
									fontFamily: fonts.body,
									fontSize: 11,
									color: colors.secondary[1],
								}}
							>
								{usedCredits} of {totalCredits} sessions used
								{progressPercent > 0
									? ` · ${Math.round(progressPercent)}%`
									: ""}
							</Text>
						</View>

						{/* 2x2 Stat Grid */}
						<View className="flex-row gap-2.5 mx-4 mb-3.5">
							<StatTile
								label="Package Value"
								value={fmtMoneyCents(total)}
								sub={taxAmount > 0 ? "incl. tax" : undefined}
								valueFontSize={20}
							/>
							<StatTile
								label="Days Left"
								value={
									daysLeft != null
										? daysLeft > 0
											? String(daysLeft)
											: "0"
										: "—"
								}
								sub={
									inst.expiresAt
										? `until ${new Date(inst.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
										: undefined
								}
							/>
						</View>
						<View className="flex-row gap-2.5 mx-4 mb-2.5">
							<StatTile
								label="Per Session"
								value={fmtMoneyCents(perSessionCost)}
								sub="avg cost"
								valueFontSize={18}
							/>
							{hasInstallments ? (
								<StatTile
									label="Installments"
									value={`${installmentsPaid}/${installmentsTotal}`}
									sub={`paid · ${fmtMoneyCents(installmentsPaid * installmentAmount)}`}
								/>
							) : (
								<StatTile
									label="Credits Left"
									value={String(remainingCredits)}
									sub={`of ${totalCredits} total`}
								/>
							)}
						</View>

						{/* Validity */}
						<SectionBlock title="Validity">
							<View className="flex-row gap-4">
								<View className="flex-1">
									<FieldLabel>Starts</FieldLabel>
									<FieldValue>{formatDate(inst.startsAt)}</FieldValue>
								</View>
								<View className="flex-1">
									<FieldLabel>Expires</FieldLabel>
									<FieldValue
										color={
											daysLeft != null && daysLeft <= 30
												? "#D97706"
												: undefined
										}
									>
										{formatDate(inst.expiresAt)}
									</FieldValue>
								</View>
							</View>
						</SectionBlock>

						{/* Trainer section */}
						{inst.assignedTrainerName && status !== "pending" && (
							<SectionBlock title="Your Trainer">
								<View className="flex-row items-center gap-2.5">
									<View
										className="h-10 w-10 items-center justify-center rounded-full"
										style={{ backgroundColor: "#DCFCE7" }}
									>
										<Ionicons
											name="person-outline"
											size={20}
											color="#16A34A"
										/>
									</View>
									<View>
										<Text
											style={{
												fontFamily: fonts.heading,
												fontSize: 14,
												fontWeight: "600",
												color: colors.primary[1],
											}}
										>
											{inst.assignedTrainerName}
										</Text>
										<Text
											style={{
												fontFamily: fonts.body,
												fontSize: 11,
												color: colors.secondary[1],
											}}
										>
											Personal Trainer
										</Text>
									</View>
								</View>
							</SectionBlock>
						)}

						{/* Preferred Trainer (pending only) */}
						{status === "pending" &&
							inst.preferredTrainerName &&
							!inst.assignedTrainerName && (
								<SectionBlock title="Preferred Trainer">
									<View className="flex-row items-center gap-2.5">
										<View
											className="h-10 w-10 items-center justify-center rounded-full"
											style={{ backgroundColor: colors.secondary[3] }}
										>
											<Ionicons
												name="person-outline"
												size={20}
												color={colors.secondary[1]}
											/>
										</View>
										<View className="flex-1">
											<Text
												style={{
													fontFamily: fonts.heading,
													fontSize: 14,
													fontWeight: "600",
													color: colors.primary[1],
												}}
											>
												{inst.preferredTrainerName}
											</Text>
											<Text
												style={{
													fontFamily: fonts.body,
													fontSize: 11,
													color: colors.secondary[1],
												}}
											>
												Your preferred trainer
											</Text>
										</View>
									</View>
								</SectionBlock>
							)}

						{/* Payment Schedule (installments) */}
						{hasInstallments && (
							<SectionBlock title="Payment Schedule">
								{Array.from(
									{ length: installmentsTotal },
									(_, i) => {
										const installNum = i + 1;
										// Derive dates from startsAt
										const baseDate = inst.startsAt
											? new Date(inst.startsAt)
											: new Date();
										const installDate = new Date(baseDate);
										installDate.setMonth(
											installDate.getMonth() + i,
										);
										const dateStr = installDate.toLocaleDateString(
											"en-US",
											{
												month: "short",
												day: "numeric",
												year: "numeric",
											},
										);

										let statusLabel: string;
										let statusType: "paid" | "due" | "future";
										if (installNum <= installmentsPaid) {
											statusLabel = "Paid";
											statusType = "paid";
										} else if (installNum === installmentsPaid + 1) {
											statusLabel = "Due";
											statusType = "due";
										} else {
											statusLabel = "Future";
											statusType = "future";
										}

										return (
											<InstallmentRow
												key={installNum}
												num={installNum}
												date={dateStr}
												amount={fmtMoneyCents(installmentAmount)}
												statusLabel={statusLabel}
												statusType={statusType}
											/>
										);
									},
								)}
							</SectionBlock>
						)}

						{/* Schedule / Preferred Times */}
						{(schedulingType === "class_slot" ||
							(preferredTimes && (preferredTimes as any[]).length > 0)) && (
							<SectionBlock
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
														className="mb-3 last:mb-0"
														style={{
															borderBottomWidth: 1,
															borderBottomColor: colors.secondary[3],
															paddingBottom: 12,
														}}
													>
														<Text
															style={{
																fontFamily: fonts.subheading,
																fontSize: 13,
																fontWeight: "600",
																textTransform: "uppercase",
																letterSpacing: 0.5,
																color: colors.primary[1],
																marginBottom: 8,
															}}
														>
															{day}
														</Text>
														<View className="flex-row flex-wrap gap-2">
															{slots.length > 0 ? (
																slots.map((time, i) => (
																	<View
																		key={`${day}-${i}`}
																		className="rounded-full px-3 py-1.5"
																		style={{
																			backgroundColor:
																				colors.secondary[3],
																			borderWidth: 1,
																			borderColor:
																				colors.secondary[3],
																		}}
																	>
																		<Text
																			style={{
																				fontFamily: fonts.body,
																				fontSize: 12,
																				fontWeight: "500",
																				color: colors.primary[1],
																			}}
																		>
																			{time}
																		</Text>
																	</View>
																))
															) : (
																<Text
																	style={{
																		fontFamily: fonts.body,
																		fontSize: 12,
																		fontStyle: "italic",
																		color: colors.secondary[1],
																	}}
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
											style={{
												fontFamily: fonts.body,
												fontSize: 13,
												fontStyle: "italic",
												color: colors.secondary[1],
											}}
										>
											No recurring schedule configured for this class.
										</Text>
									)
								) : preferredTimes && (preferredTimes as any[]).length > 0 ? (
									<View className="flex-row flex-wrap gap-2">
										{(preferredTimes as any[]).map((pt: any) => (
											<View
												key={pt.id}
												className="rounded-xl px-4 py-3"
												style={{
													backgroundColor: colors.secondary[3],
													borderWidth: 1,
													borderColor: colors.secondary[3],
													minWidth: 140,
												}}
											>
												<Text
													style={{
														fontFamily: fonts.subheading,
														fontSize: 13,
														fontWeight: "600",
														color: colors.primary[1],
														textTransform: "capitalize",
													}}
												>
													{pt.dayOfWeek}
												</Text>
												<Text
													style={{
														fontFamily: fonts.body,
														fontSize: 12,
														color: colors.secondary[1],
														marginTop: 2,
													}}
												>
													{pt.time}
												</Text>
											</View>
										))}
									</View>
								) : null}
							</SectionBlock>
						)}

						{/* Notes */}
						{inst.remark && (
							<SectionBlock title="Notes">
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 13,
										color: colors.primary[1],
										lineHeight: 20,
									}}
								>
									{inst.remark}
								</Text>
							</SectionBlock>
						)}

						{/* Pending Approval callout */}
						{status === "pending" && (
							<View
								className="mx-4 mb-2.5 rounded-2xl p-4"
								style={{
									backgroundColor: "#FEF3C7",
									borderWidth: 1,
									borderColor: "#FDE68A",
								}}
							>
								<View className="flex-row items-start">
									<Ionicons
										name="hourglass-outline"
										size={20}
										color="#D97706"
										style={{ marginTop: 2 }}
									/>
									<View className="ml-3 flex-1">
										<Text
											style={{
												fontFamily: fonts.subheading,
												fontSize: 14,
												fontWeight: "600",
												color: "#D97706",
												marginBottom: 4,
											}}
										>
											Awaiting trainer assignment
										</Text>
										<Text
											style={{
												fontFamily: fonts.body,
												fontSize: 12,
												color: "#A16207",
												lineHeight: 18,
											}}
										>
											You'll be notified once a trainer has been assigned
											to your package. After that you can start booking
											sessions.
										</Text>
									</View>
								</View>
							</View>
						)}

						{/* Rejected callout */}
						{status === "cancelled" && inst.cancellationReason && (
							<View
								className="mx-4 mb-2.5 rounded-2xl p-4"
								style={{
									backgroundColor: "#FEE2E2",
									borderWidth: 1,
									borderColor: "#FECACA",
								}}
							>
								<View className="flex-row items-start">
									<Ionicons
										name="close-circle-outline"
										size={20}
										color="#B91C1C"
										style={{ marginTop: 2 }}
									/>
									<View className="ml-3 flex-1">
										<Text
											style={{
												fontFamily: fonts.subheading,
												fontSize: 14,
												fontWeight: "600",
												color: "#B91C1C",
												marginBottom: 4,
											}}
										>
											Package rejected
										</Text>
										<Text
											style={{
												fontFamily: fonts.body,
												fontSize: 12,
												color: "#991B1B",
												lineHeight: 18,
											}}
										>
											{inst.cancellationReason}
										</Text>
									</View>
								</View>
							</View>
						)}

						{/* CTAs */}
						{status !== "pending" && (
							<TouchableOpacity
								onPress={() =>
									router.push(
										"/dashboard/book-workout/book-workout" as never,
									)
								}
								className="mx-4 mb-2.5 items-center justify-center rounded-xl py-4"
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
									Book Session
								</Text>
							</TouchableOpacity>
						)}
						<TouchableOpacity
							onPress={() => router.back()}
							className="mx-4 mb-6 items-center justify-center rounded-xl py-3.5"
							activeOpacity={0.7}
							style={{
								backgroundColor: colors.primary[2],
								borderWidth: 1,
								borderColor: colors.secondary[3],
							}}
						>
							<Text
								style={{
									fontFamily: fonts.body,
									fontSize: 14,
									fontWeight: "500",
									color: colors.primary[1],
								}}
							>
								Back
							</Text>
						</TouchableOpacity>
					</>
				)}
			</ScrollView>
		</Container>
	);
}
