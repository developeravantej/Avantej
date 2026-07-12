/**
 * Branded invoice document body. Renders from the invoices.getPrintView
 * payload:
 *
 * - Line items come from the payment_items snapshot (goods rows); the SST and
 *   discount rows are the snapshotted type='tax' / type='discount' items —
 *   nothing is recomputed client-side.
 * - The Subtotal/SST/discount breakdown renders ONLY when the snapshot
 *   reconciles with invoices.totalAmount (`reconciles`); manual/legacy
 *   invoices fall back to a single-total document rather than printing a
 *   fabricated tax split.
 * - For installment sales, Paid to date / Balance due come from the
 *   installment summary (plan total includes the installment premium;
 *   invoice.amountPaid goes stale after installment #1 by design).
 */

import type { client } from "@/utils/orpc";
import { DocumentShell, fmtDocDate, myr } from "./document-shell";

export type InvoicePrintPayload = Awaited<
	ReturnType<typeof client.invoices.getPrintView>
>;

export function InvoiceDocument({ data }: { data: InvoicePrintPayload }) {
	const {
		invoice,
		goodsItems,
		taxItems,
		discountItems,
		subtotalCents,
		reconciles,
		installmentSummary,
		identity,
		branch,
		customer,
	} = data;

	// Balance math — installment sales must use the plan totals (see header note).
	const paidToDate = installmentSummary
		? installmentSummary.paidToDateCents
		: invoice.amountPaid;
	const totalDue = installmentSummary
		? installmentSummary.planTotalCents
		: invoice.totalAmount;
	const balance = totalDue - paidToDate;

	const meta: Array<[string, string]> = [
		["Invoice no.", invoice.invoiceNumber],
		["Issue date", fmtDocDate(invoice.date)],
	];
	if (branch) meta.push(["Branch", branch.name]);

	const displayName = identity.legalName ?? identity.orgName ?? "us";

	return (
		<DocumentShell
			docType="INVOICE"
			documentNumber={invoice.invoiceNumber}
			status={invoice.status}
			identity={identity}
			branch={branch}
			customer={customer}
			meta={meta}
			footer={
				<p>
					<span className="font-bold text-[#16181d]">Thank you.</span>{" "}
					{identity.footerNote ??
						`This invoice is issued by ${displayName}${branch ? ` for services rendered at ${branch.name}` : ""}. Please retain this document for your records.`}
				</p>
			}
		>
			{/* Line items */}
			<table className="w-full text-sm">
				<thead>
					<tr className="border-[#16181d] border-b-2 text-left">
						<th className="pb-3 font-semibold text-[#a1a1aa] text-xs uppercase tracking-[0.2em]">
							Description
						</th>
						<th className="pb-3 text-center font-semibold text-[#a1a1aa] text-xs uppercase tracking-[0.2em]">
							Qty
						</th>
						<th className="pb-3 text-right font-semibold text-[#a1a1aa] text-xs uppercase tracking-[0.2em]">
							Unit price
						</th>
						<th className="pb-3 text-right font-semibold text-[#a1a1aa] text-xs uppercase tracking-[0.2em]">
							Amount
						</th>
					</tr>
				</thead>
				<tbody>
					{goodsItems.length > 0 ? (
						goodsItems.map((item) => (
							<tr key={item.id} className="border-[#f4f4f5] border-b">
								<td className="py-4 font-bold text-[#16181d]">
									{item.description}
								</td>
								<td className="py-4 text-center text-[#52525b]">
									{item.quantity}
								</td>
								<td className="py-4 text-right text-[#52525b]">
									{myr(item.unitPrice)}
								</td>
								<td className="py-4 text-right font-medium text-[#16181d]">
									{myr(item.totalPrice)}
								</td>
							</tr>
						))
					) : (
						<tr className="border-[#f4f4f5] border-b">
							<td className="py-4 font-bold text-[#16181d]" colSpan={3}>
								{invoice.paymentMode
									? `Payment (${invoice.paymentMode.replace(/_/g, " ")})`
									: "Amount due"}
							</td>
							<td className="py-4 text-right font-medium text-[#16181d]">
								{myr(invoice.totalAmount)}
							</td>
						</tr>
					)}
				</tbody>
			</table>

			{/* Totals */}
			<div className="mt-6 flex justify-end">
				<div className="w-full max-w-sm space-y-2.5 text-sm">
					{reconciles && (
						<>
							<div className="flex justify-between">
								<span className="text-[#52525b]">Subtotal (pre-tax)</span>
								<span className="font-bold text-[#16181d]">
									{myr(subtotalCents)}
								</span>
							</div>
							{discountItems.map((d) => (
								<div key={d.id} className="flex justify-between">
									<span className="text-[#52525b]">{d.description}</span>
									<span className="font-bold text-[#16181d]">
										{myr(d.totalPrice)}
									</span>
								</div>
							))}
							{taxItems.map((t) => (
								<div key={t.id} className="flex justify-between">
									<span className="text-[#52525b]">{t.description}</span>
									<span className="font-bold text-[#16181d]">
										{myr(t.totalPrice)}
									</span>
								</div>
							))}
						</>
					)}
					<div className="flex items-baseline justify-between border-[#16181d] border-t-2 pt-3">
						<span className="font-bold text-[#16181d] text-base">Total</span>
						<span className="font-extrabold text-2xl text-teal-700">
							{myr(invoice.totalAmount)}
						</span>
					</div>
					{installmentSummary && (
						<div className="flex justify-between">
							<span className="text-[#52525b]">
								Payment plan total ({installmentSummary.totalCount}{" "}
								installments, incl. premium)
							</span>
							<span className="font-bold text-[#16181d]">
								{myr(installmentSummary.planTotalCents)}
							</span>
						</div>
					)}
					<div className="flex justify-between">
						<span className="text-[#52525b]">Paid to date</span>
						<span className="font-medium text-[#16181d]">
							{myr(paidToDate)}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-[#52525b]">Balance due</span>
						<span className="font-medium text-[#16181d]">
							{balance <= 0 ? "Fully paid" : myr(balance)}
						</span>
					</div>
				</div>
			</div>
		</DocumentShell>
	);
}
