import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop";

function typeLabel(type: string | undefined | null): string {
	if (type === "semi_private" || type === "semi-private") return "Semi-Private";
	if (type === "private") return "Private";
	if (type === "both") return "All Types";
	return "Class";
}

type RelatedService = {
	id: string;
	name: string;
	imageUrl?: string | null;
	type?: string | null;
	price: number;
	priceUnit?: string | null;
};

type Props = {
	services: RelatedService[];
};

export function ServiceFeaturesList({ features }: { features: string[] }) {
	if (!Array.isArray(features) || features.length === 0) return null;
	return (
		<>
			{/* react-doctor-disable-next-line react-doctor/rn-no-raw-text -- string child wrapped internally by <Text> */}
			<Text
				className="mb-3 font-bold text-xs uppercase tracking-wider"
				style={{ color: colors.secondary[1] }}
			>
				What's included
			</Text>
			<View className="mb-5 rounded-2xl bg-primary-2 p-4">
				{features.map((f) => (
					<View key={f} className="mb-2 flex-row items-start last:mb-0">
						<Ionicons
							name="checkmark-circle"
							size={18}
							color={colors.primary[1]}
						/>
						<Text
							className="ml-2 flex-1 text-sm"
							style={{ color: colors.primary[1] }}
						>
							{f}
						</Text>
					</View>
				))}
			</View>
		</>
	);
}

export function RelatedServices({ services }: Props) {
	if (services.length === 0) return null;
	return (
		<>
			{/* react-doctor-disable-next-line react-doctor/rn-no-raw-text -- string child wrapped internally by <Text> */}
			<Text
				className="mb-3 font-bold text-xs uppercase tracking-wider"
				style={{ color: colors.secondary[1] }}
			>
				Related Services
			</Text>
			{services.map((relSvc) => (
				<Pressable
					key={relSvc.id}
					onPress={() => {
						router.push({
							pathname: "/dashboard/explore/[id]" as never,
							params: { id: relSvc.id },
						});
					}}
					className="mb-3 flex-row items-center rounded-2xl bg-primary-2 p-3"
				>
					<Image
						source={{ uri: relSvc.imageUrl ?? DEFAULT_IMAGE }}
						className="mr-3 size-14 rounded-lg"
						contentFit="cover"
					/>
					<View className="flex-1">
						<View className="mb-1 flex-row items-center justify-between">
							<Text
								className="flex-1 font-semibold text-base"
								style={{ color: colors.primary[1] }}
								numberOfLines={1}
							>
								{relSvc.name}
							</Text>
							<View
								className="ml-2 rounded-full px-2 py-0.5"
								style={{ backgroundColor: colors.secondary[3] }}
							>
								<Text
									className="font-medium text-xs"
									style={{ color: colors.primary[1] }}
								>
									{typeLabel(relSvc.type)}
								</Text>
							</View>
						</View>
						<Text className="text-sm" style={{ color: colors.secondary[1] }}>
							{formatMoney(relSvc.price)} /{" "}
							{relSvc.priceUnit === "package"
								? "package"
								: relSvc.type === "private"
									? "session"
									: "class"}
						</Text>
					</View>
					<Ionicons
						name="chevron-forward"
						size={20}
						color={colors.secondary[1]}
					/>
				</Pressable>
			))}
		</>
	);
}
