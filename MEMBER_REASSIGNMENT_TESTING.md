# Member Reassignment Feature - Testing Guide

## Overview
This feature allows you to reassign members to different branches directly from the Branch Edit dialog.

## What Was Implemented

1. **Backend Services** (`packages/services/src/member.service.ts`):
   - `getMembersByHierarchyScope()` - Lists members assigned to a hierarchy node
   - `updateMemberHierarchyScope()` - Reassigns a single member
   - `bulkUpdateMemberHierarchyScope()` - Bulk reassigns multiple members

2. **API Endpoints** (`packages/api/src/routers/hierarchy.ts`):
   - `hierarchy.listMembers` - Get members for a hierarchy node
   - `hierarchy.reassignMember` - Reassign a single member
   - `hierarchy.bulkReassignMembers` - Bulk reassign members

3. **UI Component** (`apps/web/src/components/branch/member-reassignment.tsx`):
   - Displays members assigned to a branch
   - Allows reassigning members to other branches via dropdown

4. **Integration** (`apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`):
   - Added member management section to Branch Edit dialog

## How to Test

### Prerequisites
1. Ensure you have:
   - At least one organization with branches
   - Members assigned to branches (or areas if branches were deleted)
   - User with `user_management:read` and `user_management:update` permissions

### Test Steps

#### 1. Access Branch Edit Dialog
- Navigate to `/dashboard/branch/view`
- Click the "Edit" action (three dots menu) on any branch
- The Edit Branch dialog should open

#### 2. View Members Section
- Scroll down in the dialog
- You should see a "Assigned Members" section below the "Person In Charge" field
- If members exist, they should be displayed with:
  - User ID
  - Role badge (admin/trainer/staff/client)
  - Status badge (active/suspended)
  - Join date
  - Reassign dropdown

#### 3. Test Member Reassignment
- **Single Reassignment**:
  1. Find a member in the list
  2. Click the "Reassign to..." dropdown
  3. Select a different branch from the list
  4. Wait for success toast: "Member reassigned successfully"
  5. Verify the member disappears from the current branch's list
  6. Edit the target branch to verify the member appears there

- **Empty State**:
  1. If a branch has no members, you should see:
     - "No members assigned to this branch" message
     - Users icon

#### 4. Test Edge Cases
- **Same Branch Selection**:
  - Try selecting the same branch from dropdown
  - Should show error: "Please select a different branch"

- **Loading States**:
  - During reassignment, a spinner should appear next to the dropdown
  - Dropdown should be disabled during the operation

- **Error Handling**:
  - If API fails, error toast should appear
  - Member should remain in original branch

#### 5. Verify Database Changes
- After reassignment, check the tenant database:
  ```sql
  SELECT * FROM members WHERE hierarchy_scope_id = '<branch_id>';
  ```
- The member's `hierarchy_scope_id` should be updated to the new branch ID

#### 6. Test Permission Checks
- Try accessing with a user without `user_management:update` permission
- Should see permission denied error

### Expected Behavior

✅ **Success Cases**:
- Members list loads correctly
- Reassignment updates member's hierarchy scope
- UI updates immediately after reassignment
- Success toast appears
- Member count updates

❌ **Error Cases**:
- Permission denied for unauthorized users
- Error toast for API failures
- Validation error for same branch selection
- Loading states during operations

## API Testing (Optional)

You can also test the API endpoints directly:

```typescript
// List members
const members = await client.hierarchy.listMembers({
  organizationId: "your-org-id",
  hierarchyScopeId: "branch-id",
});

// Reassign member
const result = await client.hierarchy.reassignMember({
  organizationId: "your-org-id",
  memberId: "member-id",
  newHierarchyScopeId: "new-branch-id",
});
```

## Troubleshooting

1. **Members not showing**:
   - Check if members exist in the database for that branch
   - Verify organization ID is correct
   - Check browser console for API errors

2. **Reassignment fails**:
   - Verify user has `user_management:update` permission
   - Check if target branch exists
   - Verify member exists in database

3. **UI not updating**:
   - Check React Query cache invalidation
   - Try refreshing the page
   - Check browser console for errors

## Notes

- Members reassigned from deleted branches will appear in the parent area
- You can reassign them to any branch from the branch edit dialog
- The feature respects hierarchy access permissions
- Admin users can reassign members across all accessible nodes




