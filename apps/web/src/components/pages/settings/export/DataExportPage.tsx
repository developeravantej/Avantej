import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useScope } from "@/components/scope/ScopeProvider";
import { useUserContext } from "@/hooks/useUserContext";
import { downloadCsv } from "@/lib/download-csv";
import { client, orpc } from "@/utils/orpc";

// ─── Types ──────────────────────────────────────────────────────────────────

type ExportDataset = {
	entity: string;
	label: string;
	description: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Decode a base64 ZIP payload → binary Blob → anchor download. Mirrors the
 * WS2 CSV helper (`downloadCsv`) but for the server-built ZIP archive.
 */
function downloadZipBase64(filename: string, zipBase64: string): void {
	const bytes = Uint8Array.from(atob(zipBase64), (c) => c.charCodeAt(0));
	const blob = new Blob([bytes], { type: "application/zip" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function DataExportPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const { scopeNodeId } = useScope();
	const canExport = hasPermission("reports:export");

	// ─── Queries ──────────────────────────────────────────────────────────────

	const datasetsQuery = useQuery({
		...orpc.dataExport.listDatasets.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});
	const datasets = (datasetsQuery.data ?? []) as ExportDataset[];

	// ─── Mutations ────────────────────────────────────────────────────────────

	// Single per-row mutation; the `entity` variable lets us spin only the row
	// being downloaded (mutation.variables === entity while pending).
	const downloadMutation = useMutation({
		mutationFn: (entity: string) =>
			client.dataExport.exportDataset({
				organizationId: organizationId!,
				entity,
				branchId: scopeNodeId ?? undefined,
			}),
		onSuccess: (res) => {
			downloadCsv(res.filename, res.csv);
			if (res.truncated) {
				toast.warning(
					"Export capped at 50,000 rows — this dataset is larger and was truncated.",
				);
			} else {
				toast.success("Export ready — downloading.");
			}
		},
		onError: (err: Error) => toast.error(err.message || "Export failed."),
	});

	const exportAllMutation = useMutation({
		mutationFn: () =>
			client.dataExport.exportAll({
				organizationId: organizationId!,
				branchId: scopeNodeId ?? undefined,
			}),
		onSuccess: (res) => {
			downloadZipBase64(res.filename, res.zipBase64);
			if (res.truncatedDatasets.length > 0) {
				toast.warning(
					`Some datasets were capped at 50,000 rows: ${res.truncatedDatasets.join(", ")}.`,
				);
			} else {
				toast.success("Full export ready — downloading ZIP.");
			}
		},
		onError: (err: Error) => toast.error(err.message || "Export failed."),
	});

	// ─── Guard ────────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3]">
				<div className="sticky top-0 z-10 border-b border-[#e5e5e5] bg-white px-7 py-5">
					<h1 className="text-[15px] font-bold text-[#0a0a0a]">Export Data</h1>
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
				<h1 className="text-[15px] font-bold text-[#0a0a0a]">Export Data</h1>
				<p className="mt-0.5 text-xs text-[#737373]">
					Download your business data as CSV files. Exports respect your current
					branch scope, so you only get the branches you can access.
				</p>
			</div>

			<div className="space-y-6 px-7 py-6">
				{/* ── Export everything (ZIP) ── */}
				<section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div>
							<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
								Full backup
							</p>
							<h2 className="text-[15px] font-bold text-[#0a0a0a]">
								Export everything (ZIP)
							</h2>
							<p className="mt-0.5 text-xs text-[#6b7170]">
								Bundles every dataset below into a single ZIP archive. This can
								take a few seconds for larger gyms.
							</p>
						</div>
						{canExport && (
							<button
								type="button"
								onClick={() => exportAllMutation.mutate()}
								disabled={exportAllMutation.isPending}
								className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#0a0a0a] px-4 text-[13px] font-medium text-white transition-opacity hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-50"
							>
								{exportAllMutation.isPending ? (
									<>
										<span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
										Zipping…
									</>
								) : (
									<>
										<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
											<path
												d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10"
												stroke="currentColor"
												strokeWidth="1.6"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
										Export all (ZIP)
									</>
								)}
							</button>
						)}
					</div>
				</section>

				{/* ── Per-dataset CSV downloads ── */}
				<section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
					<div className="mb-4">
						<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Datasets
						</p>
						<h2 className="text-[15px] font-bold text-[#0a0a0a]">
							Download individual CSVs
						</h2>
					</div>

					{datasetsQuery.isLoading ? (
						<p className="py-6 text-center text-sm text-[#6b7170]">Loading…</p>
					) : datasetsQuery.isError ? (
						<p className="py-6 text-center text-sm text-[#b91c1c]">
							Could not load datasets.
						</p>
					) : datasets.length === 0 ? (
						<p className="py-6 text-center text-sm text-[#6b7170]">
							No datasets available.
						</p>
					) : (
						<div className="overflow-x-auto rounded-xl border border-[#edede4]">
							<table className="w-full border-collapse text-[13px]">
								<thead>
									<tr>
										{[
											{ key: "dataset", label: "Dataset" },
											{ key: "description", label: "Description" },
											{ key: "actions", label: "" },
										].map((h) => (
											<th
												key={h.key}
												className="whitespace-nowrap border-b border-[#edede4] bg-[#faf9f5] px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6b7170]"
											>
												{h.label}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{datasets.map((ds) => {
										const isDownloading =
											downloadMutation.isPending &&
											downloadMutation.variables === ds.entity;
										return (
											<tr
												key={ds.entity}
												className="border-b border-[#f7f5ee] last:border-b-0"
											>
												<td className="px-3.5 py-2.5 align-middle font-medium text-[13px] text-[#0a0a0a]">
													{ds.label}
												</td>
												<td className="px-3.5 py-2.5 align-middle text-[13px] text-[#6b7170]">
													{ds.description}
												</td>
												<td className="px-3.5 py-2.5 align-middle text-right">
													{canExport && (
														<button
															type="button"
															onClick={() => downloadMutation.mutate(ds.entity)}
															disabled={downloadMutation.isPending}
															className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-[#e5e5e5] bg-white px-3.5 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:cursor-not-allowed disabled:opacity-50"
														>
															{isDownloading ? (
																<>
																	<span className="size-3 animate-spin rounded-full border-2 border-[#d4d4d4] border-t-[#0a0a0a]" />
																	Preparing…
																</>
															) : (
																<>
																	<svg
																		width="13"
																		height="13"
																		viewBox="0 0 16 16"
																		fill="none"
																	>
																		<path
																			d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10"
																			stroke="currentColor"
																			strokeWidth="1.6"
																			strokeLinecap="round"
																			strokeLinejoin="round"
																		/>
																	</svg>
																	Download CSV
																</>
															)}
														</button>
													)}
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
