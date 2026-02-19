import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
// TODO: Replace with actual API types when backend is ready
// import type apiClient from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import React from "react";

// Helper component for copyable cells
interface CopyableCellProps {
  value: string | null | undefined;
  displayText?: React.ReactNode; // For cases like Badge
}

const CopyableCell: React.FC<CopyableCellProps> = ({ value, displayText }) => {
  const onCopy = (textToCopy: string) => {
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        toast.success("Copied to clipboard!");
      })
      .catch((err) => {
        toast.error("Failed to copy: " + err);
      });
  };

  const displayContent = displayText || value || "N/A";

  return (
    <div
      className="cursor-pointer flex items-center group"
      onClick={() => onCopy(value!)}
    >
      <Badge
        variant="outline"
        className="flex items-center gap-x-2 truncate"
        title={value || undefined}
      >
        {displayContent}
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      </Badge>
    </div>
  );
};

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
};

export const columns: ColumnDef<RoleRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Role Name" />
    ),
    cell: ({ row }) => {
      const role = row.original;
      return (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-medium">
            {role.name}
          </Badge>
          {role.isSystem && (
            <Badge variant="outline" className="text-xs">System</Badge>
          )}
        </div>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "description",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Description" />
    ),
    cell: ({ getValue }) => {
      const description = getValue<string | null>();
      return (
        <span className="text-muted-foreground">
          {description || "No description"}
        </span>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "priority",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Priority" />
    ),
    cell: ({ getValue }) => {
      const priority = getValue<number>();
      return (
        <span className="text-sm font-mono text-muted-foreground">
          {priority}
        </span>
      );
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created At" />
    ),
    cell: ({ getValue }) => {
      const createdAt = getValue<Date>();
      return (
        <span className="text-sm text-muted-foreground">
          {new Date(createdAt).toLocaleDateString()}
        </span>
      );
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ getValue }) => {
      const id = getValue<string>();
      const shortId = id.slice(0, 8) + "...";
      return <CopyableCell value={id} displayText={shortId} />;
    },
    enableSorting: false,
    enableHiding: true,
  },
];





