# Member Selector Implementation - Person In Charge Feature

## Overview
Replaced the manual text input for "Person In Charge" with a user-friendly dropdown selector that shows organization members with their names, emails, and roles.

## What Was Implemented

### 1. Backend Service (`packages/services/src/member.service.ts`)
- **New Function**: `getAllOrganizationMembersWithUserDetails()`
  - Finds organization root node
  - Gets all active members from tenant database
  - Fetches user details (name, email) from control panel database
  - Returns enriched member data with user information

### 2. API Endpoint (`packages/api/src/routers/hierarchy.ts`)
- **New Endpoint**: `hierarchy.listAllMembers`
  - Input: `{ organizationId, includeInactive? }`
  - Returns: `{ members: [{ id, userId, name, email, role, status, ... }] }`
  - Accesses control panel database via Hono context
  - Requires `user_management:read` permission

### 3. UI Component (`apps/web/src/components/branch/member-selector.tsx`)
- **New Component**: `MemberSelector`
  - Fetches members using React Query
  - Displays members in a Select dropdown
  - Shows format: `Name (Email) - Role`
  - Includes role badges (admin/trainer/staff/client)
  - Supports clearing selection
  - Handles loading and error states

### 4. Integration (`apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`)
- Replaced `<Input>` with `<MemberSelector>` component
- Maintains same state management (`editBranchPicUserId`)
- Automatically loads when organizationId is available
- Disabled during mutations (update/move)

## How to Test

### Prerequisites
1. Ensure you have:
   - At least one organization with members
   - Members should have user records in control panel database
   - User with `user_management:read` permission

### Test Steps

#### 1. Open Branch Edit Dialog
- Navigate to `/dashboard/branch/view`
- Click "Edit" on any branch
- The Edit Branch dialog should open

#### 2. Test Member Selector
- **View Dropdown**:
  1. Scroll to "Person In Charge" section
  2. Click the dropdown
  3. You should see a list of organization members
  4. Each member shows: Name (Email) - Role badge

- **Select Member**:
  1. Click on a member from the dropdown
  2. The selected member should appear in the field
  3. Below the field, you should see: "Selected: Name (Email) - role"

- **Clear Selection**:
  1. If a member is selected, click dropdown again
  2. Select "Clear selection" option
  3. Field should be empty

#### 3. Test Edge Cases
- **Loading State**:
  - Dropdown should show "Loading members..." while fetching

- **Empty State**:
  - If no members exist, shows "No members available"

- **Error State**:
  - If API fails, shows error message

- **Disabled State**:
  - During save operation, dropdown should be disabled

#### 4. Save Branch
- Select a member
- Click "Save Changes"
- Verify the branch is updated with the selected userId
- Check database: `pic_user_id` should be set to the selected member's userId

### Expected Behavior

✅ **Success Cases**:
- Members list loads correctly
- Names and emails display properly
- Role badges show correct colors
- Selection updates state correctly
- Save operation stores userId

❌ **Error Cases**:
- Permission denied for unauthorized users
- Error message if API fails
- Loading state during fetch
- Disabled state during mutations

## API Testing (Optional)

You can test the API endpoint directly:

```typescript
// List all members
const result = await client.hierarchy.listAllMembers({
  organizationId: "your-org-id",
  includeInactive: false, // optional, default false
});

// Result structure:
// {
//   members: [
//     {
//       id: "member-uuid",
//       userId: "user-id",
//       name: "John Doe",
//       email: "john@example.com",
//       role: "admin",
//       status: "active",
//       hierarchyScopeId: "node-uuid",
//       joinedAt: Date
//     }
//   ]
// }
```

## Troubleshooting

1. **Members not loading**:
   - Check browser console for API errors
   - Verify organizationId is set correctly
   - Check if user has `user_management:read` permission
   - Verify control panel database is accessible

2. **Names/emails showing as "Unknown"/"No email"**:
   - Check if user records exist in control panel database
   - Verify userId in members table matches user.id in control panel
   - Check database connection

3. **Dropdown not appearing**:
   - Check if organizationId is available
   - Verify component is imported correctly
   - Check browser console for errors

## Technical Details

### Data Flow:
1. Frontend calls `client.hierarchy.listAllMembers({ organizationId })`
2. API endpoint accesses tenant DB to get members
3. API endpoint accesses control panel DB to get user details
4. Service function combines the data
5. Frontend displays in dropdown

### Database Access:
- Control panel DB is accessed via `context.honoContext.get("controlPanelDb")`
- This is set by `dbMiddleware` in the server
- Type-safe with proper TypeScript types

### Caching:
- React Query caches member list for 5 minutes
- Reduces unnecessary API calls
- Automatically refetches on window focus

## Notes

- Only active members are shown by default (can be changed with `includeInactive` option)
- Members are sorted by `joinedAt` date (oldest first)
- The component is reusable and can be used in other forms
- User IDs are stored as strings (matching control panel user.id type)




