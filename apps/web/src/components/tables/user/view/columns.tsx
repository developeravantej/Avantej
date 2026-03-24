import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import React from "react";

// Helper component for copyable cells
interface CopyableCellProps {
  value: string | null | undefined;
  displayText?: React.ReactNode;
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

type MemberRow = {
  id: string;
  userId: string;
  role: "admin" | "trainer" | "staff" | "client";
  hierarchyScopeId: string;
  status: "active" | "suspended";
  joinedAt: Date | null;
  name: string | null;
  email: string | null;
};

export const columns: ColumnDef<MemberRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="" />
    ),
    cell: ({ row }) => {
      const member = row.original;
      const displayName = member.name || member.email || "Unknown";
      const initials = displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      return (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{displayName}</span>
        </div>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ getValue }) => {
      const email = getValue<string | null>();
      if (!email) return <span className="text-muted-foreground">N/A</span>;
      return <CopyableCell value={email} displayText={email} />;
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "role",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Role" />
    ),
    cell: ({ getValue }) => {
      const role = getValue<string>();
      const variantMap: Record<string, "default" | "secondary" | "outline"> = {
        admin: "default",
        trainer: "secondary",
        staff: "secondary",
        client: "outline",
      };
      return (
        <Badge variant={variantMap[role] ?? "outline"} className="capitalize">
          {role}
        </Badge>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ getValue }) => {
      const status = getValue<string>();
      const isActive = status === "active";
      return (
        <Badge
          variant={isActive ? "default" : "destructive"}
          className="flex items-center gap-x-1 w-fit"
        >
          {isActive ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <XCircle className="h-3 w-3" />
          )}
          {isActive ? "Active" : "Suspended"}
        </Badge>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "joinedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Joined" />
    ),
    cell: ({ getValue }) => {
      const joinedAt = getValue<Date | null>();
      if (!joinedAt) return <span className="text-muted-foreground">N/A</span>;
      return (
        <span className="text-sm text-muted-foreground">
          {new Date(joinedAt).toLocaleDateString()}
        </span>
      );
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Member ID" />
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
