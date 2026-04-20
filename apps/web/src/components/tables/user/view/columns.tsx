import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import React from "react";
import { MemberActionsCell } from "./actions-cell";

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

export type { MemberRow };

interface CreateColumnsOptions {
	callerIsAdmin: boolean;
	organizationId: string;
}

/**
 * Factory that produces column definitions for the member table.
 *
 * When callerIsAdmin is true and organizationId is provided, a "Login as"
 * action column is appended that lets the caller impersonate staff rows.
 * The action is hidden at the cell level for non-staff targets so no
 * separate per-row permission check is needed.
 */
export function createColumns(options: CreateColumnsOptions): ColumnDef<MemberRow>[] {
	const { callerIsAdmin, organizationId } = options;

	const baseColumns: ColumnDef<MemberRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="" />
    ),
    cell: ({ row }) => {
      const member = row.original;
      const nameIsUnknown = !member.name || member.name === "Unknown";
      const emailIsValid = member.email && member.email !== "No email";
      // If the API returned "Unknown" for name but we have a real email, show
      // the email as a fallback so the row is still identifiable.
      const isFallback = nameIsUnknown && !!emailIsValid;
      const displayName = isFallback
        ? (member.email as string)
        : (member.name || member.email || "Unknown");
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
          <span className={isFallback ? "text-muted-foreground text-sm" : "font-medium"}>
            {displayName}
          </span>
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

	// Only append the actions column when the caller could be an admin —
	// the cell itself also guards on callerIsAdmin + member.role === 'staff'
	// so this is a belt-and-suspenders optimization.
	if (!callerIsAdmin) {
		return baseColumns;
	}

	return [
		...baseColumns,
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<MemberActionsCell
					member={row.original}
					callerIsAdmin={callerIsAdmin}
					organizationId={organizationId}
				/>
			),
			enableSorting: false,
			enableHiding: false,
		},
	];
}

/**
 * Default columns with no admin actions — used as a backwards-compat export
 * for any route that imports `columns` directly without admin context.
 * "Login as" will never render because callerIsAdmin is false.
 */
export const columns = createColumns({ callerIsAdmin: false, organizationId: "" });
