import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { AssignedPackage } from "../api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateStr(value: string | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return value;
	}
}

function StatusBadge({ status }: { status: AssignedPackage["status"] }) {
	if (status === "frozen") {
		return (
			<Badge className="bg-blue-100 text-blue-700 border-blue-200">
				Frozen
			</Badge>
		);
	}
	return (
		<Badge className="bg-green-100 text-green-700 border-green-200">
			Active
		</Badge>
	);
}

// ---------------------------------------------------------------------------
// Field row
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{label}
			</span>
			<div className="text-sm text-foreground">{children}</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

interface AssignedPackageDrawerProps {
	pkg: AssignedPackage | null;
	open: boolean;
	onClose: () => void;
}

export function AssignedPackageDrawer({
	pkg,
	open,
	onClose,
}: AssignedPackageDrawerProps) {
	return (
		<Sheet open={open} onOpenChange={(v) => !v && onClose()}>
			<SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="assigned-package-drawer">
				<SheetHeader className="mb-4">
					<SheetTitle>Package Details</SheetTitle>
					<SheetDescription>
						Read-only view of this assigned package.
					</SheetDescription>
				</SheetHeader>

				{pkg ? (
					<div className="flex flex-col gap-5 px-1">
						<Field label="Client">
							<span data-testid="drawer-client-name">{pkg.clientDisplayName}</span>
						</Field>

						<Field label="Service">
							<span data-testid="drawer-service-name">{pkg.serviceName}</span>
						</Field>

						<Separator />

						<Field label="Status">
							<StatusBadge status={pkg.status} />
						</Field>

						<Field label="Credits Remaining">
							<span className="font-medium tabular-nums">{pkg.creditsRemaining}</span>
						</Field>

						<Field label="Next Due">
							{formatDateStr(pkg.nextDueDate)}
						</Field>

						{pkg.status === "frozen" && pkg.frozenUntil && (
							<Field label="Frozen Until">
								{formatDateStr(pkg.frozenUntil)}
							</Field>
						)}

						<Separator />

						<Field label="Assigned On">
							{formatDateStr(pkg.createdAt)}
						</Field>
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
