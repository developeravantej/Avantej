import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { client } from "@/utils/orpc";
import { useDebounce } from "@/hooks/useDebounce";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/tenants",
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
	component: PlatformAdminTenantsPage,
});

function PlatformAdminTenantsPage() {
	const [search, setSearch] = useState("");
	const [paymentStatus, setPaymentStatus] = useState<string>("any");
	const [countryCode, setCountryCode] = useState<string>("any");
	const [page, setPage] = useState(1);
	const debouncedSearch = useDebounce(search, 300);
	const limit = 50;

	const { data, isLoading } = useQuery({
		queryKey: [
			"platformAdminTenants",
			"listTenants",
			{ search: debouncedSearch, paymentStatus, countryCode, page },
		],
		queryFn: () =>
			client.platformAdminTenants.listTenants({
				search: debouncedSearch || undefined,
				paymentStatus: paymentStatus === "any" ? undefined : paymentStatus,
				countryCode: countryCode === "any" ? undefined : countryCode,
				page,
				limit,
			}),
	});

	const tenants = data?.tenants ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / limit));

	return (
		<div className="p-6 space-y-4">
			<div>
				<h1 className="text-2xl font-semibold">Platform Admin: Tenants</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Cross-tenant management. Search by name, slug, or owner email.
				</p>
			</div>

			<div className="flex gap-3 items-center">
				<div className="relative flex-1 max-w-md">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						className="pl-9"
						placeholder="Search name, slug, or owner email"
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(1);
						}}
					/>
				</div>
				<Select
					value={paymentStatus}
					onValueChange={(v) => {
						setPaymentStatus(v);
						setPage(1);
					}}
				>
					<SelectTrigger className="w-48">
						<SelectValue placeholder="Payment status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="any">Any status</SelectItem>
						<SelectItem value="active">active</SelectItem>
						<SelectItem value="suspended">suspended</SelectItem>
						<SelectItem value="cancelled">cancelled</SelectItem>
						<SelectItem value="failed">failed</SelectItem>
					</SelectContent>
				</Select>
				<Select
					value={countryCode}
					onValueChange={(v) => {
						setCountryCode(v);
						setPage(1);
					}}
				>
					<SelectTrigger className="w-32">
						<SelectValue placeholder="Country" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="any">Any country</SelectItem>
						<SelectItem value="MY">MY</SelectItem>
						<SelectItem value="SG">SG</SelectItem>
						<SelectItem value="TH">TH</SelectItem>
					</SelectContent>
				</Select>
				<div className="text-sm text-muted-foreground ml-auto">
					{isLoading ? "Loading…" : `${total} tenant${total === 1 ? "" : "s"}`}
				</div>
			</div>

			<div className="border rounded-md">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name / Slug</TableHead>
							<TableHead>Country</TableHead>
							<TableHead>Owner</TableHead>
							<TableHead>Payment</TableHead>
							<TableHead>Sub</TableHead>
							<TableHead>Connect</TableHead>
							<TableHead>Created</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{tenants.length === 0 && !isLoading && (
							<TableRow>
								<TableCell colSpan={7} className="text-center text-muted-foreground py-8">
									No tenants match.
								</TableCell>
							</TableRow>
						)}
						{tenants.map((t) => (
							<TableRow key={t.id}>
								<TableCell>
									<Link
										to="/dashboard/platform-admin/tenants/$id"
										params={{ id: t.id }}
										className="font-medium hover:underline"
									>
										{t.name}
									</Link>
									<div className="text-xs text-muted-foreground">{t.slug}</div>
								</TableCell>
								<TableCell>
									{t.countryCode ? (
										<Badge variant="outline" className="font-mono text-xs">
											{t.countryCode}
										</Badge>
									) : (
										<span className="text-muted-foreground text-xs">—</span>
									)}
								</TableCell>
								<TableCell>
									<div className="text-sm">{t.ownerEmail ?? "—"}</div>
									{t.ownerName && (
										<div className="text-xs text-muted-foreground">{t.ownerName}</div>
									)}
								</TableCell>
								<TableCell>
									<Badge
										variant={
											t.paymentStatus === "active"
												? "default"
												: t.paymentStatus === "failed"
													? "destructive"
													: "secondary"
										}
									>
										{t.paymentStatus}
									</Badge>
								</TableCell>
								<TableCell>
									{t.subTier ? (
										<div className="text-sm">
											{t.subTier}
											<div className="text-xs text-muted-foreground">{t.subStatus}</div>
										</div>
									) : (
										<span className="text-muted-foreground text-sm">none</span>
									)}
								</TableCell>
								<TableCell>
									<div className="text-sm">
										{t.connectAccounts.chargesEnabled}/{t.connectAccounts.total} live
									</div>
								</TableCell>
								<TableCell className="text-sm text-muted-foreground">
									{new Date(t.createdAt).toLocaleDateString()}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-between text-sm">
				<div className="text-muted-foreground">
					Page {page} of {totalPages}
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						onClick={() => setPage((p) => Math.max(1, p - 1))}
					>
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages}
						onClick={() => setPage((p) => p + 1)}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
