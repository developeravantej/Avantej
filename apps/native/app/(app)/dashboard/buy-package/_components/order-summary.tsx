import { Text, View } from "react-native";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";

type Props = {
	packageName: string | null;
	creditsTotal: number | null;
	serviceName: string | null;
	validityDays: number | null;
	paymentPlanType: "full" | "half" | "quarterly" | null;
	subtotal: number;
	taxAmount: number;
	total: number;
	taxRatePercent: number;
};

export function OrderSummary({
	packageName,
	creditsTotal,
	serviceName,
	validityDays,
	paymentPlanType,
	subtotal,
	taxAmount,
	total,
	taxRatePercent,
}: Props) {
	const fmt = (cents: number) => formatMoney(cents);

	return (
		<View className="mb-6">
			<Text
				className="mb-4 font-bold text-sm uppercase tracking-wide"
				style={{ color: colors.primary[1] }}
			>
				ORDER SUMMARY
			</Text>

			<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
				<View className="mb-3 flex-row items-start justify-between">
					<View className="flex-1">
						<Text
							className="mb-1 font-semibold text-base"
							style={{ color: colors.primary[1] }}
						>
							{packageName ?? "Package"}
						</Text>
						{creditsTotal != null && creditsTotal > 0 && (
							<Text className="text-sm" style={{ color: colors.secondary[1] }}>
								{creditsTotal} credits
							</Text>
						)}
						{serviceName && (
							<Text
								className="mt-1 text-sm"
								style={{ color: colors.secondary[1] }}
							>
								Service: {serviceName}
							</Text>
						)}
					</View>
					<Text
						className="font-semibold text-base"
						style={{ color: colors.primary[1] }}
					>
						{fmt(subtotal)}
					</Text>
				</View>

				{validityDays && (
					<View className="border-secondary-3 border-t pt-3">
						<Text className="text-xs" style={{ color: colors.secondary[1] }}>
							Valid for {validityDays} days from purchase
						</Text>
					</View>
				)}
			</View>

			{paymentPlanType && paymentPlanType !== "full" && (
				<View className="mt-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
					<Text
						className="mb-1 font-semibold text-sm"
						style={{ color: colors.primary[1] }}
					>
						Payment Plan
					</Text>
					<Text className="text-sm" style={{ color: colors.secondary[1] }}>
						{paymentPlanType === "half"
							? "Half Payment (2×)"
							: "Quarterly Payment (4×)"}
					</Text>
					<Text
						className="mt-1 font-semibold text-sm"
						style={{ color: colors.primary[1] }}
					>
						First installment:{" "}
						{fmt(subtotal / (paymentPlanType === "half" ? 2 : 4))} + tax
					</Text>
				</View>
			)}

			<View className="rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
				<View className="mb-2 flex-row justify-between">
					<Text className="text-sm" style={{ color: colors.secondary[1] }}>
						Subtotal
					</Text>
					<Text className="text-sm" style={{ color: colors.primary[1] }}>
						{fmt(subtotal)}
					</Text>
				</View>
				<View className="mb-3 flex-row justify-between">
					<Text className="text-sm" style={{ color: colors.secondary[1] }}>
						Tax{taxRatePercent > 0 ? ` (${taxRatePercent}%)` : ""}
					</Text>
					<Text className="text-sm" style={{ color: colors.primary[1] }}>
						{fmt(taxAmount)}
					</Text>
				</View>
				<View className="flex-row justify-between border-secondary-3 border-t pt-3">
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
						{fmt(total)}
					</Text>
				</View>
			</View>
		</View>
	);
}
