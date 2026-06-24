import { Check, UserPlus } from "lucide-react";
import { useState } from "react";

import { AddCustomerForm } from "@/components/customers/add-customer-dialog";
import { PayoutsTab } from "@/components/pages/commissions/payouts-tab";
import { PackageInstallmentsPage } from "@/components/pages/packages/installments-page";
import { MembershipsPage } from "@/components/pages/packages/memberships-page";
import { PosWorkflow } from "@/components/pos/pos-workflow";

import type { LaunchpadCardId } from "./cards";
import { CustomersPanel } from "./customers-panel";
import { RefundsPanel } from "./refunds-panel";
import { SchedulePanel } from "./schedule-panel";

type PanelProps = { organizationId: string };

function NewSalePanel({ organizationId: _organizationId }: PanelProps) {
	// PosWorkflow reads organizationId from useUserContext internally.
	return (
		<div className="-mx-6 -my-6 flex h-full flex-col overflow-hidden">
			<PosWorkflow />
		</div>
	);
}

function NewCustomerPanel({ organizationId }: PanelProps) {
	return (
		<div className="@container -m-6 h-full min-h-[460px]">
			<div className="grid h-full min-h-[460px] grid-cols-1 overflow-hidden rounded-2xl @2xl:grid-cols-[300px_minmax(0,1fr)]">
				{/* Context aside */}
				<aside className="flex flex-col bg-gradient-to-b from-[#111317] to-[#1c1f26] p-8 text-white">
					<span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-white">
						<UserPlus className="size-6" />
					</span>
					<p className="mt-5 text-[10px] font-bold uppercase tracking-widest !text-white/55">
						Customer Directory
					</p>
					<h2 className="mt-1 text-2xl font-bold tracking-tight !text-white">
						Create Customer
					</h2>
					<p className="mt-3 text-sm leading-relaxed !text-white/60">
						Register a new member with the essentials. Staff can complete the
						full profile later or start a sale straight after.
					</p>
					<ul className="mt-auto space-y-2.5 pt-8 text-sm text-white/70">
						<li className="flex items-center gap-2.5">
							<Check className="size-4 shrink-0 text-emerald-400" />
							Takes under a minute
						</li>
						<li className="flex items-center gap-2.5">
							<Check className="size-4 shrink-0 text-emerald-400" />
							Sign-in link sent on request
						</li>
					</ul>
				</aside>

				{/* Form */}
				<div className="overflow-y-auto bg-white p-8">
					<AddCustomerForm organizationId={organizationId} wide />
				</div>
			</div>
		</div>
	);
}

function PayoutsPanel({ organizationId }: PanelProps) {
	const [recipientId, setRecipientId] = useState<string | undefined>(undefined);
	return (
		<div className="-mx-6 -my-6 flex h-full min-h-[460px] flex-col overflow-hidden">
			<PayoutsTab
				organizationId={organizationId}
				recipientId={recipientId}
				onSelectRecipient={(id) => setRecipientId(id ?? undefined)}
			/>
		</div>
	);
}

/** Maps a card id to the panel rendered on the right. */
export function LaunchpadPanel({
	id,
	organizationId,
}: {
	id: LaunchpadCardId;
	organizationId: string;
}) {
	switch (id) {
		case "new-sale":
			return <NewSalePanel organizationId={organizationId} />;
		case "new-customer":
			return <NewCustomerPanel organizationId={organizationId} />;
		case "customers":
			return <CustomersPanel organizationId={organizationId} />;
		case "renewals":
			return (
				<div className="-mx-6 -my-6 flex h-full min-h-[460px] flex-col overflow-auto">
					<MembershipsPage />
				</div>
			);
		case "installments":
			return (
				<div className="-mx-6 -my-6 flex h-full min-h-[460px] flex-col overflow-auto">
					<PackageInstallmentsPage />
				</div>
			);
		case "refunds":
			return <RefundsPanel organizationId={organizationId} />;
		case "payouts":
			return <PayoutsPanel organizationId={organizationId} />;
		case "schedule":
			return <SchedulePanel organizationId={organizationId} />;
		default:
			return null;
	}
}
