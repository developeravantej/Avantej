import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, UserPlus } from "lucide-react";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";

// ── schemas ──────────────────────────────────────────────────────────────────

const quickAddSchema = z.object({
	firstName: z.string().min(1, "First name is required"),
	lastName: z.string().min(1, "Last name is required"),
	phone: z.string().min(1, "Phone number is required"),
	email: z.string().email("Invalid email").optional().or(z.literal("")),
	hierarchyScopeId: z.string().uuid("Please select a branch"),
	dateOfBirth: z.string().optional(),
	notes: z.string().optional(),
});

const onboardingSchema = z.object({
	email: z.string().email("Invalid email address"),
	hierarchyScopeId: z.string().uuid("Please select a branch"),
});

type QuickAddData = z.infer<typeof quickAddSchema>;
type OnboardingData = z.infer<typeof onboardingSchema>;

// ── shared helpers ────────────────────────────────────────────────────────────

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-sm text-destructive">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

interface HierarchyNode {
	id: string;
	name: string;
	type: string;
	depth: number;
	code?: string | null;
}

function useHierarchyNodes(organizationId: string, open: boolean) {
	return useQuery({
		queryKey: ["hierarchy-nodes", organizationId],
		queryFn: async () => {
			const result = await client.hierarchy.listNodes({ organizationId });
			return result.nodes as HierarchyNode[];
		},
		enabled: !!organizationId && open,
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

// ── props ─────────────────────────────────────────────────────────────────────

interface AddCustomerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	onSuccess?: () => void;
}

// ── Quick Add tab ─────────────────────────────────────────────────────────────

function QuickAddTab({
	organizationId,
	open,
	onSuccess,
	onClose,
}: {
	organizationId: string;
	open: boolean;
	onSuccess?: () => void;
	onClose: () => void;
}) {
	const { data: nodes, isLoading: isLoadingHierarchy } = useHierarchyNodes(
		organizationId,
		open,
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
		invalidate: [["customerDirectory", organizationId]],
		onSuccess: () => {
			form.reset();
			onSuccess?.();
			onClose();
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

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-4"
		>
			<div className="grid grid-cols-2 gap-3">
				<form.Field name="firstName">
					{(field) => (
						<div>
							<Label htmlFor={`qa-${field.name}`} className="block text-sm font-medium text-brand-primary-1">
								First Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id={`qa-${field.name}`}
								placeholder="Jane"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								disabled={mutation.isPending}
								className="mt-1"
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="lastName">
					{(field) => (
						<div>
							<Label htmlFor={`qa-${field.name}`} className="block text-sm font-medium text-brand-primary-1">
								Last Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id={`qa-${field.name}`}
								placeholder="Doe"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								disabled={mutation.isPending}
								className="mt-1"
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>
			</div>

			<form.Field name="phone">
				{(field) => (
					<div>
						<Label htmlFor={`qa-${field.name}`} className="block text-sm font-medium text-brand-primary-1">
							Phone Number <span className="text-destructive">*</span>
						</Label>
						<Input
							id={`qa-${field.name}`}
							type="tel"
							placeholder="+60 12-345 6789"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							disabled={mutation.isPending}
							className="mt-1"
						/>
						<FieldError errors={field.state.meta.errors} />
					</div>
				)}
			</form.Field>

			<form.Field name="email">
				{(field) => (
					<div>
						<Label htmlFor={`qa-${field.name}`} className="block text-sm font-medium text-brand-primary-1">
							Email <span className="text-[#737373] font-normal">(optional)</span>
						</Label>
						<Input
							id={`qa-${field.name}`}
							type="email"
							placeholder="jane@example.com"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							disabled={mutation.isPending}
							className="mt-1"
						/>
						<FieldError errors={field.state.meta.errors} />
					</div>
				)}
			</form.Field>

			<form.Field name="hierarchyScopeId">
				{(field) => (
					<div>
						<Label htmlFor={`qa-${field.name}`} className="block text-sm font-medium text-brand-primary-1">
							Branch / Scope <span className="text-destructive">*</span>
						</Label>
						{isLoadingHierarchy ? (
							<div className="flex items-center gap-2 mt-1 text-sm text-brand-secondary-1">
								<Loader2 className="size-4 animate-spin" />
								Loading…
							</div>
						) : (
							<Select
								value={field.state.value}
								onValueChange={(v) => field.handleChange(v)}
								disabled={mutation.isPending || clientScopes.length === 0}
							>
								<SelectTrigger id={`qa-${field.name}`} className="mt-1">
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
					</div>
				)}
			</form.Field>

			<div className="grid grid-cols-2 gap-3">
				<form.Field name="dateOfBirth">
					{(field) => (
						<div>
							<Label htmlFor={`qa-${field.name}`} className="block text-sm font-medium text-brand-primary-1">
								Date of Birth
							</Label>
							<Input
								id={`qa-${field.name}`}
								type="date"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								disabled={mutation.isPending}
								className="mt-1"
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="notes">
					{(field) => (
						<div>
							<Label htmlFor={`qa-${field.name}`} className="block text-sm font-medium text-brand-primary-1">
								Notes
							</Label>
							<Input
								id={`qa-${field.name}`}
								placeholder="Optional note"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								disabled={mutation.isPending}
								className="mt-1"
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>
			</div>

			<DialogFooter className="mt-6 flex justify-end gap-x-3">
				<Button
					type="button"
					variant="outline"
					onClick={() => {
						form.reset();
						onClose();
					}}
					disabled={mutation.isPending}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					disabled={mutation.isPending}
					className="bg-zinc-950 text-white hover:bg-black/90"
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
			</DialogFooter>
		</form>
	);
}

// ── Send Onboarding tab ───────────────────────────────────────────────────────

function SendOnboardingTab({
	organizationId,
	open,
	onSuccess,
	onClose,
}: {
	organizationId: string;
	open: boolean;
	onSuccess?: () => void;
	onClose: () => void;
}) {
	const { data: nodes, isLoading: isLoadingHierarchy } = useHierarchyNodes(
		organizationId,
		open,
	);

	const clientScopes = (nodes ?? []).filter((n) =>
		["branch", "area", "region", "country"].includes(n.type),
	);

	const mutation = useApiMutation({
		mutationFn: async (data: OnboardingData) => {
			const result = await client.invitations.create({
				organizationId,
				email: data.email,
				role: "client",
				hierarchyScopeId: data.hierarchyScopeId,
			});

			try {
				await client.invitations.sendEmail({
					invitation: {
						token: result.invitation.token,
						email: result.invitation.email ?? "",
						role: result.invitation.role,
					},
					organizationId: result.organizationId,
					organizationName: result.organizationName,
					inviterName: result.inviterName,
				});
			} catch (e) {
				console.warn("Onboarding email failed (invitation still created):", e);
			}

			return result;
		},
		successMessage: "Onboarding invitation sent",
		errorMessage: (err) => err.message || "Failed to send invitation",
		onSuccess: () => {
			form.reset();
			onSuccess?.();
			onClose();
		},
	});

	const form = useForm({
		defaultValues: { email: "", hierarchyScopeId: "" } as OnboardingData,
		validators: { onSubmit: onboardingSchema },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-4"
		>
			<form.Field name="email">
				{(field) => (
					<div>
						<Label htmlFor={`ob-${field.name}`} className="block text-sm font-medium text-brand-primary-1">
							Customer Email <span className="text-destructive">*</span>
						</Label>
						<Input
							id={`ob-${field.name}`}
							type="email"
							placeholder="customer@example.com"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							disabled={mutation.isPending}
							className="mt-1"
						/>
						<FieldError errors={field.state.meta.errors} />
					</div>
				)}
			</form.Field>

			<form.Field name="hierarchyScopeId">
				{(field) => (
					<div>
						<Label htmlFor={`ob-${field.name}`} className="block text-sm font-medium text-brand-primary-1">
							Branch / Scope <span className="text-destructive">*</span>
						</Label>
						{isLoadingHierarchy ? (
							<div className="flex items-center gap-2 mt-1 text-sm text-brand-secondary-1">
								<Loader2 className="size-4 animate-spin" />
								Loading…
							</div>
						) : (
							<Select
								value={field.state.value}
								onValueChange={(v) => field.handleChange(v)}
								disabled={mutation.isPending || clientScopes.length === 0}
							>
								<SelectTrigger id={`ob-${field.name}`} className="mt-1">
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
						<p className="text-xs text-brand-secondary-1 mt-1">
							Select the branch where this customer will be registered.
						</p>
					</div>
				)}
			</form.Field>

			<DialogFooter className="mt-6 flex justify-end gap-x-3">
				<Button
					type="button"
					variant="outline"
					onClick={() => {
						form.reset();
						onClose();
					}}
					disabled={mutation.isPending}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					disabled={mutation.isPending}
					className="bg-zinc-950 text-white hover:bg-black/90"
				>
					{mutation.isPending ? (
						<>
							<Loader2 className="size-4 mr-2 animate-spin" />
							Sending…
						</>
					) : (
						<>
							<Mail className="size-4 mr-2" />
							Send Invitation
						</>
					)}
				</Button>
			</DialogFooter>
		</form>
	);
}

// ── Root dialog ───────────────────────────────────────────────────────────────

export function AddCustomerDialog({
	open,
	onOpenChange,
	organizationId,
	onSuccess,
}: AddCustomerDialogProps) {
	const [tab, setTab] = useState<"quick-add" | "onboarding">("quick-add");

	const handleClose = () => {
		onOpenChange(false);
		setTab("quick-add");
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg rounded-2xl bg-white p-6">
				<DialogHeader className="mb-2">
					<DialogTitle className="text-lg font-medium leading-6 text-brand-primary-1">
						Add Customer
					</DialogTitle>
					<DialogDescription className="text-sm text-brand-secondary-1">
						Create a profile now or send the customer an onboarding link.
					</DialogDescription>
				</DialogHeader>

				<Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
					<TabsList className="grid w-full grid-cols-2 mb-4">
						<TabsTrigger value="quick-add">Quick Add</TabsTrigger>
						<TabsTrigger value="onboarding">Send Onboarding</TabsTrigger>
					</TabsList>

					<TabsContent value="quick-add">
						<QuickAddTab
							organizationId={organizationId}
							open={open}
							onSuccess={onSuccess}
							onClose={handleClose}
						/>
					</TabsContent>

					<TabsContent value="onboarding">
						<SendOnboardingTab
							organizationId={organizationId}
							open={open}
							onSuccess={onSuccess}
							onClose={handleClose}
						/>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
