import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { colors } from "@/lib/colors";

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=400";

type Booking = {
	id: string | number;
	serviceName?: string | null;
	type?: string | null;
	startTime: string | Date;
	duration: number;
	location?: string | null;
	bookingNumber?: string | null;
	status?: string;
	imageUrl?: string | null;
};

function defaultTitle(booking: Booking): string {
	if (booking.serviceName) return booking.serviceName;
	if (booking.type === "semi-private") return "Semi-Private Session";
	if (booking.type === "private") return "Private Session";
	return "Appointment";
}

function navigateToDetail(id: Booking["id"]) {
	router.push({
		pathname: "/dashboard/bookings/[id]" as never,
		params: { id: id.toString() },
	});
}

type UpcomingProps = {
	booking: Booking;
	formatDate: (d: string | Date) => string;
	formatTime: (d: string | Date) => string;
};

export function UpcomingBookingCard({
	booking,
	formatDate,
	formatTime,
}: UpcomingProps) {
	return (
		<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
			<View className="mb-4 flex-row">
				<Image
					source={{ uri: booking.imageUrl || DEFAULT_IMAGE }}
					className="mr-4 size-24 rounded-xl"
					contentFit="cover"
				/>
				<View className="flex-1">
					<Text
						className="mb-2 font-bold text-lg"
						style={{ color: colors.primary[1] }}
					>
						{defaultTitle(booking)}
					</Text>
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
							{formatDate(booking.startTime)}
						</Text>
					</View>
					<View className="mb-1 flex-row items-center">
						<Ionicons
							name="time-outline"
							size={14}
							color={colors.secondary[1]}
						/>
						<Text
							className="ml-1 text-sm"
							style={{ color: colors.secondary[1] }}
						>
							{formatTime(booking.startTime)} ({booking.duration} min)
						</Text>
					</View>
					{booking.location && (
						<Text className="text-sm" style={{ color: colors.secondary[1] }}>
							{booking.location}
						</Text>
					)}
					{booking.bookingNumber && (
						<Text
							className="mt-1 text-xs"
							style={{ color: colors.secondary[1] }}
						>
							#{booking.bookingNumber}
						</Text>
					)}
				</View>
			</View>
			<View className="flex-row justify-between">
				<Pressable
					onPress={() => navigateToDetail(booking.id)}
					className="mr-2 flex-1 items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 py-3"
				>
					<Text className="font-medium text-base text-primary-1">
						View details
					</Text>
				</Pressable>
				<Pressable className="ml-2 flex-1 items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 py-3">
					<Text className="font-medium text-base text-primary-1">
						Reschedule
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

type PastProps = {
	booking: Booking;
	formatDate: (d: string | Date) => string;
	formatTime: (d: string | Date) => string;
	statusLabel: string;
};

export function PastBookingCard({
	booking,
	formatDate,
	formatTime,
	statusLabel,
}: PastProps) {
	return (
		<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
			<View className="mb-4 flex-row">
				<Image
					source={{ uri: booking.imageUrl || DEFAULT_IMAGE }}
					className="mr-4 size-24 rounded-xl"
					contentFit="cover"
				/>
				<View className="flex-1">
					<Text
						className="mb-2 font-bold text-lg"
						style={{ color: colors.primary[1] }}
					>
						{defaultTitle(booking)}
					</Text>
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
							{formatDate(booking.startTime)}
						</Text>
					</View>
					<View className="mb-1 flex-row items-center">
						<Ionicons
							name="time-outline"
							size={14}
							color={colors.secondary[1]}
						/>
						<Text
							className="ml-1 text-sm"
							style={{ color: colors.secondary[1] }}
						>
							{formatTime(booking.startTime)} ({booking.duration} min)
						</Text>
					</View>
					{booking.location && (
						<Text
							className="mb-1 text-sm"
							style={{ color: colors.secondary[1] }}
						>
							{booking.location}
						</Text>
					)}
					<Text className="text-sm" style={{ color: colors.secondary[1] }}>
						{statusLabel}
					</Text>
				</View>
			</View>
			<Pressable
				onPress={() => navigateToDetail(booking.id)}
				className="items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 py-3"
			>
				<Text className="font-medium text-base text-primary-1">
					View details
				</Text>
			</Pressable>
		</View>
	);
}
