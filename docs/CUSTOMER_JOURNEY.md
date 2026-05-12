# Customer App - Complete Journey Documentation

This document covers every screen, flow, API call, context provider, and navigation path in the Avantej customer native app (Expo Router).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [App Initialization & Root Layout](#2-app-initialization--root-layout)
3. [Authentication Flow](#3-authentication-flow)
4. [Registration Gate & Registration Form](#4-registration-gate--registration-form)
5. [Organization Context](#5-organization-context)
6. [Dashboard (Tab Navigation)](#6-dashboard-tab-navigation)
7. [Home Tab](#7-home-tab)
8. [Explore Tab](#8-explore-tab)
9. [Service Detail Screen](#9-service-detail-screen)
10. [Bookings Tab](#10-bookings-tab)
11. [Booking Detail Screen](#11-booking-detail-screen)
12. [Profile Tab](#12-profile-tab)
13. [Book Workout Flow (4 Steps)](#13-book-workout-flow-4-steps)
14. [Buy Package Flow (7 Steps)](#14-buy-package-flow-7-steps)
15. [Notifications Screen](#15-notifications-screen)
16. [Packages & Credits Screen](#16-packages--credits-screen)
17. [Calendar Screen](#17-calendar-screen)
18. [Modal Screen](#18-modal-screen)
19. [Complete API Reference](#19-complete-api-reference)
20. [Context Providers Reference](#20-context-providers-reference)
21. [Hooks Reference](#21-hooks-reference)
22. [Utility & Lib Files](#22-utility--lib-files)
23. [Full File Tree](#23-full-file-tree)

---

## 1. Architecture Overview

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native (Expo) |
| Router | Expo Router (file-based) |
| Styling | NativeWind (Tailwind CSS for RN) |
| State Management | React Context + TanStack React Query |
| Auth Client | Better-Auth (`@better-auth/expo/client`) |
| API Client | oRPC (end-to-end typed RPC) |
| Secure Storage | `expo-secure-store` |
| Gesture Handling | `react-native-gesture-handler` |
| Calendar | `react-native-calendars` |
| Signature | `react-native-signature-canvas` |
| Date Picker | `@react-native-community/datetimepicker` |
| Icons | `@expo/vector-icons` (Ionicons) |

### API Client Configuration

**File:** `utils/orpc.ts`

```typescript
export const { queryClient, client, orpc } = createORPCClientConfig({
  serverUrl: process.env.EXPO_PUBLIC_SERVER_URL || "",
  QueryClient,
  QueryCache,
  getAuthHeaders: () => {
    const headers: Record<string, string> = {};
    const cookies = authClient.getCookie();
    if (cookies) headers.Cookie = cookies;
    return headers;
  },
});
```

- **`client`** - Direct oRPC client for mutations (imperative calls)
- **`orpc`** - React Query-integrated oRPC for queries (declarative, with `queryOptions`)
- **`queryClient`** - TanStack Query client shared across the app
- Auth headers are injected automatically from Better-Auth cookies stored in `expo-secure-store`

### Auth Client Configuration

**File:** `lib/auth-client.ts`

```typescript
export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_SERVER_URL,
  plugins: [
    expoClient({ scheme, storagePrefix, storage: SecureStore }),
    inferAdditionalFields<typeof auth>(),
  ],
});
```

Uses `expo-secure-store` for token persistence across app restarts.

---

## 2. App Initialization & Root Layout

**File:** `app/_layout.tsx`

### What Happens on App Start

1. **Load custom fonts**: `Nordeco-Bold.otf`, `Metropolis-Medium.otf`, `Plus Jakarta Sans`
2. **Detect color scheme**: Light or dark mode via `useColorScheme()`
3. **Set Android navigation bar**: Matches color scheme
4. **Render providers**:
   - `QueryClientProvider` (TanStack React Query)
   - `ThemeProvider` (React Navigation theming)
   - `StatusBar` configuration
   - `GestureHandlerRootView` (gesture support)
5. **Render `<Slot />`**: Expo Router renders the matched child route

### Blocking Conditions

The root layout renders **nothing** (`return null`) until:
- Fonts are loaded (`fontsLoaded === true`)
- Color scheme is determined (`isColorSchemeLoaded === true`)

---

## 3. Authentication Flow

### Entry Point: `app/index.tsx`

**API Used:** `authClient.useSession()` (via `useAuth()` hook)

The root index acts as a routing gate:

```
App opens
  |
  v
useAuth() checks session
  |
  +--> isPending === true  --> Show loading spinner
  +--> isAuthenticated     --> Redirect to /(app)/dashboard
  +--> NOT authenticated   --> Redirect to /(auth)/login
```

### Auth Layout: `app/(auth)/_layout.tsx`

A headerless `Stack` navigator with 4 screens:
- `login`
- `sign-up`
- `forgot-password`
- `verify-email`

---

### 3.1 Login Screen

**File:** `app/(auth)/login.tsx`

**API Used:** `authClient.signIn.email({ email, password })` (via `useAuth().login()`)

#### Flow:
1. User enters email and password
2. Taps "Sign In"
3. Validation: both fields must be non-empty
4. Calls `login(email, password)` which:
   - Calls `authClient.signIn.email()`
   - On success: refetches session, refetches all React Query queries
   - On error: displays error message
5. On success: `router.replace("/(app)/dashboard")`

#### Navigation Links:
- "Forgot Password?" -> `/(auth)/forgot-password`
- "Don't have an account? Sign Up" -> `/(auth)/sign-up`

---

### 3.2 Sign Up Screen

**File:** `app/(auth)/sign-up.tsx`

**API Used:** `authClient.signUp.email({ name, email, password, firstName, lastName })` (via `useAuth().signUp()`)

#### Fields Collected:
- First Name (required)
- Last Name (required)
- Email (required)
- Password (required, min 8 chars)
- Confirm Password (required, must match)

#### Flow:
1. User fills all fields
2. Taps "Create Account"
3. Client-side validation: password match, min length
4. Calls `signUp(fullName, email, password, firstName, lastName)`
5. On success: `router.replace("/(auth)/verify-email", { email })`
6. On "already exists" error: shows Alert with option to redirect to login
7. On other error: displays inline error message

---

### 3.3 Verify Email Screen

**File:** `app/(auth)/verify-email.tsx`

**API Used:** `authClient.sendVerificationEmail({ email })`

#### Flow:
1. Displays "Check Your Email" message with the email address
2. "Go to Sign In" button -> `/(auth)/login`
3. "Resend Verification Email" button:
   - Calls `authClient.sendVerificationEmail()`
   - Shows "Email Sent" text for 30 seconds (cooldown)
   - Silently fails on error (prevents email enumeration)

---

### 3.4 Forgot Password Screen

**File:** `app/(auth)/forgot-password.tsx`

**API Used:** `authClient.forgetPassword({ email, redirectTo })` (via `useAuth().forgotPassword()`)

#### Flow:
1. User enters email
2. Taps "Send Reset Link"
3. Calls `forgotPassword(email)` which calls `authClient.forgetPassword()`
4. **Always** shows success screen (prevents email enumeration)
5. Success screen: "Check Your Email" with "Back to Sign In" button

---

## 4. Registration Gate & Registration Form

### Gate Logic: `app/(app)/_layout.tsx`

**API Used:** `authClient.useSession()` (via `useAuth()`)

After authentication, the `(app)` layout performs a **role check**:

```
Authenticated user arrives
  |
  v
Check user.role
  |
  +--> isPending         --> Show loading spinner
  +--> NOT authenticated --> Redirect to /(auth)/login
  +--> No role (null)    --> Show <RegistrationForm />
  +--> Has role          --> Render <OrganizationProvider> + dashboard Stack
```

This means **new users who just signed up must complete registration** before accessing the app.

---

### Registration Form (3-Step Wizard)

**File:** `components/registration-form.tsx`

**APIs Used:**
- `client.registration.listCountries()` - Fetch available countries
- `client.registration.listBranches({ country })` - Fetch branches for a country
- `client.registration.complete({ ... })` - Submit registration

#### Step 1: Personal Details

**Fields Collected (all required unless noted):**

| Field | Type | Notes |
|-------|------|-------|
| First Name | text | Pre-filled from auth signup |
| Last Name | text | Pre-filled from auth signup |
| Phone | phone-pad | With country code picker (40+ countries, auto-detected from timezone) |
| Email | email | Pre-filled from auth, read-only |
| ID / Passport No. | text | IC or Passport number |
| Address Type | radio | "Home" or "Work" |
| Street Address | text | |
| City | text | |
| State | text | |
| Country | text | |
| Postal Code | numeric | |
| Date of Birth | date picker | Platform-specific (iOS spinner, Android default) |

Also includes a "Sign Out" button so users can exit if needed.

**Country Code Picker:** Modal with searchable list of 40+ countries (flags + dial codes). Auto-detects country from device timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` mapped to a country code lookup table.

#### Step 2: Emergency Contact

**Fields Collected (all required):**

| Field | Type |
|-------|------|
| Emergency Contact Name | text |
| Emergency Contact Relationship | text (e.g., Parent, Spouse, Sibling) |
| Emergency Contact Phone | phone-pad with country code picker |

#### Step 3: Branch Selection

**Fields Collected (all required):**

| Field | Type |
|-------|------|
| Country | country grid (flag + name cards, fetched from API) |
| Branch | dropdown (fetched from API based on selected country) |

**API Flow:**
1. On mount: `client.registration.listCountries()` -> displays country cards with flags
2. On country select: `client.registration.listBranches({ country })` -> populates dropdown
3. Each branch has: `id`, `name`, `address`, `organizationId`

#### Submission

On "Submit Registration":
1. Validates all step 3 fields
2. Calls `client.registration.complete()` with:
   ```typescript
   {
     phone: `${dialCode}${phone}`,
     idPassportNo, addressType, streetAddress, city, state,
     country, postalCode, dateOfBirth (YYYY-MM-DD),
     emergencyContactName, emergencyContactRelationship,
     emergencyContactPhone: `${dialCode}${phone}`,
     branchId, organizationId
   }
   ```
3. On success: Alert "Registration Submitted", then `refetch()` session (which triggers the role check in the layout to pass)
4. On error: displays error Alert

---

## 5. Organization Context

**File:** `contexts/organization-context.tsx`

**API Used:** `client.auth.userContext()`

Wraps the entire authenticated app. On mount (when `isAuthenticated` is true):

1. Calls `client.auth.userContext()` which returns:
   ```typescript
   {
     organizations: Array<{
       id, name, slug, role,
       hierarchy: {
         nodes: Array<{ id, name, type, depth, parentId }>,
         member: { role, hierarchyScopeId, hierarchyScopeName, accessibleNodeIds }
       }
     }>,
     currentOrganizationId?: string
   }
   ```
2. Tries to restore previously selected org from `SecureStore` (`avantej_selected_organization_id`)
3. If stored org is still valid: uses it
4. If only one org: auto-selects it
5. If `currentOrganizationId` from server: uses that
6. Provides context: `organizationId`, `setOrganizationId`, `organizations`, `isLoading`, `error`, `refetch`

**Hook:** `useOrganization()` (`hooks/useOrganization.ts`) - convenience wrapper that throws if no org is selected.

---

## 6. Dashboard (Tab Navigation)

**File:** `app/(app)/dashboard/_layout.tsx`

### Visible Tabs (4)

| Tab | Icon | Route |
|-----|------|-------|
| Home | `home` / `home-outline` | `dashboard/index` |
| Explore | `compass` / `compass-outline` | `dashboard/explore` |
| Bookings | `calendar` / `calendar-outline` | `dashboard/bookings` |
| Profile | `person` / `person-outline` | `dashboard/profile` |

### Hidden Routes (not in tab bar, `href: null`)

| Route | Purpose |
|-------|---------|
| `book-workout` | Booking wizard |
| `buy-package` | Purchase wizard |
| `notifications` | Notifications list |
| `packages` | Packages & credits |
| `calendar` | Calendar view |

### Tab Bar Styling
- White background (`#FFFFFF`)
- Active: black (`#000000`), Inactive: gray (`#8A8F91`)
- Safe area aware (`useSafeAreaInsets`)
- Hides during wizard flows (book-workout, buy-package, etc.)

---

## 7. Home Tab

**File:** `app/(app)/dashboard/index.tsx`

### APIs Used (all with `enabled: !!organizationId`)

| API Call | Purpose | Query Options |
|----------|---------|---------------|
| `orpc.packageInstances.getActiveForClient` | Active fitness plan | `{ organizationId }` |
| `orpc.notifications.getUnreadCount` | Unread notification badge | `{ organizationId }`, refetchInterval: 30s |
| `orpc.appointments.listForUser` | Next upcoming session | `{ organizationId, status: "confirmed", startFrom: now, limit: 1 }` |
| `orpc.appointments.listForUser` | Recent activity | `{ organizationId, limit: 5 }` |

### Screen Sections (top to bottom)

#### 1. Header Card
- User avatar (placeholder image)
- Greeting: "Good Morning/Afternoon/Evening, {firstName}"
- Current date (e.g., "Friday, April 11")
- Notification bell with unread count badge -> navigates to `/dashboard/notifications/`

#### 2. Fitness Plan Card (conditional)
- **Loading**: Skeleton placeholder
- **Error**: "Unable to load plan details" message
- **Active Plan**: Shows:
  - "ACTIVE" badge
  - "Fitness Plan" title
  - "{N} workouts remaining" (large text)
  - Progress percentage and bar
  - "At this pace, you'll finish in {N} weeks" (calculated from expiry date)
  - "Renews on {date}" with "Manage membership" link -> `/dashboard/packages`
- **No Active Plan**: "No Active Plan" with "Browse Packages" CTA -> `/dashboard/buy-package/setup`

#### 3. Quick Insight Card (only if plan exists)
- Static tip: "Most members book 2 workouts per week to finish on time"

#### 4. Action Buttons Grid (4 buttons)

| Button | Icon | Route |
|--------|------|-------|
| Book Session | `calendar-outline` | `/dashboard/book-workout/book-workout` |
| Calendar | `calendar` | `/dashboard/calendar` |
| Buy Package | `cube-outline` | `/dashboard/buy-package/setup` |
| My Credits | `star-outline` | `/dashboard/packages` |

#### 5. Up Next Section (conditional)
- **Loading**: Skeleton
- **Error**: "Unable to load upcoming sessions"
- **Has appointment**: Card with service image, name, time, duration, date badge (TODAY/TOMORROW/day). Tap -> `/dashboard/bookings/{id}`
- **No appointments**: "No upcoming sessions" with "Book Now" CTA -> `/dashboard/book-workout/book-workout`

#### 6. Recent Activity Section
- **Loading**: Skeleton cards
- **Error**: "Unable to load recent activity"
- **Has activities**: List of up to 5 appointments with:
  - Status icon (checkmark-circle, close-circle, alert-circle)
  - Service name
  - Relative date ("Completed today", "2 days ago")
  - Credits used (e.g., "-1 credit")
- **Empty**: "No recent activity yet"

#### Pull to Refresh
Invalidates `packageInstances`, `appointments`, and `notifications` queries.

---

## 8. Explore Tab

**File:** `app/(app)/dashboard/explore/index.tsx`

### APIs Used

| API Call | Purpose | Input |
|----------|---------|-------|
| `orpc.serviceCategories.list` | Category filter chips | `{ organizationId }` |
| `orpc.services.list` | Services list | `{ organizationId, categoryId?, isActive: true }` |

### Screen Sections

#### 1. Search Bar
- Text input with search icon
- Clear button (X) when text entered
- Filter icon button (not yet functional)
- Client-side debounced search (300ms) on name + description

#### 2. Category Filter Chips
- Horizontal scrollable pills
- "All" (default) + dynamically fetched categories
- Selecting a category re-fetches services with `categoryId` filter

#### 3. Recommended For You (only shown when no search/filter active)
- First 4 services from the list
- Each card shows: image, name, description (2 lines), price per session/class

#### 4. Browse Workouts / Search Results / Services
- All filtered services
- Same card layout as recommended
- Empty state: "No services found" with contextual message

#### Navigation
- Tap any service card -> `/dashboard/explore/[id]` (Service Detail)

---

## 9. Service Detail Screen

**File:** `app/(app)/dashboard/explore/[id].tsx`

### APIs Used

| API Call | Purpose | Input |
|----------|---------|-------|
| `orpc.services.getById` | Service details | `{ organizationId, id: serviceId }` |
| `orpc.services.list` | Related services | `{ organizationId, categoryId, isActive: true }` |

### Screen Layout

- **Tab bar**: Hidden on this screen (restored on leave)
- **Back button** at top
- **Service image** (full width, rounded)
- **Title + Price**: Service name, category, price per session/class
- **Info cards**: Duration, Type (Private/Semi-Private)
- **About**: Service description
- **Related Services**: Up to 4 services from same category (tap to navigate)

### Action Buttons (bottom sticky)

| Button | Action |
|--------|--------|
| Buy Package | Navigate to `/dashboard/buy-package/setup` with `preSelectedCategoryId` and `preSelectedServiceId` |
| Book Now | Navigate to `/dashboard/book-workout/book-workout` with `preSelectedCategoryId` and `preSelectedServiceId` |

---

## 10. Bookings Tab

**File:** `app/(app)/dashboard/bookings/index.tsx`

### APIs Used

| API Call | Purpose | Input |
|----------|---------|-------|
| `orpc.appointments.listForUser` | Upcoming bookings | `{ organizationId, status: "confirmed", startFrom: now, limit: 10 }` |
| `orpc.appointments.listForUser` | Past bookings | `{ organizationId, startTo: now, limit: 10 }` |

### Screen Sections

#### 1. Header
- "My Bookings" title + description

#### 2. Quick Link
- "View My Packages & Credits" card -> `/dashboard/packages`

#### 3. Upcoming Bookings
- Filtered to `confirmed` or `pending` status
- Each card shows:
  - Image, appointment type, date (full), time + duration
  - Location (if available), booking number
  - **"View details"** button -> `/dashboard/bookings/[id]`
  - **"Reschedule"** button (UI only, not yet functional)
- Empty state: "No upcoming bookings" / "Book a session to get started"

#### 4. Past Bookings
- Filtered to `completed`, `cancelled`, or `no-show`
- Each card shows: same as upcoming + status label
- **"View details"** button only
- Empty state: "No past bookings" / "Your completed sessions will appear here"

#### Pull to Refresh
Invalidates `appointments` queries.

---

## 11. Booking Detail Screen

**File:** `app/(app)/dashboard/bookings/[id].tsx`

### APIs Used

| API Call | Purpose | Input |
|----------|---------|-------|
| `orpc.appointments.getById` | Appointment detail | `{ organizationId, id: appointmentId }` |
| `client.appointments.update` | Cancel booking (mutation) | `{ organizationId, id, status: "cancelled" }` |

### Screen Layout

- **Tab bar**: Hidden on this screen
- **Back button**
- **Booking image** (if available)
- **Title + Status badge** (color-coded: green=confirmed, blue=completed, red=cancelled, yellow=no-show)
- **Info cards row 1**: Date, Time (start - end)
- **Info cards row 2**: Duration, Price
- **Credits Used** card (if applicable)
- **Location** card (if available)
- **Cancellation Reason** (red card, if cancelled)
- **Description** section (if available)
- **Notes** section (if available)

### Action Button (only for confirmed + future bookings)
- **"Cancel Booking"** (red, destructive):
  - Shows confirmation Alert ("Are you sure?")
  - On confirm: calls `client.appointments.update({ status: "cancelled" })`
  - Invalidates appointments queries
  - Navigates back

---

## 12. Profile Tab

**File:** `app/(app)/dashboard/profile.tsx`

### APIs Used

| API Call | Purpose | Input |
|----------|---------|-------|
| `orpc.customerProfiles.get` | Customer profile data | `{ organizationId }` |
| `orpc.notificationPreferences.get` | Notification toggle states | `{ organizationId }` |
| `client.customerProfiles.upsert` | Save profile changes (mutation) | `{ organizationId, phone }` |
| `client.notificationPreferences.update` | Toggle notification pref (mutation) | `{ organizationId, [key]: value }` |
| `authClient.updateUser({ name })` | Update display name | |
| `authClient.changePassword({ currentPassword, newPassword })` | Change password | |

### Screen Sections

#### 1. User Summary Card
- Avatar (icon placeholder)
- Full name, "Member since {month year}"
- Edit toggle (pencil / close icon)

#### 2. Personal Information (editable when edit mode on)

| Field | Editable | Notes |
|-------|----------|-------|
| Full Name | Yes | Saved via `authClient.updateUser()` |
| Email | No | Always read-only (dimmed) |
| Phone Number | Yes | Saved via `client.customerProfiles.upsert()` |

- "Save Changes" button appears in edit mode

#### 3. Notification Preferences

| Toggle | API Key | Default |
|--------|---------|---------|
| Email Notifications | `emailEnabled` | true |
| Push Notifications | `pushEnabled` | false |

Each toggle calls `client.notificationPreferences.update()` immediately on change.

#### 4. Account Section

| Row | Action |
|-----|--------|
| Change Password | Opens modal |
| Help & Support | Opens `mailto:support@avantej.com` |
| Terms & Privacy | Opens `https://avantej.com/terms` |
| Sign Out | Confirmation Alert -> `logout()` -> clears queryClient, refetches session |

#### Change Password Modal
- Fields: Current Password, New Password, Confirm New Password
- Validation: min 8 chars, passwords match
- API: `authClient.changePassword({ currentPassword, newPassword })`

---

## 13. Book Workout Flow (4 Steps)

**Layout:** `app/(app)/dashboard/book-workout/_layout.tsx`
- Wraps all steps in `<BookingFlowProvider>` (React Context)
- Hides tab bar for the entire flow, restores on unmount

### Context: `BookingFlowState`

```typescript
{
  packageInstanceId, packageName,
  categoryId, categoryName,
  serviceId, serviceName,
  serviceType: "private" | "semi-private" | "semi_private",
  serviceDuration,
  trainerId, trainerName,
  date, startTime, duration,
  classSlotId,
  branchId, branchName
}
```

---

### Step 1: Setup

**File:** `app/(app)/dashboard/book-workout/book-workout.tsx`

**APIs Used:**

| API Call | Purpose | Input |
|----------|---------|-------|
| `orpc.packageInstances.listForClient` | Active packages | `{ organizationId, status: "active" }` |
| `orpc.members.list` | Available trainers | `{ organizationId, role: "trainer", status: "active" }` (enabled after package selected) |

**URL Params Accepted:** `preSelectedCategoryId`, `preSelectedServiceId` (passed from Service Detail screen, not currently used for pre-selection logic)

**User Actions (2-level selection):**

#### Level 1: Select Package
- Section: "SELECT PACKAGE"
- Fetches active package instances for the current user
- Each card shows:
  - Package name (bold)
  - **Appointment type badge** (top-right pill): "Private", "Semi-Private", or "All Types" (derived from `package.appointmentType`)
  - Credits: "{remaining} / {total} sessions remaining"
  - Expiry date: "Expires {Month Day, Year}" (if set)
- Selecting a new package **clears** the selected trainer
- If no active packages: "No active packages found. Purchase a package to book workouts."

#### Level 2: Select Provider (only shown after package selected)
- Section: "SELECT PROVIDER"
- Fetches active trainers from `members.list({ role: "trainer", status: "active" })`
- **Auto-assign option** (always first): "Auto-assign best available" with description "We'll match you with the best trainer for your needs"
- **Trainer cards**: Each shows name and role
- Selected option shows a black checkmark circle

**Validation:** Both package and trainer (or auto-assign) must be selected to show Continue button.

**On Continue:** Updates context with:
```typescript
{
  packageInstanceId: selectedId,
  packageName: selectedPackage.package.name,
  serviceType: "private" | "semi-private" (from package.appointmentType),
  serviceDuration: 60,
  trainerId: null (if auto) | trainer.id,
  trainerName: "Auto-assign" | trainer.user.name,
}
```
Navigates to `./schedule`

---

### Step 2: Schedule

**File:** `app/(app)/dashboard/book-workout/schedule.tsx`

**APIs Used:**

| API Call | Purpose | Condition |
|----------|---------|-----------|
| `orpc.classSlots.list` | Available class slots | Only for non-private, when date + serviceId selected. Input: `{ organizationId, serviceId, from, to }` |

**Behavior branches by service type:**

#### Private (1-on-1) (`serviceType === "private"`):

**Date Selection:**
- Horizontal scrollable date cards for the **next 7 days**
- Each card shows: abbreviated day name (e.g., "Fri"), date number (e.g., "11"), abbreviated month (e.g., "Apr")
- Selected date: black background with white text; unselected: white with border

**Time Selection:**
- Grid of **12 hourly time slots** from 8:00 AM to 7:00 PM (one per hour)
- 3-column layout, each slot is a tappable card
- Selected slot: black border highlight; unselected: light border
- User selects exactly **one date + one time**

#### Semi-Private / Class (`serviceType !== "private"`):

**Date Selection:**
- Same 7-day horizontal scroll as private
- **Week/Month toggle** buttons in the section header (UI toggle exists, but both show the same 7-day view)
- Selecting a new date clears the previously selected time and class slot

**Time Slots (fetched from API):**
- Calls `orpc.classSlots.list({ organizationId, serviceId, from: dayStart, to: dayEnd })` for the selected date
- Shows loading spinner while fetching
- Each slot card displays:
  - **Time**: formatted from `slot.startTime` (e.g., "10:00 AM")
  - **Spots remaining**: `capacity - currentBookings` (e.g., "3 spots left")
  - **Full slots**: disabled (gray background), shows "Full" instead of spots count
  - **Cancelled slots**: also disabled
- Selected slot: black border highlight
- "Select a date first" message if no date is selected
- "No available slots for this date" if API returns empty
- **"Join waitlist"** link at bottom (UI only, not functional)

**Validation:** Both date and time must be selected to show the Continue button.

**On Continue:** Updates context:
- `date`: ISO date string (YYYY-MM-DD)
- `startTime`: Full ISO datetime (built from selected date + time for private; from `slot.startTime` for class)
- `duration`: from `state.serviceDuration` or default 60 minutes
- `classSlotId`: the selected slot's ID (class only, null for private)
- Navigates to `./review`

---

### Step 3: Review

**File:** `app/(app)/dashboard/book-workout/review.tsx`

**API Used (mutation):**

| API Call | Purpose | Input |
|----------|---------|-------|
| `client.appointments.create` | Create the booking | See below |

**Section title:** "REVIEW YOUR BOOKING"

**Displayed cards (each in a rounded card with icon):**

| Card | Icon | Shows |
|------|------|-------|
| Service | `fitness-outline` | `state.serviceName` or "Not selected" |
| Trainer | `person-outline` | `state.trainerName` or "Auto-assign" |
| Date & Time | `calendar-outline` | Formatted as "Mon, Apr 11 at 10:00 AM" from `state.startTime` |
| Credits | `ticket-outline` | "1 credit will be deducted" + package name if available |

**On "Confirm Booking":**

```typescript
client.appointments.create({
  organizationId,
  type: "semi-private" | "private",
  startTime,
  duration: state.duration ?? 60,
  branchId,
  serviceId, trainerId, classSlotId, packageInstanceId,
  creditsUsed: 1,
  status: "confirmed",
  sessionTotal: 1,
  pricePerClient: 0,
})
```

- On success: invalidates `appointments` + `packageInstances` queries, navigates to `./done` with `bookingId` and `bookingNumber`
- On error: Alert "Booking Failed"

---

### Step 4: Done

**File:** `app/(app)/dashboard/book-workout/done.tsx`

**No API calls.**

**Displays:**
- Success checkmark icon
- "Booking Confirmed!" title
- Description about confirmation email
- Booking Details card: service, date/time, trainer, booking reference number

**Action Buttons:**
- "Back to Home" -> `router.replace("/dashboard")` (resets flow context)
- "View My Bookings" -> `router.replace("/dashboard/bookings")` (resets flow context)

---

## 14. Buy Package Flow (7 Steps)

**Layout:** `app/(app)/dashboard/buy-package/_layout.tsx`
- Wraps all steps in `<PurchaseFlowProvider>` (React Context)
- Hides tab bar for the entire flow, restores on unmount

### Context: `PurchaseFlowState`

```typescript
{
  // Step 1
  categoryId, categoryName,
  serviceId, serviceName,
  serviceType: "private" | "semi_private",
  packageId, packageName,
  creditsTotal, price, validityDays,
  // Step 2
  preferredTimes: Array<{ day, time }>,
  // Step 3
  remark,
  // Step 5
  signature, termsAgreed, termsAgreedAt,
  // Step 6
  paymentMethod,
  // Result
  packageInstanceId
}
```

---

### Step 1: Setup

**File:** `app/(app)/dashboard/buy-package/setup.tsx`

**APIs Used:**

| API Call | Purpose | Input |
|----------|---------|-------|
| `orpc.serviceCategories.list` | Categories | `{ organizationId }` |
| `orpc.services.list` | Services for category | `{ organizationId, categoryId }` |
| `orpc.packages.list` | Packages for service type | `{ organizationId, appointmentType }` |

**User Actions (cascading 3-level selection - each level resets the levels below it):**

#### Level 1: Select Category
- Section: "SELECT CATEGORY"
- Card list showing each category's `name` and `description`
- Selecting a new category **clears** the selected service and package

#### Level 2: Select Service (only shown after category selected)
- Section: "SELECT SERVICE"
- Card list showing each service's:
  - `name`
  - Type badge: "Private" or "Semi-Private" (pill in top-right)
  - `description`
- The selected service's `type` field (e.g., `"private"` or `"semi_private"`) determines which packages are fetched
- Selecting a new service **clears** the selected package

#### Level 3: Select Package (only shown after service selected)
- Section: "SELECT PACKAGE"
- Fetches packages matching the service's appointment type (`"private"`, `"semi-private"`, or `"both"`)
  - Service type `"semi_private"` is mapped to `"semi-private"` for the API call
- Card list showing each package's:
  - `name`
  - Credits badge (e.g., "12 credits") in top-right pill
  - `description`
  - Total price: `pricePerSession * sessionCount` (formatted as `$X.XX`)
  - Validity: "Valid for {N} days"

**Validation:** All three levels (category + service + package) must be selected to show the Continue button.

**On Continue:** Updates context with:
```typescript
{
  categoryId, categoryName,
  serviceId, serviceName,
  serviceType: "private" | "semi_private",
  packageId, packageName,
  creditsTotal: selectedPkg.sessionCount,
  price: selectedPkg.pricePerSession * selectedPkg.sessionCount,
  validityDays: selectedPkg.validityDays,
}
```
Navigates to `./schedule`.

---

### Step 2: Schedule

**File:** `app/(app)/dashboard/buy-package/schedule.tsx`

**No API calls.** Uses `usePurchaseFlow()` context only.

**Behavior by service type:**

#### Private Training (`serviceType === "private"`):

The user selects **up to 4 preferred day/time combinations**. The UI shows a counter: "Select up to 4 preferred day and time combinations (N/4)".

**Selected Preferences Display:**
- Chip-style cards showing abbreviated day + time (e.g., "Mon / 7:00 AM")
- Each chip has a red X button to remove that preference
- Shown at the top when any times have been selected

**Day Selection (horizontal scroll):**
- 7 day pills: Monday through Sunday
- Tap a day to expand its time picker panel below
- Days with existing selections show a blue dot indicator
- Expanded day is highlighted with inverted colors (black bg, white text, chevron-up icon)
- The day picker hides when all 4 slots are filled

**Time Picker (inside expanded day panel):**
- Shows a formatted display of the currently selected time (e.g., "7:00 AM")
- **iOS**: Native `DateTimePicker` in `spinner` mode, 200px height
- **Android**: Custom `AndroidTimePicker` component with 3 snap-scroll wheels:
  - **Hours wheel**: 1-12, snap-to-item scrolling (50px item height)
  - **Minutes wheel**: 00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55 (5-minute intervals)
  - **AM/PM wheel**: AM or PM
  - Each wheel has selection indicator borders on the center item
  - Uses `onMomentumScrollEnd` to detect final selection
- **"Add This Time"** button: Adds `{ day, time }` to preferences (prevents duplicates). Disabled when 4 slots filled.
- Shows "Already selected for {day}:" list below with tap-to-remove chips for the current day

#### Class / Semi-Private (`serviceType !== "private"`):

- Shows a static card with the service name and message: "This class has a fixed schedule. Your package will include all scheduled sessions."
- No user interaction needed; Continue button is always visible

**Validation:**
- Private: at least 1 preferred time must be selected to show the Continue button
- Class: Continue button always visible (no selection needed)

**On Continue:** Updates `preferredTimes` array in context. Navigates to `./info`.

---

### Step 3: Info

**File:** `app/(app)/dashboard/buy-package/info.tsx`

**No API calls.**

**User Action:**
- Optional multi-line text input for remarks/special requests

**On Continue:** Updates `remark`. Navigates to `./review`.

---

### Step 4: Review

**File:** `app/(app)/dashboard/buy-package/review.tsx`

**No API calls.** Reads from `usePurchaseFlow()` context.

**Section title:** "REVIEW YOUR PACKAGE"

**Displayed cards (each in a rounded card with icon):**

| Card | Icon | Shows | Condition |
|------|------|-------|-----------|
| Category | `grid-outline` | `state.categoryName` | Only if categoryName exists |
| Service | `fitness-outline` | `state.serviceName` | Only if serviceName exists |
| Package | `cube-outline` | `state.packageName`, credits count, price (`$X.XX`), validity (`Valid for N days`) | Always shown |
| Preferred Times | `time-outline` | Each preferred time as "{Day} at {Time}" (one per line) | Only for `private` serviceType with times selected |
| Remark | `document-text-outline` | `state.remark` text | Only if remark exists |

**On Continue:** Navigates to `./sign`.

---

### Step 5: Sign (E-Signature)

**File:** `app/(app)/dashboard/buy-package/sign.tsx`

**No API calls.**

**Dependencies:** `react-native-signature-canvas`, `expo-screen-orientation`

**Section title:** "E-SIGNATURE"

#### Terms Documents (must view ALL 3 before agreeing)

Each document is a tappable link that navigates to `./terms?document={id}`:

| Document ID | Display Name | PDF Asset |
|-------------|-------------|-----------|
| `agreement` | Company-Client Agreement | `assets/documents/agreement.pdf` |
| `satisfaction` | 100% Satisfaction Guarantee | `assets/documents/satisfaction-guarantee.pdf` |
| `parq` | Par-Q & You | `assets/documents/parq.pdf` |

- Unviewed documents: underlined text with chevron-forward icon
- Viewed documents: normal text with green checkmark-circle icon
- The component tracks viewed state in `viewedDocs: Record<string, boolean>`

#### Terms Viewer Screen (`terms.tsx`)

**File:** `app/(app)/dashboard/buy-package/terms.tsx`

**Dependencies:** `react-native-webview`, `expo-asset`, `expo-file-system`, `expo-intent-launcher`

**Receives:** `document` param (document ID from sign screen)

**PDF Loading Strategy (platform-specific):**

| Platform | Behavior |
|----------|----------|
| **Android** | Downloads bundled PDF via `expo-asset`, gets content URI via `FileSystem.getContentUriAsync()`, opens in system PDF viewer via `IntentLauncher.startActivityAsync("android.intent.action.VIEW")`, then auto-navigates back |
| **iOS** | Downloads bundled PDF, opens via `Linking.openURL()` in system viewer, then auto-navigates back |
| **Web** | Reads PDF as base64, renders inline via `WebView` with `data:application/pdf;base64,...` embed |

**Fallback (if PDF loading fails):** Renders inline scrollable text with 4 sections:
1. Terms and Conditions of Service (booking terms, age requirements, cancellation rights)
2. Cancellation and Refund Policy (24h cancellation window, 14-day refund, no-show policy)
3. Health and Safety Waiver (physical condition confirmation, liability release)
4. Privacy Policy (data collection, storage, third-party sharing, user rights)

Last updated: January 2025

#### Agreement Checkbox

- Tapping the checkbox **before viewing all 3 documents** shows Alert: "Please review all terms - Open each of the three document links above before agreeing."
- Only toggleable after all docs are viewed (`allTermsViewed` check)
- Text: "I agree to the terms and conditions and confirm that the information provided is accurate"

#### Signature Capture

- **Tap "Sign Below" area** (200px tall, dashed border when empty, solid when signed)
- Opens full-screen modal with `SignatureCanvas`:
  - Screen orientation **locked to landscape** via `ScreenOrientation.lockAsync(LANDSCAPE)`
  - Header shows "Sign Here (Landscape Mode)" with green "Landscape Mode Active" indicator
  - Canvas fills entire screen for easy finger/stylus signing
  - **"Clear"** button: erases the canvas
  - **"Confirm Signature"** button: reads signature as base64 image data, closes modal, unlocks orientation
- After signing: shows the signature as an image preview in the sign area
- **"Re-sign"** link appears below to clear and re-open the modal
- Orientation is always unlocked on modal close and component unmount (cleanup)

**Validation:** Both `signature` (base64 string) AND `agreedToTerms` (boolean) must be truthy to show the Continue button.

**On Continue:** Updates context with `signature` (base64 image data), `termsAgreed: true`, `termsAgreedAt: new Date().toISOString()`. Navigates to `./pay`.

---

### Step 6: Pay

**File:** `app/(app)/dashboard/buy-package/pay.tsx`

**APIs Used:**

| API Call | Purpose | Input |
|----------|---------|-------|
| `orpc.taxRates.getDefault` | Default tax rate | `{ organizationId }` |
| `authClient.useSession()` | Get current user ID for `clientId` | - |
| `client.packageInstances.create` | Create package instance (mutation) | See below |
| `client.preferredTimes.upsert` | Save preferred times (mutation) | See below |

**Section title:** "PAYMENT"

**Order Summary Card:**
- Package name, credits count
- Subtotal: `state.price` (from context)
- Tax: calculated as `subtotal * (rateInBasisPoints / 100 / 100)` where `rateInBasisPoints` comes from `taxRates.getDefault` (e.g., 1000 basis points = 10%)
- **Total: subtotal + tax amount**

**Important:** There is **no payment method selection UI** in the current implementation. The payment status is set to `"pending"` and payment method to `"pending"`. This is a placeholder flow - the "Complete Purchase" button directly creates the package instance without real payment processing.

**On "Complete Purchase":**

```typescript
// 1. Create package instance
client.packageInstances.create({
  organizationId,
  packageId,
  clientId: session.user.id,
  source: "purchased",
  totalPrice: total,
  taxAmount,
  paymentStatus: "pending",
  paymentMethod: "pending",
  eSignature: state.signature,
  termsAgreedAt: state.termsAgreedAt,
  creditsTotal, creditsRemaining: creditsTotal, creditsUsed: 0,
  startsAt: now.toISOString(),
  expiresAt: (now + validityDays).toISOString(),
  status: "active",
  remark: state.remark,
})

// 2. Save preferred times (if any, non-critical)
client.preferredTimes.upsert({
  organizationId,
  packageInstanceId: instance.id,
  items: preferredTimes.map((pt, i) => ({
    dayOfWeek: pt.day.toLowerCase(),
    time: pt.time,
    priority: i + 1,
  })),
})
```

- Invalidates `packageInstances` queries
- Updates context with `paymentMethod`, `packageInstanceId`
- Navigates to `./done`
- On error: Alert "Purchase Failed"

---

### Step 7: Done

**File:** `app/(app)/dashboard/buy-package/done.tsx`

**No API calls.**

**Displays:**
- Success checkmark
- "Package Purchased!" title
- Package details summary (name, credits, total with approximate tax)

**Action Buttons:**
- "Back to Home" -> `router.replace("/dashboard")` (resets flow)
- "View My Packages" -> `router.replace("/dashboard/packages")` (resets flow)
- "Start Booking" -> `router.replace("/dashboard/book-workout/book-workout")` (resets flow)

---

## 15. Notifications Screen

**File:** `app/(app)/dashboard/notifications/index.tsx`

### APIs Used

| API Call | Purpose | Input |
|----------|---------|-------|
| `orpc.notifications.list` | All notifications | `{ organizationId, limit: 50 }` |
| `client.notifications.markRead` | Mark single as read (mutation) | `{ organizationId, id }` |
| `client.notifications.markAllRead` | Mark all as read (mutation) | `{ organizationId }` |

### Screen Layout

- **Tab bar**: Hidden on this screen
- **Header**: Back button, "Notifications" title, unread count badge, "Mark all read" button
- **Notification list**: Each notification shows:
  - Type-specific icon and color:
    - `booking` -> calendar icon (indigo)
    - `reminder` -> time icon (amber)
    - `promotion` -> gift icon (green)
    - `system` -> info icon (gray)
  - Title, message, relative time ("5 min ago", "2 days ago")
  - Unread indicator (left border + dot)
  - Read notifications appear dimmed (opacity 0.7)

### Notification Tap Actions

| Type | Navigation |
|------|-----------|
| `booking` (with referenceId) | `/dashboard/bookings/[referenceId]` |
| `reminder` | `/dashboard/bookings` |
| `promotion` | `/dashboard/explore` |
| `system` / other | No navigation |

All taps also mark the notification as read.

### Pull to Refresh
Refetches notifications list.

---

## 16. Packages & Credits Screen

**File:** `app/(app)/dashboard/packages/index.tsx`

### APIs Used

| API Call | Purpose | Input |
|----------|---------|-------|
| `orpc.packageInstances.listForClient` | User's packages | `{ organizationId, status? }` |

### Screen Layout

- **Tab bar**: Hidden on this screen
- **Header**: Back button, "My Packages & Credits" title

### Filter Tabs (horizontal scroll)

| Tab | Filter Value |
|-----|-------------|
| All | `undefined` (no filter) |
| Active | `"active"` |
| Expired | `"expired"` |
| Exhausted | `"exhausted"` |

### Package Card (for each instance)

- **Image** + **Name** + **Status badge** (color-coded: Active=green, Expired=red, Exhausted=amber, Cancelled=gray)
- Appointment type
- Credits: "{remaining} / {total} credits remaining"
- Purchase date
- Price
- **Progress bar**: Credits used / total
- **Expiry countdown**: "Expires in N days" (amber warning if < 30 days)
- **"View Package Details"** button -> `/dashboard/bookings/[id]`

### Empty State
- "No Packages Yet" with "Buy Package" CTA -> `/dashboard/buy-package/setup`

### Pull to Refresh
Refetches package instances.

---

## 17. Calendar Screen

**File:** `app/(app)/dashboard/calendar/index.tsx`

### APIs Used

| API Call | Purpose | Input |
|----------|---------|-------|
| `orpc.appointments.listForUser` | Month's appointments | `{ organizationId, startFrom: monthStart, startTo: monthEnd }` |

### Screen Layout

- **Tab bar**: Hidden on this screen
- **Header**: Back button, "Calendar" title, description

### Calendar Component (`react-native-calendars`)
- Full month calendar view
- **Dot markers** on dates with appointments
- **Selected date** highlighted
- Navigating months triggers re-fetch for new month boundaries

### Selected Date Bookings (below calendar)
- List of bookings on the selected date
- Each shows: type icon (person for private, people for class), name, time, credits, location, status
- **Empty state**: "No Bookings" / "You don't have any bookings on this date"

### Pull to Refresh
Refetches month appointments.

---

## 18. Modal Screen

**File:** `app/(app)/modal.tsx`

A placeholder modal screen. Currently shows just "Modal" text. Available via the `(app)` stack with `presentation: "modal"` option.

---

## 19. Complete API Reference

### Authentication APIs (Better-Auth client)

| Method | Used In | Purpose |
|--------|---------|---------|
| `authClient.useSession()` | `useAuth()` hook | Get current session state |
| `authClient.signIn.email()` | Login screen | Email/password login |
| `authClient.signUp.email()` | Sign-up screen | Create account |
| `authClient.signOut()` | `useAuth().logout()` | Sign out |
| `authClient.forgetPassword()` | Forgot password | Send reset email |
| `authClient.resetPassword()` | `useAuth()` hook | Reset with token |
| `authClient.sendVerificationEmail()` | Verify email screen | Resend verification |
| `authClient.updateUser()` | Profile screen | Update display name |
| `authClient.changePassword()` | Profile modal | Change password |
| `authClient.getCookie()` | oRPC config | Get auth cookies for API headers |

### oRPC Query APIs (read-only, via React Query)

| API | Used In | Input |
|-----|---------|-------|
| `orpc.packageInstances.getActiveForClient` | Home | `{ organizationId }` |
| `orpc.packageInstances.listForClient` | Book Workout, Packages | `{ organizationId, status? }` |
| `orpc.notifications.getUnreadCount` | Home | `{ organizationId }` |
| `orpc.notifications.list` | Notifications | `{ organizationId, limit }` |
| `orpc.appointments.listForUser` | Home, Bookings, Calendar | `{ organizationId, status?, startFrom?, startTo?, limit? }` |
| `orpc.appointments.getById` | Booking Detail | `{ organizationId, id }` |
| `orpc.serviceCategories.list` | Explore, Buy Package | `{ organizationId }` |
| `orpc.services.list` | Explore, Buy Package, Service Detail | `{ organizationId, categoryId?, isActive? }` |
| `orpc.services.getById` | Service Detail | `{ organizationId, id }` |
| `orpc.packages.list` | Buy Package Setup | `{ organizationId, appointmentType }` |
| `orpc.classSlots.list` | Book Workout Schedule | `{ organizationId, serviceId, from, to }` |
| `orpc.members.list` | Book Workout Setup | `{ organizationId, role, status }` |
| `orpc.customerProfiles.get` | Profile | `{ organizationId }` |
| `orpc.notificationPreferences.get` | Profile | `{ organizationId }` |
| `orpc.taxRates.getDefault` | Buy Package Pay | `{ organizationId }` |

### oRPC Mutation APIs (write, via direct client)

| API | Used In | Purpose |
|-----|---------|---------|
| `client.auth.userContext()` | Organization Context | Fetch user's orgs + hierarchy |
| `client.registration.listCountries()` | Registration Form | Fetch available countries |
| `client.registration.listBranches()` | Registration Form | Fetch branches by country |
| `client.registration.complete()` | Registration Form | Submit registration |
| `client.appointments.create()` | Book Workout Review | Create booking |
| `client.appointments.update()` | Booking Detail | Cancel booking |
| `client.packageInstances.create()` | Buy Package Pay | Purchase package |
| `client.preferredTimes.upsert()` | Buy Package Pay | Save preferred schedule |
| `client.customerProfiles.upsert()` | Profile | Update phone/profile |
| `client.notificationPreferences.update()` | Profile | Toggle notification prefs |
| `client.notifications.markRead()` | Notifications | Mark single read |
| `client.notifications.markAllRead()` | Notifications | Mark all read |

---

## 20. Context Providers Reference

### 1. OrganizationProvider

**File:** `contexts/organization-context.tsx`
**Wraps:** `(app)` layout (after role check passes)
**Provides:** `organizationId`, `setOrganizationId`, `organizations`, `isLoading`, `error`, `refetch`
**Persistence:** `expo-secure-store` key `avantej_selected_organization_id`

### 2. BookingFlowProvider

**File:** `contexts/booking-flow-context.tsx`
**Wraps:** `book-workout/_layout.tsx` (entire booking wizard)
**Provides:** `state: BookingFlowState`, `update(partial)`, `reset()`
**Persistence:** In-memory only (resets when leaving the flow)

### 3. PurchaseFlowProvider

**File:** `contexts/purchase-flow-context.tsx`
**Wraps:** `buy-package/_layout.tsx` (entire purchase wizard)
**Provides:** `state: PurchaseFlowState`, `update(partial)`, `reset()`
**Persistence:** In-memory only (resets when leaving the flow)

---

## 21. Hooks Reference

| Hook | File | Purpose |
|------|------|---------|
| `useAuth()` | `hooks/useAuth.ts` | Session state + login/signup/logout/forgotPassword/resetPassword |
| `useOrganization()` | `hooks/useOrganization.ts` | Current `organizationId` (throws if none) |
| `useDebounce(value, delay)` | `hooks/useDebounce.ts` | Debounced value (used in Explore search) |
| `useBookingFlow()` | `contexts/booking-flow-context.tsx` | Booking wizard state |
| `usePurchaseFlow()` | `contexts/purchase-flow-context.tsx` | Purchase wizard state |
| `useOrganizationContext()` | `contexts/organization-context.tsx` | Raw org context (nullable) |

---

## 22. Utility & Lib Files

| File | Purpose |
|------|---------|
| `utils/orpc.ts` | oRPC client, queryClient, auth header injection |
| `lib/auth-client.ts` | Better-Auth client with Expo SecureStore plugin |
| `lib/colors.ts` | Design system color tokens (`primary`, `secondary`) |
| `lib/font.ts` | Font family constants (`heading`, etc.) |
| `lib/constants.ts` | Navigation theme color mappings |
| `lib/use-color-scheme.ts` | Color scheme detection hook |
| `lib/android-navigation-bar.tsx` | Android nav bar color setter |
| `components/container.tsx` | `<TabContainer>`, `<Container>`, `useTabBarHeight()` |
| `components/header-button.tsx` | Reusable header button component |
| `components/tabbar-icon.tsx` | Tab bar icon component |
| `components/sign-in.tsx` | Sign-in component (unused / legacy) |
| `components/sign-up.tsx` | Sign-up component (unused / legacy) |

---

## 23. Full File Tree

```
apps/native/
  app/
    _layout.tsx                          # Root: fonts, theme, QueryClient, GestureHandler
    index.tsx                            # Auth gate: redirect to dashboard or login
    +not-found.tsx                       # 404 screen
    (auth)/
      _layout.tsx                        # Headerless Stack
      login.tsx                          # Email/password login
      sign-up.tsx                        # Account creation
      forgot-password.tsx                # Password reset request
      verify-email.tsx                   # Email verification prompt
    (app)/
      _layout.tsx                        # Role gate: registration or dashboard
      modal.tsx                          # Placeholder modal
      dashboard/
        _layout.tsx                      # Tab navigator (4 visible + 5 hidden)
        index.tsx                        # Home tab
        profile.tsx                      # Profile tab
        explore/
          _layout.tsx                    # Stack layout
          index.tsx                      # Service browsing + search
          [id].tsx                       # Service detail
        bookings/
          _layout.tsx                    # Stack layout
          index.tsx                      # Upcoming + past bookings
          [id].tsx                       # Booking detail + cancel
        book-workout/
          _layout.tsx                    # Stack + BookingFlowProvider
          book-workout.tsx               # Step 1: Select package + trainer
          schedule.tsx                   # Step 2: Select date + time
          review.tsx                     # Step 3: Review + confirm (creates appointment)
          done.tsx                       # Step 4: Success confirmation
        buy-package/
          _layout.tsx                    # Stack + PurchaseFlowProvider
          setup.tsx                      # Step 1: Category + service + package
          schedule.tsx                   # Step 2: Preferred times
          info.tsx                       # Step 3: Remarks
          review.tsx                     # Step 4: Review all details
          sign.tsx                       # Step 5: E-signature (drawn) + terms agreement
          terms.tsx                      # Terms PDF viewer (bundled PDFs, system viewer on native)
          pay.tsx                        # Step 6: Payment (creates package instance)
          done.tsx                       # Step 7: Success confirmation
          STEP_BY_STEP_FLOW.md           # Flow documentation
        notifications/
          _layout.tsx                    # Stack layout
          index.tsx                      # Notification list + mark read
        packages/
          _layout.tsx                    # Stack layout
          index.tsx                      # Package instances + credits
        calendar/
          _layout.tsx                    # Stack layout
          index.tsx                      # Month calendar + day bookings
    (drawer)/
      index.tsx                          # Drawer index (likely unused)
  components/
    container.tsx                        # TabContainer, Container, useTabBarHeight
    header-button.tsx                    # Header button
    registration-form.tsx                # 3-step registration wizard
    sign-in.tsx                          # Legacy sign-in component
    sign-up.tsx                          # Legacy sign-up component
    tabbar-icon.tsx                      # Tab bar icon
  contexts/
    booking-flow-context.tsx             # Booking wizard state
    organization-context.tsx             # Organization selection + persistence
    purchase-flow-context.tsx            # Purchase wizard state
  hooks/
    useAuth.ts                           # Auth operations
    useDebounce.ts                       # Debounce hook
    useOrganization.ts                   # Organization access
  lib/
    android-navigation-bar.tsx           # Android nav bar
    auth-client.ts                       # Better-Auth config
    colors.ts                            # Color tokens
    constants.ts                         # Nav theme constants
    font.ts                              # Font families
    use-color-scheme.ts                  # Color scheme detection
  utils/
    orpc.ts                              # oRPC + React Query setup
  assets/
    fonts/                               # Custom fonts
    images/                              # Logo etc.
  global.css                             # NativeWind global styles
  tailwind.config.js                     # Tailwind config
  metro.config.js                        # Metro bundler config
  babel.config.js                        # Babel config
  tsconfig.json                          # TypeScript config
  package.json                           # Dependencies
  app.json                               # Expo config
  nativewind-env.d.ts                    # NativeWind type declarations
```

---

## Flow Diagram Summary

```
App Launch
    |
    v
[Root Layout] -- load fonts, theme, providers
    |
    v
[index.tsx] -- check auth
    |
    +-- Not authenticated --> [Login] <-> [Sign Up] -> [Verify Email]
    |                                  |-> [Forgot Password]
    |
    +-- Authenticated --> [(app) Layout] -- check user.role
                              |
                              +-- No role --> [Registration Form (3 steps)]
                              |                   |-> Personal Details
                              |                   |-> Emergency Contact
                              |                   |-> Branch Selection
                              |                   |-> Submit -> refetch session
                              |
                              +-- Has role --> [OrganizationProvider]
                                                |
                                                v
                                         [Dashboard Tabs]
                                              |
                      +-----------+-----------+-----------+
                      |           |           |           |
                   [Home]    [Explore]   [Bookings]  [Profile]
                      |           |           |           |
                      |     [Service Detail]  |    [Change Password]
                      |           |           |
                      |     +-----+-----+     |
                      |     |           |     |
                      | [Book Now] [Buy Pkg]  |
                      |     |           |     |
                      v     v           v     v
                [Book Workout]  [Buy Package]  [Booking Detail]
                 (4 steps)      (7 steps)      (view/cancel)
                      |               |
                      v               v
              [Notifications] [Packages] [Calendar]
```

---

## 24. Shared API Contract (oRPC Procedures)

This section documents every oRPC procedure the customer flows use, with exact input schemas, response shapes (from DB schemas), permissions, access control, and business logic. Both the native and web apps consume these same endpoints.

### Multi-Tenancy Pattern

Every procedure accepts `organizationId` as input. The server middleware resolves this to a tenant database connection (`context.tenantDb`). All data is isolated per tenant.

### Authentication & Authorization

- **`publicProcedure`**: No auth required
- **`protectedProcedure`**: Requires `context.session?.user` (Better-Auth session). Throws `UNAUTHORIZED` if missing.
- **Staff procedures**: Additionally require `context.member` (user must be a member of the organization)
- **Permission checks**: Staff operations call `requirePermission(tenantDb, member, resource, action)`. Throws `FORBIDDEN` on failure.
- **Client procedures**: Validate the authenticated user owns the resource (e.g., `userId === session.user.id`)

### Error Codes

All procedures throw `ORPCError` with these status codes:
- `UNAUTHORIZED` - No session / not logged in
- `FORBIDDEN` - Logged in but lacks permission
- `NOT_FOUND` - Resource doesn't exist
- `BAD_REQUEST` - Invalid input or business rule violation
- `CONFLICT` - Duplicate resource
- `INTERNAL_SERVER_ERROR` - Missing tenant DB or unexpected failure

---

### 24.1 auth.userContext

**File:** `apps/server/src/routers/auth.ts`
**Type:** `protectedProcedure`

**Input:** None

**Response:**
```typescript
{
  user: {
    id: string,
    email: string,
    name: string,
    firstName: string,
    lastName: string,
    emailVerified: boolean,
    role: string | null,        // null = needs registration
    image: string | null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  organizations: Array<{
    id: string,                  // organization UUID
    name: string,                // org name (from hierarchy root node)
    slug: string,                // org slug
    role: string,                // member's role: "admin" | "trainer" | "staff" | "client"
    hierarchy: {
      nodes: Array<{
        id: string,              // UUID
        name: string,
        type: string,            // "organization" | "country" | "region" | "area" | "branch"
        depth: number,           // 0-4
        parentId: string | null,
        createdAt: timestamp | null,
        updatedAt: timestamp | null,
      }>,
      member: {
        role: string,
        hierarchyScopeId: string,      // UUID - the node this member is scoped to
        hierarchyScopeName: string,
        accessibleNodeIds: string[],   // all descendant node IDs the member can access
      } | null,
    },
  }>,
  currentOrganizationId: string | null,
}
```

**Logic:**
- Fetches user from control panel DB
- For each organization the user belongs to: connects to that org's tenant DB, loads all hierarchy nodes, builds member's accessible node tree
- Returns comprehensive context for the client to use across the app

---

### 24.2 registration.listCountries

**File:** `packages/api/src/routers/registration.ts`
**Type:** `publicProcedure` (NO auth required)

**Input:** None

**Response:** `string[]` - Array of distinct country names from `organization_branches` registry table

---

### 24.3 registration.listBranches

**File:** `packages/api/src/routers/registration.ts`
**Type:** `publicProcedure` (NO auth required)

**Input:**
```typescript
{ country: string }  // min 1 char
```

**Response:**
```typescript
Array<{
  id: string,            // branch UUID
  name: string,          // branch name
  address: string | null,
  organizationId: string // UUID of the owning organization
}>
```

---

### 24.4 registration.complete

**File:** `packages/api/src/routers/registration.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{
  organizationId: string,     // UUID
  phone: string,
  idPassportNo: string,
  addressType: "home" | "work",
  streetAddress: string,
  city: string,
  state: string,
  country: string,
  postalCode: string,
  dateOfBirth: string,        // "YYYY-MM-DD"
  emergencyContactName: string,
  emergencyContactRelationship: string,
  emergencyContactPhone: string,
  branchId: string,           // UUID
}
```

**Response:**
```typescript
{ success: true, message: string, organizationId: string }
```

**Business Logic:**
1. Validates branch exists and belongs to the selected organization
2. Checks user is not already a member of the organization
3. **Dual-write**: Creates member record in tenant DB (role: "client", hierarchyScopeId: branchId, status: "active") AND updates user profile in control panel DB with personal details
4. Sets user `role` to `"user"` in control panel (marks registration as complete - this is what the app layout checks to pass the registration gate)

---

### 24.5 serviceCategories.list

**File:** `packages/api/src/routers/service-categories.ts`
**Type:** `protectedProcedure`
**Permission:** `service_management` (read)

**Input:**
```typescript
{
  organizationId: string,     // UUID
  branchId?: string | null,   // UUID - filter by branch
  isActive?: boolean,
}
```

**Response:**
```typescript
Array<{
  id: string,              // UUID
  name: string,
  description: string | null,
  displayOrder: number,    // default 0
  branchId: string | null, // UUID
  isActive: boolean,       // default true
  createdAt: timestamp,
  updatedAt: timestamp,
}>
```

**Access Control:** Requires member + permission. Results filtered by member's `accessibleNodeIds` (hierarchy scope).

---

### 24.6 services.list

**File:** `packages/api/src/routers/services.ts`
**Type:** `protectedProcedure`
**Permission:** `service_management` (read)

**Input:**
```typescript
{
  organizationId: string,        // UUID
  categoryId?: string | null,    // UUID
  branchId?: string | null,      // UUID
  isActive?: boolean,
  type?: "private" | "semi_private",
  schedulingType?: "appointment" | "class_slot",
}
```

**Response (full service objects):**
```typescript
Array<{
  id: string,                    // UUID
  name: string,
  categoryId: string | null,     // UUID
  duration: number,              // in seconds
  durationUnitType: string,      // "seconds" | "minutes" | "hours" (default "minutes")
  maxAttendees: number,
  attendanceThreshold: number | null,
  branchId: string | null,
  isActive: boolean,
  createdAt: timestamp,
  updatedAt: timestamp,
  // Display fields
  title: string | null,
  description: string | null,
  imageUrl: string | null,
  type: string,                  // "private" | "semi_private" (default "private")
  price: number | null,          // in cents
  priceUnit: string,             // "session" | "class" | "package" (default "session")
  taxable: boolean,
  taxPercentage: number,         // 0-100
  isRecommended: boolean,
  location: string | null,
  features: string[] | null,
  schedulingType: string,        // "appointment" | "class_slot" (default "appointment")
  // Stripe fields (may be present)
  stripeProductId: string | null,
  stripePriceId: string | null,
  stripeSyncStatus: string,
  stripeLastSyncedAt: timestamp | null,
}>
```

---

### 24.7 services.getById

**File:** `packages/api/src/routers/services.ts`
**Type:** `protectedProcedure`
**Permission:** `service_management` (read)

**Input:**
```typescript
{ organizationId: string, id: string }  // both UUIDs
```

**Response:** Same shape as a single item from `services.list`. Throws `NOT_FOUND` if not found.

---

### 24.8 packages.list

**File:** `packages/api/src/routers/packages.ts`
**Type:** `protectedProcedure`
**Permission:** `service_management` (read)

**Input:**
```typescript
{
  organizationId: string,                              // UUID
  branchId?: string | null,                            // UUID
  appointmentType?: "private" | "semi-private" | "both",
  isArchived?: boolean,
}
```

**Response:**
```typescript
Array<{
  id: string,                    // UUID
  name: string,                  // 1-255 chars
  appointmentType: string,       // "private" | "semi-private" | "both"
  crossUsageEnabled: boolean,    // default false
  sessionCount: number,          // positive integer (= total credits)
  pricePerSession: number,       // in cents, >= 0
  maxClientsPerSession: number,  // positive integer
  expiryDays: number | null,     // days from assignment (null if using fixed date)
  expiryDate: timestamp | null,  // fixed date (null if using days)
  autoGenerateInvoice: boolean,
  branchId: string | null,
  allowedServiceIds: string[] | null,  // null = all services allowed
  isArchived: boolean,
  createdAt: timestamp,
  updatedAt: timestamp,
}>
```

**Note:** `expiryDays` and `expiryDate` are mutually exclusive. The native app uses `validityDays` (mapped from `expiryDays`) to calculate expiry on purchase.

---

### 24.9 packageInstances.getActiveForClient

**File:** `packages/api/src/routers/package-instances.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{ organizationId: string }  // UUID
```

**Response:** First active (non-expired, non-exhausted) package instance for the session user, or `null`.

```typescript
{
  id: string,                  // UUID
  packageId: string,           // UUID
  clientId: string,            // user ID
  source: string,              // "assigned" | "purchased"
  assignedBy: string | null,
  purchaseNumber: string | null,
  paymentId: string | null,    // UUID
  totalPrice: number | null,   // in cents
  taxAmount: number,           // in cents, default 0
  paymentStatus: string,       // "pending" | "paid" | "failed" | "refunded"
  paymentMethod: string | null,
  eSignature: string | null,   // base64 signature data
  termsAgreedAt: timestamp | null,
  creditsTotal: number,
  creditsRemaining: number,
  creditsUsed: number,         // default 0
  startsAt: timestamp,
  expiresAt: timestamp,
  status: string,              // "active" | "expired" | "exhausted" | "cancelled"
  remark: string | null,
  createdAt: timestamp,
  updatedAt: timestamp,
} | null
```

**Access Control:** Uses `session.user.id` as `clientId` - no staff permission needed, client-only.

---

### 24.10 packageInstances.listForClient

**File:** `packages/api/src/routers/package-instances.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{
  organizationId: string,                                    // UUID
  status?: "active" | "expired" | "exhausted" | "cancelled",
  source?: "assigned" | "purchased",
  limit?: number,              // 1-200
}
```

**Response:** `Array<PackageInstance>` (same shape as `getActiveForClient` response, as array)

**Access Control:** Uses `session.user.id` as `clientId` - client-only.

---

### 24.11 packageInstances.create

**File:** `packages/api/src/routers/package-instances.ts`
**Type:** `protectedProcedure`
**Permission:** `service_management` (create)

**Input:**
```typescript
{
  organizationId: string,        // UUID
  packageId: string,             // UUID (required)
  clientId: string,              // user ID (required)
  source: "assigned" | "purchased",
  assignedBy?: string,
  purchaseNumber?: string,
  paymentId?: string,            // UUID
  totalPrice?: number,           // cents
  taxAmount?: number,            // cents
  paymentStatus?: "pending" | "paid" | "failed" | "refunded",
  paymentMethod?: string,
  eSignature?: string,           // base64 signature image
  termsAgreedAt?: string,        // ISO datetime
  creditsTotal: number,          // required
  creditsRemaining: number,      // required
  creditsUsed?: number,
  startsAt: string,              // ISO datetime (required)
  expiresAt: string,             // ISO datetime (required)
  status?: "active" | "expired" | "exhausted" | "cancelled",
  remark?: string,
}
```

**Response:** Created `PackageInstance` object.

**Note:** Requires `context.member` (staff). The native app calls this during purchase but the user is a "client" member - the permission check depends on the member having `service_management.create` permission via their role.

---

### 24.12 appointments.listForUser

**File:** `packages/api/src/routers/appointments.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{
  organizationId: string,        // UUID
  status?: "pending" | "confirmed" | "completed" | "cancelled" | "no-show",
  startFrom?: string,            // ISO datetime
  startTo?: string,              // ISO datetime
  limit?: number,                // 1-200
}
```

**Response:**
```typescript
Array<{
  id: string,                    // UUID
  type: string,                  // "private" | "semi-private"
  startTime: timestamp,
  duration: number,              // minutes
  endTime: timestamp,            // calculated: startTime + duration
  serviceId: string | null,
  branchId: string,
  status: string,                // "pending" | "confirmed" | "completed" | "cancelled" | "no-show"
  sessionTotal: number,          // cents
  pricePerClient: number,        // cents
  isRecurring: boolean,
  recurringParentId: string | null,
  recurringFrequency: string | null,
  recurringEndDate: timestamp | null,
  conflictResolved: boolean,
  conflictReason: string | null,
  paymentStatus: string,         // "pending" | "paid" | "partial" | "refunded"
  stripePaymentIntentId: string | null,
  notes: string | null,
  createdBy: string,
  createdAt: timestamp,
  updatedAt: timestamp,
  bookingNumber: string | null,  // unique
  userId: string | null,
  trainerId: string | null,      // UUID
  packageInstanceId: string | null,
  creditsUsed: number | null,    // default 1
  location: string | null,
  cancelledAt: timestamp | null,
  cancellationReason: string | null,
  classSlotId: string | null,
  description: string | null,
  imageUrl: string | null,
  roomId: string | null,
}>
```

**Access Control:** Uses `session.user.id` to filter - returns only the authenticated user's appointments. No staff permission needed.

---

### 24.13 appointments.getById

**File:** `packages/api/src/routers/appointments.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{ organizationId: string, id: string }  // both UUIDs
```

**Response:** Single appointment object (same shape as `listForUser` item). Throws `NOT_FOUND` if not found.

**Dual Access Control:**
- If `appointment.userId === session.user.id` -> allowed (client viewing own booking)
- If user is a staff member -> checks `appointment_management` (read) permission + hierarchy scope
- Otherwise -> throws `FORBIDDEN`

---

### 24.14 appointments.create

**File:** `packages/api/src/routers/appointments.ts`
**Type:** `protectedProcedure`
**Permission:** `appointment_management` (create)

**Input:**
```typescript
{
  organizationId: string,        // UUID
  type: "private" | "semi-private",
  startTime: string,             // ISO datetime (required)
  duration: number,              // positive integer, minutes (required)
  branchId: string,              // UUID (required)
  serviceId?: string,            // UUID
  status?: "pending" | "confirmed" | "completed" | "cancelled" | "no-show",
  sessionTotal: number,          // cents (required)
  pricePerClient: number,        // cents (required)
  userId?: string,               // user ID (for client bookings)
  trainerId?: string,            // UUID
  packageInstanceId?: string,    // UUID
  creditsUsed?: number,
  location?: string,
  classSlotId?: string,          // UUID
  description?: string,
  imageUrl?: string,
  notes?: string,
  bookingNumber?: string,
}
```

**Response:** Created appointment object. Sets `createdBy` to `context.member.userId`.

**Business Logic:**
- Requires member + `appointment_management.create` permission
- Validates branchId is within member's accessible hierarchy
- `endTime` is calculated server-side: `startTime + duration`

---

### 24.15 appointments.update

**File:** `packages/api/src/routers/appointments.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{
  organizationId: string,        // UUID
  id: string,                    // UUID (required)
  status?: "pending" | "confirmed" | "completed" | "cancelled" | "no-show",
  startTime?: string,            // ISO datetime
  duration?: number,
  trainerId?: string,
  location?: string,
  notes?: string,
  cancelledAt?: string,          // ISO datetime
  cancellationReason?: string,
  description?: string,
  imageUrl?: string,
}
```

**Response:** Updated appointment object.

**Dual Access Control (IMPORTANT):**
- **Staff path:** Requires `appointment_management` (update) permission + hierarchy scope validation. Can update any field.
- **Client path:** If `appointment.userId === session.user.id`, the client can **ONLY set `status` to `"cancelled"`**. All other fields are ignored for client updates. This is the booking cancellation flow.
- **Otherwise:** Throws `FORBIDDEN`.

---

### 24.16 classSlots.list

**File:** `packages/api/src/routers/class-slots.ts`
**Type:** `protectedProcedure`
**Permission:** `class_slot_management` (read)

**Input:**
```typescript
{
  organizationId: string,        // UUID
  serviceId?: string,            // UUID
  branchId?: string,             // UUID
  from?: string,                 // ISO datetime
  to?: string,                   // ISO datetime
  isAvailable?: boolean,
  limit?: number,
  offset?: number,
}
```

**Response:**
```typescript
Array<{
  id: string,                    // UUID
  serviceId: string,             // UUID
  branchId: string,              // UUID
  date: timestamp,
  startTime: string,             // "09:00" format
  endTime: string,               // "10:00" format
  capacity: number,              // total spots
  spotsBooked: number,           // default 0
  spotsAvailable: number,        // computed
  isFull: boolean,               // default false
  isAvailable: boolean,          // default true
  isCancelled: boolean,          // default false
  cancellationReason: string | null,
  instructorId: string | null,   // UUID
  location: string | null,
  createdAt: timestamp,
  updatedAt: timestamp,
}>
```

**Note:** The native app calculates spots remaining as `capacity - currentBookings`. The DB schema has both `spotsBooked` and `spotsAvailable` fields.

---

### 24.17 members.list

**File:** `packages/api/src/routers/members.ts`
**Type:** `protectedProcedure`
**Permission:** `user_management` (read)

**Input:**
```typescript
{
  organizationId: string,        // UUID
  role?: "admin" | "trainer" | "staff" | "client",
  status?: "active" | "suspended",
  hierarchyScopeId?: string,     // UUID
}
```

**Response:**
```typescript
Array<{
  // Tenant DB member fields
  id: string,                    // UUID
  userId: string,                // references control panel user.id
  role: string,                  // "admin" | "trainer" | "staff" | "client"
  hierarchyScopeId: string,      // UUID
  status: string,                // "active" | "suspended"
  joinedAt: timestamp,
  // Enriched from control panel DB
  user: {
    name: string,
    email: string,
    // (other user fields may be present)
  } | null,
}>
```

**RBAC:**
- Admin members see all members in the organization
- Non-admin members only see members within their accessible hierarchy scope (`accessibleNodeIds`)

**Cross-DB Operation:** Queries tenant DB for members, then fetches user details (name, email) from control panel DB.

---

### 24.18 customerProfiles.get

**File:** `packages/api/src/routers/customer-profiles.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{ organizationId: string }  // UUID
```

**Response:**
```typescript
{
  id: string,                      // UUID
  userId: string,
  phone: string | null,
  dateOfBirth: timestamp | null,
  gender: string | null,
  address: string | null,
  emergencyContactName: string | null,
  emergencyContactPhone: string | null,
  medicalNotes: string | null,
  fitnessGoals: string[] | null,
  creditPoints: number,            // default 0
  notes: string | null,
  isDeleted: boolean,
  deletedAt: timestamp | null,
  deletedSource: string | null,
  createdAt: timestamp,
  updatedAt: timestamp,
} | null
```

**Access Control:** Uses `session.user.id` - returns only the authenticated user's profile.

---

### 24.19 customerProfiles.upsert

**File:** `packages/api/src/routers/customer-profiles.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{
  organizationId: string,           // UUID
  phone?: string,
  dateOfBirth?: string,
  gender?: string,
  address?: string,
  emergencyContactName?: string,
  emergencyContactPhone?: string,
  medicalNotes?: string,
  fitnessGoals?: string[],          // array of strings
  creditPoints?: number,
  notes?: string,
}
```

**Response:** Updated `CustomerProfile` object. Creates if not exists (upsert on `userId`).

---

### 24.20 notificationPreferences.get

**File:** `packages/api/src/routers/notification-preferences.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{ organizationId: string }  // UUID
```

**Response:**
```typescript
{
  id: string,                        // UUID
  userId: string,
  // Channel toggles
  emailEnabled: boolean,             // default true
  smsEnabled: boolean,               // default false
  pushEnabled: boolean,              // default true
  // Notification type toggles
  bookingReminders: boolean,         // default true
  bookingConfirmations: boolean,     // default true
  promotionalEmails: boolean,        // default true
  packageExpiry: boolean,            // default true
  createdAt: timestamp,
  updatedAt: timestamp,
} | null
```

---

### 24.21 notificationPreferences.update

**File:** `packages/api/src/routers/notification-preferences.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{
  organizationId: string,            // UUID
  emailEnabled?: boolean,
  smsEnabled?: boolean,
  pushEnabled?: boolean,
  bookingReminders?: boolean,
  bookingConfirmations?: boolean,
  promotionalEmails?: boolean,
  packageExpiry?: boolean,
}
```

**Response:** Updated `NotificationPreferences` object.

---

### 24.22 notifications.list

**File:** `packages/api/src/routers/notifications.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{
  organizationId: string,            // UUID
  isRead?: boolean,
  type?: string,                     // "booking" | "reminder" | "payment" | "promotion" | "system"
  limit?: number,                    // 1-200
}
```

**Response:**
```typescript
Array<{
  id: string,                        // UUID
  userId: string,
  type: string,                      // "booking" | "reminder" | "payment" | "promotion" | "system"
  title: string,
  message: string,
  icon: string | null,
  color: string | null,
  relatedId: string | null,          // UUID - the native app maps this to `referenceId`
  relatedType: string | null,
  isRead: boolean,                   // default false
  readAt: timestamp | null,
  createdAt: timestamp,
}>
```

**Access Control:** Filters by `session.user.id` - returns only the authenticated user's notifications.

---

### 24.23 notifications.getUnreadCount

**File:** `packages/api/src/routers/notifications.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{ organizationId: string }  // UUID
```

**Response:** `number` (count of unread notifications for the session user)

---

### 24.24 notifications.markRead

**File:** `packages/api/src/routers/notifications.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{ organizationId: string, id: string }  // both UUIDs
```

**Response:** Updated notification object. Throws `NOT_FOUND` if notification doesn't exist or doesn't belong to the user.

---

### 24.25 notifications.markAllRead

**File:** `packages/api/src/routers/notifications.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{ organizationId: string }  // UUID
```

**Response:**
```typescript
{ count: number }  // number of notifications marked as read
```

---

### 24.26 taxRates.getDefault

**File:** `packages/api/src/routers/tax-rates.ts`
**Type:** `protectedProcedure`
**Permission:** `tax_configuration` (read)

**Input:**
```typescript
{ organizationId: string }  // UUID
```

**Response:**
```typescript
{
  id: string,                        // UUID
  name: string,                      // e.g., "Sales and Service Tax 8%"
  code: string,                      // e.g., "SST_8" (LHDN MyInvois code)
  rateInBasisPoints: number,         // 800 = 8.00%, 600 = 6.00%, 0 = 0%
  category: string,                  // "SST" | "GST" | "service_tax" | "withholding_tax" | "tax_exempt" | "custom"
  isActive: boolean,
  isDefault: boolean,                // true (this is the default rate)
  effectiveFrom: timestamp,
  effectiveUntil: timestamp | null,  // null = still active
  description: string | null,
  createdAt: timestamp,
  updatedAt: timestamp,
} | null
```

**Tax Calculation Formula:**
```
taxAmount = floor(orderAmount * rateInBasisPoints / 10000)
```
Example: For an order of $100 (10000 cents) with SST 8% (800 basis points):
`floor(10000 * 800 / 10000) = 800 cents = $8.00`

**Note:** The native app currently uses a simplified calculation: `subtotal * (rateInBasisPoints / 100 / 100)` which is mathematically equivalent but operates on dollar amounts rather than cents.

---

### 24.27 preferredTimes.upsert

**File:** `packages/api/src/routers/preferred-times.ts`
**Type:** `protectedProcedure`

**Input:**
```typescript
{
  organizationId: string,           // UUID
  packageInstanceId: string,        // UUID
  items: Array<{                    // max 4 items
    dayOfWeek: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday",
    time: string,                   // e.g., "09:00", "7:00 AM"
    priority: number,               // 1-4
  }>,
}
```

**Response:**
```typescript
Array<{
  id: string,                       // UUID
  packageInstanceId: string,        // UUID
  dayOfWeek: string,
  time: string,
  priority: number,                 // 1-4
  createdAt: timestamp,
}>
```

**Dual Access Control:**
- **Client path:** Validates `packageInstance.clientId === session.user.id` (must own the package)
- **Staff path:** Requires `service_management` (update) permission
- **Otherwise:** Throws `FORBIDDEN`

**DB Constraint:** Unique index on `(packageInstanceId, priority)` - each priority slot (1-4) can only have one entry per package instance.

---

## 25. Database Schema Reference (Tenant DB)

These are the Drizzle/PostgreSQL table definitions for all entities used in customer flows. All tables exist in isolated per-tenant Neon databases.

### 25.1 User (Control Panel DB)

```
user
  id              text        PK
  name            text        NOT NULL  (firstName + " " + lastName)
  firstName       text        NOT NULL  default ""
  lastName        text        NOT NULL  default ""
  email           text        NOT NULL  UNIQUE
  emailVerified   boolean     NOT NULL
  image           text        nullable
  phone           text        nullable
  idPassportNo    text        nullable
  addressType     text        nullable  ("home" | "work")
  streetAddress   text        nullable
  city            text        nullable
  state           text        nullable
  country         text        nullable
  postalCode      text        nullable
  dateOfBirth     date        nullable
  emergencyContactName          text  nullable
  emergencyContactRelationship  text  nullable
  emergencyContactPhone         text  nullable
  role            text        nullable  (null = needs registration, "user" = registered)
  banned          boolean     nullable
  banReason       text        nullable
  banExpires      timestamp   nullable
  createdAt       timestamp   NOT NULL
  updatedAt       timestamp   NOT NULL
  lastLoginAt     timestamp   nullable
```

### 25.2 Hierarchy Nodes

```
hierarchy_nodes
  id              uuid        PK  defaultRandom
  name            text        NOT NULL
  type            text        NOT NULL  ("organization"|"country"|"region"|"area"|"branch")
  parentId        uuid        nullable  FK -> hierarchy_nodes.id
  depth           integer     NOT NULL  (0=org, 1=country, 2=region, 3=area, 4=branch)
  address         text        nullable  (branch-only)
  picUserId       text        nullable  (Person In Charge, branch-only)
  createdAt       timestamp   NOT NULL
  updatedAt       timestamp   NOT NULL
```

### 25.3 Members

```
members
  id              uuid        PK  defaultRandom
  userId          text        NOT NULL  UNIQUE  (references control panel user.id)
  role            text        NOT NULL  ("admin"|"trainer"|"staff"|"client")
  hierarchyScopeId uuid       NOT NULL  FK -> hierarchy_nodes.id
  status          text        NOT NULL  ("active"|"suspended")
  joinedAt        timestamp   NOT NULL  defaultNow
```

### 25.4 Services

```
services
  id              uuid        PK  defaultRandom
  name            text        NOT NULL
  categoryId      uuid        nullable  FK -> service_categories.id
  duration        integer     NOT NULL  (in seconds)
  durationUnitType text       NOT NULL  default "minutes"
  maxAttendees    integer     NOT NULL
  attendanceThreshold integer nullable
  branchId        uuid        nullable  FK -> hierarchy_nodes.id
  isActive        boolean     NOT NULL  default true
  title           text        nullable
  description     text        nullable
  imageUrl        text        nullable
  type            text        NOT NULL  default "private"  ("private"|"semi_private")
  price           integer     nullable  (cents)
  priceUnit       text        default "session"
  taxable         boolean     NOT NULL  default false
  taxPercentage   integer     NOT NULL  default 0
  isRecommended   boolean     NOT NULL  default false
  location        text        nullable
  features        text[]      nullable
  schedulingType  text        NOT NULL  default "appointment"
  stripeProductId text        nullable
  stripePriceId   text        nullable
  stripeSyncStatus text       NOT NULL  default "pending"
  stripeLastSyncedAt timestamp nullable
  createdAt       timestamp   NOT NULL
  updatedAt       timestamp   NOT NULL
```

### 25.5 Service Categories

```
service_categories
  id              uuid        PK  defaultRandom
  name            text        NOT NULL
  description     text        nullable
  displayOrder    integer     NOT NULL  default 0
  branchId        uuid        nullable  FK -> hierarchy_nodes.id
  isActive        boolean     NOT NULL  default true
  createdAt       timestamp   NOT NULL
  updatedAt       timestamp   NOT NULL
```

### 25.6 Packages (Product Definitions)

```
packages
  id              uuid        PK  defaultRandom
  name            text        NOT NULL
  appointmentType text        NOT NULL  ("private"|"semi-private"|"both")
  crossUsageEnabled boolean   NOT NULL  default false
  sessionCount    integer     NOT NULL  (total credits)
  pricePerSession integer     NOT NULL  (cents per client per session)
  maxClientsPerSession integer NOT NULL
  expiryDays      integer     nullable  (days from assignment)
  expiryDate      timestamp   nullable  (fixed date, mutually exclusive with expiryDays)
  autoGenerateInvoice boolean NOT NULL  default false
  branchId        uuid        nullable  FK -> hierarchy_nodes.id
  allowedServiceIds jsonb     nullable  (null = all, array = restricted)
  isArchived      boolean     NOT NULL  default false
  createdAt       timestamp   NOT NULL
  updatedAt       timestamp   NOT NULL
```

### 25.7 Package Instances (Purchased/Assigned)

```
package_instances
  id              uuid        PK  defaultRandom
  packageId       uuid        NOT NULL  FK -> packages.id
  clientId        text        NOT NULL  (user ID)
  source          text        NOT NULL  ("assigned"|"purchased")
  assignedBy      text        nullable
  purchaseNumber  text        nullable  UNIQUE
  paymentId       uuid        nullable  FK -> payments.id
  totalPrice      integer     nullable  (cents)
  taxAmount       integer     default 0  (cents)
  paymentStatus   text        NOT NULL  ("pending"|"paid"|"failed"|"refunded")
  paymentMethod   text        nullable
  eSignature      text        nullable  (base64 image)
  termsAgreedAt   timestamp   nullable
  creditsTotal    integer     NOT NULL
  creditsRemaining integer    NOT NULL
  creditsUsed     integer     NOT NULL  default 0
  startsAt        timestamp   NOT NULL
  expiresAt       timestamp   NOT NULL
  status          text        NOT NULL  ("active"|"expired"|"exhausted"|"cancelled")
  remark          text        nullable
  createdAt       timestamp   NOT NULL
  updatedAt       timestamp   NOT NULL
```

### 25.8 Appointments

```
appointments
  id              uuid        PK  defaultRandom
  type            text        NOT NULL  ("private"|"semi-private")
  startTime       timestamp   NOT NULL
  duration        integer     NOT NULL  (minutes)
  endTime         timestamp   NOT NULL  (calculated: startTime + duration)
  serviceId       uuid        nullable  FK -> services.id
  branchId        uuid        NOT NULL  FK -> hierarchy_nodes.id
  status          text        NOT NULL  ("pending"|"confirmed"|"completed"|"cancelled"|"no-show")
  sessionTotal    integer     NOT NULL  (cents, pricePerClient x clientCount)
  pricePerClient  integer     NOT NULL  (cents)
  isRecurring     boolean     NOT NULL  default false
  recurringParentId uuid      nullable  FK -> appointments.id (self-ref)
  recurringFrequency text     nullable  ("daily"|"weekly"|"custom")
  recurringEndDate timestamp  nullable
  conflictResolved boolean    NOT NULL  default false
  conflictReason  text        nullable
  paymentStatus   text        NOT NULL  default "pending"
  stripePaymentIntentId text  nullable
  notes           text        nullable
  createdBy       text        NOT NULL  (member userId)
  bookingNumber   text        nullable  UNIQUE
  userId          text        nullable  (client's user ID)
  trainerId       uuid        nullable  FK -> members.id
  packageInstanceId uuid      nullable  FK -> package_instances.id
  creditsUsed     integer     default 1
  location        text        nullable
  cancelledAt     timestamp   nullable
  cancellationReason text     nullable
  classSlotId     uuid        nullable  FK -> class_slots.id
  description     text        nullable
  imageUrl        text        nullable
  roomId          uuid        nullable  FK -> rooms.id
  createdAt       timestamp   NOT NULL
  updatedAt       timestamp   NOT NULL
```

### 25.9 Class Slots

```
class_slots
  id              uuid        PK  defaultRandom
  serviceId       uuid        NOT NULL  FK -> services.id (cascade)
  branchId        uuid        NOT NULL  FK -> hierarchy_nodes.id
  date            timestamp   NOT NULL
  startTime       text        NOT NULL  ("09:00" format)
  endTime         text        NOT NULL
  capacity        integer     NOT NULL
  spotsBooked     integer     NOT NULL  default 0
  spotsAvailable  integer     NOT NULL
  isFull          boolean     NOT NULL  default false
  isAvailable     boolean     NOT NULL  default true
  isCancelled     boolean     NOT NULL  default false
  cancellationReason text     nullable
  instructorId    uuid        nullable  FK -> members.id
  location        text        nullable
  createdAt       timestamp   NOT NULL
  updatedAt       timestamp   NOT NULL
```

### 25.10 Notifications

```
notifications
  id              uuid        PK  defaultRandom
  userId          text        NOT NULL
  type            text        NOT NULL  ("booking"|"reminder"|"payment"|"promotion"|"system")
  title           text        NOT NULL
  message         text        NOT NULL
  icon            text        nullable
  color           text        nullable
  relatedId       uuid        nullable  (FK to related entity)
  relatedType     text        nullable
  isRead          boolean     NOT NULL  default false
  readAt          timestamp   nullable
  createdAt       timestamp   NOT NULL
```

### 25.11 Notification Preferences

```
notification_preferences
  id              uuid        PK  defaultRandom
  userId          text        NOT NULL  UNIQUE
  emailEnabled    boolean     NOT NULL  default true
  smsEnabled      boolean     NOT NULL  default false
  pushEnabled     boolean     NOT NULL  default true
  bookingReminders boolean    NOT NULL  default true
  bookingConfirmations boolean NOT NULL  default true
  promotionalEmails boolean   NOT NULL  default true
  packageExpiry   boolean     NOT NULL  default true
  createdAt       timestamp   NOT NULL
  updatedAt       timestamp   NOT NULL
```

### 25.12 Customer Profiles

```
customer_profiles
  id              uuid        PK  defaultRandom
  userId          text        NOT NULL  UNIQUE
  phone           text        nullable
  dateOfBirth     timestamp   nullable
  gender          text        nullable
  address         text        nullable
  emergencyContactName  text  nullable
  emergencyContactPhone text  nullable
  medicalNotes    text        nullable
  fitnessGoals    text[]      nullable
  creditPoints    integer     NOT NULL  default 0
  notes           text        nullable
  isDeleted       boolean     NOT NULL  default false
  deletedAt       timestamp   nullable
  deletedSource   text        nullable
  createdAt       timestamp   NOT NULL
  updatedAt       timestamp   NOT NULL
```

### 25.13 Preferred Times

```
preferred_times
  id              uuid        PK  defaultRandom
  packageInstanceId uuid      NOT NULL  FK -> package_instances.id (cascade)
  dayOfWeek       text        NOT NULL  ("monday"-"sunday")
  time            text        NOT NULL  ("09:00" format)
  priority        integer     NOT NULL  (1-4)
  createdAt       timestamp   NOT NULL

  UNIQUE(packageInstanceId, priority)
```

### 25.14 Tax Rates

```
tax_rates
  id              uuid        PK  defaultRandom
  name            text        NOT NULL
  code            text        NOT NULL  UNIQUE
  rateInBasisPoints integer   NOT NULL  (800 = 8%)
  category        text        NOT NULL  default "SST"
  isActive        boolean     NOT NULL  default true
  isDefault       boolean     NOT NULL  default false
  effectiveFrom   timestamptz NOT NULL
  effectiveUntil  timestamptz nullable
  description     text        nullable
  createdAt       timestamptz NOT NULL
  updatedAt       timestamptz NOT NULL
```

---

## 26. Permission Matrix for Customer Flows

This table shows which permissions each customer-facing API call requires. Client-only endpoints (no permission needed, just auth) are marked with "Session only".

| API Endpoint | Auth | Permission Required | Notes |
|---|---|---|---|
| `auth.userContext` | Session only | - | Returns user's orgs + hierarchy |
| `registration.listCountries` | **None** | - | Public endpoint |
| `registration.listBranches` | **None** | - | Public endpoint |
| `registration.complete` | Session only | - | Creates member as "client" |
| `serviceCategories.list` | Member | `service_management` (read) | Hierarchy-scoped |
| `services.list` | Member | `service_management` (read) | Hierarchy-scoped |
| `services.getById` | Member | `service_management` (read) | Hierarchy-scoped |
| `packages.list` | Member | `service_management` (read) | Hierarchy-scoped |
| `packageInstances.getActiveForClient` | Session only | - | Client's own data |
| `packageInstances.listForClient` | Session only | - | Client's own data |
| `packageInstances.create` | Member | `service_management` (create) | Staff operation |
| `appointments.listForUser` | Session only | - | Client's own data |
| `appointments.getById` | Session only OR Member | `appointment_management` (read) | Dual-path: owner OR staff |
| `appointments.create` | Member | `appointment_management` (create) | Hierarchy-scoped |
| `appointments.update` | Session only OR Member | `appointment_management` (update) | Client: cancel only. Staff: full update |
| `classSlots.list` | Member | `class_slot_management` (read) | Hierarchy-scoped |
| `members.list` | Member | `user_management` (read) | RBAC-filtered |
| `customerProfiles.get` | Session only | - | Client's own data |
| `customerProfiles.upsert` | Session only | - | Client's own data |
| `notificationPreferences.get` | Session only | - | Client's own data |
| `notificationPreferences.update` | Session only | - | Client's own data |
| `notifications.list` | Session only | - | Client's own data |
| `notifications.getUnreadCount` | Session only | - | Client's own data |
| `notifications.markRead` | Session only | - | Client's own data |
| `notifications.markAllRead` | Session only | - | Client's own data |
| `taxRates.getDefault` | Member | `tax_configuration` (read) | Staff permission |
| `preferredTimes.upsert` | Session only OR Member | `service_management` (update) | Client: own package. Staff: any |

**Key Implication:** Several customer-facing flows require staff-level permissions (`service_management`, `appointment_management`, `class_slot_management`, `tax_configuration`). This means the "client" role in the member table must have these permissions assigned via the role-permissions system, or the API calls will fail with `FORBIDDEN`.
