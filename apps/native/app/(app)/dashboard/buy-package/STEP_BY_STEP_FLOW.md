# Buy Package - Step by Step Flow

## Overview
The buy package flow consists of **7 steps** that guide users through selecting, configuring, and purchasing a fitness package.

---

## Step 1: Setup
**File:** `setup.tsx`  
**Progress:** Step 1 of 7 (14%)  
**Purpose:** Select service category and specific service

### User Actions:
1. **Select Category** - Choose from 6 available categories:
   - Private (Personal Training)
   - Semi-Private (Classes)
   - Group Training
   - Online Training
   - Nutrition Coaching
   - Recovery & Wellness

2. **Select Service** - Choose a specific service from the selected category
   - Services display with titles, descriptions, and credits (if applicable)
   - Each service has a unique ID

### Data Collected:
- `categoryId` - Selected category ID (1-6)
- `serviceId` - Selected service ID

### Navigation:
- **Next:** Navigates to `schedule.tsx` with `serviceId` and `categoryId` params
- **Condition:** Both category and service must be selected

---

## Step 2: Schedule
**File:** `schedule.tsx`  
**Progress:** Step 2 of 7 (29%)  
**Purpose:** Configure scheduling preferences

### User Actions:

#### For Personal Training (categoryId === 1):
1. **Select Preferred Times** - Choose up to 4 day/time combinations
   - Expand day cards to see time picker
   - Select time using platform-specific picker (iOS spinner, Android custom)
   - Add multiple time slots per day
   - Remove selected times if needed

#### For Classes (categoryId === 2):
- **View Fixed Schedule** - Display the class's predetermined schedule
- No user selection required (schedule is fixed)

### Data Collected:
- `preferredTimes` - Array of `{day: string, time: string}` objects (JSON stringified)
  - Example: `[{"day": "Monday", "time": "7:00 AM"}, {"day": "Wednesday", "time": "6:00 PM"}]`
- `serviceId` - Passed through from previous step
- `categoryId` - Passed through from previous step

### Navigation:
- **Next:** Navigates to `info.tsx` with all params
- **Condition:** For Personal Training, at least one preferred time must be selected

---

## Step 3: Info
**File:** `info.tsx`  
**Progress:** Step 3 of 7 (43%)  
**Purpose:** Collect additional information/remarks

### User Actions:
1. **Add Remarks** (Optional)
   - Multi-line text input
   - User can provide any additional information or special requests

### Data Collected:
- `remark` - Optional text string with user remarks
- All previous params passed through

### Navigation:
- **Next:** Navigates to `review.tsx` with all params including `remark`
- **Condition:** No validation required (remarks are optional)

---

## Step 4: Review
**File:** `review.tsx`  
**Progress:** Step 4 of 7 (57%)  
**Purpose:** Review all selected details before proceeding

### Displayed Information:
1. **Package Details**
   - Service title
   - Credits (if applicable)
   - Schedule (for classes)

2. **Preferred Times** (Personal Training only)
   - List of all selected day/time combinations

3. **Remark** (if provided)
   - Display user's additional notes

### Data Passed Through:
- All previous params maintained

### Navigation:
- **Next:** Navigates to `sign.tsx` with all params
- **Condition:** User confirms and clicks continue

---

## Step 5: Sign
**File:** `sign.tsx`  
**Progress:** Step 5 of 7 (71%)  
**Purpose:** E-signature and terms agreement

### User Actions:
1. **Enter Full Name** - Electronic signature input
   - User types their full name as signature

2. **Agree to Terms** - Checkbox agreement
   - Terms and Conditions of service
   - Cancellation and refund policy
   - Health and safety waiver
   - Privacy policy

### Data Collected:
- `signature` - User's full name (electronic signature)
- `agreedToTerms` - Boolean (implicit, validated before proceeding)
- All previous params passed through

### Navigation:
- **Next:** Navigates to `pay.tsx` with all params including `signature`
- **Condition:** Both signature and terms agreement required

---

## Step 6: Pay
**File:** `pay.tsx`  
**Progress:** Step 6 of 7 (86%)  
**Purpose:** Payment processing

### User Actions:
1. **Review Order Summary**
   - Package details
   - Price breakdown (Subtotal, Tax 10%, Total)
   - First session date/time (if applicable)

2. **Select Payment Method**
   - Credit/Debit Card
   - Apple Pay
   - Google Pay

3. **Process Payment**
   - Simulated payment processing (2 second delay)
   - Shows "Processing..." state

### Data Collected:
- `paymentMethod` - Selected payment type ("card" | "apple" | "google")
- All previous params passed through

### Price Calculation:
- Subtotal: Service price
- Tax: 10% of subtotal
- Total: Subtotal + Tax

### Navigation:
- **Next:** Navigates to `done.tsx` with all params after successful payment
- **Condition:** Payment method must be selected

---

## Step 7: Done
**File:** `done.tsx`  
**Progress:** Step 7 of 7 (100%)  
**Purpose:** Confirmation and completion

### Displayed Information:
1. **Success Message**
   - "Package Purchased!" confirmation
   - Success checkmark icon

2. **Package Details Summary**
   - Package name
   - Credits included
   - Preferred times (if applicable)
   - Remark (if provided)
   - Total amount paid

### User Actions:
1. **Back to Home** - Returns to dashboard
2. **View My Packages** - Navigates to bookings page

### Navigation:
- **Back to Home:** `router.replace("/dashboard")`
- **View Packages:** `router.push("/dashboard/bookings")`

---

## Data Flow Summary

### Parameters Passed Between Steps:
```typescript
{
  serviceId: string,           // From Step 1
  categoryId: string,         // From Step 1
  preferredTimes?: string,    // From Step 2 (JSON stringified array)
  remark?: string,            // From Step 3
  signature?: string,          // From Step 5
  // Additional params may include:
  coachId?: string,
  date?: string,
  time?: string,
}
```

### Step Sequence:
```
Setup → Schedule → Info → Review → Sign → Pay → Done
  1        2         3        4       5      6      7
```

---

## Service Categories & IDs

1. **PRIVATE** (1) - Personal Training
2. **SEMI_PRIVATE** (2) - Classes
3. **GROUP** (3) - Group Training
4. **ONLINE** (4) - Online Training
5. **NUTRITION** (5) - Nutrition Coaching
6. **RECOVERY** (6) - Recovery & Wellness

---

## Notes

- **Progress Tracking:** Each step shows progress percentage and step number
- **Tab Bar:** Hidden throughout the entire flow (restored when leaving)
- **Validation:** Each step validates required data before allowing progression
- **Back Navigation:** Users can go back to previous steps using back button
- **Data Persistence:** All data is passed via route params between steps
