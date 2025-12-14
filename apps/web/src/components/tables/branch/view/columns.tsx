import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// TODO: Replace with actual API types when backend is ready
// import type apiClient from "@/lib/api";
import type { ColumnDef, CellContext } from "@tanstack/react-table";
import { Copy, MoreVertical, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import React from "react";

// TODO: Replace with actual BranchRead type from API
interface BranchRead {
  id?: string;
  name?: string;
  person_in_charge?: {
    name?: string;
    email?: string;
  };
  area?: {
    name?: string;
    region?: {
      name?: string;
      country?: {
        name?: string;
      };
    };
  };
  location?: {
    address?: string;
  };
}

interface ActionColumnProps {
  branch: BranchRead;
  onEdit?: (branch: BranchRead) => void;
  onDelete?: (branchId: string) => void;
}

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

export const columns: ColumnDef<BranchRead>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Branch Name" />
    ),
    cell: ({ getValue }) => getValue<string | undefined>() || "N/A",
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "pic_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="PIC Name" />
    ),
    accessorFn: (row) => row.person_in_charge?.name,
    cell: ({ getValue }) => getValue<string | undefined>() || "N/A",
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "pic_email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="PIC Email" />
    ),
    accessorFn: (row) => row.person_in_charge?.email,
    cell: ({ getValue }) => {
      const email = getValue<string | undefined>();
      return <CopyableCell value={email} displayText={email ?? "N/A"} />;
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "area_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Area" />
    ),
    accessorFn: (row) => row.area?.name,
    cell: ({ getValue }) => getValue<string | undefined>() || "N/A",
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "region_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Region" />
    ),
    accessorFn: (row) => row.area?.region?.name,
    cell: ({ getValue }) => getValue<string | undefined>() || "N/A",
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "country_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Country" />
    ),
    accessorFn: (row) => row.area?.region?.country?.name,
    cell: ({ getValue }) => getValue<string | undefined>() || "N/A",
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "location_address",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Address" />
    ),
    accessorFn: (row) => row.location?.address,
    cell: ({ getValue }) => getValue<string | undefined>() || "N/A",
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "actions",
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row, table }) => {
      const branch = row.original;
      const meta = table.options.meta as {
        onEdit?: (branch: BranchRead) => void;
        onDelete?: (branchId: string) => void;
      } | undefined;

      return (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {meta?.onEdit && (
                <DropdownMenuItem
                  onClick={() => meta.onEdit?.(branch)}
                  className="cursor-pointer"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Branch
                </DropdownMenuItem>
              )}
              {meta?.onDelete && branch.id && (
                <>
                  {meta?.onEdit && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onClick={() => {
                      if (
                        window.confirm(
                          `Are you sure you want to delete "${branch.name}"? This action cannot be undone.`
                        )
                      ) {
                        meta.onDelete?.(branch.id!);
                      }
                    }}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Branch
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
];


