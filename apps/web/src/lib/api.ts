/**
 * API Client Stub
 * 
 * TODO: Replace with oRPC client call
 * See: utils/orpc.ts for API client pattern
 * 
 * This file is a placeholder for the old REST API client structure.
 * All API calls should be migrated to use the oRPC client from utils/orpc.ts
 * 
 * Old API pattern:
 * ```typescript
 * import apiClient from "@/lib/api";
 * const response = await apiClient.getListServices({ organization_id: orgId });
 * ```
 * 
 * New API pattern:
 * ```typescript
 * import { orpc } from "@/utils/orpc";
 * const services = await orpc.services.list.query({ organizationId: orgId });
 * ```
 */

// Stub API client for backward compatibility during migration
class ApiClient {
  // TODO: All methods should be migrated to oRPC
  // This is a placeholder to prevent import errors
  
  async getListServices(params: any): Promise<any> {
    console.warn("TODO: Replace apiClient.getListServices with oRPC client");
    return { status: 200, data: [] }; // Mock data
  }
  
  async getListServiceCategories(params: any): Promise<any> {
    console.warn("TODO: Replace apiClient.getListServiceCategories with oRPC client");
    return { status: 200, data: [] }; // Mock data
  }
  
  async getListbranches(): Promise<any> {
    console.warn("TODO: Replace apiClient.getListbranches with oRPC client");
    return { status: 200, data: [] }; // Mock data
  }
  
  // Add other stub methods as needed during migration
}

const apiClient = new ApiClient();
export default apiClient;





