/**
 * Settings → Email
 *
 * Per-tenant Resend sending-domain management. Lets an org admin register a
 * sending subdomain (e.g. mail.movefitness.com), view the DNS records that
 * must be added at their DNS provider, and trigger verification.
 *
 * Sends are gated server-side on a verified email_domains row; this UI only
 * provisions the row + surfaces status.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { z } from "zod";
import { client } from "@/utils/orpc";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
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
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

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
				<DomainListCard organizationId={organizationId} isAdmin={isAdmin} />
				<CreateDomainCard organizationId={organizationId} isAdmin={isAdmin} />
			</div>
		</div>
	);
}

const DOMAINS_QUERY_KEY_PREFIX = "emailDomains" as const;

function DomainListCard({
	organizationId,
	isAdmin,
}: {
	organizationId: string;
	isAdmin: boolean;
}) {
	const queryKey = [DOMAINS_QUERY_KEY_PREFIX, organizationId];
	const { data, isLoading } = useQuery({
		queryKey,
		queryFn: () => client.emailDomains.list({ organizationId }),
		staleTime: 30_000,
	});

	const [expandedId, setExpandedId] = useState<string | null>(null);

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
								<TableHead>From name</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Verified at</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(data as EmailDomainRow[]).map((row) => (
								<>
									<TableRow key={row.id}>
										<TableCell className="font-mono">{row.domain}</TableCell>
										<TableCell>{row.fromName}</TableCell>
										<TableCell>
											<Badge variant={statusBadgeVariant(row.status)}>
												{row.status}
											</Badge>
										</TableCell>
										<TableCell>{fmt(row.verifiedAt)}</TableCell>
										<TableCell className="space-x-2 text-right">
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setExpandedId(expandedId === row.id ? null : row.id)
												}
											>
												{expandedId === row.id ? "Hide DNS" : "DNS records"}
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
										</TableCell>
									</TableRow>
									{expandedId === row.id ? (
										<TableRow key={`${row.id}-dns`}>
											<TableCell colSpan={5} className="bg-muted/30">
												<DnsRecordsList records={row.dnsRecords} />
											</TableCell>
										</TableRow>
									) : null}
								</>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
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
		</div>
	);
}

const createSchema = z.object({
	domain: z
		.string()
		.min(3)
		.max(253)
		.regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a valid domain"),
	fromName: z.string().min(1).max(100),
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
		mutationFn: (values: { domain: string; fromName: string }) =>
			client.emailDomains.create({
				organizationId,
				domain: values.domain.trim().toLowerCase(),
				fromName: values.fromName.trim(),
			}),
		successMessage: "Domain registered. Add the DNS records and verify.",
		errorMessage: (err) => err.message || "Failed to register domain.",
		invalidate: [queryKey],
	});

	const form = useForm({
		defaultValues: { domain: "", fromName: "" },
		onSubmit: async ({ value }) => {
			await createMutation.mutateAsync(value);
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
