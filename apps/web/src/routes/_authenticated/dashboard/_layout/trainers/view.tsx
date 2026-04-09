import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useDebounce } from "@/hooks/useDebounce";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/tables/sales/view/data-table";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Users, Plus, Search, Edit, ChevronDown } from "lucide-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
	};

	const { data: membersData = [] as MemberListItem[], isLoading } = useQuery({
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
		reactivateMutation.isPending;

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

	const columns: ColumnDef<TrainerRow>[] = [
		{
			accessorKey: "displayName",
			header: "Name",
			cell: ({ row }) => {
				const display = row.original.displayName || row.original.name;
				return (
					<div>
						<span className="font-medium">{display}</span>
						{row.original.displayName && row.original.displayName !== row.original.name && (
							<p className="text-xs text-muted-foreground">{row.original.name}</p>
						)}
					</div>
				);
			},
		},
		{
			accessorKey: "email",
			header: "Email",
			cell: ({ row }) => <CopyableCell value={row.original.email} />,
		},
		{
			accessorKey: "specialization",
			header: "Specialization",
			cell: ({ row }) => (
				<span className="text-sm">
					{row.original.specialization ?? (
						<span className="text-muted-foreground">—</span>
					)}
				</span>
			),
		},
		{
			accessorKey: "phoneNumber",
			header: "Phone",
			cell: ({ row }) => <CopyableCell value={row.original.phoneNumber} />,
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => {
				const status = row.original.status;
				if (status === "active") {
					return <Badge variant="default">Active</Badge>;
				}
				if (status === "suspended") {
					return <Badge variant="destructive">Suspended</Badge>;
				}
				return (
					<Badge variant="outline" className="capitalize">
						{status}
					</Badge>
				);
			},
		},
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => {
				const trainer = row.original;
				const isActive = trainer.status === "active";
				const isSuspended = trainer.status === "suspended";
				return (
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => openEdit(trainer)}
							disabled={isMutating}
						>
							<Edit className="h-4 w-4 mr-1" />
							Edit
						</Button>
						{isActive && (
							<Button
								variant="ghost"
								size="sm"
								className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
								onClick={() => suspendMutation.mutate(trainer.id)}
								disabled={isMutating}
							>
								Suspend
							</Button>
						)}
						{isSuspended && (
							<Button
								variant="ghost"
								size="sm"
								className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
								onClick={() => reactivateMutation.mutate(trainer.id)}
								disabled={isMutating}
							>
								Reactivate
							</Button>
						)}
					</div>
				);
			},
		},
	];

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
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
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
				<div className="flex flex-col items-center justify-center py-20 gap-3">
					<Users className="h-12 w-12 text-muted-foreground/50" />
					<p className="text-lg font-medium text-foreground">No trainers found</p>
					<p className="text-sm text-muted-foreground">
						{debouncedSearch
							? "No trainers match your search. Try a different query."
							: "Add your first trainer to get started."}
					</p>
					{!debouncedSearch && (
						<Button onClick={openCreate} className="mt-2">
							<Plus className="h-4 w-4 mr-2" />
							Add Trainer
						</Button>
					)}
				</div>
			) : (
				<DataTable<TrainerRow, unknown> columns={columns} data={tableData} />
			)}

			{/* Create / Edit Sheet */}
			<Sheet
				open={sheetOpen}
				onOpenChange={(open) => {
					if (!open) closeSheet();
					else setSheetOpen(true);
				}}
			>
				<SheetContent className="w-full sm:max-w-lg overflow-y-auto">
					<SheetHeader>
						<SheetTitle>
							{editingMemberId ? "Edit Trainer" : "Add Trainer"}
						</SheetTitle>
						<SheetDescription>
							{editingMemberId
								? "Update this trainer's profile information."
								: "Add an existing user as a trainer in this organization."}
						</SheetDescription>
					</SheetHeader>

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
														{"  ".repeat(node.depth)}
														{node.name}
														<span className="ml-1 text-xs text-muted-foreground capitalize">
															({node.type})
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

						{/* ── Footer ───────────────────────────────────────────── */}
						<SheetFooter className="px-0 pt-4">
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
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		</div>
	);
}
