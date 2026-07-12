/**
 * Billing identity settings card (Settings → Organization).
 *
 * Edits the tenant's singleton org_billing_profile: the legal name, SSM
 * registration number, document address, and footer note printed on the
 * branded invoice/receipt documents, plus the logo (≤200KB png/jpeg/webp,
 * stored in R2 and inlined as a data URL on the print pages).
 *
 * Self-contained (own form + save button) so it can sit beside the page's
 * main settings form without nesting <form> elements. The form component
 * mounts only after the profile query settles, so defaultValues come straight
 * from the loaded profile — no reset-in-effect race.
 */

import { useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";

const MAX_LOGO_BYTES = 200 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type BillingProfileData = Awaited<ReturnType<typeof client.billingProfile.get>>;

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			resolve(result.slice(result.indexOf(",") + 1));
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

export function BillingIdentityCard({
	organizationId,
	isAdmin,
}: {
	organizationId: string;
	isAdmin: boolean;
}) {
	const { data: profile, isPending } = useQuery({
		...orpc.billingProfile.get.queryOptions({ input: { organizationId } }),
		staleTime: 60_000,
	});

	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
			<h2 className="text-base font-bold text-[#0a0a0a] mb-1">
				Billing Identity
			</h2>
			<p className="text-sm text-[#737373] mb-4">
				Legal details and logo printed on invoices and receipts. Leave blank to
				fall back to the organization name.
			</p>
			{isPending ? (
				<div className="space-y-2">
					<div className="h-4 w-32 rounded bg-[#e5e5e5] animate-pulse" />
					<div className="h-10 w-full rounded-md bg-[#e5e5e5] animate-pulse" />
				</div>
			) : (
				<BillingIdentityForm
					organizationId={organizationId}
					isAdmin={isAdmin}
					profile={profile ?? null}
				/>
			)}
		</div>
	);
}

function BillingIdentityForm({
	organizationId,
	isAdmin,
	profile,
}: {
	organizationId: string;
	isAdmin: boolean;
	profile: BillingProfileData;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const profileQueryKey = orpc.billingProfile.get.queryOptions({
		input: { organizationId },
	}).queryKey;

	const form = useForm({
		defaultValues: {
			legalName: profile?.legalName ?? "",
			registrationNo: profile?.registrationNo ?? "",
			address: profile?.address ?? "",
			footerNote: profile?.footerNote ?? "",
		},
		onSubmit: async ({ value }) => {
			updateMutation.mutate({
				organizationId,
				legalName: value.legalName.trim() || null,
				registrationNo: value.registrationNo.trim() || null,
				address: value.address.trim() || null,
				footerNote: value.footerNote.trim() || null,
			});
		},
	});

	const updateMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.billingProfile.update>[0]) =>
			client.billingProfile.update(input),
		successMessage: "Billing identity saved",
		errorMessage: (err: Error) => err.message,
		invalidate: [profileQueryKey],
	});

	const uploadLogoMutation = useApiMutation({
		mutationFn: (
			input: Parameters<typeof client.billingProfile.uploadLogo>[0],
		) => client.billingProfile.uploadLogo(input),
		successMessage: "Logo uploaded",
		errorMessage: (err: Error) => err.message,
		invalidate: [profileQueryKey],
	});

	const removeLogoMutation = useApiMutation({
		mutationFn: (
			input: Parameters<typeof client.billingProfile.removeLogo>[0],
		) => client.billingProfile.removeLogo(input),
		successMessage: "Logo removed",
		errorMessage: (err: Error) => err.message,
		invalidate: [profileQueryKey],
	});

	const onLogoSelected = async (file: File | undefined) => {
		if (!file) return;
		if (!ALLOWED_LOGO_TYPES.has(file.type)) {
			toast.error("Logo must be a PNG, JPEG, or WebP image.");
			return;
		}
		if (file.size > MAX_LOGO_BYTES) {
			toast.error("Logo must be under 200KB.");
			return;
		}
		const data = await fileToBase64(file);
		uploadLogoMutation.mutate({
			organizationId,
			contentType: file.type,
			data,
		});
		if (fileInputRef.current) fileInputRef.current.value = "";
	};

	const busy =
		updateMutation.isPending ||
		uploadLogoMutation.isPending ||
		removeLogoMutation.isPending;

	return (
		<div className="space-y-4">
			{/* Logo */}
			<div className="flex items-center gap-4">
				<div className="flex h-16 w-40 items-center justify-center overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#16181d]">
					{profile?.logoDataUrl ? (
						<img
							src={profile.logoDataUrl}
							alt="Document logo"
							className="max-h-14 max-w-36 object-contain"
						/>
					) : (
						<span className="px-2 text-center text-[11px] text-white/60">
							No logo — name shown instead
						</span>
					)}
				</div>
				<div className="space-y-1.5">
					<input
						ref={fileInputRef}
						type="file"
						accept="image/png,image/jpeg,image/webp"
						className="hidden"
						onChange={(e) => onLogoSelected(e.target.files?.[0])}
					/>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={!isAdmin || busy}
							onClick={() => fileInputRef.current?.click()}
						>
							{profile?.logoDataUrl ? "Replace logo" : "Upload logo"}
						</Button>
						{profile?.logoDataUrl && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={!isAdmin || busy}
								onClick={() => removeLogoMutation.mutate({ organizationId })}
							>
								Remove
							</Button>
						)}
					</div>
					<p className="text-xs text-[#737373]">
						PNG, JPEG, or WebP · max 200KB · shown on the dark document header.
					</p>
				</div>
			</div>

			<form.Field name="legalName">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="billing-legal-name">Legal name</Label>
						<Input
							id="billing-legal-name"
							placeholder="e.g. MOVE COLLECTIVE MALAYSIA SDN BHD"
							disabled={!isAdmin}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
						/>
					</div>
				)}
			</form.Field>

			<form.Field name="registrationNo">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="billing-reg-no">
							Company registration no. (SSM)
						</Label>
						<Input
							id="billing-reg-no"
							placeholder="e.g. 1590570-T"
							disabled={!isAdmin}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							className="max-w-xs"
						/>
					</div>
				)}
			</form.Field>

			<form.Field name="address">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="billing-address">Document address</Label>
						<Input
							id="billing-address"
							placeholder="Registered address shown when the branch has none"
							disabled={!isAdmin}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
						/>
					</div>
				)}
			</form.Field>

			<form.Field name="footerNote">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="billing-footer">Footer note</Label>
						<Input
							id="billing-footer"
							placeholder='Shown after "Thank you." — leave blank for the default wording'
							disabled={!isAdmin}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
						/>
					</div>
				)}
			</form.Field>

			<div className="flex justify-end">
				<Button
					type="button"
					disabled={!isAdmin || busy}
					onClick={() => form.handleSubmit()}
					className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
				>
					{updateMutation.isPending ? "Saving…" : "Save Billing Identity"}
				</Button>
			</div>
		</div>
	);
}
