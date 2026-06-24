import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Image } from "expo-image";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { TabContainer, useTabBarHeight } from "@/components/container";
import { useDebounce } from "@/hooks/useDebounce";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop";

function SkeletonCard() {
	return (
		<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
			<View className="flex-row">
				<View
					className="mr-4 size-24 rounded-xl"
					style={{ backgroundColor: colors.secondary[3] }}
				/>
				<View className="flex-1">
					<View
						className="mb-2 h-5 w-3/4 rounded"
						style={{ backgroundColor: colors.secondary[3] }}
					/>
					<View
						className="mb-2 h-4 w-full rounded"
						style={{ backgroundColor: colors.secondary[3] }}
					/>
					<View
						className="h-4 w-1/3 rounded"
						style={{ backgroundColor: colors.secondary[3] }}
					/>
				</View>
			</View>
		</View>
	);
}

export default function ExploreScreen() {
	const { organizationId } = useOrganization();
	const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
		null,
	);
	const [searchQuery, setSearchQuery] = useState("");
	const debouncedSearch = useDebounce(searchQuery, 300);
	const tabBarHeight = useTabBarHeight();

	// Fetch categories
	const { data: categories } = useQuery(
		orpc.serviceCategories.list.queryOptions({
			input: { organizationId },
		}),
	);

	// Build filter tabs
	const filterTabs = useMemo(() => {
		const tabs: Array<{ id: string | null; name: string }> = [
			{ id: null, name: "All" },
		];
		(categories ?? []).forEach((cat: any) =>
			tabs.push({ id: cat.id, name: cat.name }),
		);
		return tabs;
	}, [categories]);

	// Fetch services with optional category filter and search
	const { data: services, isLoading: servicesLoading } = useQuery({
		...orpc.services.list.queryOptions({
			input: {
				organizationId,
				categoryId: selectedCategoryId ?? undefined,
				isActive: true,
			},
		}),
	});

	// Client-side search filter (until server-side search is implemented)
	const filteredServices = useMemo(() => {
		if (!services) return [];
		if (!debouncedSearch) return services;
		const q = debouncedSearch.toLowerCase();
		return services.filter(
			(svc: any) =>
				svc.name?.toLowerCase().includes(q) ||
				svc.description?.toLowerCase().includes(q),
		);
	}, [services, debouncedSearch]);

	// Recommended: first 4 services (MVP approach)
	const recommended = filteredServices.slice(0, 4);
	const browse = filteredServices;

	return (
		<TabContainer>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentInset={{ bottom: tabBarHeight + 8 }}
				showsVerticalScrollIndicator={false}
			>
				<View className="px-4 pt-4">
					{/* Search Bar and Filter */}
					<View className="mb-4 flex-row items-center">
						<View className="mr-3 flex-1 flex-row items-center rounded-xl border border-secondary-3 bg-primary-2 px-4 py-3">
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
							{searchQuery.length > 0 && (
								<Pressable onPress={() => setSearchQuery("")}>
									<Ionicons
										name="close-circle"
										size={20}
										color={colors.secondary[1]}
									/>
								</Pressable>
							)}
						</View>
						<Pressable className="p-3">
							<Ionicons
								name="filter-outline"
								size={24}
								color={colors.primary[1]}
							/>
						</Pressable>
					</View>

					{/* Category Filters */}
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						className="mb-6"
					>
						<View className="flex-row">
							{filterTabs.map((tab) => {
								const isSelected = tab.id === selectedCategoryId;
								return (
									<Pressable
										key={tab.id ?? "all"}
										onPress={() => setSelectedCategoryId(tab.id)}
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
											style={{ color: colors.primary[1] }}
										>
											{tab.name}
										</Text>
									</Pressable>
								);
							})}
						</View>
					</ScrollView>

					{/* Loading State */}
					{servicesLoading && (
						<>
							<SkeletonCard />
							<SkeletonCard />
							<SkeletonCard />
						</>
					)}

					{/* Recommended For You Section */}
					{!servicesLoading &&
						!debouncedSearch &&
						!selectedCategoryId &&
						recommended.length > 0 && (
							<View className="mb-6">
								<Text className="mb-4 font-bold text-secondary-1 text-sm uppercase tracking-wide">
									RECOMMENDED FOR YOU
								</Text>

								{recommended.map((service: any) => (
									<Pressable
										key={service.id}
										onPress={() => {
											router.push({
												pathname: "/dashboard/explore/[id]" as never,
												params: { id: service.id },
											});
										}}
										className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm"
									>
										<View className="flex-row">
											<Image
												source={{
													uri: service.imageUrl ?? DEFAULT_IMAGE,
												}}
												className="mr-4 size-24 rounded-xl"
												contentFit="cover"
											/>
											<View className="flex-1">
												<Text
													className="mb-1 font-bold text-lg"
													style={{ color: colors.primary[1] }}
												>
													{service.name}
												</Text>
												<Text
													className="mb-2 text-sm"
													style={{ color: colors.secondary[1] }}
													numberOfLines={2}
												>
													{service.description}
												</Text>
												<View className="flex-row items-baseline">
													<Text className="font-bold text-lg text-primary-1">
														{formatMoney(service.price)}
													</Text>
													<Text
														className="ml-1 text-sm"
														style={{ color: colors.secondary[1] }}
													>
														/ {service.type === "private" ? "session" : "class"}
													</Text>
												</View>
											</View>
										</View>
									</Pressable>
								))}
							</View>
						)}

					{/* Browse Workouts Section */}
					{!servicesLoading && (
						<View>
							<Text className="mb-4 font-bold text-secondary-1 text-sm uppercase tracking-wide">
								{debouncedSearch
									? "SEARCH RESULTS"
									: selectedCategoryId
										? "SERVICES"
										: "BROWSE WORKOUTS"}
							</Text>

							{browse.length === 0 ? (
								<View className="items-center py-12">
									<Ionicons
										name="search-outline"
										size={48}
										color={colors.secondary[1]}
									/>
									<Text
										className="mt-4 text-center font-semibold text-lg"
										style={{ color: colors.primary[1] }}
									>
										No services found
									</Text>
									<Text
										className="mt-1 text-center text-sm"
										style={{ color: colors.secondary[1] }}
									>
										{debouncedSearch
											? "Try a different search term"
											: "No services available in this category"}
									</Text>
								</View>
							) : (
								browse.map((service: any) => (
									<Pressable
										key={service.id}
										onPress={() => {
											router.push({
												pathname: "/dashboard/explore/[id]" as never,
												params: { id: service.id },
											});
										}}
										className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm"
									>
										<View className="flex-row">
											<Image
												source={{
													uri: service.imageUrl ?? DEFAULT_IMAGE,
												}}
												className="mr-4 size-24 rounded-xl"
												contentFit="cover"
											/>
											<View className="flex-1">
												<Text
													className="mb-1 font-bold text-lg"
													style={{ color: colors.primary[1] }}
												>
													{service.name}
												</Text>
												<Text
													className="mb-2 text-sm"
													style={{ color: colors.secondary[1] }}
													numberOfLines={2}
												>
													{service.description}
												</Text>
												<View className="flex-row items-baseline">
													<Text className="font-bold text-lg text-primary-1">
														{formatMoney(service.price)}
													</Text>
													<Text
														className="ml-1 text-sm"
														style={{ color: colors.secondary[1] }}
													>
														/ {service.type === "private" ? "session" : "class"}
													</Text>
												</View>
											</View>
										</View>
									</Pressable>
								))
							)}
						</View>
					)}
				</View>
			</ScrollView>
		</TabContainer>
	);
}
