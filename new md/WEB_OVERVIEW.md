# Avantej Core Web Application - Project Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Application Architecture](#application-architecture)
4. [Pages and Routes](#pages-and-routes)
5. [Key Features](#key-features)
6. [Component Structure](#component-structure)

---

## Project Overview

**Avantej Core** is a comprehensive multi-tenant business management platform designed to help organizations manage their operations, staff, branches, and financial metrics. The web application provides a complete dashboard for:

- **Multi-tenant organization management** with hierarchical branch structures
- **User and role-based access control** with granular permissions
- **Service and appointment management** for businesses
- **Financial tracking and reporting** (payroll, claims, expenses)
- **Team and branch performance dashboards** with KPI tracking
- **Customer relationship management**

The application is built as a modern React SPA using TanStack Router for type-safe routing, with a focus on scalability, security, and user experience.

---

## Technology Stack

### Frontend Framework
- **React 19.1.0** - UI library
- **TypeScript** - Type safety
- **TanStack Router** - File-based routing with type safety
- **TanStack Query (React Query)** - Server state management
- **Vite** - Build tool and dev server

### UI/UX
- **TailwindCSS 4.0** - Utility-first CSS framework
- **shadcn/ui** - Reusable component library (Radix UI primitives)
- **Lucide React** - Icon library
- **Sonner** - Toast notifications
- **next-themes** - Theme management (currently forced to light mode)

### State Management & Forms
- **React Hook Form** - Form handling
- **Zod** - Schema validation
- **TanStack React Form** - Alternative form library

### API Communication
- **oRPC** - End-to-end type-safe API client
- **@tanstack/react-query** - Data fetching and caching

### Authentication
- **Better-Auth** - Authentication library
- Custom auth hooks and providers

### Development Tools
- **TanStack Router Devtools** - Route debugging
- **React Query Devtools** - Query debugging
- **TypeScript** - Static type checking

---

## Application Architecture

### Route Structure

The application uses **file-based routing** with TanStack Router:

```
routes/
├── __root.tsx                    # Root layout with providers
├── _authenticated.tsx            # Authenticated route wrapper
├── index.tsx                     # Landing/home page
├── login.tsx                     # Login page
├── signup.tsx                    # Signup page
├── verify-email.tsx              # Email verification
├── accept-invitation.tsx         # Invitation acceptance
└── _authenticated/
    ├── dashboard/
    │   └── _layout/
    │       ├── index.tsx         # Main dashboard
    │       ├── branch/
    │       │   ├── view.tsx      # Branch list/management
    │       │   └── create.tsx    # Create branch
    │       ├── role/
    │       │   └── view.tsx      # Role management
    │       ├── appointment/
    │       │   └── view.tsx      # Appointment calendar
    │       └── access-control/
    │           ├── permissions.tsx    # Permission management
    │           ├── roles.tsx          # Role management (detailed)
    │           ├── user-assignment.tsx # User-role assignment
    │           └── invitations.tsx     # Organization invitations
    ├── onboarding.tsx            # Organization setup
    ├── customers.tsx              # Customer management
    ├── user/
    │   └── view.tsx               # User list
    ├── service/
    │   └── view.tsx               # Service management
    └── service-category/
        └── view.tsx               # Service category management
```

### Authentication Flow

1. **Unauthenticated Routes**: Landing, login, signup, verify-email, accept-invitation
2. **Authenticated Routes**: All routes under `/_authenticated` require valid session
3. **Permission Guards**: Some routes check specific permissions before loading

---

## Pages and Routes

### 1. Root Route (`__root.tsx`)

**Purpose**: Application root with global providers and layout

**Functions**:
- Wraps entire app with `AuthProvider` and `ThemeProvider`
- Provides `QueryClient` and `orpc` client to router context
- Shows loading spinner during route transitions
- Includes development tools (Router Devtools, React Query Devtools)
- Sets up global toast notifications

**Key Components**:
- `AuthProvider` - Authentication context
- `ThemeProvider` - Theme management (currently forced to light)
- `Toaster` - Toast notification system
- `Loader` - Loading indicator

---

### 2. Landing Page (`index.tsx`)

**Purpose**: Marketing/landing page for unauthenticated users

**Functions**:
- Displays product features and benefits
- Shows pricing tiers (Starter, Professional, Enterprise)
- Provides navigation to login/signup
- Handles invitation tokens in URL parameters
- Features sections:
  - Hero section with CTA
  - Key features grid
  - Statistics showcase
  - Comprehensive features list
  - How it works section
  - Testimonials
  - Pricing cards
  - Final CTA section

**Key Features**:
- Responsive design
- Feature cards with icons
- Pricing comparison
- Testimonial cards
- Multiple CTA buttons linking to login

**URL Parameters**:
- `invitationToken` - Pre-fills invitation data
- `orgId` - Organization ID for invitation flow

---

### 3. Login Page (`login.tsx`)

**Purpose**: User authentication

**Functions**:
- Renders `LoginForm` component
- Handles invitation token and orgId from URL
- Passes invitation context to login form
- Responsive layout with centered form

**URL Parameters**:
- `invitationToken` - For accepting invitations
- `orgId` - Organization ID for invitation

**Components Used**:
- `LoginForm` - Form component with email/password

---

### 4. Signup Page (`signup.tsx`)

**Purpose**: New user registration

**Functions**:
- Renders `SignupForm` component
- Handles invitation token and orgId from URL
- Allows users to sign up and accept invitations simultaneously

**URL Parameters**:
- `invitationToken` - For accepting invitations during signup
- `orgId` - Organization ID for invitation

**Components Used**:
- `SignupForm` - Registration form

---

### 5. Email Verification (`verify-email.tsx`)

**Purpose**: Verify user email addresses

**Functions**:
- Validates email verification token from URL
- Calls API to verify email
- Shows loading, success, or error states
- Auto-redirects to callback URL (default: `/login`) after success

**URL Parameters**:
- `token` - Email verification token (required)
- `callbackURL` - Redirect URL after verification (default: `/login`)

**States**:
- `loading` - Verification in progress
- `success` - Email verified successfully
- `error` - Verification failed with error message

---

### 6. Accept Invitation (`accept-invitation.tsx`)

**Purpose**: Accept organization invitations

**Functions**:
- Fetches invitation details using token and orgId
- Validates invitation status
- Pre-verifies email for existing users
- Auto-accepts invitation if user is logged in with matching email
- Shows signup form for unauthenticated users
- Handles invitation acceptance flow
- Redirects to dashboard after successful acceptance

**URL Parameters**:
- `token` - Invitation token (required)
- `orgId` - Organization ID (required)

**Key Features**:
- Email pre-verification for smoother flow
- Auto-acceptance for logged-in users
- Signup form integration for new users
- Login link for existing users
- Error handling for invalid/expired invitations

**Components Used**:
- `SignupForm` - For new user registration
- Various UI cards and buttons

---

### 7. Authenticated Layout (`_authenticated.tsx`)

**Purpose**: Wrapper for all authenticated routes

**Functions**:
- Checks authentication status before rendering
- Redirects to `/login` if not authenticated
- Provides `AppLayout` with sidebar and topbar
- Sets default page title

**Components Used**:
- `AppLayout` - Main application layout with sidebar/topbar

---

### 8. Onboarding Page (`_authenticated/onboarding.tsx`)

**Purpose**: Initial organization setup for new users

**Functions**:
- Organization name input with real-time availability checking
- Debounced name validation (500ms delay)
- Creates organization via API
- Validates organization name format and availability
- Shows loading states during creation
- Redirects to dashboard after successful creation
- Refetches user context after organization creation

**Key Features**:
- Real-time name availability checking
- Visual feedback (checkmark/X icons)
- Form validation with error messages
- Success toast notifications

**Form Fields**:
- `name` - Organization name (required, min 1, max 255 chars)

**Validation**:
- Name cannot be empty
- Name availability check (debounced)
- Mock validation: names starting with "test" are unavailable

---

### 9. Main Dashboard (`_authenticated/dashboard/_layout/index.tsx`)

**Purpose**: Central dashboard with widgets and KPIs

**Functions**:
- Displays multiple dashboard widgets in grid layout
- Shows appointments, announcements, team/branch dashboards
- Displays payroll and claims widgets
- Uses sample/mock data for demonstration

**Widgets**:
1. **AppointmentsWidget** - Upcoming appointments (4 columns)
2. **AnnouncementsWidget** - Organization announcements (8 columns)
3. **TeamDashboard** - Team performance metrics (4 columns, 2 instances)
4. **SingleTeamDashboard** - Individual team metrics (4 columns)
5. **PayrollWidget** - Payroll information (4 columns)
6. **ClaimsWidget** - Expense claims (8 columns)

**Layout**:
- Responsive grid: 1 column mobile, 12 columns desktop
- Widgets arranged in rows with varying column spans

**Data**:
- Currently uses mock/sample data
- Teams, branches, and individuals data structures defined in component

---

### 10. Branch Management - View (`_authenticated/dashboard/_layout/branch/view.tsx`)

**Purpose**: List and manage organization branches

**Functions**:
- Fetches and displays all branches in a data table
- Shows branch hierarchy (Country → Region → Area → Branch)
- Displays branch details: name, location, person in charge
- Edit branch dialog with cascading dropdowns (Country → Region → Area)
- Update branch name, address, PIC, and location
- Move branches between areas
- Delete branches (with validation)
- Member reassignment within branch edit dialog
- Cache management for hierarchy data (localStorage)
- Debug panel in development mode

**Key Features**:
- Hierarchical branch structure visualization
- Cascading location selectors
- Person in charge (PIC) selection via `MemberSelector`
- Member reassignment via `MemberReassignment` component
- Real-time data updates with React Query
- Cache invalidation on mutations
- Error handling with user-friendly messages

**Data Table Columns**:
- Branch name
- Location (Country/Region/Area)
- Person in charge
- Address
- Actions (Edit/Delete)

**Mutations**:
- `updateMutation` - Update branch name, address, PIC
- `moveMutation` - Move branch to different area
- `deleteMutation` - Delete branch (validates no child nodes or assigned members)

**Components Used**:
- `DataTable` - Branch data table
- `MemberSelector` - PIC selection
- `MemberReassignment` - Member management
- Edit dialog with Headless UI

---

### 11. Branch Management - Create (`_authenticated/dashboard/_layout/branch/create.tsx`)

**Purpose**: Create new branches with hierarchical structure

**Functions**:
- Renders hierarchical branch creation form
- Step-by-step guide (Country → Region → Area → Branch)
- Permission check before load
- Success callback handling

**Components Used**:
- `HierarchicalBranchForm` - Main form component
- Info card with step-by-step instructions

**Permissions Required**:
- `hierarchy_management:create`

---

### 12. Role Management - View (`_authenticated/dashboard/_layout/role/view.tsx`)

**Purpose**: Display list of user roles

**Functions**:
- Fetches and displays roles in data table
- Shows role name, description, creation/update dates
- Authentication and organization validation
- Loading states
- Mock data for UI development

**Components Used**:
- `DataTable` - Role data table with columns

**Data Structure**:
- Role ID, name, description
- Created/updated timestamps

---

### 13. Appointment Calendar (`_authenticated/dashboard/_layout/appointment/view.tsx`)

**Purpose**: Calendar view for managing appointments

**Functions**:
- Displays appointment calendar (monthly/weekly views)
- Generates mock appointments for current month
- Handles date selection
- Handles appointment clicks
- Add appointment functionality (placeholder)
- Permission check before load

**Key Features**:
- Monthly and weekly calendar views
- Appointment status indicators (confirmed, pending, cancelled)
- Client and service information
- Assigned staff with color coding
- Date selection handling
- Add appointment button (functionality pending)

**Components Used**:
- `AppointmentCalendar` - Calendar component

**Permissions Required**:
- `appointment_management:read`

**URL Parameters**:
- `view` - Calendar view mode (`monthly` or `weekly`)

---

### 14. Permission Management (`_authenticated/dashboard/_layout/access-control/permissions.tsx`)

**Purpose**: Define and manage permission resources and actions

**Functions**:
- Display permission resources in card grid
- Create new permission resources
- Edit existing resources
- Delete resources
- Duplicate resources
- Search and filter resources
- Show statistics (total resources, actions, average)
- Mobile-responsive sheet for editing

**Key Features**:
- Resource cards with icons and action lists
- Resource editor with action management
- Search functionality
- Statistics dashboard
- Empty state handling
- Mobile-optimized UI

**Components Used**:
- `PermissionEditor` - Resource editing component
- Resource cards with dropdown menus
- Search input
- Statistics cards

**Permissions Required**:
- `role_management:read`

---

### 15. Role Management - Detailed (`_authenticated/dashboard/_layout/access-control/roles.tsx`)

**Purpose**: Comprehensive role and permission management

**Functions**:
- Display roles in multiple view modes (Cards, Matrix, Wizard)
- Create, edit, delete, duplicate roles
- Assign permissions to roles with scopes (own, team, organization, etc.)
- Permission matrix for visual permission management
- Role templates for quick setup
- Search and filter roles
- Beginner guide with quick start instructions
- User count per role
- Real-time permission updates with optimistic UI
- Integration with backend API via hooks

**View Modes**:
1. **Cards View** - Role cards with permissions summary
2. **Enhanced Matrix View** - Permission matrix with role columns
3. **Wizard View** - Step-by-step role creation (3 steps)

**Key Features**:
- Permission scope management (own, team, organization, country, region, area, branch)
- Role priority system
- Permission matrix with toggle functionality
- Role templates (Admin, Manager, Basic User, Read Only)
- Beginner guide with instructions
- Optimistic updates with rollback on error
- Pending updates indicator
- Loading and error states

**Components Used**:
- `RoleCard` - Role display card
- `EnhancedPermissionMatrix` - Permission matrix
- `RoleEditor` - Role creation/editing
- `PermissionGroupCollapsible` - Collapsible permission groups

**Permissions Required**:
- `role_management:read`

**Hooks Used**:
- `useRoles` - Role management operations
- `useRoleMatrix` - Permission matrix data
- `useAuth` - Authentication context

---

### 16. User Role Assignment (`_authenticated/dashboard/_layout/access-control/user-assignment.tsx`)

**Purpose**: Assign roles to users and manage user-role relationships

**Functions**:
- Display users in card grid
- Search users by name, email, department
- Filter by role and status (active/inactive)
- Assign multiple roles to users
- Edit user roles via sheet
- Invite new users with role assignment
- Activate/deactivate users
- Bulk selection and operations
- Show user statistics
- Display last login information
- Show highest priority role per user

**Key Features**:
- User cards with avatar, name, email, department
- Role badges with priority color coding
- Role assignment sheet with checkboxes
- Invite user dialog with role pre-selection
- Search and filter functionality
- Bulk selection with actions menu
- Statistics cards (Total, Active, No Roles, Available Roles)
- Last login formatting (Today, Yesterday, X days ago)
- Empty state handling

**Components Used**:
- `UserCard` - User display card
- `RoleAssignmentSheet` - Role assignment interface
- `InviteUserDialog` - User invitation form

**Permissions Required**:
- `user_management:read`
- `role_management:read`

**Filters**:
- Search query (name, email, department)
- Role filter (all, none, specific role)
- Status filter (all, active, inactive)

---

### 17. Invitations Management (`_authenticated/dashboard/_layout/access-control/invitations.tsx`)

**Purpose**: Manage organization invitations

**Functions**:
- Create new invitations
- List all invitations
- Revoke invitations
- Resend invitations
- View invitation status

**Components Used**:
- `InvitationsPage` - Main invitations component

**Permissions Required**:
- `user_management:read`

---

### 18. User Management (`_authenticated/user/view.tsx`)

**Purpose**: View and manage all users/employees

**Functions**:
- Display users in data table
- Show user details: name, email, verification status, onboarding status
- Permission check before load
- Mock data for UI development

**Components Used**:
- `DataTable` - User data table
- User columns with status indicators

**Permissions Required**:
- `user_management:read`

**Data Structure**:
- User ID, name, email
- Email verification status
- Onboarding completion status
- Organization ID
- Created/updated timestamps

---

### 19. Service Management (`_authenticated/service/view.tsx`)

**Purpose**: Manage services offered by the organization

**Functions**:
- Display services in data table
- Filter by scheduling type (appointment-based, recurring)
- Show service details: name, category, duration, price
- Permission check before load
- Mock data for UI development

**Components Used**:
- `DataTable` - Service data table

**Permissions Required**:
- `service_management:read`

**Data Structure**:
- Service ID, name, category
- Duration and duration unit
- Price
- Scheduling type

---

### 20. Service Category Management (`_authenticated/service-category/view.tsx`)

**Purpose**: Manage service categories

**Functions**:
- Display service categories in data table
- Show category details: name, description, service count
- Permission check before load
- Mock data for UI development

**Components Used**:
- `DataTable` - Category data table

**Permissions Required**:
- `service_management:read`

**Data Structure**:
- Category ID, name, description
- Service count (number of services in category)

---

### 21. Appointment View (Alternative) (`_authenticated/appointment/view.tsx`)

**Purpose**: Alternative appointment calendar view

**Functions**:
- Similar to dashboard appointment view
- Calendar with monthly/weekly views
- Mock appointment data
- Permission check

**Components Used**:
- `AppointmentCalendar` - Calendar component

**Permissions Required**:
- `appointment_management:read`

---

### 22. Customers Page (`_authenticated/customers.tsx`)

**Purpose**: Customer relationship management

**Functions**:
- Display customer list
- Search customers
- Add new customer (button placeholder)
- Contact and schedule actions (placeholders)
- Mock customer data

**Key Features**:
- Customer cards with avatar
- Search functionality
- Contact and schedule buttons
- Add customer button

**Components Used**:
- Customer cards
- Search input
- Action buttons

---

## Key Features

### 1. Multi-Tenant Architecture
- Organization-based data isolation
- Hierarchical branch structure (Country → Region → Area → Branch)
- Organization context switching
- Invitation-based user onboarding

### 2. Role-Based Access Control (RBAC)
- Granular permission system
- Resource-action model
- Permission scopes (own, team, organization, geographic)
- Role priority system
- Permission matrix visualization

### 3. User Management
- User authentication with Better-Auth
- Email verification
- Organization invitations
- Role assignment
- User status management (active/inactive)

### 4. Branch Management
- Hierarchical branch creation
- Branch editing with location updates
- Person in charge (PIC) assignment
- Member reassignment
- Branch deletion with validation

### 5. Service Management
- Service creation and management
- Service categories
- Scheduling types (appointment-based, recurring)
- Duration and pricing management

### 6. Appointment Management
- Calendar views (monthly, weekly)
- Appointment status tracking
- Client and service association
- Staff assignment

### 7. Dashboard & Analytics
- Widget-based dashboard
- Team and branch performance metrics
- Payroll information
- Claims and expenses
- Announcements

### 8. Data Management
- React Query for server state
- Optimistic updates
- Cache management
- Error handling and retry logic

---

## Component Structure

### Layout Components
- `AppLayout` - Main application layout with sidebar/topbar
- `AppSidebar` - Navigation sidebar
- `AppTopbar` - Top navigation bar
- `Header` - Page header component

### Form Components
- `LoginForm` - Login form
- `SignupForm` - Registration form
- `HierarchicalBranchForm` - Branch creation form
- `ServiceForm` - Service creation/editing
- `ServiceCategoryForm` - Category form

### Table Components
- `DataTable` - Reusable data table with sorting/filtering
- Column definitions for each entity type

### Access Control Components
- `PermissionEditor` - Permission resource editor
- `RoleEditor` - Role creation/editing
- `PermissionMatrix` - Permission visualization
- `RoleCard` - Role display card
- `PermissionCard` - Permission display card

### Widget Components
- `AppointmentsWidget` - Upcoming appointments
- `AnnouncementsWidget` - Organization announcements
- `TeamDashboard` - Team performance metrics
- `PayrollWidget` - Payroll information
- `ClaimsWidget` - Expense claims

### Calendar Components
- `AppointmentCalendar` - Calendar view
- `AddAppointmentModal` - Appointment creation

### Branch Components
- `MemberSelector` - User selection for PIC
- `MemberReassignment` - Member reassignment interface

### Invitation Components
- `InvitationsPage` - Invitation management
- `CreateInvitationDialog` - Create invitation form
- `InvitationList` - List of invitations

### UI Components (shadcn/ui)
- Button, Card, Input, Select, Dialog, Sheet
- Badge, Avatar, Checkbox, Tabs, Tooltip
- Form components with validation
- Dropdown menus, Collapsible sections

---

## Authentication & Authorization

### Authentication Flow
1. User signs up or logs in
2. Email verification (if new user)
3. Session created with Better-Auth
4. User context loaded with organization info
5. Permission checks on route navigation

### Permission System
- **Resources**: Users, Roles, Branches, Services, Appointments, etc.
- **Actions**: Create, Read, Update, Delete, Export, etc.
- **Scopes**: Own, Team, Organization, Country, Region, Area, Branch
- **Priority**: Role priority determines permission precedence

### Route Guards
- `requirePermission` - Checks specific permission before route load
- Redirects to dashboard if permission denied
- Used in `beforeLoad` hooks

---

## State Management

### Server State
- **React Query** - All API data fetching and caching
- Query keys organized by resource type
- Automatic refetching and cache invalidation
- Optimistic updates for better UX

### Local State
- **React Hooks** - useState, useEffect for component state
- Form state managed by React Hook Form
- URL state via TanStack Router search params

### Context
- **AuthContext** - User authentication state
- **UserContext** - Current user and organization context
- **ThemeContext** - Theme management (via next-themes)

---

## API Integration

### oRPC Client
- Type-safe API client
- Auto-generated types from server
- Query and mutation hooks via TanStack Query

### API Endpoints (via oRPC)
- `auth.*` - Authentication operations
- `hierarchy.*` - Branch/hierarchy management
- `invitations.*` - Invitation management
- `users.*` - User management
- `roles.*` - Role and permission management
- `services.*` - Service management
- `appointments.*` - Appointment management

---

## Development Notes

### Mock Data
- Many pages use mock data for UI development
- TODO comments indicate where real API integration is needed
- Mock data helps with UI/UX development before backend completion

### Caching Strategy
- Hierarchy data cached in localStorage (30-second TTL)
- React Query cache with staleTime configuration
- Cache invalidation on mutations

### Error Handling
- Toast notifications for user feedback
- Error boundaries for component errors
- API error handling with user-friendly messages
- Retry logic for failed requests

### Performance Optimizations
- Code splitting via route-based chunks
- Lazy loading for heavy components
- Debounced search inputs
- Optimistic UI updates
- React Query caching

---

## Future Enhancements

Based on TODO comments and code structure:

1. **Real API Integration** - Replace mock data with actual API calls
2. **Advanced Filtering** - More sophisticated filtering options
3. **Export Functionality** - Data export for reports
4. **Real-time Updates** - WebSocket integration for live data
5. **Advanced Analytics** - More detailed reporting and charts
6. **Mobile Optimization** - Enhanced mobile experience
7. **Dark Mode** - Theme switching (currently forced to light)
8. **Internationalization** - Multi-language support
9. **Advanced Permissions** - More granular permission controls
10. **Audit Logging** - Track user actions and changes

---

## Conclusion

The Avantej Core web application is a comprehensive business management platform with robust multi-tenant architecture, role-based access control, and extensive management capabilities. The application is built with modern React patterns, type safety, and a focus on developer experience and user experience.

The codebase is well-structured with clear separation of concerns, reusable components, and a scalable architecture that supports future growth and feature additions.
