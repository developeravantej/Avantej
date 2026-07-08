import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";

// ─── Types ──────────────────────────────────────────────────────────────────

type ImportEntity = "clients" | "packages" | "payments" | "opening_balances";

type RowResult = { line: number; ok: boolean; errors: string[] };

type PreviewResult = {
	entity: string;
	rowCount: number;
	okCount: number;
	errorCount: number;
	results: RowResult[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	const d = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

const STATUS_STYLES: Record<
	string,
	{ bg: string; border: string; text: string }
> = {
	committed: { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
	pending: { bg: "#fefce8", border: "#fde68a", text: "#a16207" },
	failed: { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" },
};

/**
 * Row shape for the import-history table. Declared locally and applied via a
 * cast because the web client's Type Check reads the built `@avantej-core/api`
 * dist, where `dataImport.history` currently types as `any` (the dist lags the
 * source router). Fields mirror the dataImport.history select.
 */
type ImportHistoryRow = {
	id: string;
	entity: string;
	status: string;
	createdCount: number;
	skippedCount: number;
	errorCount: number;
	createdAt: string;
};

// ─── Page ───────────────────────────────────────────────────────────────────

export function DataImportPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canImport = hasPermission("data_import:import");

	const [entity, setEntity] = useState<ImportEntity | "">("");
	const [csv, setCsv] = useState("");
	const [fileName, setFileName] = useState("");
	const [preview, setPreview] = useState<PreviewResult | null>(null);

	// ─── Queries ──────────────────────────────────────────────────────────────

	const entitiesQuery = useQuery({
		...orpc.dataImport.listEntities.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});
	const entities = entitiesQuery.data ?? [];
	const selectedSpec = entities.find((e) => e.entity === entity) ?? null;

	const historyKey = orpc.dataImport.history.queryOptions({
		input: { organizationId: organizationId! },
	}).queryKey;
	const historyQuery = useQuery({
		...orpc.dataImport.history.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});
	const history = (historyQuery.data ?? []) as ImportHistoryRow[];

	// ─── Mutations ────────────────────────────────────────────────────────────

	const previewMutation = useMutation({
		mutationFn: () =>
			client.dataImport.preview({
				organizationId: organizationId!,
				entity: entity as ImportEntity,
				csv,
			}),
		onSuccess: (data) => setPreview(data as PreviewResult),
		onError: (err: Error) => toast.error(err.message || "Preview failed."),
	});

	const commitMutation = useApiMutation({
		mutationFn: () =>
			client.dataImport.commit({
				organizationId: organizationId!,
				entity: entity as ImportEntity,
				csv,
				skipInvalid: true,
			}),
		successMessage: (data) =>
			`Import complete — ${data.createdCount} created, ${data.skippedCount} skipped, ${data.errorCount} errors.`,
		errorMessage: (err) => err.message || "Import failed.",
		invalidate: [historyKey],
		onSuccess: () => {
			setCsv("");
			setFileName("");
			setPreview(null);
		},
	});

	// ─── Handlers ─────────────────────────────────────────────────────────────

	function pickEntity(value: string) {
		setEntity(value as ImportEntity | "");
		setPreview(null);
	}

	function updateCsv(value: string) {
		setCsv(value);
		setPreview(null);
	}

	function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		setFileName(file.name);
		const reader = new FileReader();
		reader.onload = () => {
			updateCsv(typeof reader.result === "string" ? reader.result : "");
		};
		reader.onerror = () => toast.error("Could not read that file.");
		reader.readAsText(file);
	}

	function downloadTemplate() {
		if (!selectedSpec) return;
		const blob = new Blob([`${selectedSpec.headerRow}\n`], {
			type: "text/csv;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${selectedSpec.entity}-template.csv`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	const canPreview =
		!!entity && csv.trim().length > 0 && !previewMutation.isPending;
	const canCommit =
		canImport && !!preview && !commitMutation.isPending && !!entity;

	// ─── Guard ────────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3]">
				<div className="sticky top-0 z-10 border-b border-[#e5e5e5] bg-white px-7 py-5">
					<h1 className="text-[15px] font-bold text-[#0a0a0a]">Import Data</h1>
				</div>
				<div className="px-7 py-10 text-sm text-[#737373]">
					No organisation selected.
				</div>
			</div>
		);
	}

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3]">
			{/* Sticky white header */}
			<div className="sticky top-0 z-10 border-b border-[#e5e5e5] bg-white px-7 py-5">
				<h1 className="text-[15px] font-bold text-[#0a0a0a]">Import Data</h1>
				<p className="mt-0.5 text-xs text-[#737373]">
					Bulk-import clients, packages, payments and opening balances from a
					CSV file. Rows are validated before anything is written.
				</p>
			</div>

			<div className="space-y-6 px-7 py-6">
				{/* ── Step 1: choose entity ── */}
				<section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
					<div className="mb-4">
						<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Step 1
						</p>
						<h2 className="text-[15px] font-bold text-[#0a0a0a]">
							Choose what to import
						</h2>
					</div>

					<div className="flex flex-wrap items-end gap-3">
						<div className="min-w-[240px]">
							<label
								htmlFor="di-entity"
								className="mb-1.5 block text-xs font-medium text-[#0a0a0a]"
							>
								Data type
							</label>
							<select
								id="di-entity"
								value={entity}
								onChange={(e) => pickEntity(e.target.value)}
								disabled={entitiesQuery.isLoading}
								className="h-9 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] outline-none focus:border-[#0a0a0a] disabled:opacity-50"
							>
								<option value="">
									{entitiesQuery.isLoading ? "Loading…" : "Select a data type…"}
								</option>
								{entities.map((e) => (
									<option key={e.entity} value={e.entity}>
										{e.label}
									</option>
								))}
							</select>
						</div>

						{selectedSpec && (
							<button
								type="button"
								onClick={downloadTemplate}
								className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e5e5e5] bg-white px-3.5 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee]"
							>
								<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
									<path
										d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10"
										stroke="currentColor"
										strokeWidth="1.6"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								Download template header
							</button>
						)}
					</div>

					{/* Column hints */}
					{selectedSpec && (
						<div className="mt-5 overflow-x-auto rounded-xl border border-[#edede4]">
							<table className="w-full border-collapse text-[13px]">
								<thead>
									<tr>
										{["Column", "Required", "Description"].map((h) => (
											<th
												key={h}
												className="whitespace-nowrap border-b border-[#edede4] bg-[#faf9f5] px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6b7170]"
											>
												{h}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{selectedSpec.columns.map((col) => (
										<tr
											key={col.name}
											className="border-b border-[#f7f5ee] last:border-b-0"
										>
											<td className="px-3.5 py-2 align-top font-mono text-[13px] text-[#0a0a0a]">
												{col.name}
											</td>
											<td className="px-3.5 py-2 align-top">
												{col.required ? (
													<span className="inline-flex items-center rounded-md border border-[#fecaca] bg-[#fef2f2] px-2 py-0.5 text-[11px] font-medium text-[#b91c1c]">
														Required
													</span>
												) : (
													<span className="text-xs text-[#6b7170]">
														Optional
													</span>
												)}
											</td>
											<td className="px-3.5 py-2 align-top text-[13px] text-[#6b7170]">
												{col.description}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>

				{/* ── Step 2: provide CSV ── */}
				<section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
					<div className="mb-4">
						<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Step 2
						</p>
						<h2 className="text-[15px] font-bold text-[#0a0a0a]">
							Provide your CSV
						</h2>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-[#e5e5e5] bg-white px-3.5 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee]">
							<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
								<path
									d="M8 11V3m0 0L5 6m3-3 3 3M3 13h10"
									stroke="currentColor"
									strokeWidth="1.6"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
							Choose CSV file
							<input
								type="file"
								accept=".csv,text/csv"
								onChange={handleFile}
								className="hidden"
							/>
						</label>
						{fileName && (
							<span className="text-xs text-[#6b7170]">
								{fileName} · {csv.length.toLocaleString()} chars
							</span>
						)}
					</div>

					<div className="mt-4">
						<label
							htmlFor="di-csv"
							className="mb-1.5 block text-xs font-medium text-[#0a0a0a]"
						>
							…or paste CSV
						</label>
						<textarea
							id="di-csv"
							value={csv}
							onChange={(e) => updateCsv(e.target.value)}
							rows={8}
							spellCheck={false}
							placeholder={
								selectedSpec ? selectedSpec.headerRow : "name,email,phone,…"
							}
							className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-mono text-xs text-[#0a0a0a] outline-none focus:border-[#0a0a0a] placeholder:text-[#b5b5ad]"
						/>
					</div>

					<div className="mt-4 flex items-center gap-2">
						<button
							type="button"
							onClick={() => previewMutation.mutate()}
							disabled={!canPreview}
							className="inline-flex h-9 items-center justify-center rounded-xl border border-[#e5e5e5] bg-white px-4 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-50"
						>
							{previewMutation.isPending ? "Validating…" : "Preview"}
						</button>
						{canImport && (
							<button
								type="button"
								onClick={() => commitMutation.mutate()}
								disabled={!canCommit}
								title={!preview ? "Run a preview before importing" : undefined}
								className="inline-flex h-9 items-center justify-center rounded-xl bg-[#0a0a0a] px-4 text-[13px] font-medium text-white transition-opacity hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-50"
							>
								{commitMutation.isPending ? "Importing…" : "Commit import"}
							</button>
						)}
					</div>
				</section>

				{/* ── Preview results ── */}
				{preview && (
					<section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
						<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Preview
								</p>
								<h2 className="text-[15px] font-bold text-[#0a0a0a]">
									Validation results
								</h2>
							</div>
							<div className="flex items-center gap-2 text-xs">
								<span className="rounded-lg border border-[#e5e5e5] bg-[#faf9f5] px-2.5 py-1 font-medium text-[#0a0a0a]">
									{preview.rowCount} rows
								</span>
								<span className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-1 font-medium text-[#15803d]">
									{preview.okCount} valid
								</span>
								<span
									className={
										preview.errorCount > 0
											? "rounded-lg border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1 font-medium text-[#b91c1c]"
											: "rounded-lg border border-[#e5e5e5] bg-[#faf9f5] px-2.5 py-1 font-medium text-[#6b7170]"
									}
								>
									{preview.errorCount} errors
								</span>
							</div>
						</div>

						<div className="overflow-x-auto rounded-xl border border-[#edede4]">
							<table className="w-full border-collapse text-[13px]">
								<thead>
									<tr>
										{["Line", "Status", "Errors"].map((h) => (
											<th
												key={h}
												className="whitespace-nowrap border-b border-[#edede4] bg-[#faf9f5] px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6b7170]"
											>
												{h}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{preview.results.map((r) => (
										<tr
											key={r.line}
											className="border-b border-[#f7f5ee] last:border-b-0"
										>
											<td className="px-3.5 py-2 align-top font-mono tabular-nums text-[13px] text-[#0a0a0a]">
												{r.line}
											</td>
											<td className="px-3.5 py-2 align-top">
												{r.ok ? (
													<span className="inline-flex items-center rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-2 py-0.5 text-[11px] font-medium text-[#15803d]">
														OK
													</span>
												) : (
													<span className="inline-flex items-center rounded-md border border-[#fecaca] bg-[#fef2f2] px-2 py-0.5 text-[11px] font-medium text-[#b91c1c]">
														Error
													</span>
												)}
											</td>
											<td className="px-3.5 py-2 align-top text-[13px] text-[#6b7170]">
												{r.errors.length > 0 ? r.errors.join("; ") : "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						{preview.errorCount > 0 && canImport && (
							<p className="mt-3 text-xs text-[#6b7170]">
								Committing will import the {preview.okCount} valid row
								{preview.okCount === 1 ? "" : "s"} and skip the rest.
							</p>
						)}
					</section>
				)}

				{/* ── Import history ── */}
				<section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
					<div className="mb-4">
						<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							History
						</p>
						<h2 className="text-[15px] font-bold text-[#0a0a0a]">
							Recent imports
						</h2>
					</div>

					{historyQuery.isLoading ? (
						<p className="py-6 text-center text-sm text-[#6b7170]">Loading…</p>
					) : history.length === 0 ? (
						<p className="py-6 text-center text-sm text-[#6b7170]">
							No imports yet.
						</p>
					) : (
						<div className="overflow-x-auto rounded-xl border border-[#edede4]">
							<table className="w-full border-collapse text-[13px]">
								<thead>
									<tr>
										{[
											"Data type",
											"Status",
											"Created",
											"Skipped",
											"Errors",
											"Date",
										].map((h) => (
											<th
												key={h}
												className="whitespace-nowrap border-b border-[#edede4] bg-[#faf9f5] px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6b7170]"
											>
												{h}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{history.map((job) => {
										const s =
											STATUS_STYLES[job.status] ?? STATUS_STYLES.pending;
										return (
											<tr
												key={job.id}
												className="border-b border-[#f7f5ee] last:border-b-0"
											>
												<td className="px-3.5 py-2.5 align-middle font-medium text-[13px] text-[#0a0a0a]">
													{job.entity}
												</td>
												<td className="px-3.5 py-2.5 align-middle">
													<span
														className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize"
														style={{
															background: s.bg,
															borderColor: s.border,
															color: s.text,
														}}
													>
														{job.status}
													</span>
												</td>
												<td className="px-3.5 py-2.5 align-middle font-mono tabular-nums text-[13px] text-[#0a0a0a]">
													{job.createdCount}
												</td>
												<td className="px-3.5 py-2.5 align-middle font-mono tabular-nums text-[13px] text-[#6b7170]">
													{job.skippedCount}
												</td>
												<td className="px-3.5 py-2.5 align-middle font-mono tabular-nums text-[13px] text-[#6b7170]">
													{job.errorCount}
												</td>
												<td className="px-3.5 py-2.5 align-middle font-mono text-xs tabular-nums text-[#6b7170]">
													{formatDate(job.createdAt)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
