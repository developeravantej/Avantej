import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Paperclip, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";

interface PaymentProofSectionProps {
	organizationId: string;
	packageInstanceId: string;
	canWrite: boolean;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT =
	".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf";

/** Read a File into a bare base64 string (no data-URI prefix). */
function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = String(reader.result);
			resolve(result.slice(result.indexOf(",") + 1));
		};
		reader.onerror = () => reject(reader.error ?? new Error("read failed"));
		reader.readAsDataURL(file);
	});
}

/**
 * Offline payment-proof panel (UAT §7). Staff upload a receipt/slip against a
 * package; files are stored in R2 via packageInstances.uploadPaymentProof. The
 * list lets an admin review proofs before confirming payment (which activates
 * the package via the existing confirmPayment flow).
 */
export function PaymentProofSection({
	organizationId,
	packageInstanceId,
	canWrite,
}: PaymentProofSectionProps) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [downloadingId, setDownloadingId] = useState<string | null>(null);

	const listQuery = orpc.packageInstances.listPaymentProofs.queryOptions({
		input: { organizationId, packageInstanceId },
	});
	const { data: proofs = [], isLoading } = useQuery(listQuery);

	const uploadMutation = useApiMutation({
		mutationFn: (input: {
			fileName: string;
			contentType: string;
			dataBase64: string;
		}) =>
			client.packageInstances.uploadPaymentProof({
				organizationId,
				packageInstanceId,
				...input,
			}),
		successMessage: "Payment proof uploaded",
		errorMessage: (err) => err.message,
		invalidate: [listQuery.queryKey],
	});

	const onPick = async (file: File | undefined) => {
		if (!file) return;
		if (file.size > MAX_BYTES) {
			toast.error("File is too large (max 10 MB).");
			return;
		}
		try {
			const dataBase64 = await fileToBase64(file);
			uploadMutation.mutate({
				fileName: file.name,
				contentType: file.type || "application/octet-stream",
				dataBase64,
			});
		} catch {
			toast.error("Could not read the selected file.");
		} finally {
			if (fileRef.current) fileRef.current.value = "";
		}
	};

	const onDownload = async (proofId: string) => {
		setDownloadingId(proofId);
		try {
			const res = await client.packageInstances.downloadPaymentProof({
				organizationId,
				proofId,
			});
			const byteChars = atob(res.dataBase64);
			const bytes = new Uint8Array(byteChars.length);
			for (let i = 0; i < byteChars.length; i++)
				bytes[i] = byteChars.charCodeAt(i);
			const blob = new Blob([bytes], { type: res.contentType });
			const url = URL.createObjectURL(blob);
			window.open(url, "_blank", "noopener");
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to open the proof",
			);
		} finally {
			setDownloadingId(null);
		}
	};

	return (
		<>
			<Separator />
			<div className="flex flex-col gap-3 py-5">
				<div className="flex items-center justify-between">
					<span className="flex items-center gap-2 text-sm font-medium">
						<Paperclip className="h-4 w-4" />
						Payment Proof
					</span>
					{canWrite && (
						<>
							<input
								ref={fileRef}
								type="file"
								accept={ACCEPT}
								className="hidden"
								onChange={(e) => onPick(e.target.files?.[0])}
							/>
							<Button
								size="sm"
								variant="outline"
								onClick={() => fileRef.current?.click()}
								disabled={uploadMutation.isPending}
							>
								{uploadMutation.isPending ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									<Upload className="h-3.5 w-3.5" />
								)}
								Upload
							</Button>
						</>
					)}
				</div>

				{isLoading ? (
					<span className="text-xs text-muted-foreground">Loading…</span>
				) : proofs.length === 0 ? (
					<span className="text-xs text-muted-foreground">
						No payment proofs uploaded yet.
					</span>
				) : (
					<ul className="flex flex-col gap-1.5">
						{proofs.map((p) => (
							<li
								key={p.id}
								className="flex items-center justify-between gap-2 rounded-md border border-[#e5e5e5] px-2.5 py-1.5 text-sm"
							>
								<button
									type="button"
									onClick={() => onDownload(p.id)}
									className="flex min-w-0 items-center gap-2 text-left hover:underline"
									title="Open proof"
								>
									{downloadingId === p.id ? (
										<Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
									) : (
										<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									)}
									<span className="truncate">{p.fileName}</span>
								</button>
								<span className="shrink-0 text-xs text-muted-foreground">
									{new Date(p.uploadedAt).toLocaleDateString("en-MY")}
								</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</>
	);
}
