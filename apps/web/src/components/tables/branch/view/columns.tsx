import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
// TODO: Replace with actual API types when backend is ready
// import type apiClient from "@/lib/api";
import type { ColumnDef, CellContext } from "@tanstack/react-table";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import React from "react";

// TODO: Replace with actual BranchRead type from API
interface BranchRead {
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
    header: ({ column }: { column: any }) => (
      <DataTableColumnHeader column={column} title="Branch Name" />
    ),
    cell: ({ getValue }: CellContext<BranchRead, unknown>) => (getValue() as string | undefined) || "N/A",
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "pic_name",
    header: ({ column }: { column: any }) => (
      <DataTableColumnHeader column={column} title="PIC Name" />
    ),
    accessorFn: (row: BranchRead) => row.person_in_charge?.name,
    cell: ({ getValue }: CellContext<BranchRead, unknown>) => (getValue() as string | undefined) || "N/A",
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "pic_email",
    header: ({ column }: { column: any }) => (
      <DataTableColumnHeader column={column} title="PIC Email" />
    ),
    accessorFn: (row: BranchRead) => row.person_in_charge?.email,
    cell: ({ getValue }: CellContext<BranchRead, unknown>) => {
      const email = getValue() as string | undefined;
      return <CopyableCell value={email} displayText={email ?? "N/A"} />;
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "area_name",
    header: ({ column }: { column: any }) => (
      <DataTableColumnHeader column={column} title="Area" />
    ),
    accessorFn: (row: BranchRead) => row.area?.name,
    cell: ({ getValue }: CellContext<BranchRead, unknown>) => (getValue() as string | undefined) || "N/A",
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "region_name",
    header: ({ column }: { column: any }) => (
      <DataTableColumnHeader column={column} title="Region" />
    ),
    accessorFn: (row: BranchRead) => row.area?.region?.name,
    cell: ({ getValue }: CellContext<BranchRead, unknown>) => (getValue() as string | undefined) || "N/A",
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "country_name",
    header: ({ column }: { column: any }) => (
      <DataTableColumnHeader column={column} title="Country" />
    ),
    accessorFn: (row: BranchRead) => row.area?.region?.country?.name,
    cell: ({ getValue }: CellContext<BranchRead, unknown>) => (getValue() as string | undefined) || "N/A",
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "location_address",
    header: ({ column }: { column: any }) => (
      <DataTableColumnHeader column={column} title="Address" />
    ),
    accessorFn: (row: BranchRead) => row.location?.address,
    cell: ({ getValue }: CellContext<BranchRead, unknown>) => (getValue() as string | undefined) || "N/A",
    enableSorting: false,
    enableHiding: false,
  },
];


