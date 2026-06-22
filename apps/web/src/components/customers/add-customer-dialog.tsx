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
import { Loader2, UserPlus } from "lucide-react";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";

// ── schema ────────────────────────────────────────────────────────────────────

const quickAddSchema = z.object({
	firstName: z.string().min(1, "First name is required"),
	lastName: z.string().min(1, "Last name is required"),
	phone: z.string().min(1, "Phone number is required"),
	email: z.string().email("Invalid email").optional().or(z.literal("")),
	hierarchyScopeId: z.string().uuid("Please select a branch"),
	dateOfBirth: z.string().optional(),
	notes: z.string().optional(),
});

type QuickAddData = z.infer<typeof quickAddSchema>;

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

	const mutation = useApiMutation({
		mutationFn: (data: QuickAddData) =>
			client.customerProfiles.createUnclaimed({
				organizationId,
				firstName: data.firstName,
				lastName: data.lastName,
				phone: data.phone,
				email: data.email || undefined,
				hierarchyScopeId: data.hierarchyScopeId,
				dateOfBirth: data.dateOfBirth || undefined,
				notes: data.notes || undefined,
			}),
		successMessage: "Customer profile created",
		errorMessage: (err) => err.message || "Failed to create customer",
		invalidate: [orpc.customerDirectory.list.key()],
		onSuccess: () => {
			form.reset();
			onSuccess?.();
		},
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
		} as QuickAddData,
		validators: { onSubmit: quickAddSchema },
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

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className={wide ? "@container max-w-3xl space-y-4" : "space-y-4"}
		>
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
