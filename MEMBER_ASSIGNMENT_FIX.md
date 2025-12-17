# Member Assignment Feature - Fix Summary

## Issues Fixed

### Issue 1: No UI to Assign Members to Branch
**Problem**: The component only showed reassignment options for existing members, but had no way to assign new members to the branch.

**Solution**: 
- Added "Assign Member" button/dropdown
- Fetches all organization members using `listAllMembers` API
- Shows unassigned members in a dropdown
- Allows assigning members to the branch

### Issue 2: Person In Charge Not Shown in Assigned Members
**Problem**: When a Person In Charge (PIC) was set, they didn't appear in the assigned members list.

**Solution**:
- Component now receives `picUserId` prop
- Automatically includes PIC in the members list (even if not assigned)
- Shows special "Person In Charge" badge
- Shows "Not Assigned" badge if PIC is not actually assigned to branch
- Provides "Assign to Branch" button for unassigned PIC

## What Was Changed

### 1. Component Props (`apps/web/src/components/branch/member-reassignment.tsx`)
- Added `picUserId?: string | null` prop
- Now fetches all organization members (not just assigned ones)
- Combines assigned members with PIC for display

### 2. New Features Added
- **Assign Member Button**: Top-right button to assign new members
- **Assign Dropdown**: Shows all unassigned active members
- **PIC Display**: Shows Person In Charge with special styling
- **Member Names**: Displays member names and emails (not just User IDs)
- **Assign Action**: Button to assign PIC to branch if not already assigned

### 3. Integration (`apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`)
- Passes `picUserId` prop to `MemberReassignment` component
- Uses current form value or existing branch PIC value

## How to Test

### Test Scenario 1: Assign New Member
1. Open branch edit dialog
2. Scroll to "Assigned Members" section
3. Click "Assign Member" button (top-right)
4. Select a member from dropdown
5. Member should be assigned and appear in the list
6. Success toast should appear

### Test Scenario 2: Person In Charge Display
1. Set a Person In Charge in the dropdown above
2. Scroll to "Assigned Members" section
3. PIC should appear in the list with:
   - Blue background highlight
   - "Person In Charge" badge
   - Name and email displayed
4. If PIC is not assigned to branch:
   - Shows "Not Assigned" badge
   - Shows "Assign to Branch" button
   - Shows warning: "• Assign to branch to grant access"

### Test Scenario 3: Assign Person In Charge to Branch
1. Set a Person In Charge who is not assigned to branch
2. In "Assigned Members" section, click "Assign to Branch" button
3. PIC should be assigned to branch
4. "Not Assigned" badge should disappear
5. "Assign to Branch" button should change to "Reassign to..." dropdown

### Test Scenario 4: Reassign Existing Member
1. Find an assigned member in the list
2. Use "Reassign to..." dropdown
3. Select a different branch
4. Member should be moved to new branch
5. Success toast should appear

## UI Features

### Member Display Format
- **Name (Email)** - Role badge - Status badge
- **Person In Charge badge** (if applicable)
- **Not Assigned badge** (if PIC not assigned)
- **Joined date**

### Visual Indicators
- **Blue background**: Person In Charge
- **Gray background**: Regular assigned members
- **Role badges**: Color-coded (admin=red, trainer=default, staff=secondary, client=outline)
- **Status badges**: Active (default) or Suspended (secondary)

### Actions Available
- **Assign Member**: Button to assign new members (top-right)
- **Assign to Branch**: Button for unassigned PIC
- **Reassign to...**: Dropdown to move member to another branch

## Expected Behavior

✅ **Success Cases**:
- Assign Member button appears when unassigned members exist
- PIC appears in list even if not assigned
- Member names and emails display correctly
- Assign/reassign operations work smoothly
- Success toasts appear on completion

❌ **Edge Cases**:
- No unassigned members: "Assign Member" button hidden
- No PIC set: No special PIC display
- PIC already assigned: Shows normally with reassign option
- Loading states: Shows spinners during operations

## Technical Details

### Data Flow:
1. Component fetches assigned members (`listMembers` with branchId)
2. Component fetches all organization members (`listAllMembers`)
3. Combines lists: assigned members + PIC (if not already assigned)
4. Filters unassigned members for "Assign Member" dropdown
5. Enriches member data with names/emails from `listAllMembers`

### Member Assignment:
- Uses `reassignMember` API endpoint
- Updates member's `hierarchyScopeId` to branch ID
- Automatically refreshes member list after assignment

### Person In Charge Logic:
- PIC is shown if `picUserId` prop is set
- PIC appears even if `hierarchyScopeId` ≠ branchId
- Shows "Assign to Branch" button if PIC not assigned
- Highlights PIC with blue background

## Notes

- Members are displayed with names/emails for better UX
- Only active members are shown in assignment dropdown
- Component automatically refreshes after assign/reassign operations
- PIC assignment is optional - they can be PIC without being assigned to branch
- All operations require `user_management:update` permission

