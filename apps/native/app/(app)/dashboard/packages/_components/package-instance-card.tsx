import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";

type Badge = { bg: string; text: string; label: string };

export type PackageItem = {
	id: string;
	packageName: string;
	totalCredits: number;
	remainingCredits: number;
	purchaseDate: string;
	status: string;
	price: number;
	category: string;
	imageUrl: string;
	expiresAt: string | null;
};

type Props = {
	pkg: PackageItem;
	badge: Badge;
	expiryText: string | null;
};

export function PackageInstanceCard({ pkg, badge, expiryText }: Props) {
	const usedCredits = pkg.totalCredits - pkg.remainingCredits;
	const progressPercent =
		pkg.totalCredits > 0 ? (usedCredits / pkg.totalCredits) * 100 : 0;

	return (
		<View className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
			<View className="mb-4 flex-row">
				<Image
					source={{ uri: pkg.imageUrl }}
					className="mr-4 size-24 rounded-xl"
					contentFit="cover"
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
							{pkg.remainingCredits} / {pkg.totalCredits} credits remaining
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

			<View className="mb-2">
				<View className="mb-1 flex-row items-center justify-between">
					<Text className="text-xs" style={{ color: colors.secondary[1] }}>
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

			{expiryText && pkg.status === "active" && (
				<View className="mb-2">
					<Text
						className="text-xs"
						style={{
							color:
								expiryText.includes("Expires") && !expiryText.includes("30")
									? "#D97706"
									: colors.secondary[1],
						}}
					>
						{expiryText}
					</Text>
				</View>
			)}

			<Pressable
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
			</Pressable>
		</View>
	);
}
