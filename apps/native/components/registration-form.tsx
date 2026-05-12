import { useAuth } from "@/hooks/useAuth";
import { colors } from "@/lib/colors";
import { client } from "@/utils/orpc";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Image } from "expo-image";
import {
	ActivityIndicator,
	Alert,
	FlatList,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ─── Types ───────────────────────────────────────────────────────

type AddressType = "home" | "work";

interface PersonalDetails {
	firstName: string;
	lastName: string;
	phone: string;
	email: string;
	idPassportNo: string;
	addressType: AddressType;
	streetAddress: string;
	city: string;
	state: string;
	country: string;
	postalCode: string;
	dateOfBirth: Date | null;
}

interface EmergencyContact {
	name: string;
	relationship: string;
	phone: string;
}

interface BranchSelection {
	country: string;
	branchId: string;
	organizationId: string;
}

// Country flag mapping for display
const COUNTRY_FLAGS: Record<string, string> = {
	Malaysia: "🇲🇾",
	Thailand: "🇹🇭",
	Singapore: "🇸🇬",
	Indonesia: "🇮🇩",
	Philippines: "🇵🇭",
	Vietnam: "🇻🇳",
	Myanmar: "🇲🇲",
	Cambodia: "🇰🇭",
	Laos: "🇱🇦",
	Brunei: "🇧🇳",
	India: "🇮🇳",
	China: "🇨🇳",
	Japan: "🇯🇵",
	"South Korea": "🇰🇷",
	Taiwan: "🇹🇼",
	"Hong Kong": "🇭🇰",
	Australia: "🇦🇺",
	"New Zealand": "🇳🇿",
	"United States": "🇺🇸",
	"United Kingdom": "🇬🇧",
};

const STEPS = [
	{ number: 1, label: "Personal" },
	{ number: 2, label: "Emergency" },
	{ number: 3, label: "Branch" },
];

// ─── Country Phone Codes ─────────────────────────────────────────

interface CountryCode {
	code: string;
	dialCode: string;
	flag: string;
	name: string;
}

const COUNTRY_CODES: CountryCode[] = [
	{ code: "MY", dialCode: "+60", flag: "🇲🇾", name: "Malaysia" },
	{ code: "SG", dialCode: "+65", flag: "🇸🇬", name: "Singapore" },
	{ code: "TH", dialCode: "+66", flag: "🇹🇭", name: "Thailand" },
	{ code: "ID", dialCode: "+62", flag: "🇮🇩", name: "Indonesia" },
	{ code: "PH", dialCode: "+63", flag: "🇵🇭", name: "Philippines" },
	{ code: "VN", dialCode: "+84", flag: "🇻🇳", name: "Vietnam" },
	{ code: "MM", dialCode: "+95", flag: "🇲🇲", name: "Myanmar" },
	{ code: "KH", dialCode: "+855", flag: "🇰🇭", name: "Cambodia" },
	{ code: "LA", dialCode: "+856", flag: "🇱🇦", name: "Laos" },
	{ code: "BN", dialCode: "+673", flag: "🇧🇳", name: "Brunei" },
	{ code: "IN", dialCode: "+91", flag: "🇮🇳", name: "India" },
	{ code: "CN", dialCode: "+86", flag: "🇨🇳", name: "China" },
	{ code: "JP", dialCode: "+81", flag: "🇯🇵", name: "Japan" },
	{ code: "KR", dialCode: "+82", flag: "🇰🇷", name: "South Korea" },
	{ code: "TW", dialCode: "+886", flag: "🇹🇼", name: "Taiwan" },
	{ code: "HK", dialCode: "+852", flag: "🇭🇰", name: "Hong Kong" },
	{ code: "AU", dialCode: "+61", flag: "🇦🇺", name: "Australia" },
	{ code: "NZ", dialCode: "+64", flag: "🇳🇿", name: "New Zealand" },
	{ code: "US", dialCode: "+1", flag: "🇺🇸", name: "United States" },
	{ code: "GB", dialCode: "+44", flag: "🇬🇧", name: "United Kingdom" },
	{ code: "CA", dialCode: "+1", flag: "🇨🇦", name: "Canada" },
	{ code: "DE", dialCode: "+49", flag: "🇩🇪", name: "Germany" },
	{ code: "FR", dialCode: "+33", flag: "🇫🇷", name: "France" },
	{ code: "IT", dialCode: "+39", flag: "🇮🇹", name: "Italy" },
	{ code: "ES", dialCode: "+34", flag: "🇪🇸", name: "Spain" },
	{ code: "NL", dialCode: "+31", flag: "🇳🇱", name: "Netherlands" },
	{ code: "AE", dialCode: "+971", flag: "🇦🇪", name: "UAE" },
	{ code: "SA", dialCode: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
	{ code: "QA", dialCode: "+974", flag: "🇶🇦", name: "Qatar" },
	{ code: "BD", dialCode: "+880", flag: "🇧🇩", name: "Bangladesh" },
	{ code: "PK", dialCode: "+92", flag: "🇵🇰", name: "Pakistan" },
	{ code: "LK", dialCode: "+94", flag: "🇱🇰", name: "Sri Lanka" },
	{ code: "NP", dialCode: "+977", flag: "🇳🇵", name: "Nepal" },
	{ code: "BR", dialCode: "+55", flag: "🇧🇷", name: "Brazil" },
	{ code: "MX", dialCode: "+52", flag: "🇲🇽", name: "Mexico" },
	{ code: "ZA", dialCode: "+27", flag: "🇿🇦", name: "South Africa" },
	{ code: "NG", dialCode: "+234", flag: "🇳🇬", name: "Nigeria" },
	{ code: "KE", dialCode: "+254", flag: "🇰🇪", name: "Kenya" },
	{ code: "EG", dialCode: "+20", flag: "🇪🇬", name: "Egypt" },
	{ code: "RU", dialCode: "+7", flag: "🇷🇺", name: "Russia" },
	{ code: "SE", dialCode: "+46", flag: "🇸🇪", name: "Sweden" },
	{ code: "NO", dialCode: "+47", flag: "🇳🇴", name: "Norway" },
	{ code: "DK", dialCode: "+45", flag: "🇩🇰", name: "Denmark" },
	{ code: "FI", dialCode: "+358", flag: "🇫🇮", name: "Finland" },
	{ code: "CH", dialCode: "+41", flag: "🇨🇭", name: "Switzerland" },
	{ code: "AT", dialCode: "+43", flag: "🇦🇹", name: "Austria" },
	{ code: "PT", dialCode: "+351", flag: "🇵🇹", name: "Portugal" },
	{ code: "IE", dialCode: "+353", flag: "🇮🇪", name: "Ireland" },
	{ code: "PL", dialCode: "+48", flag: "🇵🇱", name: "Poland" },
	{ code: "TR", dialCode: "+90", flag: "🇹🇷", name: "Turkey" },
];

const DEFAULT_COUNTRY = COUNTRY_CODES[0]; // Malaysia

// Map IANA timezone to country code
const TIMEZONE_TO_COUNTRY: Record<string, string> = {
	"Asia/Kuala_Lumpur": "MY",
	"Asia/Singapore": "SG",
	"Asia/Bangkok": "TH",
	"Asia/Jakarta": "ID",
	"Asia/Makassar": "ID",
	"Asia/Jayapura": "ID",
	"Asia/Manila": "PH",
	"Asia/Ho_Chi_Minh": "VN",
	"Asia/Yangon": "MM",
	"Asia/Phnom_Penh": "KH",
	"Asia/Vientiane": "LA",
	"Asia/Brunei": "BN",
	"Asia/Kolkata": "IN",
	"Asia/Calcutta": "IN",
	"Asia/Shanghai": "CN",
	"Asia/Tokyo": "JP",
	"Asia/Seoul": "KR",
	"Asia/Taipei": "TW",
	"Asia/Hong_Kong": "HK",
	"Australia/Sydney": "AU",
	"Australia/Melbourne": "AU",
	"Australia/Brisbane": "AU",
	"Australia/Perth": "AU",
	"Pacific/Auckland": "NZ",
	"America/New_York": "US",
	"America/Chicago": "US",
	"America/Denver": "US",
	"America/Los_Angeles": "US",
	"Europe/London": "GB",
	"America/Toronto": "CA",
	"America/Vancouver": "CA",
	"Europe/Berlin": "DE",
	"Europe/Paris": "FR",
	"Europe/Rome": "IT",
	"Europe/Madrid": "ES",
	"Europe/Amsterdam": "NL",
	"Asia/Dubai": "AE",
	"Asia/Riyadh": "SA",
	"Asia/Qatar": "QA",
	"Asia/Dhaka": "BD",
	"Asia/Karachi": "PK",
	"Asia/Colombo": "LK",
	"Asia/Kathmandu": "NP",
	"America/Sao_Paulo": "BR",
	"America/Mexico_City": "MX",
	"Africa/Johannesburg": "ZA",
	"Africa/Lagos": "NG",
	"Africa/Nairobi": "KE",
	"Africa/Cairo": "EG",
	"Europe/Moscow": "RU",
	"Europe/Stockholm": "SE",
	"Europe/Oslo": "NO",
	"Europe/Copenhagen": "DK",
	"Europe/Helsinki": "FI",
	"Europe/Zurich": "CH",
	"Europe/Vienna": "AT",
	"Europe/Lisbon": "PT",
	"Europe/Dublin": "IE",
	"Europe/Warsaw": "PL",
	"Europe/Istanbul": "TR",
};

function getDefaultCountry(): CountryCode {
	try {
		const { timeZone } = Intl.DateTimeFormat().resolvedOptions();

		// Primary: use timezone which reflects physical location
		if (timeZone) {
			const countryCode = TIMEZONE_TO_COUNTRY[timeZone];
			if (countryCode) {
				const found = COUNTRY_CODES.find((c) => c.code === countryCode);
				if (found) return found;
			}
		}
	} catch {
		// Intl not available
	}
	return DEFAULT_COUNTRY;
}

// ─── Sub-Components ──────────────────────────────────────────────

function FormLabel({ text, required }: { text: string; required?: boolean }) {
	return (
		<Text
			className="mb-2 font-semibold text-sm"
			style={{ color: colors.primary[1] }}
		>
			{text}
			{required && <Text style={{ color: "#E53935" }}> *</Text>}
		</Text>
	);
}

function FormInput({
	placeholder,
	value,
	onChangeText,
	keyboardType,
	autoCapitalize,
	error,
}: {
	placeholder: string;
	value: string;
	onChangeText: (text: string) => void;
	keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
	autoCapitalize?: "none" | "sentences" | "words";
	error?: string;
}) {
	return (
		<View className="mb-4">
			<TextInput
				className="rounded-xl border bg-primary-2 px-4 py-3 text-base"
				style={{
					borderColor: error ? "#E53935" : colors.secondary[2],
					color: colors.primary[1],
				}}
				placeholder={placeholder}
				placeholderTextColor={colors.secondary[1]}
				value={value}
				onChangeText={onChangeText}
				keyboardType={keyboardType || "default"}
				autoCapitalize={autoCapitalize || "sentences"}
			/>
			{error && (
				<Text className="mt-1 text-xs" style={{ color: "#E53935" }}>
					{error}
				</Text>
			)}
		</View>
	);
}

const countryRowStyles = StyleSheet.create({
	checkmark: { marginLeft: 8 },
	rowBase: {
		borderBottomColor: colors.secondary[3],
		backgroundColor: "transparent",
	},
	rowSelected: {
		borderBottomColor: colors.secondary[3],
		backgroundColor: colors.secondary[3],
	},
});

const CountryRow = memo(function CountryRow({
	item,
	isSelected,
	onPick,
}: {
	item: CountryCode;
	isSelected: boolean;
	onPick: (code: CountryCode) => void;
}) {
	const handlePress = useCallback(() => onPick(item), [item, onPick]);
	return (
		<Pressable
			onPress={handlePress}
			className="mx-4 flex-row items-center border-b px-2 py-3"
			style={isSelected ? countryRowStyles.rowSelected : countryRowStyles.rowBase}
		>
			<Text className="mr-3 text-2xl">{item.flag}</Text>
			<Text
				className="flex-1 text-base"
				style={{ color: colors.primary[1] }}
			>
				{item.name}
			</Text>
			<Text
				className="font-medium text-sm"
				style={{ color: colors.secondary[1] }}
			>
				{item.dialCode}
			</Text>
			{isSelected && (
				<Ionicons
					name="checkmark"
					size={20}
					color={colors.primary[1]}
					style={countryRowStyles.checkmark}
				/>
			)}
		</Pressable>
	);
});

function CountryCodePicker({
	selected,
	onSelect,
	visible,
	onClose,
}: {
	selected: CountryCode;
	onSelect: (country: CountryCode) => void;
	visible: boolean;
	onClose: () => void;
}) {
	const [search, setSearch] = useState("");

	const filtered = useMemo(
		() =>
			search.trim()
				? COUNTRY_CODES.filter(
						(c) =>
							c.name.toLowerCase().includes(search.toLowerCase()) ||
							c.dialCode.includes(search) ||
							c.code.toLowerCase().includes(search.toLowerCase()),
					)
				: COUNTRY_CODES,
		[search],
	);

	const handlePick = useCallback(
		(country: CountryCode) => {
			onSelect(country);
			setSearch("");
			onClose();
		},
		[onSelect, onClose],
	);

	const renderCountry = useCallback(
		({ item }: { item: CountryCode }) => (
			<CountryRow
				item={item}
				isSelected={selected.code === item.code}
				onPick={handlePick}
			/>
		),
		[selected.code, handlePick],
	);

	return (
		<Modal visible={visible} animationType="slide" transparent>
			<View className="flex-1 justify-end">
				<Pressable
					className="flex-1"
					onPress={onClose}
				/>
				<View
					className="rounded-t-3xl bg-primary-2"
					style={{ maxHeight: "70%" }}
				>
					{/* Handle bar */}
					<View className="items-center py-3">
						<View
							className="h-1 w-10 rounded-full"
							style={{ backgroundColor: colors.secondary[2] }}
						/>
					</View>

					{/* Header */}
					<View className="px-4 pb-3">
						<Text
							className="mb-3 text-center font-bold text-lg"
							style={{ color: colors.primary[1] }}
						>
							Select Country Code
						</Text>
						<View
							className="flex-row items-center rounded-xl border bg-primary-3 px-3"
							style={{ borderColor: colors.secondary[2] }}
						>
							<Ionicons
								name="search"
								size={18}
								color={colors.secondary[1]}
							/>
							<TextInput
								className="ml-2 flex-1 py-3 text-base"
								style={{ color: colors.primary[1] }}
								placeholder="Search country or code..."
								placeholderTextColor={colors.secondary[1]}
								value={search}
								onChangeText={setSearch}
								autoCapitalize="none"
								autoCorrect={false}
							/>
							{search.length > 0 && (
								<Pressable onPress={() => setSearch("")}>
									<Ionicons
										name="close-circle"
										size={18}
										color={colors.secondary[1]}
									/>
								</Pressable>
							)}
						</View>
					</View>

					{/* List */}
					<FlatList
						data={filtered}
						keyExtractor={(item) => item.code}
						keyboardShouldPersistTaps="handled"
						renderItem={renderCountry}
						ListEmptyComponent={
							<Text
								className="py-8 text-center text-sm"
								style={{ color: colors.secondary[1] }}
							>
								No countries found
							</Text>
						}
					/>

					{/* Bottom safe area */}
					<SafeAreaView edges={["bottom"]} />
				</View>
			</View>
		</Modal>
	);
}

function PhoneInput({
	value,
	onChangeText,
	selectedCountry,
	onCountryChange,
	error,
}: {
	value: string;
	onChangeText: (text: string) => void;
	selectedCountry: CountryCode;
	onCountryChange: (country: CountryCode) => void;
	error?: string;
}) {
	const [pickerVisible, setPickerVisible] = useState(false);

	return (
		<View className="mb-4">
			<View
				className="flex-row items-center rounded-xl border bg-primary-2"
				style={{ borderColor: error ? "#E53935" : colors.secondary[2] }}
			>
				{/* Country code selector */}
				<Pressable
					onPress={() => setPickerVisible(true)}
					className="flex-row items-center border-r py-3 pl-4 pr-3"
					style={{ borderRightColor: colors.secondary[2] }}
				>
					<Text className="mr-1 text-lg">{selectedCountry.flag}</Text>
					<Text
						className="mr-1 text-sm font-medium"
						style={{ color: colors.primary[1] }}
					>
						{selectedCountry.dialCode}
					</Text>
					<Ionicons
						name="chevron-down"
						size={14}
						color={colors.secondary[1]}
					/>
				</Pressable>

				{/* Phone number input */}
				<TextInput
					className="flex-1 py-3 pl-3 pr-4 text-base"
					style={{ color: colors.primary[1] }}
					placeholder="Phone number"
					placeholderTextColor={colors.secondary[1]}
					value={value}
					onChangeText={onChangeText}
					keyboardType="phone-pad"
				/>
			</View>
			{error && (
				<Text className="mt-1 text-xs" style={{ color: "#E53935" }}>
					{error}
				</Text>
			)}

			<CountryCodePicker
				selected={selectedCountry}
				onSelect={onCountryChange}
				visible={pickerVisible}
				onClose={() => setPickerVisible(false)}
			/>
		</View>
	);
}

// ─── Step 1: Personal Details ────────────────────────────────────

function PersonalDetailsStep({
	data,
	onChange,
	errors,
	phoneCountry,
	onPhoneCountryChange,
}: {
	data: PersonalDetails;
	onChange: (data: Partial<PersonalDetails>) => void;
	errors: Record<string, string>;
	phoneCountry: CountryCode;
	onPhoneCountryChange: (country: CountryCode) => void;
}) {
	const [showDatePicker, setShowDatePicker] = useState(false);
	const { logout } = useAuth();

	const handleSignOut = () => {
		Alert.alert("Sign Out", "Are you sure you want to sign out?", [
			{ text: "Cancel", style: "cancel" },
			{ text: "Sign Out", style: "destructive", onPress: () => logout() },
		]);
	};

	return (
		<>

			<FormLabel text="First Name" required />
			<FormInput
				placeholder="First Name as per IC"
				value={data.firstName}
				onChangeText={(v) => onChange({ firstName: v })}
				autoCapitalize="words"
				error={errors.firstName}
			/>

			<FormLabel text="Last Name" required />
			<FormInput
				placeholder="Last Name as per IC"
				value={data.lastName}
				onChangeText={(v) => onChange({ lastName: v })}
				autoCapitalize="words"
				error={errors.lastName}
			/>

			<FormLabel text="Phone" required />
			<PhoneInput
				value={data.phone}
				onChangeText={(v) => onChange({ phone: v })}
				selectedCountry={phoneCountry}
				onCountryChange={onPhoneCountryChange}
				error={errors.phone}
			/>

			<FormLabel text="Email" required />
			<FormInput
				placeholder="Email address"
				value={data.email}
				onChangeText={(v) => onChange({ email: v })}
				keyboardType="email-address"
				autoCapitalize="none"
				error={errors.email}
			/>

			<FormLabel text="ID / Passport No." required />
			<FormInput
				placeholder="IC or Passport number"
				value={data.idPassportNo}
				onChangeText={(v) => onChange({ idPassportNo: v })}
				autoCapitalize="none"
				error={errors.idPassportNo}
			/>

			<FormLabel text="Address Type" required />
			<View className="mb-4 flex-row gap-4">
				<Pressable
					onPress={() => onChange({ addressType: "home" })}
					className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border p-3 ${
						data.addressType === "home"
							? "border-primary-1"
							: "border-secondary-2"
					} bg-primary-2`}
				>
					<View
						className="size-5 items-center justify-center rounded-full border-2"
						style={{
							borderColor:
								data.addressType === "home"
									? colors.primary[1]
									: colors.secondary[2],
						}}
					>
						{data.addressType === "home" && (
							<View
								className="size-2.5 rounded-full"
								style={{ backgroundColor: colors.primary[1] }}
							/>
						)}
					</View>
					<Text
						className="text-sm font-medium"
						style={{ color: colors.primary[1] }}
					>
						Home
					</Text>
				</Pressable>

				<Pressable
					onPress={() => onChange({ addressType: "work" })}
					className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border p-3 ${
						data.addressType === "work"
							? "border-primary-1"
							: "border-secondary-2"
					} bg-primary-2`}
				>
					<View
						className="size-5 items-center justify-center rounded-full border-2"
						style={{
							borderColor:
								data.addressType === "work"
									? colors.primary[1]
									: colors.secondary[2],
						}}
					>
						{data.addressType === "work" && (
							<View
								className="size-2.5 rounded-full"
								style={{ backgroundColor: colors.primary[1] }}
							/>
						)}
					</View>
					<Text
						className="text-sm font-medium"
						style={{ color: colors.primary[1] }}
					>
						Work
					</Text>
				</Pressable>
			</View>

			<FormLabel text="Street Address" required />
			<FormInput
				placeholder="Address"
				value={data.streetAddress}
				onChangeText={(v) => onChange({ streetAddress: v })}
				error={errors.streetAddress}
			/>

			<View className="flex-row gap-3">
				<View className="flex-1">
					<FormLabel text="City" required />
					<FormInput
						placeholder="City"
						value={data.city}
						onChangeText={(v) => onChange({ city: v })}
						error={errors.city}
					/>
				</View>
				<View className="flex-1">
					<FormLabel text="State" required />
					<FormInput
						placeholder="State"
						value={data.state}
						onChangeText={(v) => onChange({ state: v })}
						error={errors.state}
					/>
				</View>
			</View>

			<View className="flex-row gap-3">
				<View className="flex-1">
					<FormLabel text="Country" required />
					<FormInput
						placeholder="Country"
						value={data.country}
						onChangeText={(v) => onChange({ country: v })}
						error={errors.country}
					/>
				</View>
				<View className="flex-1">
					<FormLabel text="Postal Code" required />
					<FormInput
						placeholder="Postal Code"
						value={data.postalCode}
						onChangeText={(v) => onChange({ postalCode: v })}
						keyboardType="numeric"
						error={errors.postalCode}
					/>
				</View>
			</View>

			<FormLabel text="Date of Birth" required />
			<Pressable
				onPress={() => setShowDatePicker(true)}
				className="mb-4 rounded-xl border bg-primary-2 px-4 py-3"
				style={{
					borderColor: errors.dateOfBirth
						? "#E53935"
						: colors.secondary[2],
				}}
			>
				<Text
					className="text-base"
					style={{
						color: data.dateOfBirth
							? colors.primary[1]
							: colors.secondary[1],
					}}
				>
					{data.dateOfBirth
						? data.dateOfBirth.toLocaleDateString("en-GB", {
								day: "2-digit",
								month: "short",
								year: "numeric",
							})
						: "Select date of birth"}
				</Text>
			</Pressable>
			{errors.dateOfBirth && (
				<Text
					className="-mt-3 mb-4 text-xs"
					style={{ color: "#E53935" }}
				>
					{errors.dateOfBirth}
				</Text>
			)}
			{showDatePicker && (
				<DateTimePicker
					value={data.dateOfBirth || new Date(2000, 0, 1)}
					mode="date"
					display={Platform.OS === "ios" ? "spinner" : "default"}
					maximumDate={new Date()}
					onChange={(_event, selectedDate) => {
						setShowDatePicker(Platform.OS === "ios");
						if (selectedDate) {
							onChange({ dateOfBirth: selectedDate });
						}
					}}
				/>
			)}
						<Pressable
				onPress={handleSignOut}
				className="mb-4 self-start flex-row items-center gap-2 rounded-xl border border-red-400 bg-red-50 px-4 py-2"
			>
				<Ionicons name="log-out-outline" size={18} color="#E53935" />
				<Text className="text-sm font-medium" style={{ color: "#E53935" }}>
					Sign Out
				</Text>
			</Pressable>
		</>
	);
}

// ─── Step 2: Emergency Contact ───────────────────────────────────

function EmergencyContactStep({
	data,
	onChange,
	errors,
	phoneCountry,
	onPhoneCountryChange,
}: {
	data: EmergencyContact;
	onChange: (data: Partial<EmergencyContact>) => void;
	errors: Record<string, string>;
	phoneCountry: CountryCode;
	onPhoneCountryChange: (country: CountryCode) => void;
}) {
	return (
		<>
			<FormLabel text="Emergency Contact Name" required />
			<FormInput
				placeholder="Full name"
				value={data.name}
				onChangeText={(v) => onChange({ name: v })}
				autoCapitalize="words"
				error={errors.name}
			/>

			<FormLabel text="Emergency Contact Relationship" required />
			<FormInput
				placeholder="e.g. Parent, Spouse, Sibling"
				value={data.relationship}
				onChangeText={(v) => onChange({ relationship: v })}
				autoCapitalize="words"
				error={errors.relationship}
			/>

			<FormLabel text="Emergency Contact No." required />
			<PhoneInput
				value={data.phone}
				onChangeText={(v) => onChange({ phone: v })}
				selectedCountry={phoneCountry}
				onCountryChange={onPhoneCountryChange}
				error={errors.phone}
			/>
		</>
	);
}

// ─── Step 3: Branch Selection ────────────────────────────────────

function BranchSelectionStep({
	data,
	onChange,
	errors,
}: {
	data: BranchSelection;
	onChange: (data: Partial<BranchSelection>) => void;
	errors: Record<string, string>;
}) {
	const [countries, setCountries] = useState<string[]>([]);
	const [branches, setBranches] = useState<
		{ id: string; name: string; address: string | null; organizationId: string }[]
	>([]);
	const [loadingCountries, setLoadingCountries] = useState(true);
	const [loadingBranches, setLoadingBranches] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const selectedBranch = branches.find((b) => b.id === data.branchId);

	// Fetch countries on mount
	useEffect(() => {
		(async () => {
			try {
				const result = await client.registration.listCountries();
				setCountries(result);
			} catch (err) {
				console.error("Failed to fetch countries:", err);
			} finally {
				setLoadingCountries(false);
			}
		})();
	}, []);

	// Fetch branches when country changes
	useEffect(() => {
		if (!data.country) {
			setBranches([]);
			return;
		}
		setLoadingBranches(true);
		(async () => {
			try {
				const result = await client.registration.listBranches({
					country: data.country,
				});
				setBranches(result);
			} catch (err) {
				console.error("Failed to fetch branches:", err);
				setBranches([]);
			} finally {
				setLoadingBranches(false);
			}
		})();
	}, [data.country]);

	if (loadingCountries) {
		return (
			<View className="items-center py-8">
				<ActivityIndicator size="large" color={colors.primary[1]} />
				<Text className="mt-2 text-secondary-1">Loading countries…</Text>
			</View>
		);
	}

	return (
		<>
			<FormLabel text="Country" required />
			<View className="mb-6 flex-row flex-wrap justify-center gap-4">
				{countries.map((country) => (
					<Pressable
						key={country}
						onPress={() => {
							onChange({ country, branchId: "", organizationId: "" });
							setDropdownOpen(false);
						}}
						className={`items-center rounded-2xl border bg-primary-2 p-3 ${
							data.country === country
								? "border-primary-1"
								: "border-secondary-2"
						}`}
						style={{ width: 100 }}
					>
						<Text className="mb-2 text-5xl">
							{COUNTRY_FLAGS[country] || "🏳️"}
						</Text>
						<Text
							className="text-center font-semibold text-sm"
							style={{ color: colors.primary[1] }}
						>
							{country}
						</Text>
					</Pressable>
				))}
			</View>
			{errors.country && (
				<Text
					className="-mt-4 mb-4 text-center text-xs"
					style={{ color: "#E53935" }}
				>
					{errors.country}
				</Text>
			)}

			{data.country && (
				<>
					<FormLabel text={`Select Branch (${data.country})`} required />

					{loadingBranches ? (
						<View className="items-center py-4">
							<ActivityIndicator size="small" color={colors.primary[1]} />
						</View>
					) : (
						<>
							{/* Dropdown trigger */}
							<Pressable
								onPress={() => setDropdownOpen(!dropdownOpen)}
								className={`mb-1 flex-row items-center justify-between rounded-xl border bg-primary-2 px-4 py-3 ${
									errors.branchId
										? ""
										: dropdownOpen
											? "border-primary-1"
											: "border-secondary-2"
								}`}
								style={
									errors.branchId
										? { borderColor: "#E53935" }
										: undefined
								}
							>
								<Text
									className="flex-1 text-base"
									style={{
										color: selectedBranch
											? colors.primary[1]
											: colors.secondary[1],
									}}
								>
									{selectedBranch?.name || "Select a branch"}
								</Text>
								<Ionicons
									name={dropdownOpen ? "chevron-up" : "chevron-down"}
									size={18}
									color={colors.secondary[1]}
								/>
							</Pressable>

							{/* Dropdown list */}
							{dropdownOpen && (
								<View className="mb-1 overflow-hidden rounded-xl border border-secondary-2 bg-primary-2">
									{branches.map((branch, index) => (
										<Pressable
											key={branch.id}
											onPress={() => {
												onChange({
													branchId: branch.id,
													organizationId: branch.organizationId,
												});
												setDropdownOpen(false);
											}}
											className="flex-row items-center justify-between px-4 py-3"
											style={{
												backgroundColor:
													data.branchId === branch.id
														? colors.secondary[3]
														: colors.primary[2],
												borderTopWidth: index > 0 ? 1 : 0,
												borderTopColor: colors.secondary[3],
											}}
										>
											<View className="flex-1">
												<Text
													className="text-base"
													style={{ color: colors.primary[1] }}
												>
													{branch.name}
												</Text>
												{branch.address && (
													<Text
														className="text-xs"
														style={{ color: colors.secondary[1] }}
													>
														{branch.address}
													</Text>
												)}
											</View>
											{data.branchId === branch.id && (
												<Ionicons
													name="checkmark"
													size={18}
													color={colors.primary[1]}
												/>
											)}
										</Pressable>
									))}
								</View>
							)}
						</>
					)}

					{errors.branchId && (
						<Text
							className="mt-1 text-xs"
							style={{ color: "#E53935" }}
						>
							{errors.branchId}
						</Text>
					)}
				</>
			)}
		</>
	);
}

// ─── Main Registration Form ──────────────────────────────────────

export default function RegistrationForm() {
	const { user, refetch } = useAuth();
	const [currentStep, setCurrentStep] = useState(0);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errors, setErrors] = useState<Record<string, string>>({});

	const userFirstName = (user as { firstName?: string } | null)?.firstName || "";
	const userLastName = (user as { lastName?: string } | null)?.lastName || "";

	const [personalDetails, setPersonalDetails] = useState<PersonalDetails>({
		firstName: userFirstName,
		lastName: userLastName,
		phone: "",
		email: user?.email || "",
		idPassportNo: "",
		addressType: "home",
		streetAddress: "",
		city: "",
		state: "",
		country: "",
		postalCode: "",
		dateOfBirth: null,
	});

	// Auto-fill user details once session loads. This is a sync to async session
	// state, not an event handler — there is no user action to attach to. The
	// `prev.x || ...` guard preserves any in-progress edits, so re-running on
	// session refresh is safe and idempotent.
	useEffect(() => {
		if (user) {
			setPersonalDetails((prev) => ({
				...prev,
				firstName: prev.firstName || userFirstName,
				lastName: prev.lastName || userLastName,
				email: prev.email || user.email || "",
			}));
		}
	}, [user, userFirstName, userLastName]);

	const [phoneCountry, setPhoneCountry] = useState<CountryCode>(getDefaultCountry);
	const [emergencyPhoneCountry, setEmergencyPhoneCountry] = useState<CountryCode>(getDefaultCountry);

	const [emergencyContact, setEmergencyContact] = useState<EmergencyContact>({
		name: "",
		relationship: "",
		phone: "",
	});

	const [branchSelection, setBranchSelection] = useState<BranchSelection>({
		country: "",
		branchId: "",
		organizationId: "",
	});

	const totalSteps = 3;
	const progressPercentage = Math.round(((currentStep + 1) / totalSteps) * 100);

	const validateStep = (step: number): boolean => {
		const newErrors: Record<string, string> = {};

		if (step === 0) {
			if (!personalDetails.firstName.trim())
				newErrors.firstName = "First Name is required";
			if (!personalDetails.lastName.trim())
				newErrors.lastName = "Last Name is required";
			if (!personalDetails.phone.trim()) newErrors.phone = "Phone is required";
			if (!personalDetails.email.trim()) newErrors.email = "Email is required";
			if (!personalDetails.idPassportNo.trim())
				newErrors.idPassportNo = "ID / Passport No. is required";
			if (!personalDetails.streetAddress.trim())
				newErrors.streetAddress = "Street Address is required";
			if (!personalDetails.city.trim()) newErrors.city = "City is required";
			if (!personalDetails.state.trim()) newErrors.state = "State is required";
			if (!personalDetails.country.trim())
				newErrors.country = "Country is required";
			if (!personalDetails.postalCode.trim())
				newErrors.postalCode = "Postal Code is required";
			if (!personalDetails.dateOfBirth)
				newErrors.dateOfBirth = "Date of Birth is required";
		} else if (step === 1) {
			if (!emergencyContact.name.trim())
				newErrors.name = "Emergency Contact Name is required";
			if (!emergencyContact.relationship.trim())
				newErrors.relationship = "Relationship is required";
			if (!emergencyContact.phone.trim())
				newErrors.phone = "Emergency Contact No. is required";
		} else if (step === 2) {
			if (!branchSelection.country) newErrors.country = "Please select a country";
			if (!branchSelection.branchId) newErrors.branchId = "Please select a branch";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleNext = () => {
		if (!validateStep(currentStep)) return;
		setErrors({});
		setCurrentStep((prev) => prev + 1);
	};

	const handlePrev = () => {
		setErrors({});
		setCurrentStep((prev) => prev - 1);
	};

	const handleSubmit = async () => {
		if (!validateStep(currentStep)) return;

		setIsSubmitting(true);
		try {
			await client.registration.complete({
				phone: `${phoneCountry.dialCode}${personalDetails.phone}`,
				idPassportNo: personalDetails.idPassportNo,
				addressType: personalDetails.addressType,
				streetAddress: personalDetails.streetAddress,
				city: personalDetails.city,
				state: personalDetails.state,
				country: personalDetails.country,
				postalCode: personalDetails.postalCode,
				dateOfBirth: personalDetails.dateOfBirth
					? `${personalDetails.dateOfBirth.getFullYear()}-${String(personalDetails.dateOfBirth.getMonth() + 1).padStart(2, "0")}-${String(personalDetails.dateOfBirth.getDate()).padStart(2, "0")}`
					: "",
				emergencyContactName: emergencyContact.name,
				emergencyContactRelationship: emergencyContact.relationship,
				emergencyContactPhone: `${emergencyPhoneCountry.dialCode}${emergencyContact.phone}`,
				branchId: branchSelection.branchId,
				organizationId: branchSelection.organizationId,
			});

			Alert.alert(
				"Registration Submitted",
				"Your registration has been submitted successfully. Please wait while we set up your account.",
				[
					{
						text: "OK",
						onPress: () => refetch(),
					},
				],
			);
		} catch (error: any) {
			Alert.alert(
				"Registration Failed",
				error.message || "Something went wrong. Please try again.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<View className="flex-1 bg-secondary-3">
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 120 }}
				contentInsetAdjustmentBehavior="automatic"
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
				automaticallyAdjustKeyboardInsets
			>
					{/* Header */}
					<View className="items-center px-4 pt-4 pb-2">
						<Image
							source={require("../assets/images/Logo-B.png")}
							className="mb-2 size-12"
							contentFit="contain"
						/>
						<Text className="font-bold text-2xl text-primary-1">
							User Registration
						</Text>
					</View>

					<View className="px-4 pb-6">
						{/* Progress Indicator */}
						<View className="mb-6">
							<View className="mb-2 flex-row items-center justify-between">
								<Text className="font-semibold text-primary-1 text-sm">
									Step {currentStep + 1} of {totalSteps}
								</Text>
								<Text className="font-semibold text-primary-1 text-sm">
									{progressPercentage}%
								</Text>
							</View>

							{/* Progress Bar */}
							<View
								className="mb-4 h-2 overflow-hidden rounded-full"
								style={{ backgroundColor: colors.secondary[2] }}
							>
								<View
									className="h-full rounded-full"
									style={{
										width: `${progressPercentage}%`,
										backgroundColor: colors.primary[1],
									}}
								/>
							</View>

							{/* Step Navigation */}
							<View className="relative" style={{ height: 50 }}>
								{/* Connector line */}
								<View
									className="absolute rounded-full"
									style={{
										left: "15%",
										right: "14%",
										top: "24%",
										height: 2,
										backgroundColor: colors.secondary[2],
										zIndex: 0,
									}}
								/>
								{/* Steps */}
								<View className="absolute inset-0 flex-row items-center justify-between">
									{STEPS.map((step, index) => (
										<View
											key={step.number}
											className="items-center justify-center"
											style={{ flex: 1, zIndex: 1 }}
										>
											{index <= currentStep ? (
												<View className="mb-1 items-center justify-center">
													<View
														className="size-7 items-center justify-center rounded-full border-2 border-primary-1"
														style={{
															backgroundColor:
																index === currentStep
																	? colors.primary[1]
																	: colors.primary[2],
															zIndex: 2,
														}}
													>
														{index < currentStep ? (
															<Ionicons
																name="checkmark"
																size={14}
																color={colors.primary[1]}
															/>
														) : (
															<View
																className="size-2 rounded-full"
																style={{
																	backgroundColor: colors.primary[2],
																}}
															/>
														)}
													</View>
												</View>
											) : (
												<View className="mb-1 items-center justify-center">
													<View
														className="size-7 items-center justify-center rounded-full border-2 border-secondary-2 bg-primary-2"
														style={{ zIndex: 2 }}
													>
														<Text className="font-semibold text-primary-1 text-xs">
															{step.number}
														</Text>
													</View>
												</View>
											)}
											<Text
												className={`mt-1 text-center text-xs ${
													index === currentStep
														? "font-bold"
														: "font-medium"
												}`}
												style={{
													color:
														index <= currentStep
															? colors.primary[1]
															: colors.secondary[1],
												}}
											>
												{step.label}
											</Text>
										</View>
									))}
								</View>
							</View>
						</View>

						{/* Section Title */}
						<Text
							className="mb-4 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							{currentStep === 0
								? "PERSONAL DETAILS"
								: currentStep === 1
									? "EMERGENCY CONTACT"
									: "SELECT PREFERRED LOCATION"}
						</Text>

						{/* Form Card */}
						<View className="rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
							{currentStep === 0 && (
								<PersonalDetailsStep
									data={personalDetails}
									onChange={(d) =>
										setPersonalDetails((prev) => ({ ...prev, ...d }))
									}
									errors={errors}
									phoneCountry={phoneCountry}
									onPhoneCountryChange={setPhoneCountry}
								/>
							)}

							{currentStep === 1 && (
								<EmergencyContactStep
									data={emergencyContact}
									onChange={(d) =>
										setEmergencyContact((prev) => ({ ...prev, ...d }))
									}
									errors={errors}
									phoneCountry={emergencyPhoneCountry}
									onPhoneCountryChange={setEmergencyPhoneCountry}
								/>
							)}

							{currentStep === 2 && (
								<BranchSelectionStep
									data={branchSelection}
									onChange={(d) =>
										setBranchSelection((prev) => ({ ...prev, ...d }))
									}
									errors={errors}
								/>
							)}
						</View>
					</View>
				</ScrollView>

				{/* Bottom Navigation */}
				<SafeAreaView
					edges={["bottom"]}
					className="border-secondary-3 border-t bg-primary-2"
				>
					<View className="flex-row gap-3 p-4">
						{currentStep > 0 && (
							<Pressable
								onPress={handlePrev}
								className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-primary-1 py-4"
							>
								<Ionicons
									name="arrow-back"
									size={18}
									color={colors.primary[1]}
								/>
								<Text className="font-semibold text-base text-primary-1">
									Back
								</Text>
							</Pressable>
						)}

						<Pressable
							onPress={currentStep === 2 ? handleSubmit : handleNext}
							disabled={isSubmitting}
							className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary-1 py-4"
							style={{ opacity: isSubmitting ? 0.6 : 1 }}
						>
							{isSubmitting ? (
								<ActivityIndicator size="small" color={colors.primary[2]} />
							) : (
								<>
									<Text className="font-semibold text-base text-primary-2">
										{currentStep === 2 ? "Submit" : "Continue"}
									</Text>
									{currentStep < 2 && (
										<Ionicons
											name="arrow-forward"
											size={18}
											color={colors.primary[2]}
										/>
									)}
								</>
							)}
						</Pressable>
					</View>
				</SafeAreaView>
		</View>
	);
}
