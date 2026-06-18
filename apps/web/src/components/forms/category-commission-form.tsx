import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/useApiMutation";
import { Plus, Trash2 } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { client, orpc } from "@/utils/orpc";
import { centsToRm, rmToCents } from "@/lib/money";
import { useUserContext } from "@/hooks/useUserContext";

// Local string-literal aliases — mirrors @avantej-core/types (dist not rebuilt yet)
type CommissionRoleType = "trainer" | "sales" | "marketing" | "referrer";
type CommissionBasis = "delivery_total" | "gross_order" | "net_order" | "flat";
type CommissionPaymentType = "fixed" | "variable";
type CommissionPoolPolicy = "separate" | "shared";

// ─── Delivery tab types (existing) ────────────────────────────────────────────

interface CategoryCommissionFormProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	categoryId: string;
	categoryName: string;
	organizationId: string;
}

type SlotEntry = {
	slotIndex: number;
	label: string;
	weightageBasisPoints: number;
};
type RateEntry = { trainerTierId: string; amount: number };
type ConditionEntry = {
	conditionIndex: number;
	operator: "lt" | "lte" | "gt" | "gte" | "eq" | "between";
	threshold: number;
	thresholdMax?: number;
	label?: string;
	rates: RateEntry[];
};

// ─── Track tab types (new) ────────────────────────────────────────────────────

/** Local form state for a single commission track (non-Delivery). */
type TrackFormState = {
	/** undefined = new (not yet saved); string = existing track id */
	id: string | undefined;
	roleType: CommissionRoleType;
	basis: CommissionBasis;
	paymentType: CommissionPaymentType;
	poolPolicy: CommissionPoolPolicy;
	maxBeneficiaries: number;
	/** Rates per tier: { tierId → amount (RM for fixed, % for variable) } */
	rates: Array<{ tierId: string; amount: number }>;
	isActive: boolean;
};

const ROLE_LABELS: Record<CommissionRoleType, string> = {
	trainer: "Operation",
	sales: "Sales",
	marketing: "Marketing",
	referrer: "Referral",
};

const ADDABLE_ROLE_TYPES: CommissionRoleType[] = [
	"sales",
	"marketing",
	"referrer",
];

const BASIS_OPTIONS: Array<{
	value: CommissionBasis;
	label: string;
	desc: string;
}> = [
	{
		value: "gross_order",
		label: "Gross",
		desc: "Total order before discount/tax",
	},
	{
		value: "net_order",
		label: "Net (default)",
		desc: "After discount, before tax",
	},
	{ value: "flat", label: "Flat", desc: "Fixed amount per sale" },
];

const SLOT_COLORS = [
	"bg-blue-500",
	"bg-emerald-500",
	"bg-amber-500",
	"bg-violet-500",
	"bg-rose-500",
];

function conditionDescription(c: ConditionEntry): string {
	const op = c.operator;
	if (op === "between")
		return `When attendees between ${c.threshold} and ${c.thresholdMax ?? "?"}`;
	if (op === "lt") return `When attendees < ${c.threshold}`;
	if (op === "lte") return `When attendees ≤ ${c.threshold}`;
	if (op === "gt") return `When attendees > ${c.threshold}`;
	if (op === "gte") return `When attendees ≥ ${c.threshold}`;
	if (op === "eq") return `When attendees = ${c.threshold}`;
	return "";
}

function makeDefaultTrack(
	roleType: CommissionRoleType,
	tiers: Array<{ id: string }>,
): TrackFormState {
	return {
		id: undefined,
		roleType,
		basis: "net_order",
		paymentType: "variable",
		poolPolicy: "separate",
		maxBeneficiaries: 1,
		// Origination tracks use a SINGLE rate per track (no per-tier breakdown).
		// Keyed against a representative tier id only because the rates table
		// requires one; the engine reads the first rate row regardless of tier.
		rates: tiers.length ? [{ tierId: tiers[0].id, amount: 0 }] : [],
		isActive: true,
	};
}

// ─── Track tab panel ─────────────────────────────────────────────────────────

function TrackTabPanel({
	track,
	tiers,
	canEdit,
	onChange,
}: {
	track: TrackFormState;
	tiers: Array<{ id: string; name: string }>;
	canEdit: boolean;
	onChange: (patch: Partial<TrackFormState>) => void;
}) {
	const unitLabel = track.paymentType === "fixed" ? "RM" : "%";

	return (
		<div className="flex flex-col gap-4 py-2">
			{/* Basis */}
			<div className="flex flex-col gap-2">
				<Label className="text-sm font-medium">Calculation Basis</Label>
				<div className="grid grid-cols-3 gap-2">
					{BASIS_OPTIONS.map((opt) => (
						<button
							key={opt.value}
							type="button"
							disabled={!canEdit}
							onClick={() => onChange({ basis: opt.value })}
							className={`flex flex-col gap-0.5 rounded-lg border p-2.5 text-left transition-all disabled:opacity-50 ${
								track.basis === opt.value
									? "border-primary bg-primary/5 ring-1 ring-primary"
									: "border-[#e5e5e5] hover:border-[#737373]/40"
							}`}
						>
							<span className="text-xs font-semibold">{opt.label}</span>
							<span className="text-[10px] text-[#737373] leading-tight">
								{opt.desc}
							</span>
						</button>
					))}
				</div>
			</div>

			<Separator />

			{/* Payment type + Stacking */}
			<div className="grid grid-cols-2 gap-4">
				<div className="flex flex-col gap-2">
					<Label className="text-sm font-medium">Rate Type</Label>
					<RadioGroup
						value={track.paymentType}
						onValueChange={(v) =>
							onChange({ paymentType: v as CommissionPaymentType })
						}
						className="flex gap-3"
					>
						{(["fixed", "variable"] as const).map((type) => (
							<label
								key={type}
								htmlFor={`pt-${track.roleType}-${type}`}
								className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
									track.paymentType === type
										? "border-primary bg-primary/5"
										: "border-[#e5e5e5] hover:border-[#737373]/40"
								} ${!canEdit ? "pointer-events-none opacity-50" : ""}`}
							>
								<RadioGroupItem
									value={type}
									id={`pt-${track.roleType}-${type}`}
									disabled={!canEdit}
								/>
								<span className="font-medium">
									{type === "fixed" ? "Fixed RM" : "Variable %"}
								</span>
							</label>
						))}
					</RadioGroup>
				</div>

				<div className="flex flex-col gap-2">
					<Label className="text-sm font-medium">Stacking</Label>
					<RadioGroup
						value={track.poolPolicy}
						onValueChange={(v) =>
							onChange({ poolPolicy: v as CommissionPoolPolicy })
						}
						className="flex gap-3"
					>
						{(["separate", "shared"] as const).map((policy) => (
							<label
								key={policy}
								htmlFor={`pp-${track.roleType}-${policy}`}
								className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
									track.poolPolicy === policy
										? "border-primary bg-primary/5"
										: "border-[#e5e5e5] hover:border-[#737373]/40"
								} ${!canEdit ? "pointer-events-none opacity-50" : ""}`}
							>
								<RadioGroupItem
									value={policy}
									id={`pp-${track.roleType}-${policy}`}
									disabled={!canEdit}
								/>
								<span className="font-medium capitalize">{policy}</span>
							</label>
						))}
					</RadioGroup>
				</div>
			</div>

			<Separator />

			{/* Single rate — origination tracks pay ONE rate per sale (no tier breakdown) */}
			<div className="flex flex-col gap-2">
				<Label className="text-sm font-medium">Commission Rate</Label>
				<div className="flex items-center gap-2">
					<Input
						type="number"
						min={0}
						step={0.01}
						value={track.rates[0]?.amount ?? 0}
						disabled={!canEdit}
						onChange={(e) => {
							const val = parseFloat(e.target.value || "0");
							onChange({
								rates: [
									{
										tierId: track.rates[0]?.tierId ?? tiers[0]?.id ?? "",
										amount: val,
									},
								],
							});
						}}
						className="w-40 text-right"
					/>
					<span className="text-sm text-[#737373]">
						{unitLabel}
						{track.paymentType === "variable" ? " of order" : " per sale"}
					</span>
				</div>
				<p className="text-xs text-[#737373]">
					Single rate paid to{" "}
					{track.roleType === "sales"
						? "the closer (Sold by)"
						: "the lead source"}{" "}
					on each sale — no per-tier breakdown.
				</p>
			</div>

			{/* Active toggle */}
			{track.id && (
				<div className="flex items-center gap-3 pt-1">
					<Switch
						checked={track.isActive}
						onCheckedChange={(v) => onChange({ isActive: v })}
						id={`active-${track.roleType}`}
						disabled={!canEdit}
					/>
					<Label
						htmlFor={`active-${track.roleType}`}
						className="cursor-pointer text-sm"
					>
						Track active
					</Label>
				</div>
			)}
		</div>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level dialog with deep closure dependencies; extraction deferred to dedicated refactor
export function CategoryCommissionForm({
	open,
	onOpenChange,
	categoryId,
	categoryName,
	organizationId,
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars; reducer would not improve readability
}: CategoryCommissionFormProps) {
	const qc = useQueryClient();
	const { hasPermission } = useUserContext();

	// Permissions
	const canCreate = hasPermission("commission_track_management:create");
	const canUpdate = hasPermission("commission_track_management:update");

	// ── Active tab ─────────────────────────────────────────────────────────────
	const [activeTab, setActiveTab] = useState<string>("delivery");

	// ── Delivery tab state (existing) ─────────────────────────────────────────
	const [paymentType, setPaymentType] = useState<"fixed" | "variable">("fixed");
	const [isConditional, setIsConditional] = useState(false);
	const [maxCoaches, setMaxCoaches] = useState(1);
	const [slots, setSlots] = useState<SlotEntry[]>([
		{ slotIndex: 0, label: "Head Coach", weightageBasisPoints: 10000 },
	]);
	const [rates, setRates] = useState<RateEntry[]>([]);
	const [conditions, setConditions] = useState<ConditionEntry[]>([]);

	// ── Commission tracks state (new tabs) ────────────────────────────────────
	// Tracks keyed by roleType
	const [trackForms, setTrackForms] = useState<
		Map<CommissionRoleType, TrackFormState>
	>(new Map());
	// Which role types currently have a tab open
	const [openRoleTypes, setOpenRoleTypes] = useState<CommissionRoleType[]>([]);

	// ── Data queries ───────────────────────────────────────────────────────────
	const { data: existingConfig, isLoading: isLoadingConfig } = useQuery({
		queryKey: ["categoryCommission", organizationId, categoryId],
		queryFn: () =>
			client.categoryCommission.getByCategory({ organizationId, categoryId }),
		enabled: open && !!organizationId && !!categoryId,
	});

	const { data: tiers = [] } = useQuery({
		queryKey: ["trainerTiers", organizationId, "active"],
		queryFn: () =>
			client.trainerTiers.list({ organizationId, includeInactive: false }),
		enabled: open && !!organizationId,
	});

	const { data: existingTracks = [] } = useQuery({
		queryKey: ["commissionTracks", organizationId, categoryId],
		queryFn: () => client.commissionTracks.list({ organizationId, categoryId }),
		enabled:
			open && !!organizationId && !!categoryId && (canCreate || canUpdate),
	});

	// ── Prefill delivery form from existing config ─────────────────────────────
	// react-doctor-disable-next-line react-doctor/no-cascading-set-state -- form prefill from loaded config
	useEffect(() => {
		if (!existingConfig) return;
		const {
			config,
			slots: apiSlots,
			rates: apiRates,
			conditions: apiConditions,
		} = existingConfig;
		setPaymentType((config.paymentType ?? "fixed") as "fixed" | "variable");
		setIsConditional(config.isConditional ?? false);
		setMaxCoaches(config.maxCoaches ?? 1);
		setSlots(
			(apiSlots ?? []).map((s) => ({
				slotIndex: s.slotIndex,
				label: s.label,
				weightageBasisPoints: s.weightageBasisPoints,
			})),
		);
		if (!config.isConditional) {
			setRates(
				(apiRates ?? []).map((r) => ({
					trainerTierId: r.trainerTierId,
					amount: Number(centsToRm(r.amount)),
				})),
			);
			setConditions([]);
		} else {
			setRates([]);
			setConditions(
				(apiConditions ?? []).map(({ condition, rates: cr }) => ({
					conditionIndex: condition.conditionIndex,
					operator: condition.operator as ConditionEntry["operator"],
					threshold: condition.threshold,
					thresholdMax: condition.thresholdMax ?? undefined,
					label: condition.label ?? undefined,
					rates: (cr ?? []).map((r) => ({
						trainerTierId: r.trainerTierId,
						amount: Number(centsToRm(r.amount)),
					})),
				})),
			);
		}
	}, [existingConfig]);

	useEffect(() => {
		if (tiers.length === 0 || rates.length > 0) return;
		setRates(tiers.map((t) => ({ trainerTierId: t.id, amount: 0 })));
	}, [tiers]);

	// ── Prefill track tabs from existing tracks ────────────────────────────────
	useEffect(() => {
		if (!existingTracks || existingTracks.length === 0) return;
		const newMap = new Map<CommissionRoleType, TrackFormState>();
		const newOpen: CommissionRoleType[] = [];

		for (const entry of existingTracks) {
			const track = entry.track ?? entry;
			const trackRates: Array<{ tierId: string; amount: number }> =
				entry.rates ?? [];
			const roleType = track.roleType as CommissionRoleType;
			if (roleType === "trainer") continue; // Delivery is handled separately
			const formState: TrackFormState = {
				id: track.id,
				roleType,
				basis: track.basis as CommissionBasis,
				paymentType: track.paymentType as CommissionPaymentType,
				poolPolicy: track.poolPolicy as CommissionPoolPolicy,
				maxBeneficiaries: track.maxBeneficiaries,
				// Single rate — take the first stored rate row (engine reads first row).
				rates: (() => {
					const first = trackRates[0];
					const storedAmount = first?.amount ?? 0;
					const displayAmount =
						track.paymentType === "fixed"
							? Number(centsToRm(storedAmount))
							: storedAmount / 100; // bps → %
					const tierId = first?.tierId ?? tiers[0]?.id ?? "";
					return tierId ? [{ tierId, amount: displayAmount }] : [];
				})(),
				isActive: track.isActive ?? true,
			};
			newMap.set(roleType, formState);
			newOpen.push(roleType);
		}

		setTrackForms(newMap);
		setOpenRoleTypes(newOpen);
	}, [existingTracks, tiers]);

	// ── Delivery mutations ─────────────────────────────────────────────────────
	const upsertMutation = useApiMutation({
		mutationFn: (
			payload: Parameters<typeof client.categoryCommission.upsert>[0],
		) => client.categoryCommission.upsert(payload),
		successMessage: "Commission config saved",
		errorMessage: (err) => err.message || "Failed to save",
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["categoryCommission", organizationId, categoryId],
			});
		},
	});

	// ── Track mutations ────────────────────────────────────────────────────────
	const upsertTrackMutation = useApiMutation({
		mutationFn: async (form: TrackFormState) => {
			const ct = client.commissionTracks;
			// 1. Upsert the track
			const track = await ct.upsertTrack({
				organizationId,
				id: form.id,
				categoryId,
				scope: "category",
				roleType: form.roleType,
				trigger: "on_sale",
				basis: form.basis,
				paymentType: form.paymentType,
				poolPolicy: form.poolPolicy,
				maxBeneficiaries: form.maxBeneficiaries,
				isActive: form.isActive,
			});

			// 2. Set rates
			await ct.setTrackRates({
				organizationId,
				trackId: track.id,
				rates: form.rates.map((r: { tierId: string; amount: number }) => ({
					tierId: r.tierId,
					amount:
						form.paymentType === "fixed"
							? rmToCents(r.amount) // RM → cents
							: Math.round(r.amount * 100), // % → basis points
				})),
			});

			return track;
		},
		successMessage: "Track saved",
		errorMessage: (err) => err.message || "Failed to save track",
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["commissionTracks", organizationId, categoryId],
			});
		},
	});

	// ── Submit: delivery ───────────────────────────────────────────────────────
	function handleSubmitDelivery() {
		const totalBp = slots.reduce((s, sl) => s + sl.weightageBasisPoints, 0);
		if (totalBp !== 10000) {
			toast.error("Slot weightages must total 100%");
			return;
		}
		if (!isConditional && rates.length === 0) {
			toast.error("At least one rate is required");
			return;
		}
		if (isConditional && conditions.length === 0) {
			toast.error("At least one condition is required");
			return;
		}
		upsertMutation.mutate({
			organizationId,
			categoryId,
			paymentType,
			isConditional,
			maxCoaches,
			slots,
			rates: isConditional
				? undefined
				: rates.map((r) => ({ ...r, amount: rmToCents(r.amount) })),
			conditions: isConditional
				? conditions.map((c) => ({
						...c,
						rates: c.rates.map((r) => ({ ...r, amount: rmToCents(r.amount) })),
					}))
				: undefined,
		});
	}

	// ── Submit: track tab ──────────────────────────────────────────────────────
	function handleSubmitTrack(roleType: CommissionRoleType) {
		const form = trackForms.get(roleType);
		if (!form) return;
		upsertTrackMutation.mutate(form);
	}

	// ── Delivery slot helpers ──────────────────────────────────────────────────
	function addSlot() {
		setSlots((prev) => [
			...prev,
			{ slotIndex: prev.length, label: "Assistant", weightageBasisPoints: 0 },
		]);
	}

	function removeSlot(index: number) {
		setSlots((prev) =>
			prev.reduce<SlotEntry[]>((acc, sl, i) => {
				if (i === index) return acc;
				acc.push({ ...sl, slotIndex: acc.length });
				return acc;
			}, []),
		);
	}

	function updateSlot(
		index: number,
		field: keyof SlotEntry,
		value: string | number,
	) {
		setSlots((prev) =>
			prev.map((sl, i) => (i === index ? { ...sl, [field]: value } : sl)),
		);
	}

	function updateRate(tierId: string, amount: number) {
		setRates((prev) =>
			prev.map((r) => (r.trainerTierId === tierId ? { ...r, amount } : r)),
		);
	}

	function addCondition() {
		setConditions((prev) => [
			...prev,
			{
				conditionIndex: prev.length,
				operator: "gte",
				threshold: 0,
				label: "",
				rates: tiers.map((t) => ({ trainerTierId: t.id, amount: 0 })),
			},
		]);
	}

	function removeCondition(index: number) {
		setConditions((prev) =>
			prev.reduce<ConditionEntry[]>((acc, c, i) => {
				if (i === index) return acc;
				acc.push({ ...c, conditionIndex: acc.length });
				return acc;
			}, []),
		);
	}

	function updateCondition(
		index: number,
		field: keyof Omit<ConditionEntry, "rates">,
		value: unknown,
	) {
		setConditions((prev) =>
			prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
		);
	}

	function updateConditionRate(
		conditionIndex: number,
		tierId: string,
		amount: number,
	) {
		setConditions((prev) =>
			prev.map((c, i) =>
				i === conditionIndex
					? {
							...c,
							rates: c.rates.map((r) =>
								r.trainerTierId === tierId ? { ...r, amount } : r,
							),
						}
					: c,
			),
		);
	}

	// ── Track helpers ──────────────────────────────────────────────────────────
	function addTrackTab(roleType: CommissionRoleType) {
		if (!openRoleTypes.includes(roleType)) {
			const newForm = makeDefaultTrack(roleType, tiers);
			setTrackForms((prev) => new Map(prev).set(roleType, newForm));
			setOpenRoleTypes((prev) => [...prev, roleType]);
		}
		setActiveTab(roleType);
	}

	function updateTrackForm(
		roleType: CommissionRoleType,
		patch: Partial<TrackFormState>,
	) {
		setTrackForms((prev) => {
			const existing = prev.get(roleType);
			if (!existing) return prev;
			return new Map(prev).set(roleType, { ...existing, ...patch });
		});
	}

	// ── Derived ────────────────────────────────────────────────────────────────
	const totalWeightagePercent =
		slots.reduce((s, sl) => s + sl.weightageBasisPoints, 0) / 100;
	const weightageOk = totalWeightagePercent === 100;
	const unitLabel = paymentType === "fixed" ? "RM" : "%";
	const isDeliveryTab = activeTab === "delivery";
	const activeTrackRoleType = isDeliveryTab
		? null
		: (activeTab as CommissionRoleType);
	const activeTrackForm = activeTrackRoleType
		? trackForms.get(activeTrackRoleType)
		: null;

	// ── Save handler (dispatches to delivery or track) ─────────────────────────
	function handleSave() {
		if (isDeliveryTab) {
			handleSubmitDelivery();
		} else if (activeTrackRoleType) {
			handleSubmitTrack(activeTrackRoleType);
		}
	}

	const isSaving = upsertMutation.isPending || upsertTrackMutation.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-2xl p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
								COMMISSION SUMMARY
							</p>
							<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
								Commission Config
							</DialogTitle>
							<DialogDescription className="text-sm text-[#737373]">
								{categoryName}
							</DialogDescription>
						</div>
						{!isLoadingConfig &&
							(existingConfig ? (
								<Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">
									Configured
								</Badge>
							) : (
								<Badge variant="outline" className="text-[#737373] shrink-0">
									No config yet
								</Badge>
							))}
					</div>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					{isLoadingConfig ? (
						<div className="flex items-center justify-center py-20 text-sm text-[#737373]">
							Loading…
						</div>
					) : (
						<div className="flex flex-col gap-3 overflow-hidden min-h-0">
							{/* ── Tab bar ─────────────────────────────────────────────────── */}
							<div className="flex items-center gap-2 flex-wrap">
								<Tabs
									value={activeTab}
									onValueChange={(value) => {
										if (
											value !== "delivery" &&
											!openRoleTypes.includes(value as CommissionRoleType)
										) {
											// lazily initialise the track form on first visit
											addTrackTab(value as CommissionRoleType);
										} else {
											setActiveTab(value);
										}
									}}
									className="flex-1"
								>
									<TabsList className="h-auto flex-wrap gap-1 p-1">
										<TabsTrigger
											value="delivery"
											className="text-xs px-3 py-1.5"
										>
											Operation
										</TabsTrigger>
										{ADDABLE_ROLE_TYPES.map((roleType) => (
											<TabsTrigger
												key={roleType}
												value={roleType}
												className="text-xs px-3 py-1.5"
											>
												{ROLE_LABELS[roleType]}
											</TabsTrigger>
										))}
									</TabsList>
								</Tabs>
							</div>

							{/* ── Tab content ─────────────────────────────────────────────── */}
							<div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-0">
								{/* Delivery tab */}
								{activeTab === "delivery" && (
									<div className="flex flex-col gap-5">
										<div className="rounded-lg border bg-white p-4 flex flex-col gap-3">
											<Label className="text-sm font-medium">
												Payment Type
											</Label>
											<RadioGroup
												value={paymentType}
												onValueChange={(v) =>
													setPaymentType(v as "fixed" | "variable")
												}
												className="grid grid-cols-2 gap-3"
											>
												{(["fixed", "variable"] as const).map((type) => (
													<label
														key={type}
														htmlFor={`pt-${type}`}
														className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-all ${
															paymentType === type
																? "ring-2 ring-primary border-primary"
																: "border-[#e5e5e5] hover:border-[#737373]/40"
														}`}
													>
														<div className="flex items-center gap-2">
															<RadioGroupItem value={type} id={`pt-${type}`} />
															<span className="text-sm font-medium">
																{type === "fixed" ? "Fixed RM" : "Variable %"}
															</span>
														</div>
														<p className="text-xs text-[#737373] pl-6">
															{type === "fixed"
																? "Flat RM amount per session per trainer tier"
																: "Percentage of sale price per trainer tier"}
														</p>
													</label>
												))}
											</RadioGroup>
										</div>

										<Separator />

										<div className="rounded-lg border bg-white p-4 flex flex-col gap-4">
											<div className="flex items-center justify-between">
												<Label className="text-sm font-medium">
													Coach Slots
												</Label>
												<Badge
													className={
														weightageOk
															? "bg-emerald-100 text-emerald-700 border-emerald-200"
															: "bg-red-100 text-red-700 border-red-200"
													}
												>
													{totalWeightagePercent.toFixed(0)}%
												</Badge>
											</div>

											{slots.length > 0 && (
												<div className="flex h-2 w-full rounded-full overflow-hidden bg-[#f3f3f3]">
													{slots.map((sl, i) => (
														<div
															key={sl.slotIndex}
															className={`${SLOT_COLORS[i % SLOT_COLORS.length]} transition-all`}
															style={{
																width: `${(sl.weightageBasisPoints / 10000) * 100}%`,
															}}
														/>
													))}
												</div>
											)}

											<div className="flex flex-col gap-2">
												{slots.map((slot, i) => (
													<div
														key={slot.slotIndex}
														className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2"
													>
														<Input
															value={slot.label}
															onChange={(e) =>
																updateSlot(i, "label", e.target.value)
															}
															placeholder="Label"
														/>
														<div className="relative">
															<Input
																type="number"
																min={0}
																max={100}
																step={0.01}
																value={(
																	slot.weightageBasisPoints / 100
																).toFixed(2)}
																onChange={(e) =>
																	updateSlot(
																		i,
																		"weightageBasisPoints",
																		Math.round(
																			parseFloat(e.target.value || "0") * 100,
																		),
																	)
																}
																className="pr-6"
															/>
															<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#737373]">
																%
															</span>
														</div>
														<Button
															size="sm"
															variant="ghost"
															onClick={() => removeSlot(i)}
															disabled={slots.length === 1}
															className="size-8 p-0"
														>
															<Trash2 className="size-3.5" />
														</Button>
													</div>
												))}
											</div>

											<Button
												size="sm"
												variant="outline"
												onClick={addSlot}
												className="w-fit"
											>
												<Plus className="mr-2 size-3.5" />
												Add Slot
											</Button>

											<Separator />

											<div className="flex flex-col gap-1.5">
												<Label className="text-sm font-medium">
													Max Coaches per Session
												</Label>
												<Input
													type="number"
													min={1}
													max={10}
													value={maxCoaches}
													onChange={(e) =>
														setMaxCoaches(parseInt(e.target.value, 10) || 1)
													}
													className="w-24"
												/>
												<p className="text-xs text-[#737373]">
													Maximum simultaneous coach assignments per
													appointment.
												</p>
											</div>
										</div>

										<Separator />

										<div className="flex items-center gap-3">
											<Switch
												checked={isConditional}
												onCheckedChange={setIsConditional}
												id="conditional"
											/>
											<div>
												<Label htmlFor="conditional" className="cursor-pointer">
													Rate depends on attendee count
												</Label>
												{isConditional && (
													<p className="text-xs text-[#737373] mt-0.5">
														For POS sales, the first condition (lowest index)
														will be applied automatically.
													</p>
												)}
											</div>
										</div>

										{!isConditional && (
											<div className="rounded-lg border bg-white p-4 flex flex-col gap-3">
												<Label className="text-sm font-medium">
													Rates by Trainer Tier
												</Label>
												{tiers.length === 0 ? (
													<p className="text-sm text-[#737373]">
														No active trainer tiers found.
													</p>
												) : (
													<div className="divide-y divide-[#e5e5e5]">
														{tiers.map((tier) => {
															const rate = rates.find(
																(r) => r.trainerTierId === tier.id,
															);
															return (
																<div
																	key={tier.id}
																	className="flex items-center gap-3 py-2"
																>
																	<span className="flex-1 text-sm font-medium">
																		{tier.name}
																	</span>
																	<div className="flex items-center gap-2">
																		<Input
																			type="number"
																			min={0}
																			step={0.01}
																			value={rate?.amount ?? 0}
																			onChange={(e) =>
																				updateRate(
																					tier.id,
																					parseFloat(e.target.value || "0"),
																				)
																			}
																			className="w-28 text-right"
																		/>
																		<span className="w-6 text-xs text-[#737373]">
																			{unitLabel}
																		</span>
																	</div>
																</div>
															);
														})}
													</div>
												)}
											</div>
										)}

										{isConditional && (
											<div className="flex flex-col gap-4">
												<div className="flex items-center justify-between">
													<Label className="text-sm font-medium">
														Conditions
													</Label>
													<Button
														size="sm"
														variant="outline"
														onClick={addCondition}
													>
														<Plus className="mr-2 size-3.5" />
														Add Condition
													</Button>
												</div>

												{conditions.length === 0 && (
													<p className="text-sm text-[#737373]">
														No conditions yet. Add one above.
													</p>
												)}

												<div className="flex flex-col gap-4">
													{conditions.map((condition, ci) => (
														<div
															key={condition.conditionIndex}
															className="rounded-lg border bg-white p-4 flex flex-col gap-4"
														>
															<div className="flex items-center justify-between">
																<div className="flex items-center gap-2">
																	<Badge variant="outline" className="text-xs">
																		Condition {ci + 1}
																	</Badge>
																	<span className="text-xs text-[#737373]">
																		{conditionDescription(condition)}
																	</span>
																</div>
																<Button
																	size="sm"
																	variant="ghost"
																	onClick={() => removeCondition(ci)}
																	className="size-7 p-0"
																>
																	<Trash2 className="size-3.5" />
																</Button>
															</div>

															<div className="flex flex-wrap items-end gap-3">
																<div className="flex flex-col gap-1">
																	<Label className="text-xs">Operator</Label>
																	<Select
																		value={condition.operator}
																		onValueChange={(v) =>
																			updateCondition(
																				ci,
																				"operator",
																				v as ConditionEntry["operator"],
																			)
																		}
																	>
																		<SelectTrigger className="w-32">
																			<SelectValue />
																		</SelectTrigger>
																		<SelectContent>
																			<SelectItem value="lt">
																				Less than
																			</SelectItem>
																			<SelectItem value="lte">
																				At most
																			</SelectItem>
																			<SelectItem value="gt">
																				Greater than
																			</SelectItem>
																			<SelectItem value="gte">
																				At least
																			</SelectItem>
																			<SelectItem value="eq">
																				Equal to
																			</SelectItem>
																			<SelectItem value="between">
																				Between
																			</SelectItem>
																		</SelectContent>
																	</Select>
																</div>

																<div className="flex flex-col gap-1">
																	<Label className="text-xs">Threshold</Label>
																	<Input
																		type="number"
																		min={0}
																		value={condition.threshold}
																		onChange={(e) =>
																			updateCondition(
																				ci,
																				"threshold",
																				parseInt(e.target.value, 10) || 0,
																			)
																		}
																		className="w-20"
																	/>
																</div>

																{condition.operator === "between" && (
																	<div className="flex flex-col gap-1">
																		<Label className="text-xs">Max</Label>
																		<Input
																			type="number"
																			min={0}
																			value={condition.thresholdMax ?? 0}
																			onChange={(e) =>
																				updateCondition(
																					ci,
																					"thresholdMax",
																					parseInt(e.target.value, 10) || 0,
																				)
																			}
																			className="w-20"
																		/>
																	</div>
																)}

																<div className="flex flex-col gap-1">
																	<Label className="text-xs">
																		Label (optional)
																	</Label>
																	<Input
																		value={condition.label ?? ""}
																		onChange={(e) =>
																			updateCondition(
																				ci,
																				"label",
																				e.target.value,
																			)
																		}
																		placeholder="e.g. Small class"
																		className="w-36"
																	/>
																</div>
															</div>

															{tiers.length > 0 && (
																<div className="flex flex-col gap-2">
																	<Label className="text-xs font-medium">
																		Rates by Trainer Tier
																	</Label>
																	<div className="divide-y divide-[#e5e5e5]">
																		{tiers.map((tier) => {
																			const rate = condition.rates.find(
																				(r) => r.trainerTierId === tier.id,
																			);
																			return (
																				<div
																					key={tier.id}
																					className="flex items-center gap-3 py-2"
																				>
																					<span className="flex-1 text-sm font-medium">
																						{tier.name}
																					</span>
																					<div className="flex items-center gap-2">
																						<Input
																							type="number"
																							min={0}
																							step={0.01}
																							value={rate?.amount ?? 0}
																							onChange={(e) =>
																								updateConditionRate(
																									ci,
																									tier.id,
																									parseFloat(
																										e.target.value || "0",
																									),
																								)
																							}
																							className="w-28 text-right"
																						/>
																						<span className="w-6 text-xs text-[#737373]">
																							{unitLabel}
																						</span>
																					</div>
																				</div>
																			);
																		})}
																	</div>
																</div>
															)}
														</div>
													))}
												</div>
											</div>
										)}
									</div>
								)}

								{/* Track tabs (Sales / Marketing / Referral) */}
								{activeTrackRoleType && activeTrackForm && (
									<TrackTabPanel
										track={activeTrackForm}
										tiers={tiers.map((t) => ({ id: t.id, name: t.name }))}
										canEdit={canCreate || canUpdate}
										onChange={(patch) =>
											updateTrackForm(activeTrackRoleType, patch)
										}
									/>
								)}

								{/* Empty state: no active tab form */}
								{activeTrackRoleType && !activeTrackForm && (
									<div className="flex min-h-32 items-center justify-center text-sm text-[#737373]">
										Track not found. Close and re-open this dialog.
									</div>
								)}
							</div>
						</div>
					)}
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={handleSave}
						disabled={isSaving || isLoadingConfig}
					>
						{isSaving ? "Saving…" : "Save Config"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
