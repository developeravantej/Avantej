import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
	Image,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

// Service categories
const categories = [
	{ id: 1, name: "Training" },
	{ id: 2, name: "Classes" },
	{ id: 3, name: "Yoga" },
	{ id: 4, name: "Cardio" },
	{ id: 5, name: "Strength" },
	{ id: 6, name: "Pilates" },
];

// Mock data for services
const allServices = [
	{
		id: 1,
		name: "Personal Training",
		description:
			"Build strength and consistency with a personalized workout plan tailored to your goals",
		imageUrl:
			"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop",
		popularityPercentage: 40,
		price: 75,
		priceUnit: "class",
		category: "Training",
		recommended: true,
	},
	{
		id: 2,
		name: "HIIT Class",
		description:
			"High-energy group workout focused on fat burning and cardiovascular fitness",
		imageUrl:
			"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop",
		popularityPercentage: 35,
		price: 25,
		priceUnit: "class",
		category: "Classes",
		recommended: true,
	},
	{
		id: 3,
		name: "Yoga Flow",
		description:
			"Improve flexibility, balance, and recovery with this gentle yet invigorating practice",
		imageUrl:
			"https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&h=300&fit=crop",
		popularityPercentage: 28,
		price: 20,
		priceUnit: "class",
		category: "Yoga",
		recommended: false,
	},
	{
		id: 4,
		name: "Strength Training",
		description:
			"Build muscle mass and increase power with progressive resistance training",
		imageUrl:
			"https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&h=300&fit=crop",
		popularityPercentage: 32,
		price: 30,
		priceUnit: "class",
		category: "Training",
		recommended: false,
	},
	{
		id: 5,
		name: "Cardio Blast",
		description:
			"High-intensity cardio session designed to boost endurance and burn calories",
		imageUrl:
			"https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=400&h=300&fit=crop",
		popularityPercentage: 25,
		price: 22,
		priceUnit: "class",
		category: "Cardio",
		recommended: false,
	},
	{
		id: 6,
		name: "Pilates Core",
		description:
			"Strengthen your core and improve posture with controlled movements",
		imageUrl:
			"https://images.unsplash.com/photo-1601925260368-ae2f83d8b3d8?w=400&h=300&fit=crop",
		popularityPercentage: 20,
		price: 18,
		priceUnit: "class",
		category: "Pilates",
		recommended: false,
	},
	{
		id: 7,
		name: "Boxing Training",
		description:
			"Learn boxing techniques while getting an intense full-body workout",
		imageUrl:
			"https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=400&h=300&fit=crop",
		popularityPercentage: 30,
		price: 35,
		priceUnit: "class",
		category: "Training",
		recommended: false,
	},
	{
		id: 8,
		name: "Spin Class",
		description:
			"Indoor cycling class with energizing music and motivating instructors",
		imageUrl:
			"https://images.unsplash.com/photo-1576678927484-cc907957088c?w=400&h=300&fit=crop",
		popularityPercentage: 27,
		price: 24,
		priceUnit: "class",
		category: "Cardio",
		recommended: false,
	},
];

export default function ExploreScreen() {
	const [selectedCategory, setSelectedCategory] = useState("Training");
	const [searchQuery, setSearchQuery] = useState("");

	// Filter services based on selected category
	const filteredServices = allServices.filter(
		(service) =>
			service.category === selectedCategory &&
			(service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				service.description.toLowerCase().includes(searchQuery.toLowerCase())),
	);

	// Get recommended services
	const recommendedServices = allServices.filter(
		(service) => service.recommended,
	);

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
			>
				<View className="px-4 pt-4">
					{/* Search Bar and Filter */}
					<View className="mb-4 flex-row items-center">
						<View className="mr-3 flex-1 flex-row items-center rounded-xl bg-white px-4 py-3">
							<Ionicons
								name="search-outline"
								size={20}
								color={colors.secondary[1]}
							/>
							<TextInput
								placeholder="Search workouts, trainers, or studios"
								placeholderTextColor={colors.secondary[1]}
								value={searchQuery}
								onChangeText={setSearchQuery}
								className="ml-2 flex-1"
								style={{ color: colors.primary[1] }}
							/>
						</View>
						<TouchableOpacity className="p-3">
							<Ionicons
								name="filter-outline"
								size={24}
								color={colors.primary[1]}
							/>
						</TouchableOpacity>
					</View>

					{/* Category Filters */}
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						className="mb-6"
					>
						<View className="flex-row">
							{categories.map((category) => {
								const isSelected = category.name === selectedCategory;
								return (
									<TouchableOpacity
										key={category.id}
										onPress={() => setSelectedCategory(category.name)}
										className={`mr-2 rounded-full px-4 py-2 ${
											isSelected ? "" : "border bg-white"
										}`}
										style={{
											backgroundColor: isSelected
												? colors.secondary[2]
												: colors.primary[2],
											borderColor: isSelected
												? "transparent"
												: colors.secondary[3],
										}}
									>
										<Text
											className="font-medium text-sm"
											style={{
												color: colors.primary[1],
											}}
										>
											{category.name}
										</Text>
									</TouchableOpacity>
								);
							})}
						</View>
					</ScrollView>

					{/* Recommended For You Section */}
					{recommendedServices.length > 0 && (
						<View className="mb-6">
							<Text
								className="mb-4 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.secondary[1] }}
							>
								RECOMMENDED FOR YOU
							</Text>

							{recommendedServices.map((service) => (
								<TouchableOpacity
									key={service.id}
									onPress={() => {
										router.push({
											pathname: "/dashboard/explore/[id]" as never,
											params: { id: service.id.toString() },
										});
									}}
									className="mb-4 rounded-2xl bg-white p-4 shadow-sm"
								>
									<View className="flex-row">
										{/* Image */}
										<Image
											source={{ uri: service.imageUrl }}
											className="mr-4 h-24 w-24 rounded-xl"
											resizeMode="cover"
										/>

										{/* Details */}
										<View className="flex-1">
											<Text
												className="mb-1 font-bold text-lg"
												style={{ color: colors.primary[1] }}
											>
												{service.name}
											</Text>
											<Text
												className="mb-1 text-sm"
												style={{ color: colors.secondary[1] }}
												numberOfLines={2}
											>
												{service.description}
											</Text>
											<Text
												className="mb-2 text-xs"
												style={{ color: colors.secondary[1] }}
											>
												{service.popularityPercentage}% of members chose this
											</Text>
											<View className="flex-row items-baseline">
												<Text
													className="font-bold text-lg"
													style={{ color: "#2563EB" }}
												>
													${service.price}
												</Text>
												<Text
													className="ml-1 text-sm"
													style={{ color: colors.secondary[1] }}
												>
													/ {service.priceUnit}
												</Text>
											</View>
										</View>
									</View>
								</TouchableOpacity>
							))}
						</View>
					)}

					{/* Browse Workouts Section */}
					<View>
						<Text
							className="mb-4 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.secondary[1] }}
						>
							BROWSE WORKOUTS
						</Text>

						{filteredServices.map((service) => (
							<TouchableOpacity
								key={service.id}
								onPress={() => {
									router.push({
										pathname: "/dashboard/explore/[id]" as never,
										params: { id: service.id.toString() },
									});
								}}
								className="mb-4 rounded-2xl bg-white p-4 shadow-sm"
							>
								<View className="flex-row">
									{/* Image */}
									<Image
										source={{ uri: service.imageUrl }}
										className="mr-4 h-24 w-24 rounded-xl"
										resizeMode="cover"
									/>

									{/* Details */}
									<View className="flex-1">
										<Text
											className="mb-1 font-bold text-lg"
											style={{ color: colors.primary[1] }}
										>
											{service.name}
										</Text>
										<Text
											className="mb-1 text-sm"
											style={{ color: colors.secondary[1] }}
											numberOfLines={2}
										>
											{service.description}
										</Text>
										<Text
											className="mb-2 text-xs"
											style={{ color: colors.secondary[1] }}
										>
											{service.popularityPercentage}% of members chose this
										</Text>
										<View className="flex-row items-baseline">
											<Text
												className="font-bold text-lg"
												style={{ color: "#2563EB" }}
											>
												${service.price}
											</Text>
											<Text
												className="ml-1 text-sm"
												style={{ color: colors.secondary[1] }}
											>
												/ {service.priceUnit}
											</Text>
										</View>
									</View>
								</View>
							</TouchableOpacity>
						))}
					</View>
				</View>
			</ScrollView>
		</Container>
	);
}
