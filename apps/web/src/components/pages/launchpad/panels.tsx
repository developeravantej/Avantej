import { UserPlus } from "lucide-react";
import { useState } from "react";

import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { PayoutsTab } from "@/components/pages/commissions/payouts-tab";
import { PackageInstallmentsPage } from "@/components/pages/packages/installments-page";
import { PosWorkflow } from "@/components/pos/pos-workflow";
import { Button } from "@/components/ui/button";

import type { LaunchpadCardId } from "./cards";
import { CustomersPanel } from "./customers-panel";
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
	const [open, setOpen] = useState(false);
	return (
		<div className="flex h-full flex-col">
			<h2 className="text-lg font-semibold tracking-tight">Create Customer</h2>
			<p className="mt-1 max-w-prose text-sm text-muted-foreground">
				Register a new member. Minimal fields now — staff can complete the
				profile later or start a sale straight after.
			</p>
			<div className="mt-6">
				<Button onClick={() => setOpen(true)}>
					<UserPlus className="mr-1 size-4" />
					New customer
				</Button>
			</div>
			<AddCustomerDialog
				open={open}
				onOpenChange={setOpen}
				organizationId={organizationId}
			/>
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
		case "installments":
			return (
				<div className="-mx-6 -my-6 flex h-full min-h-[460px] flex-col overflow-auto">
					<PackageInstallmentsPage />
				</div>
			);
		case "payouts":
			return <PayoutsPanel organizationId={organizationId} />;
		case "schedule":
			return <SchedulePanel organizationId={organizationId} />;
		default:
			return null;
	}
}
