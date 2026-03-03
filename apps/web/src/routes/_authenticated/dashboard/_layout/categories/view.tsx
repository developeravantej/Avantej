import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import DataTable from "@/components/tables/categories/view/data-table";
import { columns } from "@/components/tables/categories/view/columns";
import type { CategoryRow } from "@/components/tables/categories/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/categories/view",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// Query
	const { data: categories = [], isLoading } = useQuery({
		queryKey: [
			orpc.productCategories.list.key({ input: { organizationId: organizationId! } }),
		],
		queryFn: () =>
			client.productCategories.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: [
				orpc.productCategories.list.key({
					input: { organizationId: organizationId! },
				}),
			],
		});

	// Mutations
	const createMutation = useMutation({
		mutationFn: (data: {
			name: string;
			externalCode?: string;
			description?: string;
		}) =>
			client.productCategories.create({
				organizationId: organizationId!,
				...data,
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Category created successfully");
		},
		onError: (e: Error) => toast.error(e.message),
	});

	const updateMutation = useMutation({
		mutationFn: (data: {
			id: string;
			name?: string;
			externalCode?: string;
			description?: string;
		}) =>
			client.productCategories.update({
				organizationId: organizationId!,
				...data,
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Category updated successfully");
		},
		onError: (e: Error) => toast.error(e.message),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) =>
			client.productCategories.delete({ organizationId: organizationId!, id }),
		onSuccess: () => {
			invalidate();
			toast.success("Category deleted successfully");
		},
		onError: (e: Error) => toast.error(e.message),
	});

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view categories.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	const tableData: CategoryRow[] = categories.map((c) => ({
		ID: c.id,
		Name: c.name,
		externalCode: c.externalCode ?? "",
		"Products Assigned": 0,
	}));

	return (
		<DataTable
			columns={columns}
			data={tableData}
			onAdd={(data) => createMutation.mutate(data)}
			onEdit={(id, data) => updateMutation.mutate({ id, ...data })}
			onDelete={(id) => deleteMutation.mutate(id)}
			isMutating={
				createMutation.isPending ||
				updateMutation.isPending ||
				deleteMutation.isPending
			}
		/>
	);
}
