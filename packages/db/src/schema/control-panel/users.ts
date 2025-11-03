/**
 * Control Panel Users Schema
 * 
 * Extends Better-Auth's user table with control panel specific fields.
 * This file exports the user table for use in other control panel schemas.
 * 
 * Note: passwordHash is managed by Better-Auth in the account table.
 * We reference it through Better-Auth's API, not directly.
 */

import { user } from "../auth";

// Re-export Better-Auth's user table (now extended with lastLoginAt)
// This allows other control panel schemas to import from control-panel/users.ts
// instead of directly from auth.ts, maintaining separation of concerns
export const users = user;

