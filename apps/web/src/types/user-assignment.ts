export interface UserForAssignment {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: string[];
  isActive: boolean;
  department?: string;
  lastLogin?: string;
}

export interface RoleResponse {
  id: string;
  name: string;
  description?: string;
  priority: number;
}

export interface RoleAssignmentState {
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  successMessage: string | null;
}

export interface UserListParams {
  search?: string;
  page?: number;
  limit?: number;
}

export interface RoleListParams {
  search?: string;
  includeSystem?: boolean;
}

export interface AssignmentResult {
  success: boolean;
  message: string;
  errors?: string[];
}
