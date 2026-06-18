import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/utils/orpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageCard } from "@/components/ui/page-card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/tenants/new",
)({
	beforeLoad: async () => {
		try {
			const result = await client.admin.me({});
			if (!result.isPlatformAdmin) {
				throw redirect({ to: "/dashboard" });
			}
		} catch (err: unknown) {
			if (
				err !== null &&
				typeof err === "object" &&
				"TANSTACK_ROUTER_REDIRECT" in err
			) {
				throw err;
			}
			throw redirect({ to: "/dashboard" });
		}
	},
	component: PlatformAdminTenantsNewPage,
});

function slugify(raw: string): string {
	return raw
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function PlatformAdminTenantsNewPage() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugTouched, setSlugTouched] = useState(false);
	const [country, setCountry] = useState<"MY" | "SG" | "TH">("MY");
	const [ownerEmail, setOwnerEmail] = useState("");
	const [ownerName, setOwnerName] = useState("");

	const effectiveSlug = slugTouched ? slug : slugify(name);

	const provision = useMutation({
		mutationFn: async () =>
			client.platformAdminTenants.provisionTenant({
				name: name.trim(),
				slug: effectiveSlug,
				country,
				ownerEmail: ownerEmail.trim(),
				ownerName: ownerName.trim() || undefined,
			}),
		onSuccess: (data) => {
			toast.success(
				`Tenant provisioned. Invite emailed to ${ownerEmail.trim()}.`,
			);
			navigate({
				to: "/dashboard/platform-admin/tenants/$id",
				params: { id: data.organizationId },
			});
		},
		onError: (e) => {
			toast.error(
				`Provision failed: ${(e as Error)?.message ?? "unknown error"}`,
			);
		},
	});

	const canSubmit =
		name.trim().length >= 2 &&
		effectiveSlug.length >= 3 &&
		/^[a-z0-9-]+$/.test(effectiveSlug) &&
		/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim()) &&
		!provision.isPending;

	return (
		<div className="max-w-2xl space-y-6 p-6">
			<div>
				<p className="text-sm text-muted-foreground">
					Platform Admin · Tenants
				</p>
				<h1 className="text-2xl font-semibold">New Tenant</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Spins up a Neon project, seeds RBAC, and emails the owner an admin
					invite. Super-admin only.
				</p>
			</div>

			<PageCard>
				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						if (canSubmit) provision.mutate();
					}}
				>
					<div className="space-y-1.5">
						<Label htmlFor="name">Organization name</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Avantej Studio Bangsar"
							required
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="slug">Slug</Label>
						<Input
							id="slug"
							value={effectiveSlug}
							onChange={(e) => {
								setSlugTouched(true);
								setSlug(e.target.value);
							}}
							placeholder="avantej-studio-bangsar"
							required
						/>
						<p className="text-xs text-muted-foreground">
							lowercase letters, digits, hyphens — must be unique across all
							tenants.
						</p>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="country">Country</Label>
						<Select
							value={country}
							onValueChange={(v) => setCountry(v as "MY" | "SG" | "TH")}
						>
							<SelectTrigger id="country" className="w-48">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="MY">Malaysia (MY)</SelectItem>
								<SelectItem value="SG">Singapore (SG)</SelectItem>
								<SelectItem value="TH">Thailand (TH)</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							Recorded on the audit row. Per-country Stripe Connect onboarding
							happens later from the tenant detail page.
						</p>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="ownerEmail">Owner email</Label>
						<Input
							id="ownerEmail"
							type="email"
							value={ownerEmail}
							onChange={(e) => setOwnerEmail(e.target.value)}
							placeholder="owner@example.com"
							required
						/>
						<p className="text-xs text-muted-foreground">
							Receives an admin invite. They complete signup via the standard
							accept-invitation flow.
						</p>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="ownerName">Owner name (optional)</Label>
						<Input
							id="ownerName"
							value={ownerName}
							onChange={(e) => setOwnerName(e.target.value)}
							placeholder="Jane Doe"
						/>
					</div>

					<div className="flex gap-3 pt-2">
						<Button type="submit" disabled={!canSubmit}>
							{provision.isPending ? "Provisioning…" : "Provision tenant"}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								navigate({ to: "/dashboard/platform-admin/tenants" })
							}
							disabled={provision.isPending}
						>
							Cancel
						</Button>
					</div>

					<p className="text-xs text-muted-foreground">
						Provisioning typically takes 10-30 seconds (Neon project create +
						migrations).
					</p>
				</form>
			</PageCard>
		</div>
	);
}
