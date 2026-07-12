/**
 * Branded receipt document body. Renders from the
 * receipts.getPrintViewForInvoice payload: the snapshotted payment lines
 * (installments-only for installment sales — see receipt.service.ts), total
 * received, and the "against invoice" cross-reference.
 */

import type { client } from "@/utils/orpc";
import { DocumentShell, fmtDocDate, myr } from "./document-shell";

export type ReceiptPrintPayload = Awaited<
	ReturnType<typeof client.receipts.getPrintViewForInvoice>
>;

const methodLabel = (method: string): string =>
	method.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function ReceiptDocument({ data }: { data: ReceiptPrintPayload }) {
	const { receipt, invoiceStatus, identity, branch, customer } = data;

	const meta: Array<[string, string]> = [
		["Receipt no.", receipt.receiptNumber],
		["Issue date", fmtDocDate(receipt.date)],
	];
	if (receipt.invoiceNumber)
		meta.push(["Against invoice", receipt.invoiceNumber]);
	if (branch) meta.push(["Branch", branch.name]);

	const displayName = identity.legalName ?? identity.orgName ?? "us";

	return (
		<DocumentShell
			docType="RECEIPT"
			documentNumber={receipt.receiptNumber}
			status={invoiceStatus === "partially_paid" ? "partially_paid" : "paid"}
			identity={identity}
			branch={branch}
			customer={customer}
			meta={meta}
			footer={
				<p>
					<span className="font-bold text-[#16181d]">Received with thanks</span>{" "}
					by {displayName}
					{branch ? ` (${branch.name})` : ""}.{" "}
					{receipt.invoiceNumber ? (
						<>
							This receipt is issued against invoice{" "}
							<span className="font-bold text-[#16181d]">
								{receipt.invoiceNumber}
							</span>{" "}
							and acknowledges the payment(s) listed above.{" "}
						</>
					) : (
						<>This receipt acknowledges the payment(s) listed above. </>
					)}
					Please retain this document for your records.
				</p>
			}
		>
			{/* Payment lines */}
			<table className="w-full text-sm">
				<thead>
					<tr className="border-[#16181d] border-b-2 text-left">
						<th className="pb-3 font-semibold text-[#a1a1aa] text-xs uppercase tracking-[0.2em]">
							Payment date
						</th>
						<th className="pb-3 font-semibold text-[#a1a1aa] text-xs uppercase tracking-[0.2em]">
							Method
						</th>
						<th className="pb-3 font-semibold text-[#a1a1aa] text-xs uppercase tracking-[0.2em]">
							Reference
						</th>
						<th className="pb-3 text-right font-semibold text-[#a1a1aa] text-xs uppercase tracking-[0.2em]">
							Amount
						</th>
					</tr>
				</thead>
				<tbody>
					{receipt.lines.map((line, i) => (
						<tr
							key={`${line.reference}-${i}`}
							className="border-[#f4f4f5] border-b"
						>
							<td className="py-4 font-bold text-[#16181d]">
								{fmtDocDate(line.date)}
							</td>
							<td className="py-4 text-[#52525b]">
								{methodLabel(line.method)}
							</td>
							<td className="py-4 text-[#52525b]">{line.reference}</td>
							<td className="py-4 text-right font-medium text-[#16181d]">
								{myr(line.amountCents)}
							</td>
						</tr>
					))}
				</tbody>
			</table>

			{/* Total received */}
			<div className="mt-6 flex justify-end">
				<div className="w-full max-w-sm space-y-1.5">
					<div className="flex items-baseline justify-between border-[#16181d] border-t-2 pt-3">
						<span className="font-bold text-[#16181d] text-base">
							Total received
						</span>
						<span className="font-extrabold text-2xl text-teal-700">
							{myr(receipt.totalAmount)}
						</span>
					</div>
					<p className="text-right text-[#a1a1aa] text-sm">
						{receipt.lines.length} payment
						{receipt.lines.length === 1 ? "" : "s"} covered
					</p>
				</div>
			</div>
		</DocumentShell>
	);
}
