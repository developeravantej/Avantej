import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Container } from "@/components/container";
import { fonts } from "@/lib/font";

export default function Home() {
	// Dummy data
	const userName = "Alex";
	const currentDate = "Thu, Dec 18";
	const workoutsRemaining = 8;
	const planProgress = 65;
	const weeksToFinish = 4;
	const renewalDate = "Oct 24";

	// Dummy unread notifications count
	const unreadNotificationsCount = 2;

	const upcomingActivity = {
		title: "Personal Training",
		time: "10:00 AM",
		duration: "60 min",
		date: "TOMORROW",
		image: "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=400", // Spa/candles image placeholder
	};

	const recentActivities = [
		{
			id: 1,
			name: "HIIT Class",
			date: "Completed yesterday",
			credits: -1,
			icon: "checkmark-circle",
		},
		{
			id: 2,
			name: "Strength Training",
			date: "2 days ago",
			credits: -1,
			icon: "refresh",
		},
	];

	const getGreeting = () => {
		const hour = new Date().getHours();
		if (hour < 12) return "Good Morning";
		if (hour < 17) return "Good Afternoon";
		return "Good Evening";
	};

	return (
		<Container>
			<ScrollView className="flex-1 bg-white">
				<View className="px-4 pt-4 pb-6">
					{/* Header Section */}
					<View className="mb-6 flex-row items-center">
						{/* Profile Picture - Left */}
						<View className="mr-3 h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-amber-200 bg-amber-100">
							<Image
								source={{ uri: "https://via.placeholder.com/48" }} // Placeholder - replace with actual profile image URL
								className="h-full w-full"
								resizeMode="cover"
							/>
						</View>
						{/* Greeting Message - Center Left */}
						<View className="flex-1">
							<Text
								className="text-2xl text-black"
								style={{ fontFamily: fonts.heading }}
							>
								{getGreeting()}, {userName}
							</Text>
							<Text className="mt-1 text-gray-500 text-sm">{currentDate}</Text>
						</View>
						{/* Notification Icon - Right */}
						<TouchableOpacity
							onPress={() => router.push("/dashboard/notifications/" as never)}
							className="relative h-10 w-10 items-center justify-center"
						>
							<Ionicons
								name="notifications-outline"
								size={24}
								color="#000000"
							/>
							{unreadNotificationsCount > 0 && (
								<View
									className="-top-1 -right-1 absolute h-5 w-5 items-center justify-center rounded-full"
									style={{ backgroundColor: "#EF4444" }}
								>
									<Text
										className="text-white text-xs"
										style={{ fontFamily: fonts.heading }}
									>
										{unreadNotificationsCount > 9
											? "9+"
											: unreadNotificationsCount}
									</Text>
								</View>
							)}
						</TouchableOpacity>
					</View>

					{/* Fitness Plan Card */}
					<View className="mb-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
						<View className="mb-3 flex-row items-center">
							<View className="rounded-full bg-green-100 px-3 py-1">
								<Text className="font-semibold text-green-700 text-xs">
									ACTIVE
								</Text>
							</View>
						</View>

						<Text
							className="mb-2 text-black text-xl"
							style={{ fontFamily: fonts.heading }}
						>
							Fitness Plan
						</Text>

						<View className="mb-4">
							<Text
								className="text-5xl text-black"
								style={{ fontFamily: fonts.heading }}
							>
								{workoutsRemaining} workouts
							</Text>
							<Text
								className="text-5xl text-gray-700"
								style={{ fontFamily: fonts.heading }}
							>
								remaining
							</Text>
						</View>

						<Text className="mb-3 text-gray-600 text-lg">
							You're {planProgress}% through your plan
						</Text>

						{/* Progress Bar */}
						<View className="mb-3">
							<View className="h-2 overflow-hidden rounded-full bg-gray-200">
								<View
									className="h-full rounded-full bg-gray-500"
									style={{ width: `${planProgress}%` }}
								/>
							</View>
							<View className="mt-1 flex-row justify-between">
								<Text className="text-gray-400 text-xs">Start</Text>
								<Text className="text-gray-400 text-xs">End</Text>
							</View>
						</View>

						{/* Pacing Info */}
						<View className="mb-4 flex-row items-center">
							<Ionicons name="time-outline" size={16} color="#6B7280" />
							<Text className="ml-2 text-gray-600 text-sm">
								At this pace, you'll finish in {weeksToFinish} weeks
							</Text>
						</View>

						{/* Footer */}
						<View className="flex-row items-center justify-between border-gray-100 border-t pt-3">
							<Text className="text-gray-600 text-sm">
								Renews on {renewalDate}
							</Text>
							<TouchableOpacity>
								<Text className="font-medium text-blue-600 text-sm">
									Manage membership{" "}
									<Ionicons name="chevron-forward" size={14} color="#2563EB" />
								</Text>
							</TouchableOpacity>
						</View>
					</View>

					{/* Quick Insight Card */}
					<View className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
						<View className="flex-row items-start">
							<Ionicons name="bulb-outline" size={20} color="#6B7280" />
							<Text className="ml-3 flex-1 text-gray-700 text-sm">
								Quick insight: Most members book 2 workouts per week to finish
								on time
							</Text>
						</View>
					</View>

					{/* Action Buttons Grid */}
					<View className="mb-8 flex-row justify-between">
						<TouchableOpacity
							onPress={() =>
								router.push("/dashboard/book-workout/book-workout")
							}
							className="aspect-square w-[22%] items-center justify-center rounded-xl bg-blue-600 shadow-sm"
						>
							<Ionicons name="calendar-outline" size={24} color="#FFFFFF" />
							<Text className="mt-2 text-center font-medium text-white text-xs">
								Book{"\n"}Session
							</Text>
						</TouchableOpacity>

						<TouchableOpacity className="aspect-square w-[22%] items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
							<Ionicons name="qr-code-outline" size={24} color="#6B7280" />
							<Text className="mt-2 font-medium text-gray-700 text-xs">
								Check-In
							</Text>
						</TouchableOpacity>

						<TouchableOpacity
							onPress={() =>
								router.push("/dashboard/buy-package/setup" as never)
							}
							className="aspect-square w-[22%] items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm"
						>
							<Ionicons name="cube-outline" size={24} color="#6B7280" />
							<Text className="mt-2 text-center font-medium text-gray-700 text-xs">
								Buy{"\n"}Package
							</Text>
						</TouchableOpacity>

						<TouchableOpacity className="aspect-square w-[22%] items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
							<Ionicons name="calendar" size={24} color="#6B7280" />
							<Text className="mt-2 font-medium text-gray-700 text-xs">
								Schedule
							</Text>
						</TouchableOpacity>
					</View>

					{/* UP NEXT Section */}
					<View className="mb-6">
						<Text className="mb-3 text-gray-400 text-xs uppercase tracking-wide">
							UP NEXT
						</Text>
						<TouchableOpacity className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
							<View className="flex-row">
								<View className="relative w-24 self-stretch bg-gray-200">
									<Image
										source={{ uri: upcomingActivity.image }}
										className="h-full w-full"
										resizeMode="cover"
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											right: 0,
											bottom: 0,
										}}
									/>
									<View className="absolute top-2 right-2 z-10 rounded-full bg-blue-600 px-2 py-1">
										<Text className="font-semibold text-white text-xs">
											{upcomingActivity.date}
										</Text>
									</View>
								</View>
								<View className="flex-1 justify-between p-4">
									<View>
										<Text
											className="mb-2 text-black text-lg"
											style={{ fontFamily: fonts.heading }}
										>
											{upcomingActivity.title}
										</Text>
										<View className="mb-1 flex-row items-center">
											<Ionicons name="time-outline" size={14} color="#6B7280" />
											<Text className="ml-1 text-gray-600 text-sm">
												{upcomingActivity.time} • {upcomingActivity.duration}
											</Text>
										</View>
										<Text className="text-gray-400 text-xs">
											Tap to reschedule
										</Text>
									</View>
									<Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
								</View>
							</View>
						</TouchableOpacity>
					</View>

					{/* RECENT ACTIVITY Section */}
					<View>
						<Text className="mb-3 text-gray-400 text-xs uppercase tracking-wide">
							RECENT ACTIVITY
						</Text>
						{recentActivities.map((activity) => (
							<TouchableOpacity
								key={activity.id}
								className="mb-3 flex-row items-center rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
							>
								<View className="mr-3 h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
									<Ionicons
										name={activity.icon as never}
										size={20}
										color="#6B7280"
									/>
								</View>
								<View className="flex-1">
									<Text className="font-medium text-base text-black">
										{activity.name}
									</Text>
									<Text className="mt-1 text-gray-500 text-sm">
										{activity.date}
									</Text>
								</View>
								<Text className="text-gray-600 text-sm">
									{activity.credits > 0 ? "+" : ""}
									{activity.credits} credit
								</Text>
							</TouchableOpacity>
						))}
					</View>
				</View>
			</ScrollView>
		</Container>
	);
}
