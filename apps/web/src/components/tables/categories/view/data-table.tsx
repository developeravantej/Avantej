import type { ColumnDef } from "@tanstack/react-table";

import { CategoryFormDialog } from "@/components/forms/category-form";
import { DeleteConfirmDialog } from "@/components/tables/shared/delete-confirm-dialog";
import { EntityDataTable } from "@/components/tables/shared/entity-data-table";
import { useEntityTable } from "@/components/tables/shared/use-entity-table";

import type { CategoryRow, CategoryTableMeta } from "./columns";

interface Props {
	columns: ColumnDef<CategoryRow>[];
	data: CategoryRow[];
	organizationId: string;
	onDelete: (id: string) => void;
	isMutating?: boolean;
	error?: unknown;
	onRetry?: () => void;
}

function DataTable({
	columns,
	data,
	organizationId,
	onDelete,
	isMutating,
	error,
	onRetry,
}: Props) {
	const t = useEntityTable<CategoryRow, CategoryTableMeta>({
		data,
		columns,
		buildMeta: ({ openEdit, openDelete }) => ({
			onEdit: openEdit,
			onDelete: openDelete,
		}),
	});

	return (
		<EntityDataTable
			table={t.table}
			columnsLength={columns.length}
			searchPlaceholder="Search categories..."
			globalFilter={t.globalFilter}
			onGlobalFilterChange={t.setGlobalFilter}
			addLabel="Add Category"
			onAddClick={t.openAdd}
			error={error}
			onRetry={onRetry}
			emptyTitle="No categories found"
		>
			{t.isAddOpen && (
				<CategoryFormDialog
					isOpen
					onClose={t.closeAdd}
					mode="create"
					organizationId={organizationId}
				/>
			)}
			{t.isEditOpen && t.editRow && (
				<CategoryFormDialog
					isOpen
					onClose={t.closeEdit}
					mode="edit"
					organizationId={organizationId}
					initialData={{
						id: t.editRow.ID,
						name: t.editRow.Name,
						externalCode: t.editRow.externalCode,
					}}
				/>
			)}
			{t.isDeleteOpen && t.deleteRow && (
				<DeleteConfirmDialog
					entityName="Category"
					itemLabel={t.deleteRow.Name}
					isMutating={isMutating}
					onCancel={t.closeDelete}
					onConfirm={() => {
						onDelete(t.deleteRow!.ID);
						t.closeDelete();
					}}
				/>
			)}
		</EntityDataTable>
	);
}

export default DataTable;
