/**
 * Neon Service
 *
 * Handles Neon project provisioning for tenant databases.
 * Uses Neon API to create new projects dynamically when organizations are subscribed.
 *
 * Environment Variable:
 * - NEON_API_KEY: Neon API key from https://console.neon.tech/app/settings/api-keys
 *
 * Usage:
 * ```typescript
 * import { createTenantProject } from "@/services/neon.service";
 *
 * const { projectId, connectionString } = await createTenantProject({
 *   slug: "my-org",
 *   region: "aws-ap-southeast-1"
 * });
 * ```
 */

import { env } from "cloudflare:workers";

/**
 * Neon API response type for project creation
 */
interface NeonProjectResponse {
  project: {
    id: string;
    connection_uris?: Array<{
      connection_uri: string;
    }>;
  };
}

/**
 * Create a new Neon project for a tenant organization
 *
 * @param params - Project creation parameters
 * @param params.slug - Organization slug (used in project name)
 * @param params.region - AWS region ID (default: aws-ap-southeast-1)
 * @returns Project ID and connection string
 * @throws Error if project creation fails
 */
export async function createTenantProject(params: {
  slug: string;
  region?: string;
}): Promise<{
  projectId: string;
  connectionString: string;
}> {
  const { slug, region = "aws-ap-southeast-1" } = params;
  const apiKey = env.NEON_API_KEY;

  if (!apiKey) {
    throw new Error("NEON_API_KEY environment variable is not set");
  }

  try {
    // Call Neon API to create project
    const response = await fetch("https://console.neon.tech/api/v2/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project: {
          name: `tenant-${slug}`,
          region_id: region,
          pg_version: 17,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Failed to create Neon project: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`
      );
    }

    const data = (await response.json()) as NeonProjectResponse;

    // Extract project ID and connection string
    const projectId = data.project?.id;
    const connectionUri = data.project?.connection_uris?.[0]?.connection_uri;

    if (!projectId || !connectionUri) {
      throw new Error(
        "Neon API response missing project ID or connection URI"
      );
    }

    return {
      projectId,
      connectionString: connectionUri,
    };
  } catch (error) {
    console.error("Failed to create Neon project:", error);
    throw new Error(
      `Failed to create Neon project: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

