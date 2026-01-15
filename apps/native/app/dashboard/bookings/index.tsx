import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

// Dummy data for upcoming bookings
const upcomingBookings = [
	{
		id: 1,
		serviceName: "Personal Training",
		date: "March 15, 2024",
		time: "2:00 PM",
		location: "Downtown Studio",
		trainer: "Sarah Johnson",
		imageUrl:
			"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop",
	},
	{
		id: 2,
		serviceName: "HIIT Class",
		date: "March 20, 2024",
		time: "10:00 AM",
		location: "Westside Gym",
		studio: "PowerFit Studio",
		imageUrl:
			"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop",
	},
];

// Dummy data for past bookings
const pastBookings = [
	{
		id: 3,
		title: "Yoga Flow",
		date: "March 5, 2024",
		time: "3:00 PM",
		location: "Downtown Studio",
		instructor: "Mindful Movement",
		imageUrl:
			"https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&h=300&fit=crop",
	},
	{
		id: 4,
		title: "Strength Training",
		date: "March 1, 2024",
		time: "11:00 AM",
		location: "Westside Gym",
		instructor: "Mike Chen",
		imageUrl:
			"https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&h=300&fit=crop",
	},
];

export default function BookingsScreen() {
	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Screen Title */}
				{/* <View className="bg-white px-4 py-3 mb-6">
					<Text
						className="text-2xl font-bold"
						style={{ color: colors.primary[1] }}
					>
						Bookings
					</Text>
				</View> */}

				<View className="px-4 pt-4">
					{/* UPCOMING Section */}
					<Text
						className="mb-4 font-bold text-sm uppercase tracking-wide"
						style={{ color: colors.secondary[1] }}
					>
						UPCOMING
					</Text>

					{upcomingBookings.map((booking) => (
						<View
							key={booking.id}
							className="mb-4 rounded-2xl bg-white p-4 shadow-sm"
						>
							{/* Image and Details Row */}
							<View className="mb-4 flex-row">
								{/* Image */}
								<Image
									source={{ uri: booking.imageUrl }}
									className="mr-4 h-24 w-24 rounded-xl"
									resizeMode="cover"
								/>

								{/* Details */}
								<View className="flex-1">
									<Text
										className="mb-2 font-bold text-lg"
										style={{ color: colors.primary[1] }}
									>
										{booking.serviceName}
									</Text>

									{/* Date */}
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
											{booking.date}
										</Text>
									</View>

									{/* Time */}
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
											{booking.time}
										</Text>
									</View>

									{/* Location */}
									<Text
										className="text-sm"
										style={{ color: colors.secondary[1] }}
									>
										{booking.location}
									</Text>

									{/* Trainer or Studio (if exists) */}
									{booking.trainer && (
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											{booking.trainer}
										</Text>
									)}
									{booking.studio && (
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											{booking.studio}
										</Text>
									)}
								</View>
							</View>

							{/* Action Buttons */}
							<View className="flex-row justify-between">
								<TouchableOpacity
									onPress={() => {
										router.push({
											pathname: "/dashboard/bookings/[id]" as never,
											params: { id: booking.id.toString() },
										});
									}}
									className="mr-2 flex-1 items-center justify-center rounded-xl bg-white py-3"
									style={{
										borderWidth: 1,
										borderColor: colors.secondary[2],
									}}
								>
									<Text
										className="font-medium text-base"
										style={{ color: colors.primary[1] }}
									>
										View details
									</Text>
								</TouchableOpacity>

								<TouchableOpacity
									className="ml-2 flex-1 items-center justify-center rounded-xl bg-white py-3"
									style={{
										borderWidth: 1,
										borderColor: colors.secondary[2],
									}}
								>
									<Text
										className="font-medium text-base"
										style={{ color: colors.primary[1] }}
									>
										Reschedule
									</Text>
								</TouchableOpacity>
							</View>
						</View>
					))}

					{/* PAST Section */}
					<Text
						className="mt-2 mb-4 font-bold text-sm uppercase tracking-wide"
						style={{ color: colors.secondary[1] }}
					>
						PAST
					</Text>

					{pastBookings.map((booking) => (
						<View
							key={booking.id}
							className="mb-4 rounded-2xl bg-white p-4 shadow-sm"
						>
							{/* Image and Details Row */}
							<View className="mb-4 flex-row">
								{/* Image */}
								<Image
									source={{ uri: booking.imageUrl }}
									className="mr-4 h-24 w-24 rounded-xl"
									resizeMode="cover"
								/>

								{/* Details */}
								<View className="flex-1">
									<Text
										className="mb-2 font-bold text-lg"
										style={{ color: colors.primary[1] }}
									>
										{booking.title}
									</Text>

									{/* Date */}
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
											{booking.date}
										</Text>
									</View>

									{/* Time */}
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
											{booking.time}
										</Text>
									</View>

									{/* Location */}
									<Text
										className="mb-1 text-sm"
										style={{ color: colors.secondary[1] }}
									>
										{booking.location}
									</Text>

									{/* Instructor */}
									<Text
										className="text-sm"
										style={{ color: colors.secondary[1] }}
									>
										{booking.instructor}
									</Text>
								</View>
							</View>

							{/* View Details Button */}
							<TouchableOpacity
								onPress={() => {
									router.push({
										pathname: "/dashboard/bookings/[id]" as never,
										params: { id: booking.id.toString() },
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
									View details
								</Text>
							</TouchableOpacity>
						</View>
					))}
				</View>
			</ScrollView>
		</Container>
	);
}
