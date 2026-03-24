import { useAuth } from "@/hooks/useAuth";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Image,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";

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
}

// Country options for step 3
const COUNTRY_OPTIONS = [
	{
		id: "malaysia",
		name: "Malaysia",
		flag: "🇲🇾",
	},
	{
		id: "thailand",
		name: "Thailand",
		flag: "🇹🇭",
	},
	{
		id: "singapore",
		name: "Singapore",
		flag: "🇸🇬",
	},
];

// Dummy branches - replace with API data
const BRANCHES: Record<string, { id: string; name: string }[]> = {
	malaysia: [
		{ id: "kl-solaris", name: "Kuala Lumpur - Solaris" },
		{ id: "kl-bangsar", name: "Kuala Lumpur - Bangsar" },
		{ id: "penang", name: "Penang - Gurney" },
	],
	thailand: [
		{ id: "bkk-sukhumvit", name: "Bangkok - Sukhumvit" },
		{ id: "bkk-silom", name: "Bangkok - Silom" },
	],
	singapore: [
		{ id: "sg-orchard", name: "Singapore - Orchard" },
		{ id: "sg-marina", name: "Singapore - Marina Bay" },
	],
};

// ─── Sub-Components ──────────────────────────────────────────────

function FormLabel({ text, required }: { text: string; required?: boolean }) {
	return (
		<Text
			style={{
				fontSize: 14,
				fontWeight: "600",
				color: "#1A1A1A",
				marginBottom: 8,
				fontFamily: fonts.body,
			}}
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
		<View style={{ marginBottom: 16 }}>
			<TextInput
				style={{
					borderBottomWidth: 1,
					borderBottomColor: error ? "#E53935" : "#D1D5DB",
					paddingVertical: 10,
					fontSize: 15,
					color: "#1A1A1A",
					fontFamily: fonts.body,
				}}
				placeholder={placeholder}
				placeholderTextColor="#9CA3AF"
				value={value}
				onChangeText={onChangeText}
				keyboardType={keyboardType || "default"}
				autoCapitalize={autoCapitalize || "sentences"}
			/>
			{error && (
				<Text
					style={{
						color: "#E53935",
						fontSize: 12,
						marginTop: 4,
						fontFamily: fonts.body,
					}}
				>
					{error}
				</Text>
			)}
		</View>
	);
}

function PhoneInput({
	value,
	onChangeText,
	error,
}: {
	value: string;
	onChangeText: (text: string) => void;
	error?: string;
}) {
	return (
		<View style={{ marginBottom: 16 }}>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					borderBottomWidth: 1,
					borderBottomColor: error ? "#E53935" : "#D1D5DB",
				}}
			>
				<Text style={{ fontSize: 18, marginRight: 4 }}>🇲🇾</Text>
				<Text
					style={{
						fontSize: 14,
						color: "#6B7280",
						marginRight: 8,
						fontFamily: fonts.body,
					}}
				>
					+60
				</Text>
				<TextInput
					style={{
						flex: 1,
						paddingVertical: 10,
						fontSize: 15,
						color: "#1A1A1A",
						fontFamily: fonts.body,
					}}
					placeholder="12-345 6789"
					placeholderTextColor="#9CA3AF"
					value={value}
					onChangeText={onChangeText}
					keyboardType="phone-pad"
				/>
			</View>
			{error && (
				<Text
					style={{
						color: "#E53935",
						fontSize: 12,
						marginTop: 4,
						fontFamily: fonts.body,
					}}
				>
					{error}
				</Text>
			)}
		</View>
	);
}

function StepHeader({ title }: { title: string }) {
	return (
		<View
			style={{
				backgroundColor: "#000000",
				paddingVertical: 10,
				paddingHorizontal: 16,
				borderRadius: 4,
				alignItems: "center",
				marginBottom: 24,
			}}
		>
			<Text
				style={{
					fontSize: 14,
					fontWeight: "600",
					color: "#FFFFFF",
					fontFamily: fonts.subheading,
				}}
			>
				{title}
			</Text>
		</View>
	);
}

function StepIndicator({
	currentStep,
	totalSteps,
}: { currentStep: number; totalSteps: number }) {
	return (
		<View
			style={{
				flexDirection: "row",
				justifyContent: "center",
				gap: 8,
				marginBottom: 0,
			}}
		>
			{Array.from({ length: totalSteps }, (_, i) => (
				<View
					key={i}
					style={{
						width: i === currentStep ? 24 : 8,
						height: 8,
						borderRadius: 4,
						backgroundColor: i === currentStep ? "#000000" : "#D1D5DB",
					}}
				/>
			))}
		</View>
	);
}

// ─── Step 1: Personal Details ────────────────────────────────────

function PersonalDetailsStep({
	data,
	onChange,
	errors,
}: {
	data: PersonalDetails;
	onChange: (data: Partial<PersonalDetails>) => void;
	errors: Record<string, string>;
}) {
	const [showDatePicker, setShowDatePicker] = useState(false);

	return (
		<>
			<StepHeader title="Personal Details" />

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
			<View style={{ flexDirection: "row", gap: 16, marginBottom: 16 }}>
				<TouchableOpacity
					onPress={() => onChange({ addressType: "home" })}
					style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
				>
					<View
						style={{
							width: 20,
							height: 20,
							borderRadius: 10,
							borderWidth: 2,
							borderColor:
								data.addressType === "home" ? "#000000" : "#D1D5DB",
							justifyContent: "center",
							alignItems: "center",
						}}
					>
						{data.addressType === "home" && (
							<View
								style={{
									width: 10,
									height: 10,
									borderRadius: 5,
									backgroundColor: "#000000",
								}}
							/>
						)}
					</View>
					<Text style={{ fontSize: 14, fontFamily: fonts.body }}>Home</Text>
				</TouchableOpacity>

				<TouchableOpacity
					onPress={() => onChange({ addressType: "work" })}
					style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
				>
					<View
						style={{
							width: 20,
							height: 20,
							borderRadius: 10,
							borderWidth: 2,
							borderColor:
								data.addressType === "work" ? "#000000" : "#D1D5DB",
							justifyContent: "center",
							alignItems: "center",
						}}
					>
						{data.addressType === "work" && (
							<View
								style={{
									width: 10,
									height: 10,
									borderRadius: 5,
									backgroundColor: "#000000",
								}}
							/>
						)}
					</View>
					<Text style={{ fontSize: 14, fontFamily: fonts.body }}>Work</Text>
				</TouchableOpacity>
			</View>

			<FormLabel text="Street Address" required />
			<FormInput
				placeholder="Address"
				value={data.streetAddress}
				onChangeText={(v) => onChange({ streetAddress: v })}
				error={errors.streetAddress}
			/>

			<View style={{ flexDirection: "row", gap: 12 }}>
				<View style={{ flex: 1 }}>
					<FormLabel text="City" required />
					<FormInput
						placeholder="City"
						value={data.city}
						onChangeText={(v) => onChange({ city: v })}
						error={errors.city}
					/>
				</View>
				<View style={{ flex: 1 }}>
					<FormLabel text="State" required />
					<FormInput
						placeholder="State"
						value={data.state}
						onChangeText={(v) => onChange({ state: v })}
						error={errors.state}
					/>
				</View>
			</View>

			<View style={{ flexDirection: "row", gap: 12 }}>
				<View style={{ flex: 1 }}>
					<FormLabel text="Country" required />
					<FormInput
						placeholder="Country"
						value={data.country}
						onChangeText={(v) => onChange({ country: v })}
						error={errors.country}
					/>
				</View>
				<View style={{ flex: 1 }}>
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
			<TouchableOpacity
				onPress={() => setShowDatePicker(true)}
				style={{
					borderBottomWidth: 1,
					borderBottomColor: errors.dateOfBirth ? "#E53935" : "#D1D5DB",
					paddingVertical: 10,
					marginBottom: 16,
				}}
			>
				<Text
					style={{
						fontSize: 15,
						color: data.dateOfBirth ? "#1A1A1A" : "#9CA3AF",
						fontFamily: fonts.body,
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
			</TouchableOpacity>
			{errors.dateOfBirth && (
				<Text
					style={{
						color: "#E53935",
						fontSize: 12,
						marginTop: -12,
						marginBottom: 16,
						fontFamily: fonts.body,
					}}
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
		</>
	);
}

// ─── Step 2: Emergency Contact ───────────────────────────────────

function EmergencyContactStep({
	data,
	onChange,
	errors,
}: {
	data: EmergencyContact;
	onChange: (data: Partial<EmergencyContact>) => void;
	errors: Record<string, string>;
}) {
	return (
		<>
			<StepHeader title="Emergency Contact Details" />

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
	const branches = data.country ? BRANCHES[data.country] || [] : [];
	const [showBranchPicker, setShowBranchPicker] = useState(false);
	const selectedBranch = branches.find((b) => b.id === data.branchId);

	return (
		<>
			<FormLabel text="Country" required />
			<View
				style={{
					flexDirection: "row",
					justifyContent: "center",
					gap: 16,
					marginBottom: 24,
				}}
			>
				{COUNTRY_OPTIONS.map((c) => (
					<TouchableOpacity
						key={c.id}
						onPress={() => onChange({ country: c.id, branchId: "" })}
						style={{
							width: 100,
							alignItems: "center",
							borderWidth: 2,
							borderColor: data.country === c.id ? "#2E7D32" : "#E5E7EB",
							borderRadius: 12,
							paddingVertical: 12,
							paddingHorizontal: 8,
							backgroundColor: "#FFFFFF",
						}}
					>
						<Text style={{ fontSize: 48, marginBottom: 8 }}>{c.flag}</Text>
						<Text
							style={{
								fontSize: 13,
								fontWeight: "600",
								color: "#1A1A1A",
								fontFamily: fonts.body,
								textAlign: "center",
							}}
						>
							{c.name}
						</Text>
					</TouchableOpacity>
				))}
			</View>
			{errors.country && (
				<Text
					style={{
						color: "#E53935",
						fontSize: 12,
						marginTop: -16,
						marginBottom: 16,
						textAlign: "center",
						fontFamily: fonts.body,
					}}
				>
					{errors.country}
				</Text>
			)}

			{data.country && (
				<>
					<FormLabel
						text={`Select Branch (${COUNTRY_OPTIONS.find((c) => c.id === data.country)?.name})`}
						required
					/>
					<TouchableOpacity
						onPress={() => setShowBranchPicker(!showBranchPicker)}
						style={{
							borderBottomWidth: 1,
							borderBottomColor: errors.branchId ? "#E53935" : "#D1D5DB",
							paddingVertical: 10,
							marginBottom: showBranchPicker ? 0 : 16,
							flexDirection: "row",
							justifyContent: "space-between",
							alignItems: "center",
						}}
					>
						<Text
							style={{
								fontSize: 15,
								color: selectedBranch ? "#1A1A1A" : "#9CA3AF",
								fontFamily: fonts.body,
							}}
						>
							{selectedBranch?.name || "Select a branch"}
						</Text>
						<Ionicons
							name={showBranchPicker ? "chevron-up" : "chevron-down"}
							size={20}
							color="#6B7280"
						/>
					</TouchableOpacity>
					{errors.branchId && (
						<Text
							style={{
								color: "#E53935",
								fontSize: 12,
								marginTop: 4,
								marginBottom: 16,
								fontFamily: fonts.body,
							}}
						>
							{errors.branchId}
						</Text>
					)}

					{showBranchPicker && (
						<View
							style={{
								backgroundColor: "#FFFFFF",
								borderWidth: 1,
								borderColor: "#E5E7EB",
								borderRadius: 8,
								marginBottom: 16,
								overflow: "hidden",
							}}
						>
							{branches.map((branch) => (
								<TouchableOpacity
									key={branch.id}
									onPress={() => {
										onChange({ branchId: branch.id });
										setShowBranchPicker(false);
									}}
									style={{
										paddingVertical: 12,
										paddingHorizontal: 16,
										borderBottomWidth: 1,
										borderBottomColor: "#F3F4F6",
										backgroundColor:
											data.branchId === branch.id ? "#F3F3F3" : "#FFFFFF",
									}}
								>
									<Text
										style={{
											fontSize: 14,
											color: "#1A1A1A",
											fontFamily: fonts.body,
										}}
									>
										{branch.name}
									</Text>
								</TouchableOpacity>
							))}
						</View>
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

	const [personalDetails, setPersonalDetails] = useState<PersonalDetails>({
		firstName: "",
		lastName: "",
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

	const [emergencyContact, setEmergencyContact] = useState<EmergencyContact>({
		name: "",
		relationship: "",
		phone: "",
	});

	const [branchSelection, setBranchSelection] = useState<BranchSelection>({
		country: "",
		branchId: "",
	});

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
			// Build address string from components
			const fullAddress = [
				personalDetails.streetAddress,
				personalDetails.city,
				personalDetails.state,
				personalDetails.postalCode,
				personalDetails.country,
			]
				.filter(Boolean)
				.join(", ");

			// TODO: Replace with actual client registration API endpoint
			// This should:
			// 1. Create/update customer profile in tenant DB
			// 2. Add user as client member in the organization
			// 3. Set user role to "user"
			//
			// For now, we'll call the customer profile upsert if organizationId is available
			// and show an alert about the registration data

			const registrationData = {
				personalDetails: {
					...personalDetails,
					fullAddress,
				},
				emergencyContact,
				branchSelection,
			};

			console.log("Registration data:", JSON.stringify(registrationData, null, 2));

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
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			style={{ flex: 1, backgroundColor: "#F5F5F5" }}
		>
			<ScrollView
				contentContainerStyle={{
					flexGrow: 1,
					paddingHorizontal: 24,
					paddingTop: 16,
					paddingBottom: 120,
				}}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				{/* Header */}
				<View style={{ alignItems: "center", marginBottom: 16 }}>
					<Image
						source={require("../assets/images/Logo-B.png")}
						style={{ width: 48, height: 48, marginBottom: 8 }}
						resizeMode="contain"
					/>
					<Text
						style={{
							fontSize: 20,
							fontWeight: "bold",
							color: "#1A1A1A",
							fontFamily: fonts.heading,
						}}
					>
						Client Registration Form
					</Text>
				</View>

				{/* Step Indicator */}
				<StepIndicator currentStep={currentStep} totalSteps={3} />

				{/* Form Card */}
				<View
					style={{
						backgroundColor: "#FFFFFF",
						borderRadius: 16,
						padding: 20,
						shadowColor: "#000",
						shadowOffset: { width: 0, height: 2 },
						shadowOpacity: 0.05,
						shadowRadius: 8,
						elevation: 2,
					}}
				>
					{currentStep === 0 && (
						<PersonalDetailsStep
							data={personalDetails}
							onChange={(d) =>
								setPersonalDetails((prev) => ({ ...prev, ...d }))
							}
							errors={errors}
						/>
					)}

					{currentStep === 1 && (
						<EmergencyContactStep
							data={emergencyContact}
							onChange={(d) =>
								setEmergencyContact((prev) => ({ ...prev, ...d }))
							}
							errors={errors}
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
			</ScrollView>

			{/* Bottom Navigation Buttons */}
			<View
				style={{
					position: "absolute",
					bottom: 0,
					left: 0,
					right: 0,
					flexDirection: "row",
					paddingHorizontal: 24,
					paddingBottom: Platform.OS === "ios" ? 34 : 24,
					paddingTop: 12,
					backgroundColor: "#F5F5F5",
				}}
			>
				{currentStep > 0 && (
					<TouchableOpacity
						onPress={handlePrev}
						style={{
							flex: 1,
							height: 50,
							backgroundColor: "#000000",
							borderRadius: 8,
							justifyContent: "center",
							alignItems: "center",
							marginRight: 8,
							flexDirection: "row",
							gap: 4,
						}}
					>
						<Ionicons name="arrow-back" size={18} color="#FFFFFF" />
						<Text
							style={{
								fontSize: 15,
								fontWeight: "600",
								color: "#FFFFFF",
								fontFamily: fonts.subheading,
							}}
						>
							PREV
						</Text>
					</TouchableOpacity>
				)}

				<TouchableOpacity
					onPress={currentStep === 2 ? handleSubmit : handleNext}
					disabled={isSubmitting}
					style={{
						flex: currentStep > 0 ? 0.5 : 1,
						height: 50,
						backgroundColor: "#000000",
						borderRadius: 8,
						justifyContent: "center",
						alignItems: "center",
						flexDirection: "row",
						gap: 4,
						opacity: isSubmitting ? 0.6 : 1,
					}}
				>
					{isSubmitting ? (
						<ActivityIndicator size="small" color="#FFFFFF" />
					) : (
						<>
							<Text
								style={{
									fontSize: 15,
									fontWeight: "600",
									color: "#FFFFFF",
									fontFamily: fonts.subheading,
								}}
							>
								{currentStep === 2 ? "SUBMIT" : "NEXT"}
							</Text>
							{currentStep < 2 && (
								<Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
							)}
						</>
					)}
				</TouchableOpacity>
			</View>
		</KeyboardAvoidingView>
	);
}
