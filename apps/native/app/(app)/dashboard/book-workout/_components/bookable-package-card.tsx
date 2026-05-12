import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";

type ServiceLite = {
	name?: string | null;
	description?: string | null;
	type?: string | null;
	duration?: number | null;
};

type Instance = {
	id: string;
	creditsTotal?: number | null;
	creditsRemaining?: number | null;
	totalPrice?: number | null;
	expiresAt?: string | null;
};

type Props = {
	instance: Instance;
	service: ServiceLite | undefined;
	selected: boolean;
	nowMs: number;
	onSelect: (id: string) => void;
};

export function BookablePackageCard({
	instance,
	service,
	selected,
	nowMs,
	onSelect,
}: Props) {
	const total = instance.creditsTotal ?? 0;
	const remaining = instance.creditsRemaining ?? 0;
	const used = Math.max(total - remaining, 0);
	const progressPercent = total > 0 ? (used / total) * 100 : 0;

	let expiryText: string | null = null;
	let expiryUrgent = false;
	if (instance.expiresAt) {
		const expiry = new Date(instance.expiresAt);
		const diffDays = Math.ceil(
			(expiry.getTime() - nowMs) / (1000 * 60 * 60 * 24),
		);
		if (diffDays < 0) expiryText = "Expired";
		else if (diffDays === 0) expiryText = "Expires today";
		else if (diffDays === 1) expiryText = "Expires tomorrow";
		else expiryText = `Expires in ${diffDays} days`;
		expiryUrgent = diffDays >= 0 && diffDays <= 14;
	}

	const typeLabel =
		service?.type === "semi_private"
			? "Semi-Private"
			: service?.type === "both"
				? "All Types"
				: "Private";

	return (
		<Pressable
			onPress={() => onSelect(instance.id)}
			className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
				selected ? "border-primary-1" : "border-secondary-3"
			} shadow-sm`}
		>
			<View className="mb-2 flex-row items-start justify-between">
				<Text
					className="flex-1 font-bold text-lg"
					style={{ color: colors.primary[1] }}
				>
					{service?.name ?? "Package"}
				</Text>
				<View
					className="ml-2 rounded-full px-2 py-1"
					style={{ backgroundColor: colors.secondary[3] }}
				>
					<Text
						className="font-medium text-xs"
						style={{ color: colors.primary[1] }}
					>
						{typeLabel}
					</Text>
				</View>
			</View>

			{service?.description && (
				<Text
					className="mb-2 text-sm"
					style={{ color: colors.secondary[1] }}
				>
					{service.description}
				</Text>
			)}

			<View className="mb-2 flex-row items-center justify-between">
				<View className="flex-row items-center">
					<Ionicons
						name="star-outline"
						size={14}
						color={colors.secondary[1]}
					/>
					<Text
						className="ml-1 text-sm"
						style={{ color: colors.secondary[1] }}
					>
						{remaining} of {total} credits remaining
					</Text>
				</View>
				<Text
					className="font-semibold text-xs"
					style={{ color: colors.primary[1] }}
				>
					{used} used
				</Text>
			</View>
			<View
				className="mb-3 h-2 overflow-hidden rounded-full"
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

			<View className="flex-row flex-wrap items-center gap-3">
				{service?.duration != null && (
					<View className="flex-row items-center">
						<Ionicons
							name="time-outline"
							size={14}
							color={colors.secondary[1]}
						/>
						<Text
							className="ml-1 text-xs"
							style={{ color: colors.secondary[1] }}
						>
							{service.duration} min/session
						</Text>
					</View>
				)}
				{instance.totalPrice != null && (
					<View className="flex-row items-center">
						<Ionicons
							name="cash-outline"
							size={14}
							color={colors.secondary[1]}
						/>
						<Text
							className="ml-1 text-xs"
							style={{ color: colors.primary[1] }}
						>
							{formatMoney(instance.totalPrice)}
						</Text>
					</View>
				)}
				{instance.expiresAt && (
					<View className="flex-row items-center">
						<Ionicons
							name="calendar-outline"
							size={14}
							color={expiryUrgent ? "#D97706" : colors.secondary[1]}
						/>
						<Text
							className="ml-1 text-xs"
							style={{
								color: expiryUrgent ? "#D97706" : colors.secondary[1],
							}}
						>
							{expiryText ??
								new Date(instance.expiresAt).toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
									year: "numeric",
								})}
						</Text>
					</View>
				)}
			</View>
		</Pressable>
	);
}
