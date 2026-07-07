import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Loader2, Mail, UserPlus } from "lucide-react";
import { useForm } from "@tanstack/react-form";
import { useRef, useState } from "react";
import * as z from "zod";

// ── schema ────────────────────────────────────────────────────────────────────

// Onboarding fields carried by both schemas so the form values have one shape;
// quick add leaves them optional, full details requires them.
const onboardingOptional = {
	idPassportNo: z.string().optional(),
	addressType: z.enum(["home", "work"]).optional(),
	streetAddress: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	country: z.string().optional(),
	postalCode: z.string().optional(),
	emergencyContactName: z.string().optional(),
	emergencyContactRelationship: z.string().optional(),
	emergencyContactPhone: z.string().optional(),
};

const quickAddSchema = z.object({
	firstName: z.string().min(1, "First name is required"),
	lastName: z.string().min(1, "Last name is required"),
	phone: z.string().min(1, "Phone number is required"),
	email: z.string().email("Invalid email").optional().or(z.literal("")),
	hierarchyScopeId: z.string().uuid("Please select a branch"),
	dateOfBirth: z.string().optional(),
	notes: z.string().optional(),
	...onboardingOptional,
});

// Full details requires the whole onboarding profile up front — same fields the
// self-service registration wizard collects.
const fullDetailsSchema = quickAddSchema.extend({
	dateOfBirth: z.string().min(1, "Date of birth is required"),
	idPassportNo: z.string().min(1, "ID / Passport No. is required"),
	addressType: z.enum(["home", "work"]),
	streetAddress: z.string().min(1, "Street address is required"),
	city: z.string().min(1, "City is required"),
	state: z.string().min(1, "State is required"),
	country: z.string().min(1, "Country is required"),
	postalCode: z.string().min(1, "Postal code is required"),
	emergencyContactName: z.string().min(1, "Emergency contact name is required"),
	emergencyContactRelationship: z.string().min(1, "Relationship is required"),
	emergencyContactPhone: z
		.string()
		.min(1, "Emergency contact number is required"),
});

type AddCustomerData = z.infer<typeof quickAddSchema>;

// ── shared helpers ────────────────────────────────────────────────────────────

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-xs text-rose-600">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

function Field({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-col gap-1.5">{children}</div>;
}

interface HierarchyNode {
	id: string;
	name: string;
	type: string;
	depth: number;
	code?: string | null;
}

function useHierarchyNodes(organizationId: string, enabled: boolean) {
	return useQuery({
		queryKey: ["hierarchy-nodes", organizationId],
		queryFn: async () => {
			const result = await client.hierarchy.listNodes({ organizationId });
			return result.nodes as HierarchyNode[];
		},
		enabled: !!organizationId && enabled,
		staleTime: 30 * 1000,
	});
}

function getScopeDisplayName(node: HierarchyNode) {
	const typeLabels: Record<string, string> = {
		organization: "Organization",
		country: "Country",
		region: "Region",
		area: "Area",
		branch: "Branch",
	};
	const label = typeLabels[node.type] || node.type;
	return `${label}: ${node.name}${node.code ? ` (${node.code})` : ""}`;
}

// ── form ──────────────────────────────────────────────────────────────────────

interface AddCustomerFormProps {
	organizationId: string;
	/** Whether to fetch hierarchy nodes. Defaults to true (inline use). */
	enabled?: boolean;
	/** Called after a profile is created successfully. */
	onSuccess?: () => void;
	/** When provided, renders a Cancel button that invokes this. */
	onCancel?: () => void;
	/** Two-column field layout for wide containers (e.g. the launchpad panel). */
	wide?: boolean;
}

/**
 * The Add Customer form body without any modal chrome. Render it directly for an
 * inline form, or wrap it in {@link AddCustomerDialog} for a modal.
 */
export function AddCustomerForm({
	organizationId,
	enabled = true,
	onSuccess,
	onCancel,
	wide = false,
}: AddCustomerFormProps) {
	const { data: nodes, isLoading: isLoadingHierarchy } = useHierarchyNodes(
		organizationId,
		enabled,
	);

	const clientScopes = (nodes ?? []).filter((n) =>
		["branch", "area", "region", "country"].includes(n.type),
	);

	// "quick" captures the 4 essentials and lets the customer self-complete their
	// profile later via a sign-in link; "full" captures the whole onboarding
	// profile now (IC, address, emergency contact) so the customer is created
	// registration-complete.
	const [mode, setMode] = useState<"quick" | "full">("quick");
	// The form instance is created once, so its validator closure would capture
	// the initial mode — read the live mode through a ref instead.
	const modeRef = useRef(mode);
	modeRef.current = mode;
	// After a quick-add, hold the created profile so we can offer the sign-in
	// (onboarding) link in-flow. Full-details creates close immediately.
	const [created, setCreated] = useState<{
		profileId: string;
		hasRealEmail: boolean;
	} | null>(null);

	const mutation = useApiMutation({
		mutationFn: (data: AddCustomerData) =>
			client.customerProfiles.createUnclaimed({
				organizationId,
				firstName: data.firstName,
				lastName: data.lastName,
				phone: data.phone,
				email: data.email || undefined,
				hierarchyScopeId: data.hierarchyScopeId,
				dateOfBirth: data.dateOfBirth || undefined,
				notes: data.notes || undefined,
				// Onboarding profile — only sent in "full" mode. When all present the
				// server marks the customer registration-complete (role "user").
				...(mode === "full"
					? {
							idPassportNo: data.idPassportNo || undefined,
							addressType: data.addressType || undefined,
							streetAddress: data.streetAddress || undefined,
							city: data.city || undefined,
							state: data.state || undefined,
							country: data.country || undefined,
							postalCode: data.postalCode || undefined,
							emergencyContactName: data.emergencyContactName || undefined,
							emergencyContactRelationship:
								data.emergencyContactRelationship || undefined,
							emergencyContactPhone: data.emergencyContactPhone || undefined,
						}
					: {}),
			}),
		successMessage:
			mode === "full"
				? "Customer created with full profile"
				: "Customer profile created",
		errorMessage: (err) => err.message || "Failed to create customer",
		invalidate: [orpc.customerDirectory.list.key()],
		onSuccess: (result, vars) => {
			if (mode === "full") {
				// Registration-complete already — nothing left to hand off.
				form.reset();
				onSuccess?.();
				return;
			}
			// Quick add — offer the onboarding link before closing.
			setCreated({
				profileId: result.profileId,
				hasRealEmail: !!vars.email,
			});
		},
	});

	// Onboarding hand-off for quick-adds: dispatch the sign-in link so the
	// customer can set a password and self-complete their profile.
	const sendLinkMutation = useApiMutation({
		mutationFn: (profileId: string) =>
			client.customerProfiles.resendMagicLink({
				organizationId,
				customerProfileId: profileId,
			}),
		successMessage: "Onboarding link sent",
		errorMessage: (err) => err.message || "Failed to send link",
	});

	const form = useForm({
		defaultValues: {
			firstName: "",
			lastName: "",
			phone: "",
			email: "",
			hierarchyScopeId: "",
			dateOfBirth: "",
			notes: "",
			idPassportNo: "",
			addressType: "home",
			streetAddress: "",
			city: "",
			state: "",
			country: "",
			postalCode: "",
			emergencyContactName: "",
			emergencyContactRelationship: "",
			emergencyContactPhone: "",
		} as AddCustomerData,
		validators: {
			// Function validator (not a static schema) so the active mode's schema
			// applies live when the toggle changes. Maps zod issues to field errors.
			onSubmit: ({ value }) => {
				const schema =
					modeRef.current === "full" ? fullDetailsSchema : quickAddSchema;
				const result = schema.safeParse(value);
				if (result.success) return undefined;
				const fields: Record<string, string> = {};
				for (const issue of result.error.issues) {
					const key = issue.path[0];
					if (typeof key === "string" && !fields[key]) {
						fields[key] = issue.message;
					}
				}
				return { fields };
			},
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	const firstNameField = (
		<form.Field name="firstName">
			{(field) => (
				<Field>
					<Label htmlFor={`qa-${field.name}`}>
						First Name <span className="text-rose-600">*</span>
					</Label>
					<Input
						id={`qa-${field.name}`}
						placeholder="Jane"
						value={field.state.value}
						onBlur={field.handleBlur}
						onChange={(e) => field.handleChange(e.target.value)}
						disabled={mutation.isPending}
					/>
					<FieldError errors={field.state.meta.errors} />
				</Field>
			)}
		</form.Field>
	);

	const lastNameField = (
		<form.Field name="lastName">
			{(field) => (
				<Field>
					<Label htmlFor={`qa-${field.name}`}>
						Last Name <span className="text-rose-600">*</span>
					</Label>
					<Input
						id={`qa-${field.name}`}
						placeholder="Doe"
						value={field.state.value}
						onBlur={field.handleBlur}
						onChange={(e) => field.handleChange(e.target.value)}
						disabled={mutation.isPending}
					/>
					<FieldError errors={field.state.meta.errors} />
				</Field>
			)}
		</form.Field>
	);

	const phoneField = (
		<form.Field name="phone">
			{(field) => (
				<Field>
					<Label htmlFor={`qa-${field.name}`}>
						Phone Number <span className="text-rose-600">*</span>
					</Label>
					<Input
						id={`qa-${field.name}`}
						type="tel"
						placeholder="+60 12-345 6789"
						value={field.state.value}
						onBlur={field.handleBlur}
						onChange={(e) => field.handleChange(e.target.value)}
						disabled={mutation.isPending}
					/>
					<FieldError errors={field.state.meta.errors} />
				</Field>
			)}
		</form.Field>
	);

	const emailField = (
		<form.Field name="email">
			{(field) => (
				<Field>
					<Label htmlFor={`qa-${field.name}`}>
						Email{" "}
						<span className="text-[#737373] font-normal text-xs">
							(optional)
						</span>
					</Label>
					<Input
						id={`qa-${field.name}`}
						type="email"
						placeholder="jane@example.com"
						value={field.state.value}
						onBlur={field.handleBlur}
						onChange={(e) => field.handleChange(e.target.value)}
						disabled={mutation.isPending}
					/>
					<FieldError errors={field.state.meta.errors} />
				</Field>
			)}
		</form.Field>
	);

	const branchField = (
		<form.Field name="hierarchyScopeId">
			{(field) => (
				<Field>
					<Label htmlFor={`qa-${field.name}`}>
						Branch / Scope <span className="text-rose-600">*</span>
					</Label>
					{isLoadingHierarchy ? (
						<div className="flex items-center gap-2 text-sm text-[#737373]">
							<Loader2 className="size-4 animate-spin" />
							Loading…
						</div>
					) : (
						<Select
							value={field.state.value}
							onValueChange={(v) => field.handleChange(v)}
							disabled={mutation.isPending || clientScopes.length === 0}
						>
							<SelectTrigger id={`qa-${field.name}`}>
								<SelectValue placeholder="Select branch" />
							</SelectTrigger>
							<SelectContent>
								{clientScopes.map((n) => (
									<SelectItem key={n.id} value={n.id}>
										{getScopeDisplayName(n)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					<FieldError errors={field.state.meta.errors} />
				</Field>
			)}
		</form.Field>
	);

	const dobField = (
		<form.Field name="dateOfBirth">
			{(field) => (
				<Field>
					<Label htmlFor={`qa-${field.name}`}>Date of Birth</Label>
					<Input
						id={`qa-${field.name}`}
						type="date"
						value={field.state.value}
						onBlur={field.handleBlur}
						onChange={(e) => field.handleChange(e.target.value)}
						disabled={mutation.isPending}
					/>
					<FieldError errors={field.state.meta.errors} />
				</Field>
			)}
		</form.Field>
	);

	const notesField = (
		<form.Field name="notes">
			{(field) => (
				<Field>
					<Label htmlFor={`qa-${field.name}`}>Notes</Label>
					<Input
						id={`qa-${field.name}`}
						placeholder="Optional note"
						value={field.state.value}
						onBlur={field.handleBlur}
						onChange={(e) => field.handleChange(e.target.value)}
						disabled={mutation.isPending}
					/>
					<FieldError errors={field.state.meta.errors} />
				</Field>
			)}
		</form.Field>
	);

	// Compact text field for the "Full details" onboarding section — same look as
	// the fields above, less repetition.
	const onboardingText = (
		name: keyof AddCustomerData,
		label: string,
		placeholder: string,
	) => (
		<form.Field name={name}>
			{(field) => (
				<Field>
					<Label htmlFor={`qa-${field.name}`}>
						{label} <span className="text-rose-600">*</span>
					</Label>
					<Input
						id={`qa-${field.name}`}
						placeholder={placeholder}
						value={String(field.state.value ?? "")}
						onBlur={field.handleBlur}
						onChange={(e) => field.handleChange(e.target.value)}
						disabled={mutation.isPending}
						data-testid={`addcust-${name}`}
					/>
					<FieldError errors={field.state.meta.errors} />
				</Field>
			)}
		</form.Field>
	);

	const fullDetailsFields = (
		<div className="space-y-4 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
			<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
				Onboarding details
			</p>
			{onboardingText("idPassportNo", "ID / Passport No.", "IC or passport")}
			<form.Field name="addressType">
				{(field) => (
					<Field>
						<Label>
							Address Type <span className="text-rose-600">*</span>
						</Label>
						<div className="flex gap-2">
							{(["home", "work"] as const).map((v) => (
								<button
									key={v}
									type="button"
									onClick={() => field.handleChange(v)}
									disabled={mutation.isPending}
									data-testid={`addcust-addressType-${v}`}
									className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize ${
										field.state.value === v
											? "border-[#0a0a0a] font-medium"
											: "border-[#e5e5e5] text-[#737373]"
									}`}
								>
									{v}
								</button>
							))}
						</div>
					</Field>
				)}
			</form.Field>
			{onboardingText("streetAddress", "Street Address", "Address")}
			<div className="grid grid-cols-2 gap-3">
				{onboardingText("city", "City", "City")}
				{onboardingText("state", "State", "State")}
			</div>
			<div className="grid grid-cols-2 gap-3">
				{onboardingText("country", "Country", "Country")}
				{onboardingText("postalCode", "Postal Code", "Postal code")}
			</div>
			<div className="border-t border-[#e5e5e5] pt-4">
				<p className="mb-3 text-[10px] font-bold tracking-widest uppercase text-[#737373]">
					Emergency contact
				</p>
				{onboardingText("emergencyContactName", "Name", "Full name")}
				<div className="mt-4 grid grid-cols-2 gap-3">
					{onboardingText(
						"emergencyContactRelationship",
						"Relationship",
						"e.g. Spouse",
					)}
					{onboardingText("emergencyContactPhone", "Phone", "Phone number")}
				</div>
			</div>
		</div>
	);

	// After a quick-add, offer to send the onboarding link before closing.
	if (created) {
		return (
			<div className="space-y-4" data-testid="addcust-created-panel">
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
					Customer created. They still need to complete their profile (ID,
					address, emergency contact).
				</div>
				{created.hasRealEmail ? (
					<p className="text-sm text-[#525252]">
						Send them a sign-in link — they'll set a password and complete
						onboarding themselves.
					</p>
				) : (
					<p className="text-sm text-[#525252]">
						No email on file. Add one from the customer's profile to send an
						onboarding link, or reopen this customer later.
					</p>
				)}
				<div className="flex justify-end gap-2 border-t border-[#e5e5e5] pt-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							form.reset();
							setCreated(null);
							onSuccess?.();
						}}
						data-testid="addcust-done-btn"
					>
						Done
					</Button>
					{created.hasRealEmail && (
						<Button
							type="button"
							className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
							disabled={sendLinkMutation.isPending}
							data-testid="addcust-send-link-btn"
							onClick={async () => {
								await sendLinkMutation.mutateAsync(created.profileId);
								form.reset();
								setCreated(null);
								onSuccess?.();
							}}
						>
							{sendLinkMutation.isPending ? (
								<>
									<Loader2 className="mr-2 size-4 animate-spin" />
									Sending…
								</>
							) : (
								<>
									<Mail className="mr-2 size-4" />
									Send onboarding link
								</>
							)}
						</Button>
					)}
				</div>
			</div>
		);
	}

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className={wide ? "@container max-w-3xl space-y-4" : "space-y-4"}
		>
			{/* Mode toggle — quick add vs full onboarding profile. */}
			<div className="flex gap-1 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-1">
				{(
					[
						["quick", "Quick add"],
						["full", "Full details"],
					] as const
				).map(([value, label]) => (
					<button
						key={value}
						type="button"
						onClick={() => setMode(value)}
						data-testid={`addcust-mode-${value}`}
						className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
							mode === value
								? "bg-white text-[#0a0a0a] shadow-sm"
								: "text-[#737373]"
						}`}
					>
						{label}
					</button>
				))}
			</div>
			<p className="text-xs text-[#737373]">
				{mode === "quick"
					? "Capture the essentials now — the customer completes their profile via a sign-in link."
					: "Capture the customer's full onboarding profile now (ID, address, emergency contact)."}
			</p>

			{wide ? (
				/* Two columns when the form has room, one when narrow. Capped at
				   two (via container query, not auto-fit) so a wide panel doesn't
				   sprawl the fields across four+ columns. */
				<div className="grid grid-cols-1 gap-x-5 gap-y-4 @md:grid-cols-2">
					{firstNameField}
					{lastNameField}
					{phoneField}
					{emailField}
					{branchField}
					{dobField}
					<div className="col-span-full">{notesField}</div>
				</div>
			) : (
				/* Stacked layout for the narrow modal dialog. */
				<>
					<div className="grid grid-cols-2 gap-3">
						{firstNameField}
						{lastNameField}
					</div>
					{phoneField}
					{emailField}
					{branchField}
					<div className="grid grid-cols-2 gap-3">
						{dobField}
						{notesField}
					</div>
				</>
			)}

			{mode === "full" && fullDetailsFields}

			{/* Footer */}
			<div
				className={`mt-2 flex gap-2 pt-4 border-t border-[#e5e5e5] ${onCancel || wide ? "justify-end" : ""}`}
			>
				{onCancel ? (
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							form.reset();
							onCancel();
						}}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
				) : null}
				<Button
					type="submit"
					disabled={mutation.isPending}
					className={`bg-[#0a0a0a] text-white hover:bg-[#262626] ${onCancel || wide ? "" : "w-full"}`}
				>
					{mutation.isPending ? (
						<>
							<Loader2 className="size-4 mr-2 animate-spin" />
							Creating…
						</>
					) : (
						<>
							<UserPlus className="size-4 mr-2" />
							Create Profile
						</>
					)}
				</Button>
			</div>
		</form>
	);
}

// ── props ─────────────────────────────────────────────────────────────────────

interface AddCustomerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	onSuccess?: () => void;
}

// ── dialog ────────────────────────────────────────────────────────────────────

export function AddCustomerDialog({
	open,
	onOpenChange,
	organizationId,
	onSuccess,
}: AddCustomerDialogProps) {
	const handleClose = () => onOpenChange(false);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				hideCloseButton
				className="sm:max-w-lg p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
			>
				{/* Header */}
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						CUSTOMER DIRECTORY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Add Customer
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Create a profile. If the customer has an email, send them a sign-in
						link from their profile afterwards.
					</DialogDescription>
				</DialogHeader>

				{/* Form */}
				<div className="px-6 pt-4 pb-6">
					<AddCustomerForm
						organizationId={organizationId}
						enabled={open}
						onCancel={handleClose}
						onSuccess={() => {
							onSuccess?.();
							handleClose();
						}}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
