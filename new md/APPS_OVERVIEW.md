# Native App - Page-by-Page Functions & Features Analysis

## Table of Contents
1. [Root Layout & Entry Points](#root-layout--entry-points)
2. [Authentication Pages](#authentication-pages)
3. [Dashboard Pages](#dashboard-pages)
4. [Book Workout Flow](#book-workout-flow)
5. [Buy Package Flow](#buy-package-flow)
6. [Bookings Pages](#bookings-pages)
7. [Explore Pages](#explore-pages)
8. [Profile & Settings](#profile--settings)
9. [Notifications](#notifications)

---

## Root Layout & Entry Points

### `app/_layout.tsx` (Root Layout)
**Functions:**
- Theme management (light/dark mode)
- Font loading (Nordeco, Metropolis-Medium, Plus Jakarta Sans)
- QueryClientProvider setup
- ThemeProvider configuration
- StatusBar styling
- Android navigation bar styling
- Stack navigation setup

**Features:**
- Dark/Light theme support
- Custom font loading
- Global navigation structure
- API query client integration

---

### `app/index.tsx` (Login Screen)
**Functions:**
- `handleLogin()` - OTP login flow (placeholder)
- `handleSignUp()` - Navigate to sign-up page
- Phone number input validation
- Loading state management

**Features:**
- Phone number input with validation
- OTP login button (disabled when empty)
- Sign-up navigation link
- Logo display
- Welcome message
- Keyboard avoiding view
- Loading indicator

---

### `app/sign-up.tsx` (Sign Up Screen)
**Functions:**
- `handleSignUp()` - Sign-up flow (placeholder)
- `handleSignIn()` - Navigate back to login
- Phone number input validation
- Loading state management

**Features:**
- Phone number input
- Sign-up button (disabled when empty)
- Sign-in navigation link
- Logo display
- Create account message
- Keyboard avoiding view
- Loading indicator

---

### `app/modal.tsx` (Modal Screen)
**Functions:**
- Basic modal display

**Features:**
- Simple modal container
- Title display

---

### `app/+not-found.tsx` (404 Screen)
**Functions:**
- Navigation to home

**Features:**
- Error message display
- Home navigation link
- User-friendly error UI

---

## Authentication Pages

### `app/(drawer)/_layout.tsx` (Drawer Layout)
**Functions:**
- Drawer navigation setup
- Header button configuration

**Features:**
- Drawer menu navigation
- Home and Tabs navigation
- Modal link in header

---

### `app/(drawer)/index.tsx` (Home - Drawer)
**Functions:**
- Health check API query
- Private data API query
- Session management
- Sign out functionality

**Features:**
- User session display
- API status indicator
- Private data display
- Sign in/up components
- Sign out button

---

### `app/(drawer)/(tabs)/_layout.tsx` (Tabs Layout)
**Functions:**
- Tab navigation setup
- Color scheme detection

**Features:**
- Two tabs: Home and Explore
- Dark/light theme support
- Tab bar styling

---

### `app/(drawer)/(tabs)/index.tsx` (Tab One)
**Features:**
- Simple placeholder content
- Tab one display

---

### `app/(drawer)/(tabs)/two.tsx` (Tab Two)
**Features:**
- Simple placeholder content
- Tab two display

---

## Dashboard Pages

### `app/dashboard/_layout.tsx` (Dashboard Layout)
**Functions:**
- Tab navigation setup
- Safe area handling

**Features:**
- 4 main tabs: Home, Explore, Bookings, Profile
- Hidden tabs: book-workout, notifications, buy-package
- Tab bar styling with safe area insets
- Active/inactive tab states

---

### `app/dashboard/index.tsx` (Dashboard Home)
**Functions:**
- `getGreeting()` - Time-based greeting (Good Morning/Afternoon/Evening)
- Navigation to book workout
- Navigation to buy package
- Navigation to notifications

**Features:**
- User greeting with profile picture
- Current date display
- Fitness plan card:
  - Active status badge
  - Workouts remaining count
  - Plan progress percentage
  - Progress bar visualization
  - Pacing information
  - Renewal date
  - Manage membership link
- Quick insight card
- Action buttons grid:
  - Book Session
  - Check-In (placeholder)
  - Buy Package
  - Schedule (placeholder)
- Up Next section:
  - Upcoming activity card
  - Activity image
  - Date badge
  - Time and duration
  - Reschedule option
- Recent Activity section:
  - Activity history list
  - Credit changes display
  - Activity icons
- Notification badge with unread count

---

### `app/dashboard/profile.tsx` (Profile Screen)
**Functions:**
- `handleSaveChanges()` - Save user data (placeholder)
- `toggleNotification(type)` - Toggle notification preferences
- User data state management
- Notification preferences state

**Features:**
- User summary section:
  - Avatar display
  - Full name
  - Member since date
- Personal information section:
  - Full name input (editable)
  - Email input (editable)
  - Phone number input (editable)
  - Save changes button
- Notification preferences:
  - Email notifications toggle
  - Push notifications toggle
  - SMS notifications (commented out)
- Account section:
  - Change password link
  - Help & Support link
  - Terms & Privacy link

---

## Book Workout Flow

### `app/dashboard/book-workout/_layout.tsx` (Book Workout Layout)
**Functions:**
- Tab bar visibility management
- Navigation state tracking

**Features:**
- Hides tab bar when in book-workout flow
- Stack navigation for workflow steps

---

### `app/dashboard/book-workout/book-workout.tsx` (Step 1: Setup)
**Functions:**
- Category selection
- Service selection
- Trainer selection (auto-assign or specific)
- Navigation to schedule step
- Tab bar hiding

**Features:**
- Progress indicator (Step 1 of 4, 25%)
- Step navigation visualization
- Category selection:
  - Fitness & Training
  - Group Classes
  - Wellness & Recovery
  - Specialized Programs
- Service selection (filtered by category):
  - Service cards with tags
  - Service descriptions
- Provider selection:
  - Auto-assign option
  - Trainer list with specializations
  - Selection indicators
- Continue button (only when all selections made)

---

### `app/dashboard/book-workout/schedule.tsx` (Step 2: Schedule)
**Functions:**
- Date selection
- Time selection
- Different UI for 1-on-1 vs class services
- View mode toggle (week/month) for class services
- Navigation to review step
- Tab bar hiding

**Features:**
- Progress indicator (Step 2 of 4, 50%)
- Step navigation with completed states
- For 1-on-1 services:
  - Date picker (scrollable dates)
  - Time picker (grid of time slots)
- For class services:
  - View mode toggle (Week/Month)
  - Date picker
  - Time slot grid with availability:
    - Available slots
    - Unavailable slots
    - Full slots
    - Spots remaining indicator
  - Waitlist option
- Continue button (only when date and time selected)

---

### `app/dashboard/book-workout/review.tsx` (Step 3: Review)
**Functions:**
- Booking summary display
- Navigation to done step
- Tab bar hiding

**Features:**
- Progress indicator (Step 3 of 4, 75%)
- Step navigation with completed states
- Review cards:
  - Service details
  - Trainer details
  - Date & time details
- Confirm booking button

---

### `app/dashboard/book-workout/done.tsx` (Step 4: Done)
**Functions:**
- Success confirmation
- Navigation to dashboard
- Navigation to bookings
- Tab bar hiding

**Features:**
- Progress indicator (Step 4 of 4, 100%)
- All steps completed visualization
- Success message with checkmark
- Booking details summary:
  - Service name
  - Date & time
  - Trainer
- Action buttons:
  - Back to Home
  - View My Bookings

---

## Buy Package Flow

### `app/dashboard/buy-package/_layout.tsx` (Buy Package Layout)
**Functions:**
- Tab bar visibility management
- Navigation state tracking

**Features:**
- Hides tab bar when in buy-package flow
- Stack navigation for workflow steps

---

### `app/dashboard/buy-package/setup.tsx` (Step 1: Setup)
**Functions:**
- Category selection (Private/Semi-Private)
- Service selection
- Navigation to schedule step
- Tab bar hiding

**Features:**
- Progress indicator (Step 1 of 7, ~14%)
- Step navigation visualization (7 steps)
- Category selection:
  - Private (Personal Training)
  - Semi-Private (Classes)
- Service selection:
  - Personal Training packages (with credits)
  - Class packages (with schedules)
- Continue button

---

### `app/dashboard/buy-package/schedule.tsx` (Step 2: Schedule)
**Functions:**
- Preferred time selection (for Personal Training)
- Day selection with expandable time picker
- Time picker (custom Android picker with scrollable hours/minutes/AM-PM, native iOS spinner)
- Add/remove preferred times (up to 4)
- Expanded day state management
- Navigation to info step
- Tab bar hiding

**Features:**
- Progress indicator (Step 2 of 7, ~29%)
- Step navigation with completed states
- For Personal Training:
  - Day selection (horizontal scroll, shows selected indicator)
  - Expandable day cards
  - Custom time picker (Android):
    - Scrollable hour picker (1-12)
    - Scrollable minute picker (00-55 in 5-min intervals)
    - Scrollable AM/PM picker
    - Visual selection indicator
  - Native iOS time spinner
  - Selected preferences display with remove buttons
  - Add time button
  - Maximum 4 preferences
  - Already selected times display for expanded day
- For Classes:
  - Fixed schedule display
  - Class schedule information
- Continue button (enabled when preferences selected for PT, always for classes)

---

### `app/dashboard/buy-package/info.tsx` (Step 3: Info)
**Functions:**
- Remark input
- Navigation to review step
- Tab bar hiding

**Features:**
- Progress indicator (Step 3 of 7, ~43%)
- Step navigation with completed states
- Remark text input (multiline, optional)
- Continue button

---

### `app/dashboard/buy-package/review.tsx` (Step 4: Review)
**Functions:**
- Package summary display
- Preferred times display
- Remark display
- Navigation to sign step
- Tab bar hiding

**Features:**
- Progress indicator (Step 4 of 7, ~57%)
- Step navigation with completed states
- Review cards:
  - Package details
  - Credits/schedule information
  - Preferred times (if applicable)
  - Remark (if provided)
- Continue button

---

### `app/dashboard/buy-package/sign.tsx` (Step 5: Sign)
**Functions:**
- E-signature input
- Terms agreement checkbox
- Navigation to pay step
- Tab bar hiding

**Features:**
- Progress indicator (Step 5 of 7, ~71%)
- Step navigation with completed states
- Terms and conditions display
- E-signature input (full name)
- Agreement checkbox
- Continue button (only when signed and agreed)

---

### `app/dashboard/buy-package/pay.tsx` (Step 6: Pay)
**Functions:**
- Payment method selection
- Order summary calculation
- Payment processing (simulated)
- Navigation to done step
- Tab bar hiding

**Features:**
- Progress indicator (Step 6 of 7, ~86%)
- Step navigation with completed states
- Order summary:
  - Package details
  - Price breakdown
  - Tax calculation (10%)
  - Total amount
- Payment methods:
  - Credit/Debit Card
  - Apple Pay
  - Google Pay
- Payment processing state
- Pay button

---

### `app/dashboard/buy-package/done.tsx` (Step 7: Done)
**Functions:**
- Success confirmation
- Navigation to dashboard
- Navigation to bookings
- Tab bar hiding

**Features:**
- Progress indicator (Step 7 of 7, 100%)
- All steps completed visualization
- Success message with checkmark
- Package details summary:
  - Package name
  - Credits included
  - Preferred times (if applicable)
  - Remark (if provided)
  - Total paid
- Action buttons:
  - Back to Home
  - View My Packages

---

## Bookings Pages

### `app/dashboard/bookings/_layout.tsx` (Bookings Layout)
**Features:**
- Stack navigation setup
- Index and detail screens

---

### `app/dashboard/bookings/index.tsx` (Bookings List)
**Functions:**
- Navigation to booking details
- Reschedule action (placeholder)

**Features:**
- Upcoming bookings section:
  - Booking cards with images
  - Service name
  - Date and time
  - Location
  - Trainer/Studio information
  - View details button
  - Reschedule button
- Past bookings section:
  - Completed booking cards
  - View details button only

---

### `app/dashboard/bookings/[id].tsx` (Booking Details)
**Functions:**
- Booking detail display
- Reschedule action (placeholder)
- Cancel action (placeholder)
- Tab bar hiding/showing

**Features:**
- Booking image
- Booking title and status badge
- Booking ID
- Information cards:
  - Date
  - Time
  - Duration
  - Price
- Location and trainer/instructor
- Description
- Action buttons (for upcoming bookings):
  - Reschedule
  - Cancel

---

## Explore Pages

### `app/dashboard/explore/_layout.tsx` (Explore Layout)
**Functions:**
- Tab bar visibility management

**Features:**
- Stack navigation
- Index and detail screens

---

### `app/dashboard/explore/index.tsx` (Explore Screen)
**Functions:**
- Category filtering (state management)
- Search functionality (text input filtering)
- Service filtering (by category and search query)
- Navigation to service details

**Features:**
- Search bar with search icon
- Filter icon button (placeholder)
- Category filters (horizontal scroll):
  - Training
  - Classes
  - Yoga
  - Cardio
  - Strength
  - Pilates
- Recommended For You section:
  - Recommended service cards with images
  - Service descriptions
  - Popularity percentage display
  - Price display with unit
- Browse Workouts section:
  - Filtered service list (by selected category and search query)
  - Service cards with images
  - Service descriptions (2 lines max)
  - Popularity percentage display
  - Price display with unit

---

### `app/dashboard/explore/[id].tsx` (Service Details)
**Functions:**
- Service detail display
- Navigation to book workout
- Tab bar hiding/showing

**Features:**
- Service image
- Service title and category
- Price display
- Information cards:
  - Duration
  - Popularity percentage
- Location and trainer information
- Description
- Features list
- Book Now button

---

## Notifications

### `app/dashboard/notifications/_layout.tsx` (Notifications Layout)
**Functions:**
- Tab bar visibility management

**Features:**
- Hides tab bar when in notifications
- Stack navigation

---

### `app/dashboard/notifications/index.tsx` (Notifications Screen)
**Functions:**
- `markAsRead(id)` - Mark individual notification as read
- `markAllAsRead()` - Mark all notifications as read
- Unread count calculation
- Tab bar hiding/showing

**Features:**
- Header with back button
- Unread count badge
- Mark all read button
- Notification list:
  - Notification cards with icons
  - Type-based icon colors
  - Read/unread states
  - Timestamp display
  - Tap to mark as read
- Empty state display

---

## Common Features Across Pages

### Navigation
- Tab bar visibility management
- Back button navigation
- Stack navigation
- Deep linking support

### UI Components
- Progress indicators
- Step navigation
- Loading states
- Empty states
- Error handling

### State Management
- React Query for API calls
- Local state with useState
- Navigation params passing

### Styling
- Tailwind CSS classes
- Custom color scheme
- Dark/light theme support
- Safe area handling

### Data Flow
- Dummy data for development
- Parameter passing between screens
- State persistence through navigation

---

## Summary Statistics

- **Total Pages**: 30+ screens
- **Main Flows**: 2 (Book Workout, Buy Package)
- **Tab Navigation**: 4 main tabs
- **Multi-step Processes**: 2 (4-step and 7-step)
- **API Integration Points**: Health check, private data, session management
- **Authentication**: Phone-based OTP (placeholder)

---

## Notes

1. Most API calls are placeholders (TODO comments)
2. Payment processing is simulated
3. Data is currently using dummy/mock data
4. Some features are commented out (e.g., SMS notifications)
5. Tab bar visibility is managed dynamically based on navigation state
6. All forms include validation and disabled states for empty inputs
7. **Code Issue**: In `buy-package/sign.tsx`, the steps array shows Review as step 3 and Info as step 4, but the actual flow is Info (3) → Review (4). The `currentStep` value is correct (5), so the active step displays correctly, but the step labels in the array are inconsistent.
8. **Code Issue**: In `buy-package/schedule.tsx` line 612, there's a reference to `index` variable that should be the map index but the map uses `pt` as parameter. This would cause a runtime error.
