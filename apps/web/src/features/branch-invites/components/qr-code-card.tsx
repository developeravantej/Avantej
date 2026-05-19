import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Copy, Download, QrCode, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
	useBranchInvites,
	useCreateBranchInvite,
	useRegenerateBranchInvite,
	useRevokeBranchInvite,
} from "../api";
import { BranchInviteList } from "./branch-invite-list";

interface QrCodeCardProps {
	organizationId: string;
	branchId: string;
	branchName: string;
}

export function QrCodeCard({
	organizationId,
	branchId,
	branchName,
}: QrCodeCardProps) {
	const { data: invites, isLoading } = useBranchInvites(
		organizationId,
		branchId,
	);
	const createMutation = useCreateBranchInvite(organizationId, branchId);
	const revokeMutation = useRevokeBranchInvite(organizationId, branchId);
	const regenerateMutation = useRegenerateBranchInvite(
		organizationId,
		branchId,
	);

	// Dialog state for the QR display after generation
	const [qrDialog, setQrDialog] = useState<{
		open: boolean;
		url: string;
		id: string;
	}>({ open: false, url: "", id: "" });

	const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
	const [confirmRegenerate, setConfirmRegenerate] = useState<string | null>(
		null,
	);
	const [copied, setCopied] = useState(false);

	const qrRef = useRef<SVGSVGElement>(null);

	const activeInvite = invites?.find(
		(i: { isActive: boolean }) => i.isActive,
	);

	const handleGenerate = useCallback(() => {
		createMutation.mutate(
			{},
			{
				onSuccess: (data: { id: string; token: string; url: string }) => {
					setQrDialog({ open: true, url: data.url, id: data.id });
				},
			},
		);
	}, [createMutation]);

	const handleCopyUrl = useCallback(async (url: string) => {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			toast.success("Link copied to clipboard.");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Failed to copy link.");
		}
	}, []);

	const handleDownload = useCallback((url: string) => {
		// Create an offscreen canvas to rasterise the SVG, then download as PNG
		const svg = document.querySelector<SVGSVGElement>(
			"[data-qr-download]",
		);
		if (!svg) {
			toast.error("Could not find QR element.");
			return;
		}

		const serialised = new XMLSerializer().serializeToString(svg);
		const blob = new Blob([serialised], { type: "image/svg+xml" });
		const objectUrl = URL.createObjectURL(blob);

		// Draw onto canvas
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement("canvas");
			const size = 512;
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, size, size);
			ctx.drawImage(img, 0, 0, size, size);
			URL.revokeObjectURL(objectUrl);

			canvas.toBlob((pngBlob) => {
				if (!pngBlob) return;
				const pngUrl = URL.createObjectURL(pngBlob);
				const a = document.createElement("a");
				a.href = pngUrl;
				a.download = `qr-${branchName.replace(/\s+/g, "-").toLowerCase()}.png`;
				a.click();
				URL.revokeObjectURL(pngUrl);
			}, "image/png");
		};
		img.src = objectUrl;
	}, [branchName]);

	return (
		<>
			<Card>
				<CardHeader className="pb-3">
					<div className="flex items-center gap-2">
						<div className="rounded-lg bg-primary/10 p-1.5">
							<QrCode className="h-4 w-4 text-primary" />
						</div>
						<div>
							<CardTitle className="text-base">Customer Onboarding QR Code</CardTitle>
							<CardDescription className="text-xs mt-0.5">
								Customers scan this code to self-register at this branch.
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className="space-y-2">
							<Skeleton className="h-8 w-32" />
						</div>
					) : activeInvite ? (
						<ActiveQrView
							invite={activeInvite as { id: string; url: string; usesCount: number; maxUses?: number | null; createdAt: string | Date; isActive: boolean }}
							branchName={branchName}
							onCopy={handleCopyUrl}
							onDownload={handleDownload}
							copied={copied}
							onRevoke={(id) => setConfirmRevoke(id)}
							onRegenerate={(id) => setConfirmRegenerate(id)}
							isRevoking={revokeMutation.isPending}
							isRegenerating={regenerateMutation.isPending}
						/>
					) : (
						<div className="flex flex-col items-start gap-3">
							<p className="text-sm text-muted-foreground">
								No active QR code for this branch. Generate one to let customers self-register.
							</p>
							<Button
								size="sm"
								onClick={handleGenerate}
								disabled={createMutation.isPending}
								data-testid="generate-qr-button"
							>
								{createMutation.isPending ? "Generating..." : "Generate QR"}
							</Button>
						</div>
					)}

					{/* Invite list (all active invites) */}
					{!isLoading && invites && invites.length > 1 && (
						<BranchInviteList
							organizationId={organizationId}
							branchId={branchId}
						/>
					)}
				</CardContent>
			</Card>

			{/* New QR dialog (shown immediately after generation) */}
			<Dialog
				open={qrDialog.open}
				onOpenChange={(open) => !open && setQrDialog((s) => ({ ...s, open: false }))}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>QR Code Ready</DialogTitle>
						<DialogDescription>
							Print or share this code at the {branchName} reception desk.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col items-center gap-4 py-2">
						{qrDialog.url && (
							<QRCodeSVG
								data-qr-download
								value={qrDialog.url}
								size={220}
								level="M"
								includeMargin
							/>
						)}
						<p
							className="text-xs text-muted-foreground break-all text-center max-w-xs"
							data-testid="invite-url-input"
						>
							{qrDialog.url}
						</p>
					</div>
					<DialogFooter className="flex gap-2 sm:gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => handleCopyUrl(qrDialog.url)}
							className="flex-1"
						>
							{copied ? (
								<Check className="mr-1.5 h-3.5 w-3.5" />
							) : (
								<Copy className="mr-1.5 h-3.5 w-3.5" />
							)}
							{copied ? "Copied" : "Copy URL"}
						</Button>
						<Button
							size="sm"
							onClick={() => handleDownload(qrDialog.url)}
							className="flex-1"
						>
							<Download className="mr-1.5 h-3.5 w-3.5" />
							Download PNG
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Revoke confirm */}
			<Dialog
				open={confirmRevoke !== null}
				onOpenChange={(open) => !open && setConfirmRevoke(null)}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Revoke QR code?</DialogTitle>
						<DialogDescription>
							This code will stop working immediately. Previously signed-up
							customers are not affected.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmRevoke(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={revokeMutation.isPending}
							onClick={() => {
								if (confirmRevoke) {
									revokeMutation.mutate(confirmRevoke, {
										onSuccess: () => setConfirmRevoke(null),
									});
								}
							}}
						>
							{revokeMutation.isPending ? "Revoking..." : "Revoke"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Regenerate confirm */}
			<Dialog
				open={confirmRegenerate !== null}
				onOpenChange={(open) => !open && setConfirmRegenerate(null)}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Regenerate QR code?</DialogTitle>
						<DialogDescription>
							The current code will be revoked and a new one will be issued.
							Make sure to update any printed materials.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setConfirmRegenerate(null)}
						>
							Cancel
						</Button>
						<Button
							disabled={regenerateMutation.isPending}
							onClick={() => {
								if (confirmRegenerate) {
									regenerateMutation.mutate(confirmRegenerate, {
										onSuccess: (data: { id: string; token: string; url: string }) => {
											setConfirmRegenerate(null);
											setQrDialog({ open: true, url: data.url, id: data.id });
										},
									});
								}
							}}
						>
							{regenerateMutation.isPending ? "Regenerating..." : "Regenerate"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Hidden QR for download */}
			<div className="sr-only" aria-hidden>
				<svg ref={qrRef} />
			</div>
		</>
	);
}

// ---------------------------------------------------------------------------
// Active QR sub-view (inline in card when invite already exists)
// ---------------------------------------------------------------------------

interface ActiveQrViewProps {
	invite: {
		id: string;
		url: string;
		usesCount: number;
		maxUses?: number | null;
		createdAt: string | Date;
		isActive: boolean;
	};
	branchName: string;
	onCopy: (url: string) => void;
	onDownload: (url: string) => void;
	copied: boolean;
	onRevoke: (id: string) => void;
	onRegenerate: (id: string) => void;
	isRevoking: boolean;
	isRegenerating: boolean;
}

function ActiveQrView({
	invite,
	branchName,
	onCopy,
	onDownload,
	copied,
	onRevoke,
	onRegenerate,
	isRevoking,
	isRegenerating,
}: ActiveQrViewProps) {
	const url = invite.url;

	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-start">
			{/* QR code */}
			<div className="flex-shrink-0">
				<QRCodeSVG
					data-qr-download
					value={url}
					size={160}
					level="M"
					includeMargin
					className="rounded-lg border"
				/>
			</div>

			{/* Info + actions */}
			<div className="flex flex-1 flex-col gap-3">
				<div>
					<p className="text-sm font-medium">{branchName}</p>
					<p className="text-xs text-muted-foreground mt-0.5 break-all">{url}</p>
				</div>

				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span>
						{invite.usesCount}
						{invite.maxUses != null ? `/${invite.maxUses}` : ""} sign-ups
					</span>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => onCopy(url)}
					>
						{copied ? (
							<Check className="mr-1.5 h-3.5 w-3.5" />
						) : (
							<Copy className="mr-1.5 h-3.5 w-3.5" />
						)}
						{copied ? "Copied" : "Copy URL"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => onDownload(url)}
					>
						<Download className="mr-1.5 h-3.5 w-3.5" />
						Download
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={isRegenerating}
						onClick={() => onRegenerate(invite.id)}
					>
						<RefreshCw className="mr-1.5 h-3.5 w-3.5" />
						{isRegenerating ? "..." : "Regenerate"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="text-destructive hover:text-destructive"
						disabled={isRevoking}
						onClick={() => onRevoke(invite.id)}
					>
						{isRevoking ? "Revoking..." : "Revoke"}
					</Button>
				</div>
			</div>
		</div>
	);
}
