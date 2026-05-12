import { Pressable, Text, View } from "react-native";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";

type Service = {
	id: string;
	name?: string | null;
	description?: string | null;
	sessionCount?: number | null;
	type?: "private" | "semi_private" | null;
	price?: number | null;
	expiryDays?: number | null;
};

type Props = {
	service: Service;
	selected: boolean;
	onSelect: (id: string) => void;
};

export function ServiceOptionCard({ service, selected, onSelect }: Props) {
	return (
		<Pressable
			onPress={() => onSelect(service.id)}
			className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
				selected ? "border-primary-1" : "border-secondary-3"
			} shadow-sm`}
		>
			<View className="mb-2 flex-row items-start justify-between">
				<Text
					className="flex-1 font-bold text-lg"
					style={{ color: colors.primary[1] }}
				>
					{service.name}
				</Text>
				<View className="ml-2 flex-row gap-1">
					{service.sessionCount != null && (
						<View
							className="rounded-full px-2 py-1"
							style={{ backgroundColor: colors.secondary[3] }}
						>
							<Text
								className="font-medium text-xs"
								style={{ color: colors.primary[1] }}
							>
								{service.sessionCount} credits
							</Text>
						</View>
					)}
					{service.type && (
						<View
							className="rounded-full px-2 py-1"
							style={{ backgroundColor: colors.secondary[3] }}
						>
							<Text
								className="font-medium text-xs"
								style={{ color: colors.primary[1] }}
							>
								{service.type === "semi_private" ? "Semi-Private" : "Private"}
							</Text>
						</View>
					)}
				</View>
			</View>
			{service.description && (
				<Text
					className="mb-2 text-sm"
					style={{ color: colors.secondary[1] }}
				>
					{service.description}
				</Text>
			)}
			<View className="flex-row items-center justify-between">
				<Text
					className="font-semibold text-base"
					style={{ color: colors.primary[1] }}
				>
					{service.price != null ? formatMoney(service.price) : "—"}
				</Text>
				{service.expiryDays && (
					<Text
						className="text-xs"
						style={{ color: colors.secondary[1] }}
					>
						Valid for {service.expiryDays} days
					</Text>
				)}
			</View>
		</Pressable>
	);
}
