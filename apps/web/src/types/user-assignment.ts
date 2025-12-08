/**
 * User Assignment Types
 * 
 * Types for user role assignment functionality that match backend API responses
 */

import type { User } from './auth';

// Role response from backend API
export interface RoleResponse {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  organization_id: string | null;
  is_system_role: boolean;
  created_at: string;
  permission_count: number;
  user_count: number;
}

// Role list response with pagination
export interface RoleListResponse {
  items: RoleResponse[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// User response for assignment list (extended from auth User type)
export interface UserForAssignment extends User {
  name: string; // Display name, maps to full_name
  roles: string[]; // Array of role IDs currently assigned
  lastLogin?: string; // Maps to last_login
  isActive: boolean; // Maps to is_active
  department?: string; // Additional field that might come from metadata or separate table
}

// User role assignment request
export interface UserRoleAssignmentRequest {
  role_id: string;
}

// User role assignment response
export interface UserRoleAssignmentResponse {
  id: string;
  user_id: string;
  organization_id: string;
  role_id: string;
  created_at: string;
  role: RoleResponse | null;
}

// API response for listing users
export interface UserListResponse {
  users: User[];
  total: number;
  page: number;
  size: number;
}

// Parameters for user listing API
export interface UserListParams {
  skip?: number;
  limit?: number;
  search?: string;
  is_active?: boolean;
  organization_id?: string;
}

// Parameters for role listing API
export interface RoleListParams {
  organization_id?: string;
  include_system?: boolean;
  skip?: number;
  limit?: number;
}

// Parameters for user role operations
export interface UserRoleParams {
  user_id: string;
  organization_id: string;
}

// Bulk role assignment request
export interface BulkRoleAssignmentRequest {
  user_ids: string[];
  role_ids: string[];
  organization_id: string;
}

// Assignment operation result
export interface AssignmentResult {
  success: boolean;
  message: string;
  errors?: string[];
}

// State for role assignment operations
export interface RoleAssignmentState {
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  successMessage: string | null;
}

// Props for role assignment components
export interface RoleAssignmentProps {
  user: UserForAssignment | null;
  roles: RoleResponse[];
  organizationId: string;
  onSave: (userRoles: string[]) => Promise<void>;
  onClose: () => void;
  isOpen: boolean;
  isLoading?: boolean;
}

// User card component props
export interface UserCardProps {
  user: UserForAssignment;
  roles: RoleResponse[];
  onEditRoles: (user: UserForAssignment) => void;
  onDeactivate: (userId: string) => void;
  onSelect?: (userId: string, selected: boolean) => void;
  isSelected?: boolean;
  isLoading?: boolean;
}

// Filter options for user listing
export interface UserFilterOptions {
  search: string;
  roleFilter: string;
  statusFilter: 'all' | 'active' | 'inactive';
}

// Transform functions for API response mapping
export interface UserTransformFunctions {
  transformUserForAssignment: (user: User) => UserForAssignment;
  transformUsersForAssignment: (users: User[]) => UserForAssignment[];
}


