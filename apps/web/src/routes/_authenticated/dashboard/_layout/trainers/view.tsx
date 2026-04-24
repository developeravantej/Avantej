import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useDebounce } from "@/hooks/useDebounce";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TrainerAvailabilityEditor } from "@/components/trainers/trainer-availability-editor";
import { Button } from "@/components/ui/button";
import { StatusBadge, type CanonicalStatus } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Plus, Search, Edit, ChevronDown, Mail, Phone, Award } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatPrice } from "@/lib/money";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/trainers/view",
)({
	beforeLoad: async () => {
		await requirePermission("user_management:read");
	},
	component: TrainersView,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type TrainerRow = {
	id: string;
	userId: string;
	hierarchyScopeId: string;
	status: string;
	joinedAt: Date | string | null;
	name: string;
	email: string;
	trainerTierId?: string | null;
	// Profile fields (may be undefined if profile not yet fetched)
	displayName?: string | null;
	specialization?: string | null;
	phoneNumber?: string | null;
	bio?: string | null;
	certifications?: string[] | null;
};

type FormState = {
	// Member fields (create only)
	email: string;
	hierarchyScopeId: string;
	// Profile fields
	displayName: string;
	bio: string;
	specialization: string;
	phoneNumber: string;
	certifications: string; // comma-separated in the UI
};

const EMPTY_FORM: FormState = {
	email: "",
	hierarchyScopeId: "",
	displayName: "",
	bio: "",
	specialization: "",
	phoneNumber: "",
	certifications: "",
};

function getInitials(name: string) {
	return name
		.split(" ")
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

// ─── Page component ───────────────────────────────────────────────────────────

function TrainersView() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// Derive accessible hierarchy nodes from the user context (already fetched)
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const hierarchyNodes = currentOrg?.hierarchy?.nodes ?? [];

	// Search & debounce
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 300);

	// Sheet state
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);
	const [profileSectionOpen, setProfileSectionOpen] = useState(true);
	const [availabilitySectionOpen, setAvailabilitySectionOpen] = useState(false);
	const [servicesSectionOpen, setServicesSectionOpen] = useState(false);
	const [commissionsSectionOpen, setCommissionsSectionOpen] = useState(false);
	const [editingBufferServiceId, setEditingBufferServiceId] = useState<string | null>(null); // keyed by serviceId
	const [bufferInputValue, setBufferInputValue] = useState<string>("");
	const [selectedTrainer, setSelectedTrainer] = useState<TrainerRow | null>(null);

	// ── Queries ──────────────────────────────────────────────────────────────

	type MemberListItem = {
		id: string;
		userId: string;
		role: string;
		hierarchyScopeId: string;
		status: string;
		joinedAt: Date | string | null;
		name: string;
		email: string;
		trainerTierId?: string | null;
	};

	const { data: membersData = [] as MemberListItem[], isLoading, isError, refetch } = useQuery({
		queryKey: ["trainers", organizationId],
		queryFn: async () => {
			if (!organizationId) return [] as MemberListItem[];
			return client.members.list({
				organizationId,
				role: "trainer",
			});
		},
		enabled: !!organizationId,
	});

	// Fetch profiles for all trainers in parallel
	const { data: profilesMap = {} } = useQuery({
		queryKey: ["trainerProfiles", organizationId, membersData.map((m: MemberListItem) => m.id)],
		queryFn: async () => {
			if (!organizationId || membersData.length === 0) return {};
			const results = await Promise.allSettled(
				membersData.map((m: MemberListItem) =>
					client.memberProfiles.get({ organizationId, memberId: m.id }),
				),
			);
			const map: Record<
				string,
				{
					displayName?: string | null;
					specialization?: string | null;
					phoneNumber?: string | null;
					bio?: string | null;
					certifications?: string[] | null;
				}
			> = {};
			results.forEach((result, i) => {
				if (result.status === "fulfilled" && result.value) {
					map[membersData[i].id] = result.value;
				}
			});
			return map;
		},
		enabled: !!organizationId && membersData.length > 0,
	});

	const { data: trainerTiers = [] } = useQuery({
		queryKey: ["trainerTiers", organizationId, "active"],
		queryFn: () =>
			client.trainerTiers.list({ organizationId: organizationId!, includeInactive: false }),
		enabled: !!organizationId,
	});

	const { data: trainerServices = [] } = useQuery({
		queryKey: ["trainerServices", organizationId, editingMemberId],
		queryFn: () =>
			client.serviceMembers.listForMember({
				organizationId: organizationId!,
				memberId: editingMemberId!,
			}),
		enabled: !!organizationId && !!editingMemberId && servicesSectionOpen,
	});

	// All services for assignment checkboxes (lazy: only when servicesSectionOpen)
	const { data: allServices = [] } = useQuery({
		queryKey: ["allServices", organizationId],
		queryFn: () => client.services.list({ organizationId: organizationId!, isActive: true }),
		enabled: !!organizationId && !!editingMemberId && servicesSectionOpen,
	});

	const { data: allCategories = [] } = useQuery({
		queryKey: ["allCategories", organizationId],
		queryFn: () => client.serviceCategories.list({ organizationId: organizationId! }),
		enabled: !!organizationId && !!editingMemberId && servicesSectionOpen,
	});

	// Resolve the editing trainer's userId (cross-DB) for commission queries
	const editingTrainer = membersData.find(
		(m: MemberListItem) => m.id === editingMemberId,
	);
	const editingTrainerUserId = editingTrainer?.userId ?? null;

	// Commission ledger for the selected trainer (lazy: only when section is open)
	type CommissionRow = {
		id: string;
		createdAt: string | Date;
		appointmentId: string | null;
		salesOrderId: string | null;
		appointmentNumber?: string | null;
		salesOrderNumber?: string | null;
		serviceName?: string | null;
		calculatedAmount: number;
		status: string;
	};
	const { data: trainerCommissionsData, isLoading: commissionsLoading } = useQuery({
		queryKey: ["trainerCommissions", organizationId, editingTrainerUserId],
		queryFn: () =>
			client.commissionSplits.listLedger({
				organizationId: organizationId!,
				staffId: editingTrainerUserId!,
				limit: 20,
				offset: 0,
			}),
		enabled: !!organizationId && !!editingTrainerUserId && commissionsSectionOpen,
	});
	const trainerCommissions: CommissionRow[] =
		(trainerCommissionsData as { rows?: CommissionRow[] } | undefined)?.rows ?? [];

	// ── Mutations ────────────────────────────────────────────────────────────

	const createMutation = useMutation({
		mutationFn: async (values: FormState) => {
			if (!organizationId) throw new Error("No organization selected");
			// Step 1: Create the member with role "trainer"
			const result = await client.members.create({
				organizationId,
				email: values.email,
				role: "trainer",
				hierarchyScopeId: values.hierarchyScopeId,
			});
			// Step 2: Upsert profile data
			const memberId = result.member.id;
			const certs = values.certifications
				? values.certifications
						.split(",")
						.map((c) => c.trim())
						.filter(Boolean)
				: undefined;
			await client.memberProfiles.upsert({
				organizationId,
				memberId,
				displayName: values.displayName || undefined,
				bio: values.bio || undefined,
				specialization: values.specialization || undefined,
				phoneNumber: values.phoneNumber || undefined,
				certifications: certs && certs.length > 0 ? certs : undefined,
			});
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["trainers", organizationId] });
			queryClient.invalidateQueries({
				queryKey: ["trainerProfiles", organizationId],
			});
			toast.success("Trainer added successfully.");
			closeSheet();
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to add trainer.",
			);
		},
	});

	const updateProfileMutation = useMutation({
		mutationFn: async ({
			memberId,
			values,
		}: { memberId: string; values: FormState }) => {
			if (!organizationId) throw new Error("No organization selected");
			const certs = values.certifications
				? values.certifications
						.split(",")
						.map((c) => c.trim())
						.filter(Boolean)
				: undefined;
			return client.memberProfiles.upsert({
				organizationId,
				memberId,
				displayName: values.displayName || undefined,
				bio: values.bio || undefined,
				specialization: values.specialization || undefined,
				phoneNumber: values.phoneNumber || undefined,
				certifications: certs && certs.length > 0 ? certs : undefined,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["trainerProfiles", organizationId],
			});
			toast.success("Trainer profile updated.");
			closeSheet();
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to update trainer profile.",
			);
		},
	});

	const suspendMutation = useMutation({
		mutationFn: (memberId: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.members.suspend({ organizationId, memberId });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["trainers", organizationId] });
			toast.success("Trainer suspended.");
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to suspend trainer.",
			);
		},
	});

	const reactivateMutation = useMutation({
		mutationFn: (memberId: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.members.reactivate({ organizationId, memberId });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["trainers", organizationId] });
			toast.success("Trainer reactivated.");
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to reactivate trainer.",
			);
		},
	});

	const updateBufferMutation = useMutation({
		mutationFn: ({
			serviceId,
			bufferTimeMinutes,
		}: {
			serviceId: string;
			bufferTimeMinutes: number | null;
		}) =>
			client.serviceMembers.updateBuffer({
				organizationId: organizationId!,
				memberId: editingMemberId!,
				serviceId,
				bufferTimeMinutes,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["trainerServices", organizationId, editingMemberId] });
			setEditingBufferServiceId(null);
			toast.success("Buffer time updated.");
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to update buffer."),
	});

	const assignMutation = useMutation({
		mutationFn: (serviceId: string) =>
			client.serviceMembers.assign({
				organizationId: organizationId!,
				memberId: editingMemberId!,
				serviceId,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["trainerServices", organizationId, editingMemberId] });
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to assign service."),
	});

	const removeMutation = useMutation({
		mutationFn: (serviceId: string) =>
			client.serviceMembers.remove({
				organizationId: organizationId!,
				memberId: editingMemberId!,
				serviceId,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["trainerServices", organizationId, editingMemberId] });
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to remove service."),
	});

	const assignTierMutation = useMutation({
		mutationFn: ({ memberId, tierId }: { memberId: string; tierId: string | null }) =>
			client.trainerTiers.assignToMember({ organizationId: organizationId!, memberId, tierId }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["trainers", organizationId] });
			toast.success("Tier assigned");
		},
		onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to assign tier"),
	});

	// ── Sheet helpers ────────────────────────────────────────────────────────

	function openCreate() {
		setEditingMemberId(null);
		setForm(EMPTY_FORM);
		setProfileSectionOpen(true);
		setSheetOpen(true);
	}

	function openEdit(row: TrainerRow) {
		setEditingMemberId(row.id);
		const certs = row.certifications?.join(", ") ?? "";
		setForm({
			email: row.email,
			hierarchyScopeId: row.hierarchyScopeId,
			displayName: row.displayName ?? "",
			bio: row.bio ?? "",
			specialization: row.specialization ?? "",
			phoneNumber: row.phoneNumber ?? "",
			certifications: certs,
		});
		setProfileSectionOpen(true);
		setSheetOpen(true);
	}

	function closeSheet() {
		setSheetOpen(false);
		setEditingMemberId(null);
		setForm(EMPTY_FORM);
		setServicesSectionOpen(false);
		setCommissionsSectionOpen(false);
		setEditingBufferServiceId(null);
		setBufferInputValue("");
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (editingMemberId) {
			updateProfileMutation.mutate({ memberId: editingMemberId, values: form });
		} else {
			if (!form.email.trim()) {
				toast.error("Email is required.");
				return;
			}
			if (!form.hierarchyScopeId) {
				toast.error("Hierarchy scope is required.");
				return;
			}
			createMutation.mutate(form);
		}
	}

	const isMutating =
		createMutation.isPending ||
		updateProfileMutation.isPending ||
		suspendMutation.isPending ||
		reactivateMutation.isPending ||
		updateBufferMutation.isPending ||
		assignMutation.isPending ||
		removeMutation.isPending ||
		assignTierMutation.isPending;

	// ── Table data & columns ─────────────────────────────────────────────────

	// Merge member list with profiles and apply client-side search
	const tableData: TrainerRow[] = membersData
		.map((m: MemberListItem) => {
			const profile = profilesMap[m.id];
			return {
				id: m.id,
				userId: m.userId,
				hierarchyScopeId: m.hierarchyScopeId,
				status: m.status,
				joinedAt: m.joinedAt,
				name: m.name,
				email: m.email,
				trainerTierId: m.trainerTierId ?? null,
				displayName: profile?.displayName ?? null,
				specialization: profile?.specialization ?? null,
				phoneNumber: profile?.phoneNumber ?? null,
				bio: profile?.bio ?? null,
				certifications: profile?.certifications ?? null,
			};
		})
		.filter((row: TrainerRow) => {
			if (!debouncedSearch) return true;
			const q = debouncedSearch.toLowerCase();
			return (
				row.name.toLowerCase().includes(q) ||
				row.email.toLowerCase().includes(q) ||
				(row.displayName?.toLowerCase().includes(q) ?? false) ||
				(row.specialization?.toLowerCase().includes(q) ?? false)
			);
		});

	// ── Guard: no org selected ───────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to manage trainers.
			</div>
		);
	}

	// ── Guard: loading ───────────────────────────────────────────────────────

	if (isLoading) {
		return <PageLoader />;
	}

	if (isError) {
		return (
			<div className="p-6">
				<StatusCallout variant="error" title="Couldn't load trainers" onRetry={() => refetch()} />
			</div>
		);
	}

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<Users className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold font-heading">Trainers</h1>
						<p className="text-muted-foreground text-sm">
							Manage trainers, their profiles, and account status.
						</p>
					</div>
				</div>
				<Button onClick={openCreate} disabled={isMutating}>
					<Plus className="h-4 w-4 mr-2" />
					Add Trainer
				</Button>
			</div>

			{/* Search bar */}
			<div className="relative w-72">
				<Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search name, email, or specialization..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="pl-9"
				/>
			</div>

			<Separator />

			{/* Empty state */}
			{tableData.length === 0 && !isLoading ? (
				<EmptyState
					icon={Users}
					title="No trainers found"
					description={
						debouncedSearch
							? "No trainers match your search. Try a different query."
							: "Add your first trainer to get started."
					}
					action={!debouncedSearch ? { label: "Add Trainer", onClick: openCreate } : undefined}
					context={debouncedSearch ? "search" : "empty"}
				/>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{tableData.map((trainer) => {
						const initials = getInitials(trainer.displayName ?? trainer.name);
						const isActive = trainer.status === "active";
						const isSuspended = trainer.status === "suspended";
						return (
							<div
								key={trainer.id}
								role="button"
								tabIndex={0}
								onClick={() => setSelectedTrainer(trainer)}
								onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedTrainer(trainer); }}
								className="flex flex-col rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-all duration-150 overflow-hidden cursor-pointer"
							>
								<div className="flex items-start gap-3 px-4 pt-4 pb-3">
									<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-secondary-2 text-brand-primary-1 text-sm font-bold">
										{initials}
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-semibold text-foreground truncate">
											{trainer.displayName ?? trainer.name}
										</p>
										{trainer.specialization ? (
											<p className="text-xs text-muted-foreground truncate mt-0.5">{trainer.specialization}</p>
										) : (
											<p className="text-xs text-muted-foreground truncate mt-0.5">No specialization</p>
										)}
										<p className="text-xs text-muted-foreground truncate mt-0.5">{trainer.email}</p>
									</div>
									<StatusBadge
										status={isActive ? "active" : "inactive"}
										label={isActive ? "Active" : isSuspended ? "Suspended" : trainer.status}
										className="shrink-0 self-start text-xs"
									/>
								</div>
								<div className={cn("h-0.5 w-full shrink-0", isActive ? "bg-emerald-400" : "bg-rose-400")} />
								{/* Tier selector */}
								<div
									className="px-4 py-2 border-t border-border"
									onClick={(e) => e.stopPropagation()}
									onKeyDown={(e) => e.stopPropagation()}
								>
									<select
										className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-card focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
										value={trainer.trainerTierId ?? ""}
										disabled={assignTierMutation.isPending}
										onChange={(e) => {
											const tierId = e.target.value || null;
											assignTierMutation.mutate({ memberId: trainer.id, tierId });
										}}
									>
										<option value="">No tier</option>
										{(trainerTiers as any[]).map((tier) => (
											<option key={tier.id} value={tier.id}>
												{tier.name}
											</option>
										))}
									</select>
								</div>
							</div>
						);
					})}
				</div>
			)}
			{/* —— Trainer Detail Dialog —— */}
			<Dialog open={selectedTrainer !== null} onOpenChange={(open) => { if (!open) setSelectedTrainer(null); }}>
				<DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl gap-0">
					{selectedTrainer && (() => {
						const trainer = selectedTrainer;
						const initials = getInitials(trainer.displayName ?? trainer.name);
						const isActive = trainer.status === "active";
						const isSuspended = trainer.status === "suspended";
						return (
							<>
								{/* Header */}
								<div className="px-6 pt-6 pb-5 border-b border-border">
									<div className="flex items-start gap-4">
										<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-secondary-2 text-brand-primary-1 text-xl font-bold">
											{initials}
										</div>
										<div className="flex-1 min-w-0 pt-1">
											<DialogHeader className="p-0 space-y-0">
												<DialogTitle className="text-base font-bold text-foreground">
													{trainer.displayName ?? trainer.name}
												</DialogTitle>
												{trainer.specialization && (
													<DialogDescription className="text-xs text-muted-foreground mt-0.5">
														{trainer.specialization}
													</DialogDescription>
												)}
											</DialogHeader>
											<div className="mt-2">
												<StatusBadge
													status={isActive ? "active" : "inactive"}
													label={isActive ? "Active" : isSuspended ? "Suspended" : trainer.status}
													className="text-xs"
												/>
											</div>
										</div>
									</div>
								</div>

								{/* Detail rows */}
								<div className="px-5 py-4 space-y-1 bg-white">
									<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-accent transition-colors">
										<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-secondary-3">
											<Mail className="h-3.5 w-3.5 text-muted-foreground" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-[11px] text-muted-foreground font-medium">Email</p>
											<p className="text-sm text-foreground font-medium">{trainer.email}</p>
										</div>
									</div>
									{trainer.phoneNumber && (
										<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-accent transition-colors">
											<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-secondary-3">
												<Phone className="h-3.5 w-3.5 text-muted-foreground" />
											</div>
											<div className="flex-1 min-w-0">
												<p className="text-[11px] text-muted-foreground font-medium">Phone</p>
												<p className="text-sm text-foreground font-medium">{trainer.phoneNumber}</p>
											</div>
										</div>
									)}
									{trainer.bio && (
										<div className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-accent transition-colors">
											<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-secondary-3">
												<Users className="h-3.5 w-3.5 text-muted-foreground" />
											</div>
											<div className="flex-1 min-w-0">
												<p className="text-[11px] text-muted-foreground font-medium">Bio</p>
												<p className="text-sm text-foreground leading-relaxed">{trainer.bio}</p>
											</div>
										</div>
									)}
									{trainer.certifications && trainer.certifications.length > 0 && (
										<div className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-accent transition-colors">
											<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-secondary-3">
												<Award className="h-3.5 w-3.5 text-muted-foreground" />
											</div>
											<div className="flex-1 min-w-0">
												<p className="text-[11px] text-muted-foreground font-medium">Certifications</p>
												<div className="flex flex-wrap gap-1.5 mt-1">
													{trainer.certifications.map((cert) => (
														<span key={cert} className="inline-flex items-center rounded-full bg-brand-secondary-3 px-2.5 py-0.5 text-xs text-foreground font-medium">
															{cert}
														</span>
													))}
												</div>
											</div>
										</div>
									)}
								</div>

								{/* Footer actions */}
								<div className="px-5 pb-5 pt-0 bg-white flex flex-col gap-2">
									<button
										type="button"
										onClick={() => { setSelectedTrainer(null); openEdit(trainer); }}
										className="flex items-center justify-center gap-2 w-full rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
									>
										<Edit className="h-3.5 w-3.5" />
										Edit Profile
									</button>
									{isActive && (
										<button
											type="button"
											onClick={() => { setSelectedTrainer(null); suspendMutation.mutate(trainer.id); }}
											disabled={isMutating}
											className="flex items-center justify-center gap-2 w-full rounded-xl border border-border py-2.5 text-sm font-medium text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
										>
											Suspend
										</button>
									)}
									{isSuspended && (
										<button
											type="button"
											onClick={() => { setSelectedTrainer(null); reactivateMutation.mutate(trainer.id); }}
											disabled={isMutating}
											className="flex items-center justify-center gap-2 w-full rounded-xl border border-border py-2.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
										>
											Reactivate
										</button>
									)}
								</div>
							</>
						);
					})()}
				</DialogContent>
			</Dialog>


			{/* Create / Edit Dialog */}
			<Dialog
				open={sheetOpen}
				onOpenChange={(open) => {
					if (!open) closeSheet();
					else setSheetOpen(true);
				}}
			>
				<DialogContent className="sm:max-w-lg overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{editingMemberId ? "Edit Trainer" : "Add Trainer"}
						</DialogTitle>
						<DialogDescription>
							{editingMemberId
								? "Update this trainer's profile information."
								: "Add an existing user as a trainer in this organization."}
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 py-4">
						{/* ── Member Info (create only) ─────────────────────────── */}
						{!editingMemberId && (
							<>
								<div className="space-y-1">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Account
									</p>
									<Separator />
								</div>

								{/* Email */}
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="trainer-email">
										Email <span className="text-destructive">*</span>
									</Label>
									<Input
										id="trainer-email"
										type="email"
										placeholder="trainer@example.com"
										value={form.email}
										onChange={(e) =>
											setForm((f) => ({ ...f, email: e.target.value }))
										}
										required={!editingMemberId}
										autoComplete="off"
									/>
									<p className="text-xs text-muted-foreground">
										The user must already be registered in the system.
									</p>
								</div>

								{/* Hierarchy Scope */}
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="trainer-scope">
										Hierarchy Scope <span className="text-destructive">*</span>
									</Label>
									<Select
										value={form.hierarchyScopeId}
										onValueChange={(v) =>
											setForm((f) => ({ ...f, hierarchyScopeId: v }))
										}
									>
										<SelectTrigger id="trainer-scope">
											<SelectValue placeholder="Select a location..." />
										</SelectTrigger>
										<SelectContent>
											{hierarchyNodes.length === 0 ? (
												<SelectItem value="" disabled>
													No nodes available
												</SelectItem>
											) : (
												hierarchyNodes.map((node) => (
													<SelectItem key={node.id} value={node.id}>
														<span style={{ paddingLeft: `${node.depth * 12}px` }}>
															{node.name}
															<span className="ml-1 text-xs text-muted-foreground capitalize">
																({node.type})
															</span>
														</span>
													</SelectItem>
												))
											)}
										</SelectContent>
									</Select>
								</div>
							</>
						)}

						{/* ── Profile ──────────────────────────────────────────── */}
						<Collapsible
							open={profileSectionOpen}
							onOpenChange={setProfileSectionOpen}
						>
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex w-full items-center justify-between pt-1"
								>
									<div className="space-y-0.5 text-left">
										<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
											Profile
										</p>
										<Separator />
									</div>
									<ChevronDown
										className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
											profileSectionOpen ? "rotate-180" : ""
										}`}
									/>
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent className="flex flex-col gap-4 pt-3">
								{/* Display Name */}
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="trainer-display-name">Display Name</Label>
									<Input
										id="trainer-display-name"
										placeholder="Public-facing name (e.g. Coach Alex)"
										value={form.displayName}
										onChange={(e) =>
											setForm((f) => ({ ...f, displayName: e.target.value }))
										}
									/>
								</div>

								{/* Specialization */}
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="trainer-specialization">Specialization</Label>
									<Input
										id="trainer-specialization"
										placeholder="e.g. Strength & Conditioning"
										value={form.specialization}
										onChange={(e) =>
											setForm((f) => ({
												...f,
												specialization: e.target.value,
											}))
										}
									/>
								</div>

								{/* Phone Number */}
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="trainer-phone">Phone Number</Label>
									<Input
										id="trainer-phone"
										type="tel"
										placeholder="+60 12-345 6789"
										value={form.phoneNumber}
										onChange={(e) =>
											setForm((f) => ({ ...f, phoneNumber: e.target.value }))
										}
									/>
								</div>

								{/* Bio */}
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="trainer-bio">Bio</Label>
									<Textarea
										id="trainer-bio"
										placeholder="A short description of the trainer..."
										rows={3}
										value={form.bio}
										onChange={(e) =>
											setForm((f) => ({ ...f, bio: e.target.value }))
										}
									/>
								</div>

								{/* Certifications */}
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="trainer-certs">Certifications</Label>
									<Input
										id="trainer-certs"
										placeholder="e.g. ACE, NASM, CrossFit L2"
										value={form.certifications}
										onChange={(e) =>
											setForm((f) => ({
												...f,
												certifications: e.target.value,
											}))
										}
									/>
									<p className="text-xs text-muted-foreground">
										Separate multiple certifications with commas.
									</p>
								</div>
							</CollapsibleContent>
						</Collapsible>

						{/* ── Availability (edit only) ─────────────────────────── */}
						{editingMemberId && (
							<Collapsible open={availabilitySectionOpen} onOpenChange={setAvailabilitySectionOpen}>
								<CollapsibleTrigger asChild>
									<button type="button" className="flex w-full items-center justify-between pt-1">
										<div className="space-y-0.5 text-left">
											<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
												Weekly Availability
											</p>
											<Separator />
										</div>
										<ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200",
											availabilitySectionOpen && "rotate-180"
										)} />
									</button>
								</CollapsibleTrigger>
								<CollapsibleContent className="pt-3">
									<TrainerAvailabilityEditor
										organizationId={organizationId!}
										trainerId={editingMemberId}
										onSaved={() => toast.success("Availability saved")}
									/>
								</CollapsibleContent>
							</Collapsible>
						)}

						{/* ── Services (edit only) ─────────────────────────── */}
						{editingMemberId && (
							<Collapsible open={servicesSectionOpen} onOpenChange={setServicesSectionOpen}>
								<CollapsibleTrigger asChild>
									<button
										type="button"
										className="flex w-full items-center justify-between pt-1"
									>
										<div className="space-y-0.5 text-left">
											<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
												Services
											</p>
											<Separator />
										</div>
										<ChevronDown
											className={cn(
												"h-4 w-4 text-muted-foreground transition-transform duration-200",
												servicesSectionOpen && "rotate-180"
											)}
										/>
									</button>
								</CollapsibleTrigger>
								<CollapsibleContent className="pt-3">
									{(() => {
										const assignedServiceIds = new Set(trainerServices.map((s) => s.serviceId));

										// Group services by category
										type ServiceGroup = {
											categoryId: string | null;
											categoryName: string;
											services: typeof allServices;
										};
										const groupMap = new Map<string, ServiceGroup>();
										for (const svc of allServices) {
											const key = svc.categoryId ?? "__none__";
											if (!groupMap.has(key)) {
												const cat = allCategories.find((c) => c.id === svc.categoryId);
												groupMap.set(key, {
													categoryId: svc.categoryId ?? null,
													categoryName: cat?.name ?? "Uncategorized",
													services: [],
												});
											}
											groupMap.get(key)!.services.push(svc);
										}
										const groups = Array.from(groupMap.values());

										if (groups.length === 0) {
											return (
												<p className="text-sm text-muted-foreground py-2">
													No services available.
												</p>
											);
										}

										return (
											<div className="space-y-4">
												{groups.map((group) => {
													const assignedCount = group.services.filter((s) =>
														assignedServiceIds.has(s.id)
													).length;
													const allAssigned = assignedCount === group.services.length;
													const someAssigned = assignedCount > 0 && !allAssigned;

													return (
														<div key={group.categoryId ?? "__none__"}>
															{/* Category row */}
															<div className="flex items-center gap-2 py-1">
																<Checkbox
																	checked={allAssigned ? true : someAssigned ? "indeterminate" : false}
																	onCheckedChange={async (checked) => {
																		if (checked) {
																			const toAssign = group.services.filter(
																				(s) => !assignedServiceIds.has(s.id)
																			);
																			await Promise.allSettled(
																				toAssign.map((s) => assignMutation.mutateAsync(s.id))
																			);
																		} else {
																			const toRemove = group.services.filter(
																				(s) => assignedServiceIds.has(s.id)
																			);
																			await Promise.allSettled(
																				toRemove.map((s) => removeMutation.mutateAsync(s.id))
																			);
																		}
																		queryClient.invalidateQueries({
																			queryKey: ["trainerServices", organizationId, editingMemberId],
																		});
																	}}
																	disabled={assignMutation.isPending || removeMutation.isPending}
																/>
																<span className="text-sm font-medium">{group.categoryName}</span>
																<span className="text-xs text-muted-foreground">
																	({assignedCount}/{group.services.length})
																</span>
															</div>

															{/* Service rows */}
															<div className="ml-6 space-y-0.5">
																{group.services.map((svc) => {
																	const isAssigned = assignedServiceIds.has(svc.id);
																	const assignedDetails = trainerServices.find(
																		(ts) => ts.serviceId === svc.id
																	);
																	return (
																		<div key={svc.id}>
																			<div className="flex items-center gap-2 py-1">
																				<Checkbox
																					checked={isAssigned}
																					onCheckedChange={(checked) => {
																						if (checked) {
																							assignMutation.mutate(svc.id);
																						} else {
																							removeMutation.mutate(svc.id);
																							if (editingBufferServiceId === svc.id) {
																								setEditingBufferServiceId(null);
																							}
																						}
																					}}
																					disabled={assignMutation.isPending || removeMutation.isPending}
																				/>
																				<span className="text-sm">{svc.name}</span>
																			</div>
																			{/* Buffer editor — only for assigned services */}
																			{isAssigned && (
																				<div className="ml-6 flex items-center gap-2 py-1 border-b last:border-0">
																					{editingBufferServiceId === svc.id ? (
																						<div className="flex items-center gap-1.5">
																							<Input
																								type="number"
																								min={0}
																								max={480}
																								className="w-20 h-7 text-sm"
																								placeholder="min"
																								value={bufferInputValue}
																								onChange={(e) =>
																									setBufferInputValue(e.target.value)
																								}
																							/>
																							<Button
																								type="button"
																								size="sm"
																								variant="default"
																								className="h-7 px-2 text-xs"
																								onClick={() => {
																									const parsed = parseInt(bufferInputValue, 10);
																									const val: number | null =
																										bufferInputValue === "" || isNaN(parsed)
																											? null
																											: parsed;
																									updateBufferMutation.mutate({
																										serviceId: svc.id,
																										bufferTimeMinutes: val,
																									});
																								}}
																								disabled={updateBufferMutation.isPending}
																							>
																								Save
																							</Button>
																							<Button
																								type="button"
																								size="sm"
																								variant="ghost"
																								className="h-7 px-2 text-xs"
																								onClick={() => setEditingBufferServiceId(null)}
																							>
																								Cancel
																							</Button>
																						</div>
																					) : (
																						<div className="flex items-center gap-2">
																							<span className="text-xs text-muted-foreground">
																								Buffer:{" "}
																								{assignedDetails?.bufferTimeMinutes != null
																									? `${assignedDetails.bufferTimeMinutes} min`
																									: "Using default"}
																							</span>
																							<Button
																								type="button"
																								size="sm"
																								variant="ghost"
																								className="h-7 px-2"
																								onClick={() => {
																									setEditingBufferServiceId(svc.id);
																									setBufferInputValue(
																										assignedDetails?.bufferTimeMinutes?.toString() ?? ""
																									);
																								}}
																							>
																								<Edit className="h-3 w-3" />
																							</Button>
																						</div>
																					)}
																				</div>
																			)}
																		</div>
																	);
																})}
															</div>
														</div>
													);
												})}
											</div>
										);
									})()}
								</CollapsibleContent>
							</Collapsible>
						)}

						{/* ── Commissions (edit only, read-only) ───────────────── */}
						{editingMemberId && (
							<Collapsible
								open={commissionsSectionOpen}
								onOpenChange={setCommissionsSectionOpen}
							>
								<CollapsibleTrigger asChild>
									<button
										type="button"
										className="flex w-full items-center justify-between pt-1"
									>
										<div className="space-y-0.5 text-left">
											<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
												Commissions
											</p>
											<Separator />
										</div>
										<ChevronDown
											className={cn(
												"h-4 w-4 text-muted-foreground transition-transform duration-200",
												commissionsSectionOpen && "rotate-180",
											)}
										/>
									</button>
								</CollapsibleTrigger>
								<CollapsibleContent className="pt-3">
									{commissionsLoading ? (
										<p className="text-sm text-muted-foreground py-2">
											Loading commissions…
										</p>
									) : trainerCommissions.length === 0 ? (
										<p className="text-sm text-muted-foreground py-2">
											No commission records found.
										</p>
									) : (
										<div className="overflow-x-auto">
											<table className="w-full text-sm">
												<thead>
													<tr className="border-b text-left">
														<th className="pb-1.5 pr-3 font-medium text-muted-foreground text-xs">
															Date
														</th>
														<th className="pb-1.5 pr-3 font-medium text-muted-foreground text-xs">
															Source
														</th>
														<th className="pb-1.5 pr-3 font-medium text-muted-foreground text-xs">
															Amount
														</th>
														<th className="pb-1.5 font-medium text-muted-foreground text-xs">
															Status
														</th>
													</tr>
												</thead>
												<tbody>
													{trainerCommissions.map((c) => {
														const dateStr = c.createdAt
															? new Date(c.createdAt).toLocaleDateString("en-MY")
															: "—";
														const source = c.serviceName
															? c.serviceName
															: c.appointmentNumber
																? `Appt ${c.appointmentNumber.slice(0, 8)}`
																: c.salesOrderNumber
																	? `Sale ${c.salesOrderNumber}`
																	: "—";
														return (
															<tr key={c.id} className="border-b last:border-0">
																<td className="py-1.5 pr-3 text-muted-foreground text-xs whitespace-nowrap">
																	{dateStr}
																</td>
																<td className="py-1.5 pr-3 text-xs max-w-[120px] truncate">
																	{source}
																</td>
																<td className="py-1.5 pr-3 tabular-nums text-xs whitespace-nowrap">
																	{formatPrice(c.calculatedAmount, "MYR")}
																</td>
																<td className="py-1.5">
																	<StatusBadge status={c.status as CanonicalStatus} />
																</td>
															</tr>
														);
													})}
												</tbody>
											</table>
										</div>
									)}
								</CollapsibleContent>
							</Collapsible>
						)}

						{/* ── Footer ───────────────────────────────────────────── */}
						<DialogFooter className="px-0 pt-4">
							<Button
								type="button"
								variant="outline"
								onClick={closeSheet}
								disabled={isMutating}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isMutating}>
								{isMutating
									? "Saving..."
									: editingMemberId
										? "Save Changes"
										: "Add Trainer"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
