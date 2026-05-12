export interface UserForAssignment {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: string[];
  isActive: boolean;
  /**
   * Soft-delete marker. Mirrors `customer_profiles.deletedAt`. Non-null when
   * the row was soft-deleted via `members.softDelete`. Hidden from default
   * lists; surfaced when the "Show deleted" toggle is on.
   */
  isDeleted?: boolean;
  department?: string;
  lastLogin?: string;
  ghlSync?: {
    syncStatus: "active" | "inactive" | "skipped" | "error";
    lastError: string | null;
    lastSyncedAt: Date | string | null;
    // Discriminator: staff rows have `ghlUserId`, client rows have
    // `ghlContactId` + `customerProfileId`.
    kind?: "staff" | "customer";
    ghlUserId?: string;
    ghlContactId?: string;
    customerProfileId?: string;
  } | null;
}

export interface RoleResponse {
  id: string;
  name: string;
  description?: string;
  priority: number;
}

interface RoleAssignmentState {
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  successMessage: string | null;
}

interface UserListParams {
  search?: string;
  page?: number;
  limit?: number;
}

interface RoleListParams {
  search?: string;
  includeSystem?: boolean;
}

interface AssignmentResult {
  success: boolean;
  message: string;
  errors?: string[];
}
