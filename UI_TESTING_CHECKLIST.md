# UI Testing Checklist - avantej-core Web App

This document provides a comprehensive checklist of all UI pages and components available for testing in the avantej-core web application.

## 📋 How to Use This Checklist

- [ ] = Not tested yet
- [x] = Tested and working
- [⚠️] = Tested with issues (add notes)

---

## 🌐 Public Pages (No Authentication Required)

### Landing & Authentication

- [x] **Landing Page** (`/`)
  - Hero section with "Streamline Your Business Operations with Powerful KPI Tracking"
  - Key Features section (Client Management, Financial Management, Analytics & Reporting)
  - Stats section (500+ Active Branches, 10k+ Staff Managed, etc.)
  - Core Features grid
  - How It Works section
  - Testimonials section
  - Pricing section (Starter, Professional, Enterprise)
  - CTA sections
  - Footer with Terms of Service and Privacy Policy links

- [x] **Login Page** (`/login`)
  - "Welcome back" heading
  - "Login to your avantej core account" subtitle
  - Email input field with placeholder
  - Password input field
  - "Login" button with loading state
  - "Or continue with" divider
  - Social login buttons (Apple, Google, Meta) - UI ready
  - Right-side hero image (desktop view)
  - "Don't have an account? Sign up" link
  - Terms of Service and Privacy Policy footer
  - Responsive design (mobile/desktop)

- [x] **Signup Page** (`/signup`)
  - "Create Account" heading
  - Name input field
  - Email input field
  - Password input field
  - "Sign Up" button
  - "Already have an account? Sign In" link
  - Form validation (min length, email format)
  - Responsive design

---

## 🔐 Authenticated Pages (Requires Login)

_Note: All authenticated pages use the AppLayout with sidebar navigation and topbar_

### Dashboard

- [x] **Main Dashboard** (`/dashboard`)
  - Welcome message with user name/email
  - API status display
  - Dashboard widgets/cards
  - Sidebar navigation
  - Topbar with user menu

### Branch Management

- [x] **View Branches** (`/branch/view`)
  - Data table with branch listings
  - Filtering and sorting capabilities
  - Pagination
  - Create/Edit/Delete actions (if permissions allow)

- [ ] **Create Branch** (`/branch/create`)
  - Branch creation form
  - Form validation
  - Submit functionality

### Service Management

- [ ] **View Services** (`/service/view`)
  - Data table with service listings
  - Filtering and sorting
  - Service details
  - CRUD operations (if permissions allow)

- [ ] **View Service Categories** (`/service-category/view`)
  - Data table with service category listings
  - Category management
  - Filtering and sorting

### User Management

- [ ] **View Users** (`/user/view`)
  - Data table with user listings
  - User details
  - User management actions
  - Filtering and sorting

### Access Control

- [ ] **Permissions Management** (`/access-control/permissions`)
  - Permission matrix/grid
  - Permission assignment interface
  - Role-based permissions view

- [ ] **Roles Management** (`/access-control/roles`)
  - Roles listing
  - Role creation/editing
  - Role assignment interface
  - Permission assignment to roles

- [ ] **User Assignment** (`/access-control/user-assignment`)
  - User-to-role assignment interface
  - Bulk assignment capabilities
  - Assignment management

### Appointments

- [ ] **View Appointments** (`/appointment/view`)
  - Appointments calendar/list view
  - Appointment details
  - Create/Edit/Delete appointments
  - Filtering by date, staff, client, etc.

---

## 🎨 UI Components to Test

### Navigation Components

- [ ] **App Sidebar** (visible on authenticated pages)
  - Navigation menu items
  - Active state highlighting
  - Collapsible/expandable sections
  - Responsive behavior (mobile drawer)

- [ ] **App Topbar** (visible on authenticated pages)
  - Page title display
  - User menu dropdown
  - User avatar
  - Logout functionality

### Form Components

- [ ] **Login Form**
  - Email validation
  - Password validation
  - Error message display
  - Loading states
  - Success redirect

- [ ] **Signup Form**
  - Name validation
  - Email validation
  - Password validation
  - Error message display
  - Success redirect

- [ ] **Branch Form** (Create/Edit)
  - All form fields
  - Validation
  - Submit functionality

- [ ] **Service Forms**
  - Service creation form
  - Service category form
  - Form validation
  - Dynamic fields

### Data Table Components

- [ ] **Branch Data Table**
  - Column sorting
  - Filtering
  - Pagination
  - Row actions

- [ ] **Service Data Table**
  - Column sorting
  - Filtering
  - Pagination
  - Row actions

- [ ] **User Data Table**
  - Column sorting
  - Filtering
  - Pagination
  - Row actions

- [ ] **Role Data Table**
  - Column sorting
  - Filtering
  - Pagination
  - Row actions

### Permission Components

- [ ] **Permission Matrix**
  - Grid display
  - Checkbox interactions
  - Save functionality
  - Scope selection (Own, Team, Organization, etc.)

- [ ] **Role Editor**
  - Role name input
  - Priority input
  - Description field
  - Permission assignment

- [ ] **User Assignment Interface**
  - User selection
  - Role assignment
  - Bulk operations

---

## 🎯 Testing Scenarios

### Authentication Flow

- [ ] **Login Flow**
  - [ ] Enter valid credentials → Success redirect to dashboard
  - [ ] Enter invalid credentials → Error message displayed
  - [ ] Empty form submission → Validation errors shown
  - [ ] Click "Sign up" link → Navigate to signup page

- [ ] **Signup Flow**
  - [ ] Fill all required fields → Success redirect
  - [ ] Invalid email format → Validation error
  - [ ] Password too short → Validation error
  - [ ] Click "Sign In" link → Navigate to login page

- [ ] **Session Management**
  - [ ] Login → Session persists on page refresh
  - [ ] Logout → Redirect to login page
  - [ ] Access protected route without login → Redirect to login

### Responsive Design

- [ ] **Mobile View (< 768px)**
  - [ ] Landing page layout
  - [ ] Login page layout (no right-side image)
  - [ ] Signup page layout
  - [ ] Sidebar becomes drawer on mobile
  - [ ] Data tables are scrollable

- [ ] **Tablet View (768px - 1024px)**
  - [ ] Layout adjustments
  - [ ] Navigation behavior

- [ ] **Desktop View (> 1024px)**
  - [ ] Full sidebar visible
  - [ ] Login page shows right-side image
  - [ ] Optimal table layouts

### Theme & Styling

- [ ] **Light Theme** (forced)
  - [ ] All pages display in light theme
  - [ ] No dark mode applied (even with system dark mode)
  - [ ] Consistent colors throughout

- [ ] **UI Components**
  - [ ] Buttons (primary, secondary, outline, ghost)
  - [ ] Input fields
  - [ ] Cards
  - [ ] Modals/Dialogs
  - [ ] Dropdowns
  - [ ] Tooltips
  - [ ] Loading states
  - [ ] Error states

---

## 🐛 Known Issues / Notes

_Add any issues or observations here during testing:_

-

---

## ✅ Testing Status Summary

- **Total Pages:** [X] tested / [Y] total
- **Total Components:** [X] tested / [Y] total
- **Critical Issues:** [X]
- **Minor Issues:** [X]

---

## 📝 Testing Notes

_Add any additional notes, observations, or feedback here:_

-

---

**Last Updated:** December 9, 2025
**App Version:** avantej-core web app
**Base URL:** `http://localhost:[port]` (development) or your deployed URL
