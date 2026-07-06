import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	ArrowRight,
	Building2,
	Check,
	Loader2,
	TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	type BranchSelection,
	COUNTRY_CODES,
	COUNTRY_FLAGS,
	type CountryCode,
	type EmergencyContact,
	type PersonalDetails,
	getDefaultCountry,
} from "./registration-constants";

// Web port of apps/native/components/registration-form.tsx — same 3 steps,
// same validation messages, same registration.complete payload. Registration
// creates the org member, which downstream feeds the GHL customer sync.
//
// Two modes:
//  - invite mode (default): QR walk-in with ?token= — Personal → Emergency →
//    Branch, submits registration.complete (creates the member).
//  - profile-completion mode: the caller is ALREADY a client member with a
//    null user role (GHL-approved contact). Branch is fixed by the existing
//    membership, so step 3 becomes a read-only Confirm and submit goes to
//    registration.completeProfile (no invite token, no member creation).

const INVITE_STEPS = [
	{ number: 1, label: "Personal" },
	{ number: 2, label: "Emergency" },
	{ number: 3, label: "Branch" },
];

const COMPLETION_STEPS = [
	{ number: 1, label: "Personal" },
	{ number: 2, label: "Emergency" },
	{ number: 3, label: "Confirm" },
];

// ─── Small field helpers ─────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
	if (!message) return null;
	return <p className="text-xs text-destructive">{message}</p>;
}

function TextField({
	id,
	label,
	required,
	placeholder,
	value,
	onChange,
	error,
	type = "text",
	disabled,
	testId,
}: {
	id: string;
	label: string;
	required?: boolean;
	placeholder?: string;
	value: string;
	onChange: (value: string) => void;
	error?: string;
	type?: string;
	disabled?: boolean;
	testId?: string;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>
				{label}
				{required && <span className="text-destructive"> *</span>}
			</Label>
			<Input
				id={id}
				type={type}
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				aria-invalid={!!error}
				disabled={disabled}
				data-testid={testId}
			/>
			<FieldError message={error} />
		</div>
	);
}

function PhoneField({
	id,
	label,
	required,
	value,
	onChange,
	selectedCountry,
	onCountryChange,
	error,
	testId,
}: {
	id: string;
	label: string;
	required?: boolean;
	value: string;
	onChange: (value: string) => void;
	selectedCountry: CountryCode;
	onCountryChange: (country: CountryCode) => void;
	error?: string;
	testId?: string;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>
				{label}
				{required && <span className="text-destructive"> *</span>}
			</Label>
			<div className="flex gap-2">
				<Select
					value={selectedCountry.code}
					onValueChange={(code) => {
						const found = COUNTRY_CODES.find((c) => c.code === code);
						if (found) onCountryChange(found);
					}}
				>
					<SelectTrigger className="w-[110px] shrink-0">
						<SelectValue>
							<span>
								{selectedCountry.flag} {selectedCountry.dialCode}
							</span>
						</SelectValue>
					</SelectTrigger>
					<SelectContent className="max-h-72">
						{COUNTRY_CODES.map((c) => (
							<SelectItem key={c.code} value={c.code}>
								{c.flag} {c.name} ({c.dialCode})
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Input
					id={id}
					type="tel"
					placeholder="Phone number"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					aria-invalid={!!error}
					data-testid={testId}
				/>
			</div>
			<FieldError message={error} />
		</div>
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
	const today = new Date().toISOString().slice(0, 10);

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<TextField
					id="firstName"
					label="First Name"
					required
					placeholder="First Name as per IC"
					value={data.firstName}
					onChange={(v) => onChange({ firstName: v })}
					error={errors.firstName}
					testId="reg-first-name"
				/>
				<TextField
					id="lastName"
					label="Last Name"
					required
					placeholder="Last Name as per IC"
					value={data.lastName}
					onChange={(v) => onChange({ lastName: v })}
					error={errors.lastName}
					testId="reg-last-name"
				/>
			</div>

			<PhoneField
				id="phone"
				label="Phone"
				required
				value={data.phone}
				onChange={(v) => onChange({ phone: v })}
				selectedCountry={phoneCountry}
				onCountryChange={onPhoneCountryChange}
				error={errors.phone}
				testId="reg-phone"
			/>

			<TextField
				id="email"
				label="Email"
				required
				type="email"
				placeholder="Email address"
				value={data.email}
				onChange={(v) => onChange({ email: v })}
				error={errors.email}
				testId="reg-email"
			/>

			<TextField
				id="idPassportNo"
				label="ID / Passport No."
				required
				placeholder="IC or Passport number"
				value={data.idPassportNo}
				onChange={(v) => onChange({ idPassportNo: v })}
				error={errors.idPassportNo}
				testId="reg-id-passport"
			/>

			<div className="space-y-1.5">
				<Label>
					Address Type<span className="text-destructive"> *</span>
				</Label>
				<RadioGroup
					value={data.addressType}
					onValueChange={(v) =>
						onChange({ addressType: v as PersonalDetails["addressType"] })
					}
					className="flex gap-4"
				>
					<Label
						htmlFor="address-home"
						className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 font-medium has-[[data-state=checked]]:border-primary"
					>
						<RadioGroupItem value="home" id="address-home" />
						Home
					</Label>
					<Label
						htmlFor="address-work"
						className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 font-medium has-[[data-state=checked]]:border-primary"
					>
						<RadioGroupItem value="work" id="address-work" />
						Work
					</Label>
				</RadioGroup>
			</div>

			<TextField
				id="streetAddress"
				label="Street Address"
				required
				placeholder="Address"
				value={data.streetAddress}
				onChange={(v) => onChange({ streetAddress: v })}
				error={errors.streetAddress}
				testId="reg-street"
			/>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<TextField
					id="city"
					label="City"
					required
					placeholder="City"
					value={data.city}
					onChange={(v) => onChange({ city: v })}
					error={errors.city}
					testId="reg-city"
				/>
				<TextField
					id="state"
					label="State"
					required
					placeholder="State"
					value={data.state}
					onChange={(v) => onChange({ state: v })}
					error={errors.state}
					testId="reg-state"
				/>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<TextField
					id="country"
					label="Country"
					required
					placeholder="Country"
					value={data.country}
					onChange={(v) => onChange({ country: v })}
					error={errors.country}
					testId="reg-country"
				/>
				<TextField
					id="postalCode"
					label="Postal Code"
					required
					placeholder="Postal Code"
					value={data.postalCode}
					onChange={(v) => onChange({ postalCode: v })}
					error={errors.postalCode}
					testId="reg-postal"
				/>
			</div>

			<div className="space-y-1.5">
				<Label htmlFor="dateOfBirth">
					Date of Birth<span className="text-destructive"> *</span>
				</Label>
				<Input
					id="dateOfBirth"
					type="date"
					max={today}
					value={data.dateOfBirth}
					onChange={(e) => onChange({ dateOfBirth: e.target.value })}
					aria-invalid={!!errors.dateOfBirth}
					data-testid="reg-dob"
				/>
				<FieldError message={errors.dateOfBirth} />
			</div>
		</div>
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
		<div className="space-y-4">
			<TextField
				id="emergencyName"
				label="Emergency Contact Name"
				required
				placeholder="Full name"
				value={data.name}
				onChange={(v) => onChange({ name: v })}
				error={errors.name}
				testId="reg-emergency-name"
			/>
			<TextField
				id="emergencyRelationship"
				label="Emergency Contact Relationship"
				required
				placeholder="e.g. Parent, Spouse, Sibling"
				value={data.relationship}
				onChange={(v) => onChange({ relationship: v })}
				error={errors.relationship}
				testId="reg-emergency-relationship"
			/>
			<PhoneField
				id="emergencyPhone"
				label="Emergency Contact No."
				required
				value={data.phone}
				onChange={(v) => onChange({ phone: v })}
				selectedCountry={phoneCountry}
				onCountryChange={onPhoneCountryChange}
				error={errors.phone}
				testId="reg-emergency-phone"
			/>
		</div>
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
	const { data: countries, isLoading: loadingCountries } = useQuery({
		queryKey: ["registration", "countries"],
		queryFn: () => client.registration.listCountries(),
	});

	const { data: branches, isLoading: loadingBranches } = useQuery({
		queryKey: ["registration", "branches", data.country],
		queryFn: () => client.registration.listBranches({ country: data.country }),
		enabled: !!data.country,
	});

	if (loadingCountries) {
		return (
			<div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
				<Loader2 className="h-6 w-6 animate-spin" />
				<span className="text-sm">Loading countries…</span>
			</div>
		);
	}

	const selectedBranch = branches?.find((b) => b.id === data.branchId);

	return (
		<div className="space-y-4">
			<div className="space-y-1.5">
				<Label>
					Country<span className="text-destructive"> *</span>
				</Label>
				<div className="flex flex-wrap justify-center gap-4">
					{(countries ?? []).map((country) => (
						<button
							key={country}
							type="button"
							onClick={() =>
								onChange({ country, branchId: "", organizationId: "" })
							}
							className={`w-[100px] rounded-2xl border bg-card p-3 text-center transition-colors ${
								data.country === country
									? "border-primary ring-1 ring-primary"
									: "border-border hover:border-muted-foreground"
							}`}
							data-testid={`reg-country-${country}`}
						>
							<div className="mb-2 text-5xl">
								{COUNTRY_FLAGS[country] || "🏳️"}
							</div>
							<div className="text-sm font-semibold">{country}</div>
						</button>
					))}
				</div>
				<FieldError message={errors.country} />
			</div>

			{data.country && (
				<div className="space-y-1.5">
					<Label>
						Select Branch ({data.country})
						<span className="text-destructive"> *</span>
					</Label>
					{loadingBranches ? (
						<div className="flex justify-center py-4">
							<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
						</div>
					) : (
						<Select
							value={data.branchId || undefined}
							onValueChange={(branchId) => {
								const branch = branches?.find((b) => b.id === branchId);
								if (branch) {
									onChange({
										branchId: branch.id,
										organizationId: branch.organizationId,
									});
								}
							}}
						>
							<SelectTrigger
								aria-invalid={!!errors.branchId}
								data-testid="reg-branch-select"
							>
								<SelectValue placeholder="Select a branch">
									{selectedBranch?.name}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{/* Keep SelectItem children inline-only — Radix clones ItemText
								    into the trigger's value slot and block elements break its
								    DOM reconciliation (removeChild crash). */}
								{(branches ?? []).map((branch) => (
									<SelectItem key={branch.id} value={branch.id}>
										{branch.name}
										{branch.address ? ` — ${branch.address}` : ""}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					<FieldError message={errors.branchId} />
				</div>
			)}
		</div>
	);
}

// ─── Step 3 (profile-completion mode): Confirm ───────────────────

function ConfirmStep({
	branchName,
	personal,
	emergency,
	phoneCountry,
	emergencyPhoneCountry,
}: {
	branchName: string | null;
	personal: PersonalDetails;
	emergency: EmergencyContact;
	phoneCountry: CountryCode;
	emergencyPhoneCountry: CountryCode;
}) {
	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-4">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
					<Building2 className="h-5 w-5" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="font-semibold" data-testid="reg-confirm-branch">
						{branchName ?? "Your branch"}
					</p>
					<p className="text-xs text-muted-foreground">
						Your branch — assigned by your gym
					</p>
				</div>
				<Badge variant="secondary">🔒 Fixed</Badge>
			</div>
			<p className="text-xs text-muted-foreground">
				Wrong branch? Ask reception — staff can move you after registration.
			</p>

			<div className="divide-y rounded-xl border text-sm">
				<div className="flex justify-between gap-4 p-3">
					<span className="text-muted-foreground">Name</span>
					<span className="text-right font-medium">
						{personal.firstName} {personal.lastName}
					</span>
				</div>
				<div className="flex justify-between gap-4 p-3">
					<span className="text-muted-foreground">ID / Passport</span>
					<span className="text-right font-medium">
						{personal.idPassportNo}
					</span>
				</div>
				<div className="flex justify-between gap-4 p-3">
					<span className="text-muted-foreground">Phone</span>
					<span className="text-right font-medium">
						{phoneCountry.dialCode} {personal.phone}
					</span>
				</div>
				<div className="flex justify-between gap-4 p-3">
					<span className="text-muted-foreground">Date of birth</span>
					<span className="text-right font-medium">{personal.dateOfBirth}</span>
				</div>
				<div className="flex justify-between gap-4 p-3">
					<span className="text-muted-foreground">Emergency contact</span>
					<span className="text-right font-medium">
						{emergency.name} · {emergency.relationship} ·{" "}
						{emergencyPhoneCountry.dialCode} {emergency.phone}
					</span>
				</div>
			</div>
		</div>
	);
}

// ─── Main Registration Form ──────────────────────────────────────

export function RegistrationForm({ inviteToken }: { inviteToken: string }) {
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();
	const [currentStep, setCurrentStep] = useState(0);
	const [errors, setErrors] = useState<Record<string, string>>({});

	// Mode detection: an existing client membership + null user role means the
	// caller was materialized by staff (GHL approval) — switch to
	// profile-completion mode. Any query failure falls back to invite mode.
	const { data: userCtx, isLoading: ctxLoading } = useQuery({
		queryKey: ["registration", "userContext"],
		queryFn: () => client.auth.userContext({}),
		staleTime: 60_000,
		retry: 1,
	});
	const memberOrgId = userCtx?.organizations?.[0]?.id ?? null;
	const { data: profileStatus, isLoading: statusLoading } = useQuery({
		queryKey: ["registration", "profileStatus", memberOrgId],
		queryFn: () =>
			client.registration.profileStatus({ organizationId: memberOrgId! }),
		enabled: !!memberOrgId,
		retry: 1,
	});
	const completionMode = !!profileStatus?.needsProfileCompletion;
	const detecting = ctxLoading || (!!memberOrgId && statusLoading);
	const steps = completionMode ? COMPLETION_STEPS : INVITE_STEPS;

	const [personalDetails, setPersonalDetails] = useState<PersonalDetails>({
		firstName: "",
		lastName: "",
		phone: "",
		email: "",
		idPassportNo: "",
		addressType: "home",
		streetAddress: "",
		city: "",
		state: "",
		country: "",
		postalCode: "",
		dateOfBirth: "",
	});

	// Prefill name/email from the session once it loads, preserving in-progress
	// edits (same `prev.x || …` guard as the native form). Name/email are
	// display-only — registration.complete does not accept them.
	useEffect(() => {
		const user = session?.user;
		if (!user) return;
		const [firstName = "", ...rest] = (user.name ?? "").split(" ");
		const lastName = rest.join(" ");
		setPersonalDetails((prev) => ({
			...prev,
			firstName: prev.firstName || firstName,
			lastName: prev.lastName || lastName,
			email: prev.email || user.email || "",
		}));
	}, [session?.user]);

	const [phoneCountry, setPhoneCountry] = useState(getDefaultCountry);
	const [emergencyPhoneCountry, setEmergencyPhoneCountry] =
		useState(getDefaultCountry);

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

	const totalSteps = steps.length;
	const progressPercentage = Math.round(((currentStep + 1) / totalSteps) * 100);

	const completeMutation = useMutation({
		mutationFn: async () => {
			const profileFields = {
				phone: `${phoneCountry.dialCode}${personalDetails.phone}`,
				idPassportNo: personalDetails.idPassportNo,
				addressType: personalDetails.addressType,
				streetAddress: personalDetails.streetAddress,
				city: personalDetails.city,
				state: personalDetails.state,
				country: personalDetails.country,
				postalCode: personalDetails.postalCode,
				dateOfBirth: personalDetails.dateOfBirth,
				emergencyContactName: emergencyContact.name,
				emergencyContactRelationship: emergencyContact.relationship,
				emergencyContactPhone: `${emergencyPhoneCountry.dialCode}${emergencyContact.phone}`,
			};
			// Profile-completion mode: membership already exists (GHL approval) —
			// no invite token, no branch selection, member row untouched.
			if (completionMode && memberOrgId) {
				return client.registration.completeProfile({
					organizationId: memberOrgId,
					...profileFields,
				});
			}
			try {
				return await client.registration.complete({
					inviteToken,
					...profileFields,
					branchId: branchSelection.branchId,
					organizationId: branchSelection.organizationId,
				});
			} catch (err) {
				// Safety net mirroring the native form: if mode detection under-fired
				// and the caller is actually already a member, complete() rejects
				// CONFLICT — finish their PROFILE against their real org instead of
				// dead-ending the user. Keyed on the stable oRPC code (message as a
				// defensive fallback).
				const e = err as { code?: string; message?: string };
				const alreadyMember =
					e?.code === "CONFLICT" ||
					(e?.message ?? "").toLowerCase().includes("already a member");
				if (alreadyMember && memberOrgId) {
					return client.registration.completeProfile({
						organizationId: memberOrgId,
						...profileFields,
					});
				}
				throw err;
			}
		},
		onSuccess: async () => {
			toast.success(
				completionMode
					? "Registration complete. Welcome!"
					: "Registration submitted successfully. Setting up your account…",
			);
			// Refresh the Better-Auth session so the updated role is picked up.
			await authClient.getSession();
			navigate({ to: "/dashboard" });
		},
		onError: (err: Error) => {
			toast.error(err.message || "Something went wrong. Please try again.");
		},
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
		} else if (step === 2 && !completionMode) {
			// Confirm step (completion mode) has no inputs to validate.
			if (!branchSelection.country)
				newErrors.country = "Please select a country";
			if (!branchSelection.branchId)
				newErrors.branchId = "Please select a branch";
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

	const handleSubmit = () => {
		if (!validateStep(currentStep)) return;
		completeMutation.mutate();
	};

	const isSubmitting = completeMutation.isPending;

	// Hold the wizard until the mode is known — prevents an invite-mode flash
	// (Branch step + token notice) for members who belong in completion mode.
	if (detecting) {
		return (
			<div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-muted-foreground">
				<Loader2 className="h-6 w-6 animate-spin" />
				<span className="text-sm">Preparing your registration…</span>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-2xl px-4 py-8">
			{/* Invite mode without a token: the submit will be rejected — tell the
			    user up front. Never shown in completion mode (no token needed). */}
			{!inviteToken && !completionMode && (
				<Alert className="mb-6" data-testid="reg-missing-token-notice">
					<TriangleAlert className="h-4 w-4" />
					<AlertTitle>Registration invite required</AlertTitle>
					<AlertDescription>
						Submitting this form requires a registration invite. Scan the QR
						code at your gym's reception or open your invite link to continue.
					</AlertDescription>
				</Alert>
			)}

			{/* Header */}
			<div className="mb-6 text-center">
				<h1 className="text-2xl font-bold">User Registration</h1>
			</div>

			{/* Progress */}
			<div className="mb-6 space-y-4">
				<div className="flex items-center justify-between text-sm font-semibold">
					<span>
						Step {currentStep + 1} of {totalSteps}
					</span>
					<span>{progressPercentage}%</span>
				</div>
				<Progress value={progressPercentage} className="h-2" />

				{/* Step indicators */}
				<div className="flex items-center justify-between">
					{steps.map((step, index) => (
						<div
							key={step.number}
							className="flex flex-1 flex-col items-center gap-1"
						>
							<div
								className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold ${
									index < currentStep
										? "border-primary bg-primary/10 text-primary"
										: index === currentStep
											? "border-primary bg-primary text-primary-foreground"
											: "border-border bg-card text-muted-foreground"
								}`}
							>
								{index < currentStep ? (
									<Check className="h-3.5 w-3.5" />
								) : (
									step.number
								)}
							</div>
							<span
								className={`text-xs ${
									index === currentStep
										? "font-bold"
										: index < currentStep
											? "font-medium"
											: "text-muted-foreground"
								}`}
							>
								{step.label}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Section title */}
			<h2 className="mb-4 text-sm font-bold uppercase tracking-wide">
				{currentStep === 0
					? "Personal Details"
					: currentStep === 1
						? "Emergency Contact"
						: completionMode
							? "Confirm Your Details"
							: "Select Preferred Location"}
			</h2>

			{/* Form card */}
			<Card>
				<CardContent className="pt-6">
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

					{currentStep === 2 &&
						(completionMode ? (
							<ConfirmStep
								branchName={profileStatus?.branchName ?? null}
								personal={personalDetails}
								emergency={emergencyContact}
								phoneCountry={phoneCountry}
								emergencyPhoneCountry={emergencyPhoneCountry}
							/>
						) : (
							<BranchSelectionStep
								data={branchSelection}
								onChange={(d) =>
									setBranchSelection((prev) => ({ ...prev, ...d }))
								}
								errors={errors}
							/>
						))}
				</CardContent>
			</Card>

			{/* Navigation */}
			<div className="mt-6 flex gap-3">
				{currentStep > 0 && (
					<Button
						type="button"
						variant="outline"
						className="flex-1"
						onClick={handlePrev}
						disabled={isSubmitting}
						data-testid="reg-back-button"
					>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Button>
				)}
				<Button
					type="button"
					className="flex-1"
					onClick={currentStep === totalSteps - 1 ? handleSubmit : handleNext}
					disabled={isSubmitting}
					data-testid="reg-next-button"
				>
					{isSubmitting ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Submitting…
						</>
					) : currentStep === totalSteps - 1 ? (
						completionMode ? (
							"Complete registration"
						) : (
							"Submit"
						)
					) : (
						<>
							Continue
							<ArrowRight className="ml-2 h-4 w-4" />
						</>
					)}
				</Button>
			</div>
		</div>
	);
}
