import { useMemo, useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { PageLoader } from "@/components/ui/loading-spinner";
import { ServiceFormDialogA as ServiceFormDialog } from "@/components/forms/service-form-a";
import { ServiceDetailDialogA as ServiceDetailDialog } from "@/components/forms/service-detail-dialog-a";
import { centsToRm, formatPrice } from "@/lib/money";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Service = {
	id: string;
	name: string | null;
	categoryId: string | null;
	service_category_name: string | null;
	duration: number | null;
	durationUnitType: string | null;
	price: number | null;
	sessionCount: number | null;
	isActive: boolean | null;
	schedulingType?: string | null;
	eligibleTrainerTiers?: string[];
	defaultCommissionBps?: number | null;
	avgPerMonth?: number | null;
	[k: string]: unknown;
};

type SortKey = "name" | "duration" | "price" | "avgPerMonth" | null;
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(duration: number | null, unit?: string | null): string {
	if (duration == null) return "—";
	if (unit === "hours") return `${duration}h`;
	if (unit === "minutes") return `${duration}m`;
	return `${duration}s`;
}

function categoryAbbr(name: string | null): string {
	if (!name) return "—";
	const map: Record<string, string> = {
		"Personal Training": "PT",
		"Group Class": "Group",
		Assessment: "Assess",
		Recovery: "Recov",
		"Nutrition Consult": "Nutri",
		Nutrition: "Nutri",
	};
	return map[name] ?? name.slice(0, 5);
}

// Category badge colour mapping (design tokens)
const CATEGORY_COLOURS: Record<string, string> = {
	PT: "bg-blue-50 text-blue-700",
	Group: "bg-green-50 text-green-700",
	Assess: "bg-purple-50 text-purple-700",
	Recov: "bg-orange-50 text-orange-600",
	Nutri: "bg-yellow-50 text-yellow-700",
};

function categoryBadgeClass(abbr: string): string {
	return (
		CATEGORY_COLOURS[abbr] ??
		"bg-[#f3f3f3] text-[#404040]"
	);
}

// ---------------------------------------------------------------------------
// Inline active/inactive toggle
// ---------------------------------------------------------------------------

function ActiveToggle({
	serviceId,
	isActive,
	organizationId,
	onToggled,
}: {
	serviceId: string;
	isActive: boolean;
	organizationId: string;
	onToggled: () => void;
}) {
	const [pending, setPending] = useState(false);

	const handleChange = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			e.stopPropagation();
			setPending(true);
			try {
				await client.services.update({
					organizationId,
					id: serviceId,
					isActive: e.target.checked,
				});
				toast.success(e.target.checked ? "Service activated" : "Service deactivated");
				onToggled();
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : "Failed to update service";
				toast.error(msg);
			} finally {
				setPending(false);
			}
		},
		[organizationId, serviceId, onToggled]
	);

	return (
		// eslint-disable-next-line jsx-a11y/label-has-associated-control
		<label
			className="relative inline-flex w-7 h-4 cursor-pointer"
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			<input
				type="checkbox"
				className="sr-only peer"
				checked={isActive}
				disabled={pending}
				onChange={handleChange}
			/>
			<span className="absolute inset-0 rounded-full transition-colors bg-[#e5e5e5] peer-checked:bg-[#0a0a0a]" />
			<span className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform peer-checked:translate-x-3" />
		</label>
	);
}

// ---------------------------------------------------------------------------
// Header checkbox (tri-state)
// ---------------------------------------------------------------------------

function HeaderCheckbox({
	checked,
	indeterminate,
	onChange,
}: {
	checked: boolean;
	indeterminate: boolean;
	onChange: (v: boolean) => void;
}) {
	const ref = useRef<HTMLInputElement>(null);

	// Apply indeterminate via ref (not an HTML attribute)
	if (ref.current) {
		ref.current.indeterminate = indeterminate;
	}

	return (
		<input
			ref={ref}
			type="checkbox"
			checked={checked}
			onChange={(e) => onChange(e.target.checked)}
			onClick={(e) => e.stopPropagation()}
			className="h-3.5 w-3.5 cursor-pointer appearance-none rounded-sm border-[1.5px] border-[#a3a3a3] checked:border-[#0a0a0a] checked:bg-[#0a0a0a] indeterminate:border-[#0a0a0a] indeterminate:bg-[#0a0a0a] focus:outline-none"
			style={{
				backgroundImage: checked || indeterminate
					? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'%3E%3Cpath d='M13.485 4.515a.75.75 0 0 0-1.06-1.06L6.5 9.379 3.575 6.455a.75.75 0 1 0-1.06 1.06l3.485 3.486a.75.75 0 0 0 1.061 0z'/%3E%3C/svg%3E\")"
					: undefined,
				backgroundRepeat: "no-repeat",
				backgroundPosition: "center",
				backgroundSize: "14px",
			}}
		/>
	);
}

// ---------------------------------------------------------------------------
// Sort header button
// ---------------------------------------------------------------------------

function SortTh({
	label,
	sortKey,
	currentKey,
	currentDir,
	onSort,
	className,
}: {
	label: string;
	sortKey: SortKey;
	currentKey: SortKey;
	currentDir: SortDir;
	onSort: (k: SortKey) => void;
	className?: string;
}) {
	const active = sortKey === currentKey;
	return (
		<th
			className={`py-3 px-3 text-[10px] uppercase tracking-widest font-bold cursor-pointer select-none text-[#737373] hover:text-[#0a0a0a] transition-colors ${className ?? ""}`}
			onClick={() => onSort(sortKey)}
		>
			{label}{" "}
			<span className={active ? "text-[#0a0a0a]" : "text-[#d6cdb1]"}>
				{active && currentDir === "asc" ? "↑" : "↓"}
			</span>
		</th>
	);
}

const PAGE_SIZE = 15;

// ---------------------------------------------------------------------------
// Main ServicesPage
// ---------------------------------------------------------------------------

export function ServicesPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const qc = useQueryClient();

	// ── data ──────────────────────────────────────────────────────────────────
	const { data: rawServices = [], isLoading } = useQuery({
		...orpc.services.list.queryOptions({ input: { organizationId: organizationId! } }),
		enabled: !!organizationId,
	});
	const services = rawServices as Service[];

	// ── local state ───────────────────────────────────────────────────────────
	const [search, setSearch] = useState("");
	const [categoryFilter, setCategoryFilter] = useState<string>("all");
	const [sortKey, setSortKey] = useState<SortKey>(null);
	const [sortDir, setSortDir] = useState<SortDir>("asc");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [page, setPage] = useState(1);

	// modals
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDetailOpen, setIsDetailOpen] = useState(false);
	const [editServiceId, setEditServiceId] = useState<string | null>(null);
	const [detailServiceId, setDetailServiceId] = useState<string | null>(null);

	// ── edit data ─────────────────────────────────────────────────────────────
	const { data: editServiceData } = useQuery({
		queryKey: ["service", "edit", editServiceId, organizationId],
		queryFn: async () => {
			if (!editServiceId || !organizationId) return null;
			return client.services.getById({ organizationId, id: editServiceId });
		},
		enabled: !!editServiceId && !!organizationId && isEditOpen,
	});

	const editInitialData = editServiceData
		? (() => {
				const expiryDays = editServiceData.expiryDays ?? null;
				let duration = 1;
				let duration_unit = "day";
				if (expiryDays) {
					if (expiryDays % 365 === 0) { duration = expiryDays / 365; duration_unit = "year"; }
					else if (expiryDays % 30 === 0) { duration = expiryDays / 30; duration_unit = "month"; }
					else if (expiryDays % 7 === 0) { duration = expiryDays / 7; duration_unit = "week"; }
					else { duration = expiryDays; duration_unit = "day"; }
				}
				return {
					id: editServiceData.id,
					name: editServiceData.name,
					duration,
					duration_unit,
					expirable: editServiceData.expirable ?? false,
					price: editServiceData.price != null ? Number(centsToRm(editServiceData.price)) : 0,
					sessions: editServiceData.sessionCount ?? 1,
					taxable: editServiceData.taxable ?? false,
					taxPercentage: editServiceData.taxPercentage ?? 0,
					categoryId: editServiceData.categoryId ?? "",
					schedulingType: (editServiceData.schedulingType === "class_slot"
						? "time-preset"
						: "appointment-based") as "appointment-based" | "time-preset",
					sessionDurationMinutes:
						editServiceData.durationUnitType === "minutes"
							? editServiceData.duration
							: editServiceData.durationUnitType === "hours"
								? editServiceData.duration * 60
								: Math.round(editServiceData.duration / 60),
					maxAttendees: editServiceData.maxAttendees ?? 1,
					availablePaymentPlans: (editServiceData.availablePaymentPlans ?? []) as string[],
					installmentIntervalDays: editServiceData.installmentIntervalDays ?? 30,
					gracePeriodDays: editServiceData.gracePeriodDays ?? null,
					timePresetConfig: editServiceData.timePresetConfig ?? undefined,
				};
			})()
		: undefined;

	const handleEdit = useCallback((serviceId: string) => {
		setEditServiceId(serviceId);
		setIsEditOpen(true);
	}, []);

	const handleDeactivate = useCallback(
		async (serviceId: string) => {
			try {
				await client.services.update({ organizationId: organizationId!, id: serviceId, isActive: false });
				toast.success("Service deactivated");
				qc.invalidateQueries({ queryKey: orpc.services.list.key() });
			} catch (err: unknown) {
				toast.error(err instanceof Error ? err.message : "Failed to deactivate service");
			}
		},
		[organizationId, qc]
	);

	const invalidate = useCallback(() => {
		qc.invalidateQueries({ queryKey: orpc.services.list.key() });
	}, [qc]);

	// ── duplicate mutation ─────────────────────────────────────────────────────
	const duplicateMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.services.duplicate({ organizationId: organizationId!, id }),
		successMessage: "Service duplicated (inactive draft created)",
		invalidate: [orpc.services.list.key()],
	});

	// ── derived: unique categories for filter dropdown ─────────────────────────
	const categories = useMemo(() => {
		const set = new Set<string>();
		for (const s of services) {
			if (s.service_category_name) set.add(s.service_category_name);
		}
		return Array.from(set).sort();
	}, [services]);

	// ── filtering ─────────────────────────────────────────────────────────────
	const filtered = useMemo(() => {
		let list = services;
		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter(
				(s) =>
					(s.name ?? "").toLowerCase().includes(q) ||
					(s.service_category_name ?? "").toLowerCase().includes(q)
			);
		}
		if (categoryFilter !== "all") {
			list = list.filter((s) => s.service_category_name === categoryFilter);
		}
		return list;
	}, [services, search, categoryFilter]);

	// ── sorting (client-side; avgPerMonth now ships in batch so it's sortable) ──
	const sorted = useMemo(() => {
		if (!sortKey) return filtered;
		return [...filtered].sort((a, b) => {
			let cmp = 0;
			if (sortKey === "name") cmp = (a.name ?? "").localeCompare(b.name ?? "");
			else if (sortKey === "duration") cmp = (a.duration ?? 0) - (b.duration ?? 0);
			else if (sortKey === "price") cmp = (a.price ?? 0) - (b.price ?? 0);
			else if (sortKey === "avgPerMonth") cmp = (a.avgPerMonth ?? 0) - (b.avgPerMonth ?? 0);
			return sortDir === "asc" ? cmp : -cmp;
		});
	}, [filtered, sortKey, sortDir]);

	const handleSort = useCallback((k: SortKey) => {
		setSortKey((prev) => {
			if (prev === k) {
				setSortDir((d) => (d === "asc" ? "desc" : "asc"));
				return k;
			}
			setSortDir("asc");
			return k;
		});
		setPage(1);
	}, []);

	// ── pagination ────────────────────────────────────────────────────────────
	const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);
	const pageItems = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

	// ── selection ─────────────────────────────────────────────────────────────
	const pageIds = pageItems.map((s) => s.id);
	const selectedOnPage = pageIds.filter((id) => selected.has(id));
	const allPageSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
	const somePageSelected = selectedOnPage.length > 0 && !allPageSelected;

	const toggleSelectAll = useCallback(
		(checked: boolean) => {
			setSelected((prev) => {
				const next = new Set(prev);
				if (checked) pageIds.forEach((id) => next.add(id));
				else pageIds.forEach((id) => next.delete(id));
				return next;
			});
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[pageIds.join(",")]
	);

	const toggleRow = useCallback((id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	// ── bulk actions ──────────────────────────────────────────────────────────
	const bulkSetActive = useCallback(
		async (isActive: boolean) => {
			if (!organizationId) return;
			const ids = Array.from(selected);
			await Promise.allSettled(
				ids.map((id) =>
					client.services.update({ organizationId, id, isActive })
				)
			);
			toast.success(isActive ? "Selected services enabled" : "Selected services disabled");
			setSelected(new Set());
			qc.invalidateQueries({ queryKey: orpc.services.list.key() });
		},
		[selected, organizationId, qc]
	);

	// ── guard ─────────────────────────────────────────────────────────────────
	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-sm text-[#737373]">
				Select an organization to view services.
			</div>
		);
	}

	if (isLoading) return <PageLoader />;

	const activeCount = services.filter((s) => s.isActive).length;

	return (
		<div>
			{/* ── Subheader: count + New Service ───────────────────────────────── */}
			<div className="mb-4 flex items-center justify-between">
				<p className="text-sm text-[#737373]">
					<span className="font-mono tabular-nums font-semibold text-[#0a0a0a]">{services.length}</span> services
					<span className="mx-1.5 text-[#d4d4d4]">·</span>
					<span className="font-mono tabular-nums font-semibold text-[#0a0a0a]">{activeCount}</span> active
				</p>
				<button
					type="button"
					onClick={() => setIsAddOpen(true)}
					className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition"
				>
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
					New Service
				</button>
			</div>

			{/* ── Toolbar ──────────────────────────────────────────────────────── */}
			<div className="mb-4 flex flex-wrap items-center gap-2">
				{/* Search */}
				<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5">
					<svg className="h-3.5 w-3.5 text-[#a3a3a3] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />
					</svg>
					<input
						value={search}
						onChange={(e) => { setSearch(e.target.value); setPage(1); }}
						placeholder="Search services…"
						className="w-44 bg-transparent text-[13px] text-[#0a0a0a] placeholder:text-[#a3a3a3] outline-none"
					/>
				</div>

				{/* Category filter pills */}
				<div className="flex items-center gap-1.5 flex-wrap">
					<button
						type="button"
						onClick={() => { setCategoryFilter("all"); setPage(1); }}
						className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
							categoryFilter === "all"
								? "bg-[#0a0a0a] text-white"
								: "text-[#737373] hover:bg-[#f3f3f3] border border-[#e5e5e5] bg-white"
						}`}
					>
						All
					</button>
					{categories.map((cat) => (
						<button
							key={cat}
							type="button"
							onClick={() => { setCategoryFilter(cat); setPage(1); }}
							className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
								categoryFilter === cat
									? "bg-[#0a0a0a] text-white"
									: "text-[#737373] hover:bg-[#f3f3f3] border border-[#e5e5e5] bg-white"
							}`}
						>
							{cat}
						</button>
					))}
				</div>
			</div>

			{/* ── Bulk action bar ───────────────────────────────────────────────── */}
			{selected.size > 0 && (
				<div className="mb-3 flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white px-4 py-2.5">
					<span className="text-xs font-semibold text-[#0a0a0a]">
						{selected.size} selected
					</span>
					<div className="h-4 w-px bg-[#e5e5e5]" />
					<button
						type="button"
						onClick={() => bulkSetActive(true)}
						className="inline-flex items-center gap-1 rounded-full border border-[#e5e5e5] bg-[#0a0a0a] px-3 py-1 text-[11px] font-semibold text-white"
					>
						Enable selected
					</button>
					<button
						type="button"
						onClick={() => bulkSetActive(false)}
						className="inline-flex items-center gap-1 rounded-full border border-[#e5e5e5] bg-white px-3 py-1 text-[11px] font-medium text-[#737373] hover:bg-[#f3f3f3]"
					>
						Disable selected
					</button>
					<button
						type="button"
						onClick={() => setSelected(new Set())}
						className="ml-auto text-[11px] text-[#a3a3a3] hover:text-[#737373]"
					>
						Clear
					</button>
				</div>
			)}

			{/* ── Table ────────────────────────────────────────────────────────── */}
			<div>
				<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-[#e5e5e5] bg-[#f3f3f3]">
								<th className="py-3 pl-4 pr-2 w-8">
									<HeaderCheckbox
										checked={allPageSelected}
										indeterminate={somePageSelected}
										onChange={toggleSelectAll}
									/>
								</th>
								<SortTh
									label="Service"
									sortKey="name"
									currentKey={sortKey}
									currentDir={sortDir}
									onSort={handleSort}
									className="text-left"
								/>
								<th className="py-3 px-3 text-left text-[10px] uppercase tracking-widest font-bold text-[#737373]">
									Category
								</th>
								<SortTh
									label="Duration"
									sortKey="duration"
									currentKey={sortKey}
									currentDir={sortDir}
									onSort={handleSort}
									className="text-right"
								/>
								<SortTh
									label="Price"
									sortKey="price"
									currentKey={sortKey}
									currentDir={sortDir}
									onSort={handleSort}
									className="text-right"
								/>
								<th className="py-3 px-3 text-right text-[10px] uppercase tracking-widest font-bold text-[#737373]">
									Commission
								</th>
								<SortTh
									label="Avg/mo"
									sortKey="avgPerMonth"
									currentKey={sortKey}
									currentDir={sortDir}
									onSort={handleSort}
									className="text-right"
								/>
								<th className="py-3 px-3 text-center text-[10px] uppercase tracking-widest font-bold text-[#737373]">
									Active
								</th>
								<th className="py-3 pl-3 pr-4 text-left text-[10px] uppercase tracking-widest font-bold text-[#737373]">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{pageItems.length === 0 ? (
								<tr>
									<td colSpan={9} className="py-16 text-center text-sm text-[#a3a3a3]">
										{search || categoryFilter !== "all"
											? "No services match this filter."
											: "No services yet. Create your first one."}
									</td>
								</tr>
							) : (
								pageItems.map((svc) => {
									const isSelected = selected.has(svc.id);
									const isActive = svc.isActive ?? false;
									const abbr = categoryAbbr(svc.service_category_name);
									const badgeClass = categoryBadgeClass(abbr);

									return (
										<tr
											key={svc.id}
											className={`border-b border-[#e5e5e5] transition-colors group cursor-pointer ${
												isSelected
													? "bg-[#f3f3f3]"
													: isActive
														? "hover:bg-[#f3f3f3]/60"
														: "opacity-60 hover:bg-[#f3f3f3]/60"
											}`}
											onClick={() => {
												setDetailServiceId(svc.id);
												setIsDetailOpen(true);
											}}
										>
											{/* checkbox */}
											<td
												className="py-3 pl-4 pr-2"
												onClick={(e) => e.stopPropagation()}
											>
												<input
													type="checkbox"
													checked={isSelected}
													onChange={() => toggleRow(svc.id)}
													className="h-3.5 w-3.5 cursor-pointer appearance-none rounded-sm border-[1.5px] border-[#a3a3a3] checked:border-[#0a0a0a] checked:bg-[#0a0a0a] focus:outline-none"
													style={
														isSelected
															? {
																	backgroundImage:
																		"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'%3E%3Cpath d='M13.485 4.515a.75.75 0 0 0-1.06-1.06L6.5 9.379 3.575 6.455a.75.75 0 1 0-1.06 1.06l3.485 3.486a.75.75 0 0 0 1.061 0z'/%3E%3C/svg%3E\")",
																	backgroundRepeat: "no-repeat",
																	backgroundPosition: "center",
																	backgroundSize: "14px",
																}
															: {}
													}
												/>
											</td>

											{/* Name + category sub-label */}
											<td className="py-3 px-3">
												<div className="font-semibold text-[13px] text-[#0a0a0a]">
													{svc.name ?? "—"}
												</div>
												{svc.service_category_name && (
													<div className="text-[11px] text-[#a3a3a3]">
														{svc.service_category_name}
													</div>
												)}
											</td>

											{/* Category badge */}
											<td className="py-3 px-3">
												<span
													className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.06em] ${badgeClass}`}
												>
													{abbr}
												</span>
											</td>

											{/* Duration */}
											<td className="py-3 px-3 text-right font-mono tabular-nums text-[13px] text-[#404040]">
												{formatDuration(svc.duration, svc.durationUnitType)}
											</td>

											{/* Price */}
											<td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-[13px] text-[#0a0a0a]">
												{svc.price != null ? formatPrice(svc.price, "MYR") : "—"}
											</td>

											{/* Commission */}
											<td className="py-3 px-3 text-right font-mono tabular-nums text-[13px] text-[#404040]">
												{svc.defaultCommissionBps != null && svc.defaultCommissionBps > 0
													? `${(svc.defaultCommissionBps / 100).toFixed(2)}%`
													: <span className="text-[#a3a3a3]">—</span>}
											</td>

											{/* Avg/mo — now from batch list response */}
											<td className="py-3 px-3 text-right font-mono tabular-nums text-[13px]">
												{svc.avgPerMonth != null && svc.avgPerMonth > 0
													? <span className="font-semibold text-[#0a0a0a]">{svc.avgPerMonth.toFixed(1)}</span>
													: <span className="text-[#a3a3a3]">—</span>}
											</td>

											{/* Active toggle */}
											<td
												className="py-3 px-3 text-center"
												onClick={(e) => e.stopPropagation()}
											>
												<ActiveToggle
													serviceId={svc.id}
													isActive={isActive}
													organizationId={organizationId}
													onToggled={invalidate}
												/>
											</td>

											{/* Actions (hover-revealed) */}
											<td
												className="py-3 pl-3 pr-4"
												onClick={(e) => e.stopPropagation()}
											>
												<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
													<button
														type="button"
														onClick={() => handleEdit(svc.id)}
														className="rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#262626] hover:bg-[#f3f3f3] transition-colors"
													>
														Edit
													</button>
													<button
														type="button"
														disabled={duplicateMutation.isPending}
														onClick={() => duplicateMutation.mutate(svc.id)}
														className="rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#262626] hover:bg-[#f3f3f3] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
													>
														Dupe
													</button>
												</div>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>

					{/* ── Pagination footer ─────────────────────────────────────────── */}
					<div className="flex items-center justify-between border-t border-[#e5e5e5] bg-[#f3f3f3]/50 px-4 py-2.5">
						<span className="text-[11px] text-[#a3a3a3]">
							Showing {Math.min((safePage - 1) * PAGE_SIZE + 1, sorted.length)}–
							{Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length}{" "}
							services
						</span>
						<div className="flex items-center gap-1">
							<button
								type="button"
								disabled={safePage <= 1}
								onClick={() => setPage((p) => p - 1)}
								className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[11px] font-medium hover:bg-[#f3f3f3] disabled:opacity-40 disabled:cursor-not-allowed"
							>
								Prev
							</button>
							{Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
								<button
									key={pg}
									type="button"
									onClick={() => setPage(pg)}
									className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
										pg === safePage
											? "bg-[#0a0a0a] text-white"
											: "border border-[#e5e5e5] bg-white text-[#262626] hover:bg-[#f3f3f3]"
									}`}
								>
									{pg}
								</button>
							))}
							<button
								type="button"
								disabled={safePage >= totalPages}
								onClick={() => setPage((p) => p + 1)}
								className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[11px] font-medium hover:bg-[#f3f3f3] disabled:opacity-40 disabled:cursor-not-allowed"
							>
								Next
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* ── Modals ───────────────────────────────────────────────────────── */}
			<ServiceFormDialog
				isOpen={isAddOpen}
				onClose={() => setIsAddOpen(false)}
				organizationId={organizationId}
				mode="create"
			/>

			<ServiceFormDialog
				isOpen={isEditOpen}
				onClose={() => {
					setIsEditOpen(false);
					setEditServiceId(null);
				}}
				organizationId={organizationId}
				mode="edit"
				initialData={editInitialData}
			/>

			<ServiceDetailDialog
				isOpen={isDetailOpen}
				onClose={() => {
					setIsDetailOpen(false);
					setDetailServiceId(null);
				}}
				serviceId={detailServiceId}
				organizationId={organizationId}
				onEdit={handleEdit}
				onDelete={handleDeactivate}
			/>
		</div>
	);
}
