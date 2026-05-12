import type { ColumnDef } from "@tanstack/react-table";

import { BrandFormDialog } from "@/components/forms/brand-form";
import { DeleteConfirmDialog } from "@/components/tables/shared/delete-confirm-dialog";
import { EntityDataTable } from "@/components/tables/shared/entity-data-table";
import { useEntityTable } from "@/components/tables/shared/use-entity-table";

import type { BrandRow, BrandTableMeta } from "./columns";

interface Props {
	columns: ColumnDef<BrandRow>[];
	data: BrandRow[];
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
	const t = useEntityTable<BrandRow, BrandTableMeta>({
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
			searchPlaceholder="Search brands..."
			globalFilter={t.globalFilter}
			onGlobalFilterChange={t.setGlobalFilter}
			addLabel="Add Brand"
			onAddClick={t.openAdd}
			error={error}
			onRetry={onRetry}
			emptyTitle="No brands found"
		>
			{t.isAddOpen && (
				<BrandFormDialog
					isOpen
					onClose={t.closeAdd}
					mode="create"
					organizationId={organizationId}
				/>
			)}
			{t.isEditOpen && t.editRow && (
				<BrandFormDialog
					isOpen
					onClose={t.closeEdit}
					mode="edit"
					organizationId={organizationId}
					initialData={{ id: t.editRow.ID, name: t.editRow.Name }}
				/>
			)}
			{t.isDeleteOpen && t.deleteRow && (
				<DeleteConfirmDialog
					entityName="Brand"
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
