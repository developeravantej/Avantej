/**
 * Shared visual shell for the branded printable documents (invoice +
 * receipt), matching the approved mockup: dark header block with tenant logo
 * / doc-type label / number / status pill, teal accent rule, FROM · BILLED TO
 * · meta grid, content slot (items table + totals), footer note, and a
 * screen-only action bar (Back, Print / Save as PDF → window.print()).
 *
 * Print behaviour: the route lives under the bare `_print` layout (no
 * sidebar/topbar), the action bar is `print:hidden`, and the embedded style
 * block pins A4 sizing + exact color reproduction for the dark header.
 */

import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import type React from "react";

export type DocumentIdentity = {
	orgName: string | null;
	legalName: string | null;
	registrationNo: string | null;
	address: string | null;
	footerNote: string | null;
	logoDataUrl: string | null;
};

export type DocumentBranch = { name: string; address: string | null } | null;

export type DocumentCustomer = {
	name: string;
	phone: string | null;
	email: string | null;
};

export const myr = (cents: number): string =>
	`MYR ${(cents / 100).toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;

export const fmtDocDate = (d: string | Date | null | undefined): string => {
	if (!d) return "—";
	try {
		return new Date(d).toLocaleDateString("en-GB", {
			day: "numeric",
			month: "short",
			year: "numeric",
		});
	} catch {
		return "—";
	}
};

const STATUS_STYLES: Record<string, string> = {
	paid: "bg-amber-400 text-[#16181d]",
	partially_paid: "bg-amber-400 text-[#16181d]",
	pending: "bg-gray-300 text-[#16181d]",
	overdue: "bg-red-500 text-white",
	cancelled: "bg-gray-400 text-white",
	draft: "bg-gray-300 text-[#16181d]",
	sent: "bg-blue-300 text-[#16181d]",
};

export function DocumentShell({
	docType,
	documentNumber,
	status,
	identity,
	branch,
	customer,
	meta,
	footer,
	children,
}: {
	docType: "INVOICE" | "RECEIPT";
	documentNumber: string;
	status: string;
	identity: DocumentIdentity;
	branch: DocumentBranch;
	customer: DocumentCustomer;
	/** Right-hand meta rows, e.g. [["Invoice no.", "INV-…"], ["Issue date", "2 Jul 2026"]]. */
	meta: Array<[string, string]>;
	footer: React.ReactNode;
	children: React.ReactNode;
}) {
	const router = useRouter();
	const displayName = identity.legalName ?? identity.orgName ?? "—";
	const statusClass = STATUS_STYLES[status] ?? "bg-gray-300 text-[#16181d]";

	return (
		<div className="min-h-screen bg-[#f4f4f5] px-4 py-6 print:bg-white print:p-0">
			<style>{`
				@page { size: A4; margin: 10mm; }
				@media print {
					.print-doc-card, .print-doc-card * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
				}
			`}</style>

			{/* Screen-only action bar */}
			<div className="mx-auto mb-4 flex max-w-4xl items-center justify-end gap-3 print:hidden">
				<button
					type="button"
					onClick={() => router.history.back()}
					className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 font-semibold text-[#16181d] text-sm shadow-sm transition hover:bg-gray-50"
				>
					<ArrowLeft className="h-4 w-4" />
					Back
				</button>
				<button
					type="button"
					onClick={() => window.print()}
					className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 font-semibold text-sm text-white shadow-sm transition hover:bg-teal-800"
				>
					<Printer className="h-4 w-4" />
					Print / Save as PDF
				</button>
			</div>

			{/* Document card */}
			<div className="print-doc-card mx-auto max-w-4xl overflow-hidden rounded-2xl bg-white shadow-lg print:max-w-none print:rounded-none print:shadow-none">
				{/* Dark header */}
				<div className="border-teal-700 border-b-4 bg-[#16181d] px-10 py-10">
					<div className="flex items-start justify-between gap-6">
						<div className="flex min-h-14 items-center">
							{identity.logoDataUrl ? (
								<img
									src={identity.logoDataUrl}
									alt={displayName}
									className="max-h-14 max-w-52 object-contain"
								/>
							) : (
								<span className="font-extrabold text-3xl text-white tracking-tight">
									{displayName}
								</span>
							)}
						</div>
						<div className="text-right">
							<p className="font-bold text-amber-400 text-xs uppercase tracking-[0.3em]">
								{docType}
							</p>
							<p className="mt-1 font-bold text-2xl text-white">
								{documentNumber}
							</p>
							<span
								className={`mt-3 inline-block rounded-full px-4 py-1 font-bold text-xs uppercase tracking-wide ${statusClass}`}
							>
								{status.replace(/_/g, " ")}
							</span>
						</div>
					</div>
				</div>

				{/* From / Billed to / Meta */}
				<div className="grid grid-cols-1 gap-8 px-10 pt-10 pb-6 sm:grid-cols-3">
					<div>
						<p className="font-semibold text-[#a1a1aa] text-xs uppercase tracking-[0.2em]">
							From
						</p>
						<p className="mt-2 font-bold text-[#16181d] text-base leading-snug">
							{displayName}
						</p>
						<div className="mt-1 space-y-0.5 text-[#52525b] text-sm">
							{branch && <p>{branch.name} · Malaysia</p>}
							{(branch?.address ?? identity.address) && (
								<p className="whitespace-pre-line">
									{branch?.address ?? identity.address}
								</p>
							)}
							{identity.registrationNo && (
								<p>Reg. No. {identity.registrationNo}</p>
							)}
						</div>
					</div>
					<div>
						<p className="font-semibold text-[#a1a1aa] text-xs uppercase tracking-[0.2em]">
							Billed to
						</p>
						<p className="mt-2 font-bold text-[#16181d] text-base leading-snug">
							{customer.name}
						</p>
						<div className="mt-1 space-y-0.5 text-[#52525b] text-sm">
							{customer.phone && <p>{customer.phone}</p>}
							{customer.email && <p>{customer.email}</p>}
						</div>
					</div>
					<div className="space-y-1.5 text-sm">
						{meta.map(([label, value]) => (
							<div key={label} className="flex justify-between gap-4">
								<span className="text-[#52525b]">{label}</span>
								<span className="text-right font-bold text-[#16181d]">
									{value}
								</span>
							</div>
						))}
					</div>
				</div>

				{/* Content (items table + totals) */}
				<div className="px-10 pb-8">{children}</div>

				{/* Footer */}
				<div className="mx-10 border-[#e4e4e7] border-t py-6 text-[#52525b] text-sm leading-relaxed">
					{footer}
				</div>
			</div>
		</div>
	);
}
