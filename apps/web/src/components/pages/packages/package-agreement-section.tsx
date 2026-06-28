import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSignature, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { downloadAgreementDoc } from "./export-agreement-pdf";

interface PackageAgreementSectionProps {
	organizationId: string;
	packageInstanceId: string;
	/** Router enforces permissions; this only gates the sign affordance in the UI. */
	canWrite: boolean;
}

/**
 * Package-agreement panel (UAT §2). Loads the agreement view-model, lets staff
 * download the PDF, and — when unsigned — capture the member's typed e-signature.
 * Signing persists to package_instances.e_signature + terms_agreed_at via
 * packageInstances.signAgreement; the agreement is immutable once signed.
 */
export function PackageAgreementSection({
	organizationId,
	packageInstanceId,
	canWrite,
}: PackageAgreementSectionProps) {
	const [signedName, setSignedName] = useState("");
	const [downloading, setDownloading] = useState(false);

	const agreementQuery = orpc.packageInstances.getAgreement.queryOptions({
		input: { organizationId, packageInstanceId },
	});
	const { data: agreement, isLoading } = useQuery(agreementQuery);

	const signMutation = useApiMutation({
		mutationFn: (input: { signedName: string }) =>
			client.packageInstances.signAgreement({
				organizationId,
				packageInstanceId,
				signedName: input.signedName,
			}),
		successMessage: "Agreement signed",
		errorMessage: (err) => err.message,
		invalidate: [agreementQuery.queryKey],
		onSuccess: () => setSignedName(""),
	});

	const onDownload = async () => {
		if (!agreement) return;
		setDownloading(true);
		try {
			await downloadAgreementDoc(agreement);
		} finally {
			setDownloading(false);
		}
	};

	const isSigned = !!agreement?.signedAt;

	return (
		<>
			<Separator />
			<div className="flex flex-col gap-3 py-5">
				<div className="flex items-center justify-between">
					<span className="flex items-center gap-2 text-sm font-medium">
						<FileSignature className="h-4 w-4" />
						Agreement
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={onDownload}
						disabled={isLoading || !agreement || downloading}
					>
						{downloading ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Download className="h-3.5 w-3.5" />
						)}
						PDF
					</Button>
				</div>

				{isLoading ? (
					<span className="text-xs text-muted-foreground">Loading…</span>
				) : isSigned ? (
					<div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
						<CheckCircle2 className="h-4 w-4 shrink-0" />
						<span>
							Signed by{" "}
							<span className="font-medium">
								{agreement?.signature?.signedName}
							</span>{" "}
							on{" "}
							{agreement?.signedAt
								? new Date(agreement.signedAt).toLocaleDateString("en-MY")
								: "—"}
						</span>
					</div>
				) : canWrite ? (
					<div className="flex flex-col gap-2">
						<span className="text-xs text-muted-foreground">
							Type the member's full name to record their agreement to the
							terms.
						</span>
						<div className="flex gap-2">
							<Input
								value={signedName}
								onChange={(e) => setSignedName(e.target.value)}
								placeholder="Member full name"
								className="h-9"
							/>
							<Button
								size="sm"
								onClick={() =>
									signMutation.mutate({ signedName: signedName.trim() })
								}
								disabled={
									signedName.trim().length === 0 || signMutation.isPending
								}
							>
								{signMutation.isPending ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									"Sign"
								)}
							</Button>
						</div>
					</div>
				) : (
					<span className="text-xs text-muted-foreground">Not yet signed.</span>
				)}
			</div>
		</>
	);
}
