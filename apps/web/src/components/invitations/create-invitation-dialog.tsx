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
import { Loader2, Mail } from "lucide-react";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";

const invitationSchema = z.object({
	email: z.string().email("Invalid email address"),
	role: z.enum(["admin", "trainer", "staff", "client"]),
	hierarchyScopeId: z.string().uuid("Please select a hierarchy scope"),
});

type InvitationFormData = z.infer<typeof invitationSchema>;

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-sm text-rose-600">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

interface CreateInvitationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	onSuccess?: () => void;
	/** When set, locks role to this value and hides the role selector. */
	lockedRole?: "admin" | "trainer" | "staff" | "client";
	/** Override the dialog title (e.g. "Add Customer"). */
	title?: string;
	/** Override the dialog description. */
	description?: string;
}

interface HierarchyNode {
	id: string;
	name: string;
	type: string;
	depth: number;
	parentId?: string | null;
	code?: string | null;
}

export function CreateInvitationDialog({
	open,
	onOpenChange,
	organizationId,
	onSuccess,
	lockedRole,
	title,
	description,
}: CreateInvitationDialogProps) {
	const createMutation = useApiMutation({
		mutationFn: async (data: InvitationFormData) => {
			const result = await client.invitations.create({
				organizationId,
				email: data.email,
				role: data.role,
				hierarchyScopeId: data.hierarchyScopeId,
			});

			// Email send is best-effort
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
				console.warn(
					"Invitation email failed to send (invitation still created):",
					e,
				);
			}

			return result;
		},
		successMessage: "Invitation sent successfully",
		errorMessage: (error) => `Failed to create invitation: ${error.message}`,
		onSuccess: () => {
			form.reset();
			onSuccess?.();
			onOpenChange(false);
		},
	});

	const form = useForm({
		defaultValues: {
			email: "",
			role: (lockedRole ?? "staff") as "admin" | "trainer" | "staff" | "client",
			hierarchyScopeId: "",
		} as InvitationFormData,
		validators: { onSubmit: invitationSchema },
		onSubmit: async ({ value }) => {
			await createMutation.mutateAsync(value);
		},
	});

	// Fetch hierarchy nodes for scope selection
	const { data: hierarchyData, isLoading: isLoadingHierarchy } = useQuery({
		queryKey: ["hierarchy-nodes", organizationId],
		queryFn: async () => {
			const result = await client.hierarchy.listNodes({ organizationId });
			return result.nodes;
		},
		enabled: !!organizationId && open,
		staleTime: 30 * 1000,
	});

	const hierarchyNodes: HierarchyNode[] = hierarchyData || [];

	const getScopeDisplayName = (node: HierarchyNode) => {
		const typeLabels: Record<string, string> = {
			organization: "Organization",
			country: "Country",
			region: "Region",
			area: "Area",
			branch: "Branch",
		};

		const typeLabel = typeLabels[node.type] || node.type;
		return `${typeLabel}: ${node.name}${node.code ? ` (${node.code})` : ""}`;
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						ACCESS CONTROL
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						{title ?? "Invite Member"}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{description ??
							"Send an invitation to join your organization. The invitee will receive an email with a link to accept the invitation."}
					</DialogDescription>
				</DialogHeader>

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					<div className="px-6 pt-4 pb-2 overflow-y-auto space-y-4">
						{/* Email */}
						<form.Field name="email">
							{(field) => (
								<div>
									<Label
										htmlFor={field.name}
										className="block text-sm font-medium text-brand-primary-1"
									>
										Email Address <span className="text-rose-600">*</span>
									</Label>
									<Input
										id={field.name}
										type="email"
										placeholder="user@example.com"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										disabled={createMutation.isPending}
										className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>

						{/* Role — hidden when locked */}
						{!lockedRole && (
							<form.Field name="role">
								{(field) => (
									<div>
										<Label
											htmlFor={field.name}
											className="block text-sm font-medium text-brand-primary-1"
										>
											Role <span className="text-rose-600">*</span>
										</Label>
										<Select
											value={field.state.value}
											onValueChange={(value) => {
												field.handleChange(
													value as "admin" | "trainer" | "staff" | "client",
												);
												// Reset hierarchy scope when role changes
												form.setFieldValue("hierarchyScopeId", "");
											}}
											disabled={createMutation.isPending}
										>
											<SelectTrigger
												id={field.name}
												className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
											>
												<SelectValue placeholder="Select role" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="admin">Admin</SelectItem>
												<SelectItem value="trainer">Trainer</SelectItem>
												<SelectItem value="staff">Staff</SelectItem>
												<SelectItem value="client">Client</SelectItem>
											</SelectContent>
										</Select>
										<FieldError errors={field.state.meta.errors} />
									</div>
								)}
							</form.Field>
						)}

						{/* Hierarchy Scope */}
						<form.Subscribe selector={(state) => state.values.role}>
							{(selectedRole) => {
								const availableScopes = hierarchyNodes.filter((node) => {
									if (selectedRole === "admin") {
										return node.type === "organization" && node.depth === 0;
									}
									return ["branch", "area", "region", "country"].includes(
										node.type,
									);
								});

								return (
									<form.Field name="hierarchyScopeId">
										{(field) => (
											<div>
												<Label
													htmlFor={field.name}
													className="block text-sm font-medium text-brand-primary-1"
												>
													Hierarchy Scope{" "}
													<span className="text-rose-600">*</span>
												</Label>
												{isLoadingHierarchy ? (
													<div className="flex items-center gap-2 mt-1 text-sm text-[#737373]">
														<Loader2 className="size-4 animate-spin" />
														Loading hierarchy…
													</div>
												) : (
													<Select
														value={field.state.value}
														onValueChange={(value) => field.handleChange(value)}
														disabled={
															createMutation.isPending ||
															availableScopes.length === 0
														}
													>
														<SelectTrigger
															id={field.name}
															className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
														>
															<SelectValue placeholder="Select hierarchy scope" />
														</SelectTrigger>
														<SelectContent>
															{availableScopes.length === 0 ? (
																<div className="px-2 py-1.5 text-sm text-[#737373]">
																	No available scopes for this role
																</div>
															) : (
																availableScopes.map((node) => (
																	<SelectItem key={node.id} value={node.id}>
																		{getScopeDisplayName(node)}
																	</SelectItem>
																))
															)}
														</SelectContent>
													</Select>
												)}
												<FieldError errors={field.state.meta.errors} />
												<p className="text-xs text-[#737373] mt-1">
													{selectedRole === "admin"
														? "Admins are assigned to the organization root for organization-wide access."
														: "Select the branch, area, region, or country where this member will have access."}
												</p>
											</div>
										)}
									</form.Field>
								);
							}}
						</form.Subscribe>
					</div>

					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								form.reset();
								onOpenChange(false);
							}}
							disabled={createMutation.isPending}
							className="border-brand-secondary-3 bg-white text-brand-primary-1 hover:bg-brand-secondary-3/50"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={createMutation.isPending}
							className="bg-[#0a0a0a] text-white hover:bg-[#262626] disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{createMutation.isPending ? (
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
			</DialogContent>
		</Dialog>
	);
}
