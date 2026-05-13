import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
	ActivityIndicator,
	Image,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { TabContainer, useTabBarHeight } from "@/components/container";
import { useDebounce } from "@/hooks/useDebounce";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { formatMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop";

function typeLabel(type: string | undefined | null): string {
	if (type === "class_slot" || type === "class-slot") return "Class Slot";
	if (type === "appointment") return "Appointment";
	return type ?? "Service";
}

// ─── Skeleton ────────────────────────────────────────────────────

function SkeletonBox({ className }: { className?: string }) {
	return (
		<View
			className={`animate-pulse rounded-lg bg-secondary-3 ${className}`}
		/>
	);
}

function ServiceRowSkeleton() {
	return (
		<View
			className="flex-row items-center px-4 py-3"
			style={{ minHeight: 76, gap: 14 }}
		>
			<SkeletonBox className="h-16 w-16 rounded-[10px]" />
			<View className="flex-1">
				<SkeletonBox className="mb-1.5 h-4 w-32" />
				<SkeletonBox className="mb-1.5 h-3 w-20" />
				<SkeletonBox className="h-5 w-16 rounded-md" />
			</View>
			<View className="items-end">
				<SkeletonBox className="mb-1 h-4 w-16" />
				<SkeletonBox className="h-3 w-14" />
			</View>
		</View>
	);
}

// ─── Service Row ─────────────────────────────────────────────────

function ServiceRow({
	service,
	isLast,
}: {
	service: any;
	isLast: boolean;
}) {
	return (
		<TouchableOpacity
			activeOpacity={0.7}
			onPress={() =>
				router.push({
					pathname: "/dashboard/explore/[id]" as never,
					params: { id: service.id },
				})
			}
			className="flex-row items-center px-4 py-3"
			style={{ minHeight: 76, gap: 14 }}
		>
			{/* Thumbnail */}
			<Image
				source={{ uri: service.imageUrl ?? DEFAULT_IMAGE }}
				className="h-16 w-16 rounded-[10px]"
				resizeMode="cover"
				style={{ backgroundColor: colors.secondary[3] }}
			/>

			{/* Info */}
			<View className="flex-1" style={{ minWidth: 0 }}>
				<Text
					numberOfLines={1}
					style={{
						fontFamily: fonts.heading,
						fontSize: 15,
						fontWeight: "700",
						color: colors.primary[1],
						letterSpacing: -0.3,
						marginBottom: 3,
					}}
				>
					{service.name}
				</Text>
				<View className="flex-row items-center" style={{ gap: 6 }}>
					<Text
						style={{
							fontFamily: fonts.subheading,
							fontSize: 11.5,
							color: colors.secondary[1],
						}}
					>
						{service.category?.name ?? "Service"}
					</Text>
					<View
						className="rounded-full"
						style={{
							width: 3,
							height: 3,
							backgroundColor: colors.secondary[2],
						}}
					/>
					<Text
						style={{
							fontFamily: fonts.body,
							fontSize: 11.5,
							color: colors.secondary[1],
						}}
					>
						{typeLabel(service.schedulingType)}
					</Text>
				</View>
				<View
					className="mt-1 self-start rounded-md px-2 py-0.5"
					style={{
						backgroundColor: colors.secondary[3],
						borderWidth: 1,
						borderColor: colors.secondary[2],
					}}
				>
					<Text
						style={{
							fontFamily: fonts.subheading,
							fontSize: 10.5,
							color: colors.secondary[1],
						}}
					>
						{typeLabel(service.schedulingType)}
					</Text>
				</View>
			</View>

			{/* Price + Chevron */}
			<View className="items-end" style={{ flexShrink: 0 }}>
				<Text
					style={{
						fontFamily: fonts.heading,
						fontSize: 14,
						fontWeight: "700",
						color: colors.primary[1],
						letterSpacing: -0.4,
					}}
				>
					{formatMoney(service.price)}
				</Text>
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 10.5,
						color: colors.secondary[1],
						marginTop: 2,
					}}
				>
					{service.sessionCount
						? `${service.sessionCount} sessions`
						: service.priceUnit === "class"
							? "per class"
							: "per session"}
				</Text>
				<Ionicons
					name="chevron-forward"
					size={14}
					color={colors.secondary[2]}
					style={{ marginTop: 4 }}
				/>
			</View>

			{/* Divider (rendered inside row, positioned at top for non-first rows) */}
			{!isLast && (
				<View
					className="absolute bottom-0 right-4"
					style={{
						left: 94,
						height: 1,
						backgroundColor: colors.secondary[2],
						opacity: 0.7,
					}}
				/>
			)}
		</TouchableOpacity>
	);
}

// ─── Main ────────────────────────────────────────────────────────

export default function ExploreScreen() {
	const { organizationId, isLoading: orgLoading } = useOrganization();
	const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
		null,
	);
	const [searchQuery, setSearchQuery] = useState("");
	const debouncedSearch = useDebounce(searchQuery, 300);
	const tabBarHeight = useTabBarHeight();

	const { data: categories } = useQuery(
		orpc.serviceCategories.list.queryOptions({
			input: { organizationId },
		}),
	);

	const filterTabs = useMemo(() => {
		const tabs: Array<{ id: string | null; name: string }> = [
			{ id: null, name: "All" },
		];
		(categories ?? []).forEach((cat: any) =>
			tabs.push({ id: cat.id, name: cat.name }),
		);
		return tabs;
	}, [categories]);

	const { data: services, isLoading: servicesLoading } = useQuery({
		...orpc.services.list.queryOptions({
			input: {
				organizationId,
				categoryId: selectedCategoryId ?? undefined,
				isActive: true,
			},
		}),
	});

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

	if (orgLoading) {
		return (
			<TabContainer>
				<View className="flex-1 items-center justify-center bg-secondary-3">
					<ActivityIndicator size="large" color={colors.primary[1]} />
				</View>
			</TabContainer>
		);
	}

	return (
		<TabContainer>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: tabBarHeight + 8 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Header */}
				<View className="px-6 pt-5">
					<Text
						style={{
							fontFamily: fonts.heading,
							fontSize: 30,
							fontWeight: "800",
							color: colors.primary[1],
							letterSpacing: -0.8,
						}}
					>
						Explore
					</Text>
				</View>

				{/* Search Bar */}
				<View className="px-6 pt-3.5">
					<View
						className="flex-row items-center rounded-[14px] border bg-primary-2 px-4"
						style={{
							height: 48,
							borderColor: colors.secondary[2],
							gap: 10,
							shadowColor: "#000",
							shadowOffset: { width: 0, height: 1 },
							shadowOpacity: 0.06,
							shadowRadius: 4,
						}}
					>
						<Ionicons
							name="search-outline"
							size={18}
							color={colors.secondary[1]}
						/>
						<TextInput
							placeholder="Search services..."
							placeholderTextColor={colors.secondary[1]}
							value={searchQuery}
							onChangeText={setSearchQuery}
							className="flex-1"
							style={{
								fontFamily: fonts.body,
								fontSize: 15,
								color: colors.primary[1],
							}}
						/>
						{searchQuery.length > 0 && (
							<TouchableOpacity onPress={() => setSearchQuery("")}>
								<Ionicons
									name="close-circle"
									size={18}
									color={colors.secondary[1]}
								/>
							</TouchableOpacity>
						)}
					</View>
				</View>

				{/* Category Pills */}
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					className="pt-3.5"
					contentContainerStyle={{ paddingLeft: 24, paddingRight: 24, gap: 8 }}
				>
					{filterTabs.map((tab) => {
						const isActive = tab.id === selectedCategoryId;
						return (
							<TouchableOpacity
								key={tab.id ?? "all"}
								onPress={() => setSelectedCategoryId(tab.id)}
								activeOpacity={0.7}
								style={{
									height: 34,
									paddingHorizontal: 14,
									borderRadius: 100,
									borderWidth: 1.5,
									borderColor: isActive
										? colors.primary[1]
										: colors.secondary[2],
									backgroundColor: isActive
										? colors.primary[1]
										: "transparent",
									justifyContent: "center",
									alignItems: "center",
								}}
							>
								<Text
									style={{
										fontFamily: fonts.subheading,
										fontSize: 13,
										color: isActive
											? colors.primary[2]
											: colors.primary[1],
										letterSpacing: -0.1,
									}}
								>
									{tab.name}
								</Text>
							</TouchableOpacity>
						);
					})}
				</ScrollView>

				{/* Results Count */}
				<View className="px-6 pt-3.5 pb-2.5">
					<Text
						style={{
							fontFamily: fonts.body,
							fontSize: 12.5,
							color: colors.secondary[1],
						}}
					>
						{servicesLoading
							? "Loading..."
							: `${filteredServices.length} service${filteredServices.length !== 1 ? "s" : ""} found`}
					</Text>
				</View>

				{/* Service List Card */}
				{servicesLoading ? (
					<View
						className="mx-4 overflow-hidden rounded-2xl bg-primary-2"
						style={{
							shadowColor: "#000",
							shadowOffset: { width: 0, height: 4 },
							shadowOpacity: 0.07,
							shadowRadius: 24,
							borderWidth: 1,
							borderColor: colors.secondary[2],
						}}
					>
						<ServiceRowSkeleton />
						<ServiceRowSkeleton />
						<ServiceRowSkeleton />
						<ServiceRowSkeleton />
					</View>
				) : filteredServices.length === 0 ? (
					<View className="mx-4 items-center rounded-2xl bg-primary-2 p-8">
						<Ionicons
							name="search-outline"
							size={40}
							color={colors.secondary[1]}
						/>
						<Text
							style={{
								fontFamily: fonts.heading,
								fontSize: 16,
								color: colors.primary[1],
								marginTop: 12,
							}}
						>
							No services found
						</Text>
						<Text
							style={{
								fontFamily: fonts.body,
								fontSize: 13,
								color: colors.secondary[1],
								marginTop: 4,
								textAlign: "center",
							}}
						>
							{debouncedSearch
								? "Try a different search term"
								: "No services available in this category"}
						</Text>
					</View>
				) : (
					<View
						className="mx-4 overflow-hidden rounded-2xl bg-primary-2"
						style={{
							shadowColor: "#000",
							shadowOffset: { width: 0, height: 4 },
							shadowOpacity: 0.07,
							shadowRadius: 24,
							borderWidth: 1,
							borderColor: colors.secondary[2],
						}}
					>
						{filteredServices.map((service: any, i: number) => (
							<ServiceRow
								key={service.id}
								service={service}
								isLast={i === filteredServices.length - 1}
							/>
						))}
					</View>
				)}
			</ScrollView>
		</TabContainer>
	);
}
