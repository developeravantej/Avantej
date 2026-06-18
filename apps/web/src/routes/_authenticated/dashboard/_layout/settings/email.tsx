/**
 * Settings → Email
 *
 * Per-tenant Resend sending-domain management. Lets an org admin register a
 * sending subdomain (e.g. mail.movefitness.com), view the DNS records that
 * must be added at their DNS provider, edit sender settings (from-name,
 * default local-part), delete a domain, and trigger verification.
 *
 * Sends are gated server-side on a verified email_domains row; this UI only
 * provisions the row + surfaces status.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Fragment, useState } from "react";
import { z } from "zod";
import { client } from "@/utils/orpc";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { DMARC_STEPS, parseDmarcPolicy } from "@/lib/email-dmarc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteConfirmDialog } from "@/components/tables/shared/delete-confirm-dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/email",
)({
	component: EmailSettingsPage,
});

type EmailDomainRow = {
	id: string;
	organizationId: string;
	resendDomainId: string;
	domain: string;
	fromName: string;
	defaultLocalPart: string | null;
	status: string;
	dnsRecords: unknown;
	verifiedAt: string | Date | null;
	createdAt: string | Date;
	updatedAt: string | Date;
};

type DnsRecord = {
	record?: string;
	name: string;
	type: string;
	ttl?: string;
	status?: string;
	value: string;
	priority?: number;
};

const LOCAL_PART_REGEX = /^[a-z0-9._-]{1,64}$/i;

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
	switch (status) {
		case "verified":
			return "default";
		case "failed":
			return "destructive";
		case "verifying":
			return "secondary";
		default:
			return "outline";
	}
}

function fmt(value: string | Date | null): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleString("en-MY");
	} catch {
		return "—";
	}
}

function EmailSettingsPage() {
	const { data: userContext, hasRole } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const isAdmin = hasRole(["admin"]);

	if (!organizationId) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
				<EmptyState
					title="No organization selected"
					description="Select an organization to manage sending domains."
				/>
			</div>
		);
	}

	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
			<PageHeader
				title="Email"
				description="Send transactional email from your own domain via Resend."
			/>
			<div className="mt-6 space-y-6">
				<DomainListCard
					organizationId={organizationId}
					isAdmin={isAdmin}
					userEmail={userContext?.user?.email ?? ""}
				/>
				<CreateDomainCard organizationId={organizationId} isAdmin={isAdmin} />
				<NotificationRoutingCard organizationId={organizationId} isAdmin={isAdmin} />
			</div>
		</div>
	);
}

const DOMAINS_QUERY_KEY_PREFIX = "emailDomains" as const;

const NOTIFICATION_ROUTES_QUERY_KEY_PREFIX = "emailNotificationRoutes" as const;

const NOTIFICATION_TYPE_META: Array<{
	type: "member_invitation" | "payment_receipt" | "auth_verification" | "auth_password_reset" | "auth_magic_link";
	label: string;
	tokens: string[];
}> = [
	{ type: "member_invitation", label: "Member invitation", tokens: ["organizationName", "role", "inviterName"] },
	{ type: "payment_receipt", label: "Payment receipt", tokens: ["amount", "appointmentId"] },
	{ type: "auth_verification", label: "Email verification", tokens: ["appName"] },
	{ type: "auth_password_reset", label: "Password reset", tokens: ["appName"] },
	{ type: "auth_magic_link", label: "Magic-link sign-in", tokens: ["appName"] },
];

function DomainListCard({
	organizationId,
	isAdmin,
	userEmail,
}: {
	organizationId: string;
	isAdmin: boolean;
	userEmail: string;
}) {
	const queryKey = [DOMAINS_QUERY_KEY_PREFIX, organizationId];
	const { data, isLoading } = useQuery({
		queryKey,
		queryFn: () => client.emailDomains.list({ organizationId }),
		staleTime: 30_000,
	});

	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [rowToDelete, setRowToDelete] = useState<EmailDomainRow | null>(null);
	const [rowToEdit, setRowToEdit] = useState<EmailDomainRow | null>(null);
	const [rowToTest, setRowToTest] = useState<EmailDomainRow | null>(null);

	const verifyMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.emailDomains.verify({ id, organizationId }),
		successMessage: (row) =>
			row.status === "verified"
				? "Domain verified."
				: "Verification re-checked.",
		errorMessage: (err) => err.message || "Verification failed.",
		invalidate: [queryKey],
	});

	const deleteMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.emailDomains.delete({ id, organizationId }),
		successMessage: "Sending domain removed.",
		errorMessage: (err) => err.message || "Failed to delete domain.",
		invalidate: [queryKey],
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sending domains</CardTitle>
				<CardDescription>
					Each domain needs SPF, DKIM, and DMARC DNS records to be added at
					your DNS provider. Until status is <strong>verified</strong>, email
					falls back to the platform sender.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : !data || data.length === 0 ? (
					<EmptyState
						title="No sending domains yet"
						description="Register a domain below to get started."
					/>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Domain</TableHead>
								<TableHead>Sender</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Verified at</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(data as EmailDomainRow[]).map((row) => (
								<Fragment key={row.id}>
									<TableRow>
										<TableCell className="font-mono">{row.domain}</TableCell>
										<TableCell>
											<div className="font-medium">{row.fromName}</div>
											<div className="text-xs text-muted-foreground font-mono">
												{`${row.defaultLocalPart ?? "support"}@${row.domain}`}
											</div>
										</TableCell>
										<TableCell>
											<Badge variant={statusBadgeVariant(row.status)}>
												{row.status}
											</Badge>
										</TableCell>
										<TableCell>{fmt(row.verifiedAt)}</TableCell>
										<TableCell>
											<div className="flex justify-end gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														setExpandedId(
															expandedId === row.id ? null : row.id,
														)
													}
												>
													{expandedId === row.id ? "Hide DNS" : "DNS records"}
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={!isAdmin}
													onClick={() => setRowToEdit(row)}
												>
													Edit sender
												</Button>
												<Button
													size="sm"
													disabled={!isAdmin || verifyMutation.isPending}
													onClick={() => verifyMutation.mutate(row.id)}
												>
													{verifyMutation.isPending &&
													verifyMutation.variables === row.id
														? "Verifying…"
														: "Verify now"}
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={!isAdmin || row.status !== "verified"}
													onClick={() => setRowToTest(row)}
													title={
														row.status !== "verified"
															? "Verify the domain first"
															: "Send a test email through this domain"
													}
												>
													Send test
												</Button>
												<Button
													variant="destructive"
													size="sm"
													disabled={
														!isAdmin ||
														row.status === "verifying" ||
														(deleteMutation.isPending &&
															deleteMutation.variables === row.id)
													}
													onClick={() => setRowToDelete(row)}
												>
													Delete
												</Button>
											</div>
										</TableCell>
									</TableRow>
									{expandedId === row.id ? (
										<TableRow>
											<TableCell colSpan={5} className="bg-muted/30">
												<div className="space-y-6">
													<DnsRecordsList records={row.dnsRecords} />
													<AliasesPanel
														emailDomainId={row.id}
														organizationId={organizationId}
														domain={row.domain}
														defaultLocalPart={row.defaultLocalPart}
														isAdmin={isAdmin}
													/>
												</div>
											</TableCell>
										</TableRow>
									) : null}
								</Fragment>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
			{rowToDelete ? (
				<DeleteConfirmDialog
					entityName="Sending domain"
					itemLabel={rowToDelete.domain}
					isMutating={deleteMutation.isPending}
					onCancel={() => setRowToDelete(null)}
					onConfirm={() => {
						const id = rowToDelete.id;
						setRowToDelete(null);
						deleteMutation.mutate(id);
					}}
				/>
			) : null}
			{rowToEdit ? (
				<EditSenderDialog
					row={rowToEdit}
					organizationId={organizationId}
					queryKey={queryKey}
					onClose={() => setRowToEdit(null)}
				/>
			) : null}
			{rowToTest ? (
				<SendTestDialog
					row={rowToTest}
					organizationId={organizationId}
					defaultRecipient={userEmail}
					onClose={() => setRowToTest(null)}
				/>
			) : null}
		</Card>
	);
}

const sendTestSchema = z.object({
	to: z.string().email("Enter a valid email"),
	aliasLabel: z.string().max(100).or(z.literal("")),
});

function SendTestDialog({
	row,
	organizationId,
	defaultRecipient,
	onClose,
}: {
	row: EmailDomainRow;
	organizationId: string;
	defaultRecipient: string;
	onClose: () => void;
}) {
	const sendMutation = useApiMutation({
		mutationFn: (values: { to: string; aliasLabel?: string }) =>
			client.emailDomains.sendTest({
				id: row.id,
				organizationId,
				to: values.to,
				aliasLabel: values.aliasLabel,
			}),
		successMessage: (data) =>
			`Test email sent from ${data.fromAddress} to ${data.to}.`,
		errorMessage: (err) => err.message || "Test send failed.",
		onSuccess: () => onClose(),
	});

	const form = useForm({
		defaultValues: { to: defaultRecipient, aliasLabel: "" },
		onSubmit: async ({ value }) => {
			const aliasLabel = value.aliasLabel.trim();
			await sendMutation.mutateAsync({
				to: value.to.trim(),
				aliasLabel: aliasLabel === "" ? undefined : aliasLabel,
			});
		},
		validators: { onSubmit: sendTestSchema },
	});

	const localPartPreview = row.defaultLocalPart ?? "support";

	return (
		<Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Send test email — {row.domain}</DialogTitle>
					<DialogDescription>
						Sends a small confirmation email through this verified domain so
						you can prove the DNS records + Resend delivery path are working
						before wiring real flows.
					</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="to">
						{(field) => (
							<div className="space-y-1">
								<label htmlFor={field.name} className="text-sm font-medium">
									Recipient
								</label>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="you@example.com"
									disabled={sendMutation.isPending}
								/>
								{field.state.meta.errors[0] ? (
									<p className="text-xs text-destructive">
										{String(field.state.meta.errors[0])}
									</p>
								) : null}
							</div>
						)}
					</form.Field>
					<form.Field name="aliasLabel">
						{(field) => (
							<div className="space-y-1">
								<label htmlFor={field.name} className="text-sm font-medium">
									Alias label (optional)
								</label>
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="e.g. Billing emails"
									disabled={sendMutation.isPending}
								/>
								<p className="text-xs text-muted-foreground font-mono">
									Without an alias: sends as {row.fromName} &lt;
									{localPartPreview}@{row.domain}&gt;
								</p>
							</div>
						)}
					</form.Field>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={sendMutation.isPending}
						>
							Cancel
						</Button>
						<form.Subscribe>
							{(state) => (
								<Button
									type="submit"
									disabled={
										!state.canSubmit ||
										state.isSubmitting ||
										sendMutation.isPending
									}
								>
									{sendMutation.isPending ? "Sending…" : "Send test email"}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DnsRecordsList({ records }: { records: unknown }) {
	const arr = Array.isArray(records) ? (records as DnsRecord[]) : [];
	if (arr.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No DNS records returned. Try refreshing the row.
			</p>
		);
	}
	return (
		<div className="space-y-2">
			<p className="text-sm font-medium">
				Add these records at your DNS provider:
			</p>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Type</TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Value</TableHead>
						<TableHead>TTL</TableHead>
						<TableHead>Priority</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{arr.map((r, i) => (
						<TableRow key={`${r.type}-${r.name}-${i}`}>
							<TableCell className="font-mono uppercase">{r.type}</TableCell>
							<TableCell className="font-mono break-all">{r.name}</TableCell>
							<TableCell className="font-mono break-all">{r.value}</TableCell>
							<TableCell>{r.ttl ?? "Auto"}</TableCell>
							<TableCell>{r.priority ?? "—"}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<DmarcProgression records={arr} />
		</div>
	);
}

/**
 * Shows where the domain sits on the DMARC hardening path (none →
 * quarantine → reject) so an admin knows the safe next step instead of
 * guessing. Derived from the _dmarc TXT record's p= value.
 */
function DmarcProgression({ records }: { records: DnsRecord[] }) {
	const current = parseDmarcPolicy(records);
	const currentIdx = current ? DMARC_STEPS.findIndex((s) => s.policy === current) : -1;
	const next =
		currentIdx >= 0 && currentIdx < DMARC_STEPS.length - 1
			? DMARC_STEPS[currentIdx + 1]
			: null;

	return (
		<div className="mt-4 space-y-2 rounded-md border p-3">
			<p className="text-sm font-medium">DMARC policy</p>
			{current === null ? (
				<p className="text-sm text-muted-foreground">
					No DMARC policy detected. Add the <span className="font-mono">_dmarc</span> TXT
					record above (starting at <span className="font-mono">p=none</span>) to begin
					monitoring, then harden over time.
				</p>
			) : (
				<>
					<div className="flex items-center gap-1">
						{DMARC_STEPS.map((step, i) => (
							<Fragment key={step.policy}>
								<span
									className={
										i === currentIdx
											? "rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
											: i < currentIdx
												? "rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
												: "rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
									}
									title={step.blurb}
								>
									{step.label}
								</span>
								{i < DMARC_STEPS.length - 1 && (
									<span className="text-muted-foreground">→</span>
								)}
							</Fragment>
						))}
					</div>
					<p className="text-sm text-muted-foreground">
						{DMARC_STEPS[currentIdx]!.blurb}
						{next
							? ` Once reports look clean, move to p=${next.policy}.`
							: " You're at the strongest policy."}
					</p>
				</>
			)}
		</div>
	);
}

type AliasRow = {
	id: string;
	emailDomainId: string;
	localPart: string;
	label: string | null;
	createdAt: string | Date;
	updatedAt: string | Date;
};

const ALIASES_QUERY_KEY_PREFIX = "emailDomainAliases" as const;

const aliasAddSchema = z.object({
	localPart: z
		.string()
		.regex(LOCAL_PART_REGEX, "Letters, numbers, . _ -"),
	label: z.string().max(100).or(z.literal("")),
});

function AliasesPanel({
	emailDomainId,
	organizationId,
	domain,
	defaultLocalPart,
	isAdmin,
}: {
	emailDomainId: string;
	organizationId: string;
	domain: string;
	defaultLocalPart: string | null;
	isAdmin: boolean;
}) {
	const queryKey = [ALIASES_QUERY_KEY_PREFIX, emailDomainId];
	const { data, isLoading } = useQuery({
		queryKey,
		queryFn: () =>
			client.emailDomains.listAliases({ emailDomainId, organizationId }),
		staleTime: 30_000,
	});

	const addMutation = useApiMutation({
		mutationFn: (values: { localPart: string; label?: string }) =>
			client.emailDomains.addAlias({
				emailDomainId,
				organizationId,
				localPart: values.localPart,
				label: values.label,
			}),
		successMessage: "Alias added.",
		errorMessage: (err) => err.message || "Failed to add alias.",
		invalidate: [queryKey],
	});

	const removeMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.emailDomains.removeAlias({
				id,
				emailDomainId,
				organizationId,
			}),
		successMessage: "Alias removed.",
		errorMessage: (err) => err.message || "Failed to remove alias.",
		invalidate: [queryKey],
	});

	const form = useForm({
		defaultValues: { localPart: "", label: "" },
		onSubmit: async ({ value }) => {
			const localPart = value.localPart.trim().toLowerCase();
			const label = value.label.trim();
			await addMutation.mutateAsync({
				localPart,
				label: label === "" ? undefined : label,
			});
			form.reset();
		},
		validators: { onSubmit: aliasAddSchema },
	});

	const aliases = (data as AliasRow[] | undefined) ?? [];
	const fallback = defaultLocalPart ?? "support";

	return (
		<div className="space-y-3">
			<div>
				<p className="text-sm font-medium">Sending-address aliases</p>
				<p className="text-xs text-muted-foreground">
					Curated local-parts code paths can pick by label. The default
					(when no alias is selected) is{" "}
					<code className="font-mono">{fallback}@{domain}</code>.
				</p>
			</div>
			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : aliases.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No aliases yet. Sends use the default unless a caller overrides
					per-send.
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Local-part</TableHead>
							<TableHead>Label</TableHead>
							<TableHead>Address</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{aliases.map((a) => (
							<TableRow key={a.id}>
								<TableCell className="font-mono">{a.localPart}</TableCell>
								<TableCell>{a.label ?? "—"}</TableCell>
								<TableCell className="font-mono">
									{`${a.localPart}@${domain}`}
								</TableCell>
								<TableCell className="text-right">
									<Button
										variant="destructive"
										size="sm"
										disabled={
											!isAdmin ||
											(removeMutation.isPending &&
												removeMutation.variables === a.id)
										}
										onClick={() => removeMutation.mutate(a.id)}
									>
										Remove
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
			>
				<form.Field name="localPart">
					{(field) => (
						<div className="space-y-1">
							<label htmlFor={field.name} className="text-xs font-medium">
								Local-part
							</label>
							<Input
								id={field.name}
								name={field.name}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="billing"
								disabled={!isAdmin || addMutation.isPending}
								className="w-40"
							/>
							{field.state.meta.errors[0] ? (
								<p className="text-xs text-destructive">
									{String(field.state.meta.errors[0])}
								</p>
							) : null}
						</div>
					)}
				</form.Field>
				<form.Field name="label">
					{(field) => (
						<div className="space-y-1">
							<label htmlFor={field.name} className="text-xs font-medium">
								Label (optional)
							</label>
							<Input
								id={field.name}
								name={field.name}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="Billing emails"
								disabled={!isAdmin || addMutation.isPending}
								className="w-56"
							/>
						</div>
					)}
				</form.Field>
				<form.Subscribe>
					{(state) => (
						<Button
							type="submit"
							size="sm"
							disabled={
								!isAdmin ||
								!state.canSubmit ||
								state.isSubmitting ||
								addMutation.isPending
							}
						>
							{addMutation.isPending ? "Adding…" : "Add alias"}
						</Button>
					)}
				</form.Subscribe>
			</form>
		</div>
	);
}

const editSenderSchema = z.object({
	fromName: z.string().min(1).max(100),
	defaultLocalPart: z
		.string()
		.regex(LOCAL_PART_REGEX, "Letters, numbers, . _ -")
		.or(z.literal("")),
});

function EditSenderDialog({
	row,
	organizationId,
	queryKey,
	onClose,
}: {
	row: EmailDomainRow;
	organizationId: string;
	queryKey: ReadonlyArray<unknown>;
	onClose: () => void;
}) {
	const updateMutation = useApiMutation({
		mutationFn: (values: { fromName: string; defaultLocalPart: string | null }) =>
			client.emailDomains.update({
				id: row.id,
				organizationId,
				fromName: values.fromName,
				defaultLocalPart: values.defaultLocalPart,
			}),
		successMessage: "Sender settings saved.",
		errorMessage: (err) => err.message || "Failed to update sender.",
		invalidate: [queryKey],
		onSuccess: () => onClose(),
	});

	const form = useForm({
		defaultValues: {
			fromName: row.fromName,
			defaultLocalPart: row.defaultLocalPart ?? "",
		},
		onSubmit: async ({ value }) => {
			await updateMutation.mutateAsync({
				fromName: value.fromName.trim(),
				defaultLocalPart:
					value.defaultLocalPart.trim() === ""
						? null
						: value.defaultLocalPart.trim().toLowerCase(),
			});
		},
		validators: { onSubmit: editSenderSchema },
	});

	return (
		<Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit sender for {row.domain}</DialogTitle>
					<DialogDescription>
						Customize the from-name and local-part used when sending email from
						this domain.
					</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="fromName">
						{(field) => (
							<div className="space-y-1">
								<label htmlFor={field.name} className="text-sm font-medium">
									From name
								</label>
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									disabled={updateMutation.isPending}
								/>
								{field.state.meta.errors[0] ? (
									<p className="text-xs text-destructive">
										{String(field.state.meta.errors[0])}
									</p>
								) : null}
							</div>
						)}
					</form.Field>
					<form.Field name="defaultLocalPart">
						{(field) => {
							const preview = field.state.value.trim() || "support";
							return (
								<div className="space-y-1">
									<label htmlFor={field.name} className="text-sm font-medium">
										Local-part (leave blank for "support")
									</label>
									<Input
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="support"
										disabled={updateMutation.isPending}
									/>
									<p className="text-xs text-muted-foreground font-mono">
										Will send as: {form.state.values.fromName} &lt;
										{preview}@{row.domain}&gt;
									</p>
									{field.state.meta.errors[0] ? (
										<p className="text-xs text-destructive">
											{String(field.state.meta.errors[0])}
										</p>
									) : null}
								</div>
							);
						}}
					</form.Field>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={updateMutation.isPending}
						>
							Cancel
						</Button>
						<form.Subscribe>
							{(state) => (
								<Button
									type="submit"
									disabled={
										!state.canSubmit ||
										state.isSubmitting ||
										updateMutation.isPending
									}
								>
									{updateMutation.isPending ? "Saving…" : "Save"}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

const createSchema = z.object({
	domain: z
		.string()
		.min(3)
		.max(253)
		.regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a valid domain"),
	fromName: z.string().min(1).max(100),
	defaultLocalPart: z
		.string()
		.regex(LOCAL_PART_REGEX, "Letters, numbers, . _ -")
		.or(z.literal("")),
});

function CreateDomainCard({
	organizationId,
	isAdmin,
}: {
	organizationId: string;
	isAdmin: boolean;
}) {
	const queryKey = [DOMAINS_QUERY_KEY_PREFIX, organizationId];

	const createMutation = useApiMutation({
		mutationFn: (values: {
			domain: string;
			fromName: string;
			defaultLocalPart?: string;
		}) =>
			client.emailDomains.create({
				organizationId,
				domain: values.domain,
				fromName: values.fromName,
				defaultLocalPart: values.defaultLocalPart,
			}),
		successMessage: "Domain registered. Add the DNS records and verify.",
		errorMessage: (err) => err.message || "Failed to register domain.",
		invalidate: [queryKey],
	});

	const form = useForm({
		defaultValues: { domain: "", fromName: "", defaultLocalPart: "" },
		onSubmit: async ({ value }) => {
			const trimmedLocal = value.defaultLocalPart.trim();
			await createMutation.mutateAsync({
				domain: value.domain.trim().toLowerCase(),
				fromName: value.fromName.trim(),
				defaultLocalPart: trimmedLocal === "" ? undefined : trimmedLocal.toLowerCase(),
			});
			form.reset();
		},
		validators: { onSubmit: createSchema },
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Add a sending domain</CardTitle>
				<CardDescription>
					Use a dedicated subdomain (e.g. <code>mail.example.com</code>) so
					your main domain's reputation stays isolated.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="domain">
						{(field) => (
							<div className="space-y-1">
								<label htmlFor={field.name} className="text-sm font-medium">
									Domain
								</label>
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="mail.example.com"
									disabled={!isAdmin || createMutation.isPending}
								/>
								{field.state.meta.errors[0] ? (
									<p className="text-xs text-destructive">
										{String(field.state.meta.errors[0])}
									</p>
								) : null}
							</div>
						)}
					</form.Field>
					<form.Field name="fromName">
						{(field) => (
							<div className="space-y-1">
								<label htmlFor={field.name} className="text-sm font-medium">
									From name
								</label>
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="Example Support"
									disabled={!isAdmin || createMutation.isPending}
								/>
								{field.state.meta.errors[0] ? (
									<p className="text-xs text-destructive">
										{String(field.state.meta.errors[0])}
									</p>
								) : null}
							</div>
						)}
					</form.Field>
					<form.Field name="defaultLocalPart">
						{(field) => (
							<div className="space-y-1">
								<label htmlFor={field.name} className="text-sm font-medium">
									Default local-part (optional)
								</label>
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="support"
									disabled={!isAdmin || createMutation.isPending}
								/>
								<p className="text-xs text-muted-foreground">
									Used as the part before @ in the sender address. Defaults to{" "}
									<code>support</code> if blank.
								</p>
								{field.state.meta.errors[0] ? (
									<p className="text-xs text-destructive">
										{String(field.state.meta.errors[0])}
									</p>
								) : null}
							</div>
						)}
					</form.Field>
					<form.Subscribe>
						{(state) => (
							<Button
								type="submit"
								disabled={
									!isAdmin ||
									!state.canSubmit ||
									state.isSubmitting ||
									createMutation.isPending
								}
							>
								{createMutation.isPending ? "Registering…" : "Register domain"}
							</Button>
						)}
					</form.Subscribe>
					{!isAdmin ? (
						<p className="text-xs text-muted-foreground">
							You need the <strong>admin</strong> role to register a sending
							domain.
						</p>
					) : null}
				</form>
			</CardContent>
		</Card>
	);
}

function NotificationRoutingCard({
	organizationId,
	isAdmin,
}: {
	organizationId: string;
	isAdmin: boolean;
}) {
	const { data, isLoading, isError } = useQuery({
		queryKey: [NOTIFICATION_ROUTES_QUERY_KEY_PREFIX, organizationId],
		queryFn: () => client.emailDomains.getNotificationRouting({ organizationId }),
		staleTime: 30_000,
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Notification routing</CardTitle>
				<CardDescription>
					Choose which sending address, name, and subject each notification uses.
					Unset rows fall back to your domain's default sender.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isError ? (
					<p className="text-sm text-destructive">
						Couldn't load notification routing. Please refresh and try again.
					</p>
				) : isLoading ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : (
					NOTIFICATION_TYPE_META.map((meta) => (
						<NotificationRoutingRow
							key={meta.type}
							meta={meta}
							organizationId={organizationId}
							isAdmin={isAdmin}
							route={data?.routes.find((r) => r.notificationType === meta.type) ?? null}
							aliases={data?.aliases ?? []}
							verifiedDomain={data?.verifiedDomain ?? null}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}

function NotificationRoutingRow({
	meta,
	organizationId,
	isAdmin,
	route,
	aliases,
	verifiedDomain,
}: {
	meta: (typeof NOTIFICATION_TYPE_META)[number];
	organizationId: string;
	isAdmin: boolean;
	route: { aliasId: string | null; fromNameOverride: string | null; subjectOverride: string | null } | null;
	aliases: Array<{ id: string; localPart: string; label: string | null }>;
	verifiedDomain: { domain: string; fromName: string; defaultLocalPart: string | null } | null;
}) {
	const saveMutation = useApiMutation({
		mutationFn: (vars: {
			aliasId: string | null;
			fromNameOverride: string | null;
			subjectOverride: string | null;
		}) =>
			client.emailDomains.upsertNotificationRoute({
				organizationId,
				notificationType: meta.type,
				...vars,
			}),
		successMessage: "Routing saved.",
		errorMessage: (err: Error) => err.message || "Failed to save routing.",
		invalidate: [[NOTIFICATION_ROUTES_QUERY_KEY_PREFIX, organizationId]],
	});

	const resetMutation = useApiMutation({
		mutationFn: () =>
			client.emailDomains.deleteNotificationRoute({ organizationId, notificationType: meta.type }),
		successMessage: "Routing reset.",
		errorMessage: (err: Error) => err.message || "Failed to reset routing.",
		invalidate: [[NOTIFICATION_ROUTES_QUERY_KEY_PREFIX, organizationId]],
	});

	const form = useForm({
		defaultValues: {
			aliasId: route?.aliasId ?? "",
			fromNameOverride: route?.fromNameOverride ?? "",
			subjectOverride: route?.subjectOverride ?? "",
		},
		onSubmit: async ({ value }) => {
			await saveMutation.mutateAsync({
				aliasId: value.aliasId || null,
				fromNameOverride: value.fromNameOverride.trim() || null,
				subjectOverride: value.subjectOverride.trim() || null,
			});
		},
	});

	const previewDomain = verifiedDomain?.domain ?? "(no verified domain)";

	return (
		<form
			className="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
		>
			<p className="text-sm font-medium">{meta.label}</p>
			<div className="flex flex-wrap items-end gap-2">
				<form.Field name="aliasId">
					{(field) => (
						<div className="w-44">
							<Select
								value={field.state.value || "__default__"}
								onValueChange={(v) => field.handleChange(v === "__default__" ? "" : v)}
								disabled={!isAdmin || !verifiedDomain}
							>
								<SelectTrigger>
									<SelectValue placeholder="Default sender" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__default__">Use domain default</SelectItem>
									{aliases.map((a) => (
										<SelectItem key={a.id} value={a.id}>
											{a.localPart}
											{a.label ? ` · ${a.label}` : ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</form.Field>
				<form.Field name="fromNameOverride">
					{(field) => (
						<Input
							className="w-40"
							placeholder="From name (optional)"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							disabled={!isAdmin}
						/>
					)}
				</form.Field>
				<form.Field name="subjectOverride">
					{(field) => (
						<Input
							className="w-56"
							placeholder="Subject override (optional)"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							disabled={!isAdmin}
						/>
					)}
				</form.Field>
				<Button type="submit" disabled={!isAdmin || saveMutation.isPending}>
					Save
				</Button>
				{route ? (
					<Button
						type="button"
						variant="ghost"
						disabled={!isAdmin || resetMutation.isPending}
						onClick={() => resetMutation.mutate(undefined)}
					>
						Reset
					</Button>
				) : null}
			</div>
			<form.Subscribe selector={(state) => state.values}>
				{(values) => {
					const selectedAlias = aliases.find((a) => a.id === values.aliasId);
					const effectiveLocalPart =
						selectedAlias?.localPart ?? verifiedDomain?.defaultLocalPart ?? "support";
					const effectiveFromName =
						values.fromNameOverride.trim() || verifiedDomain?.fromName || "Avantej Core";
					return (
						<p className="font-mono text-xs text-muted-foreground">
							Will send as: {effectiveFromName} &lt;{effectiveLocalPart}@{previewDomain}&gt;
							{!selectedAlias && verifiedDomain ? " (falls back to default sender)" : ""}
						</p>
					);
				}}
			</form.Subscribe>
			{meta.tokens.length > 0 ? (
				<p className="text-xs text-muted-foreground">
					Subject tokens: {meta.tokens.map((t) => `{${t}}`).join(", ")}
				</p>
			) : null}
		</form>
	);
}
