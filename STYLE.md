# Design Style Guide

This document outlines the design system and style guidelines for the EasyEats food delivery application.

## Color Palette

### Primary Colors

- **Primary Accent (Brown)**: `#957F65`
  - Used for: Active states, primary buttons, delivery status, positive actions
  - Examples: "Get Now", "Add to Cart", "Checkout", active navigation items

- **Secondary Accent (Green)**: `#4CAF50`
  - Used for: Special offers, success states, highlights, promotional banners
  - Example: "New Year Offer" banners, success messages

### Neutral Colors

- **Background**:
  - Primary: `#FFFFFF` (White)
  - Secondary: `#F8F8F8` (Very light gray)

- **Text Colors**:
  - Primary Text: `#333333` or `#424242` (Dark Gray/Black)
  - Secondary Text: `#757575` or `#9E9E9E` (Medium Gray)
  - Tertiary Text: `#BDBDBD` (Light Gray) - For placeholders and subtle details

- **Borders & Dividers**: `#E0E0E0` (Light Gray)

- **Shadows**: `rgba(0, 0, 0, 0.1)` - Subtle, soft gray shadows for elevation

## Typography

### Font Family

- **Primary Font**: Clean, modern sans-serif
  - Recommended: Inter, Poppins, Roboto, or SF Pro Display (system fonts)

### Font Weights

- **Light**: 300 - For subtle text
- **Regular**: 400 - Default for body text
- **Medium**: 500 - For secondary headings
- **Semi-Bold**: 600 - For section headers
- **Bold**: 700 - For main titles and important information

### Font Sizes

- **Extra Large**: 32px - Main page titles
- **Large**: 24px - Section headers (e.g., "Best Sellers")
- **Medium**: 18px - Product names, card titles
- **Regular**: 16px - Body text, descriptions
- **Small**: 14px - Secondary information, prices
- **Extra Small**: 12px - Meta information (calories, time estimates)

### Line Heights

- **Tight**: 1.2 - For headings
- **Normal**: 1.5 - For body text
- **Relaxed**: 1.75 - For descriptions and longer text

## Spacing & Layout

### Spacing Scale

- **XS**: 4px - Minimal spacing between tightly related elements
- **SM**: 8px - Small gaps between related items
- **MD**: 16px - Standard padding/margin (default)
- **LG**: 24px - Section spacing
- **XL**: 32px - Large section spacing
- **2XL**: 48px - Major section breaks

### Container Padding

- **Mobile**: 16px horizontal padding
- **Card Content**: 16px - 24px padding
- **Section Spacing**: 24px - 32px vertical margin

### Grid System

- **Columns**: 2-column grid for product listings
- **Gaps**: 16px - 20px between grid items
- **Max Width**: Content should respect maximum width constraints for readability

## Component Styles

### Buttons

#### Primary Button

- **Background**: Primary Brown (`#957F65`)
- **Text Color**: White (`#FFFFFF`)
- **Padding**: 14px 24px
- **Border Radius**: 12px (rounded rectangle)
- **Font Weight**: 600 (Semi-Bold)
- **Font Size**: 16px
- **Hover**: Slightly darker brown (`#786450`)
- **Active**: Pressed state with reduced opacity

#### Secondary Button (Outline)

z

- **Background**: Transparent
- **Border**: 2px solid Primary Brown
- **Text Color**: Primary Brown
- **Padding**: 14px 24px
- **Border Radius**: 12px
- **Hover**: Red background with white text

#### Icon Button (Circular)

- **Size**: 40px - 48px diameter
- **Background**: White or Primary Brown
- **Border Radius**: 50% (perfect circle)
- **Icon**: Centered, 24px size
- **Shadow**: Subtle shadow for elevation

### Cards

- **Background**: White (`#FFFFFF`)
- **Border Radius**: 16px - 20px (rounded corners)
- **Shadow**: `0 2px 8px rgba(0, 0, 0, 0.1)` - Subtle elevation
- **Padding**: 16px - 20px
- **Margin**: 8px - 16px between cards

### Input Fields

- **Background**: White
- **Border**: 1px solid `#E0E0E0`
- **Border Radius**: 12px
- **Padding**: 12px 16px
- **Font Size**: 16px
- **Focus State**:
  - Border color: Primary Brown
  - Border width: 2px
  - Shadow: Subtle red glow

### Navigation

#### Bottom Navigation Bar

- **Background**: White
- **Height**: 64px - 72px
- **Top Border**: 1px solid `#E0E0E0` or subtle shadow
- **Icon Size**: 24px
- **Active State**: Red icon and text
- **Inactive State**: Gray icon and text
- **Text Size**: 12px labels below icons

#### Category Icons (Home Screen)

- **Size**: 56px - 64px diameter
- **Background**: White
- **Border Radius**: 50%
- **Icon**: Colored, 28px - 32px
- **Spacing**: 16px - 20px horizontal gap

### Badges & Tags

- **Background**: Light gray or colored background
- **Padding**: 6px 12px
- **Border Radius**: 16px (pill-shaped)
- **Font Size**: 12px
- **Font Weight**: 500

### Progress Indicators

#### Delivery Status Card

- **Background**: Primary Brown
- **Padding**: 20px - 24px
- **Border Radius**: 16px
- **Text Color**: White
- **Icon**: White, 24px - 32px

#### Timeline Steps

- **Completed**: Red circle with checkmark
- **Active**: Red circle with border
- **Pending**: Gray circle
- **Connecting Line**: Light gray, 2px width

## Design Principles

### 1. Clarity and Simplicity

- Minimalist design approach
- Clear labels and intuitive icons
- Avoid clutter and unnecessary elements

### 2. Visual Hierarchy

- Use size, weight, and color to emphasize important information
- Primary actions (buttons, prices) should be prominent
- Secondary information should be subtle but readable

### 3. Consistency

- Uniform use of rounded corners (12px - 16px standard)
- Consistent card styles across all screens
- Standardized button designs and interactions
- Uniform typography hierarchy

### 4. Mobile-First Approach

- Layouts optimized for small screens
- Large touch targets (minimum 44px x 44px)
- Adequate spacing between interactive elements
- Horizontal scrolling for categories and promotions

### 5. Engaging Imagery

- High-quality food photos are central to browsing
- Images should be prominent and appetizing
- Consistent aspect ratios for product images

### 6. Action-Oriented Design

- Clear call-to-action buttons
- Prominent "Add to Cart" buttons
- Easy checkout flow

### 7. Feedback and States

- Visual cues for active/inactive states
- Hover and press states for interactive elements
- Clear loading and success states
- Notification badges and indicators

## Component Specifications

### Header

- **Height**: 56px - 64px
- **Background**: White or transparent
- **Padding**: 16px horizontal
- **Elements**: Logo/App name, Search icon, Notification bell

### Promotional Banner

- **Background**: Primary Brown or gradient
- **Padding**: 24px
- **Border Radius**: 16px
- **Text**: White, bold
- **Call-to-Action**: Prominent button

### Product Card

- **Image Aspect Ratio**: 16:9 or 4:3
- **Image Border Radius**: Top corners only (12px)
- **Content Padding**: 16px
- **Footer**: Price and add button

### Cart Item

- **Image Size**: 64px x 64px (square, rounded)
- **Content**: Flexible width
- **Quantity Selector**: Horizontal bar with +/- buttons
- **Spacing**: 16px between elements

### Summary Section

- **Background**: Light gray or white
- **Padding**: 20px
- **Divider**: 1px solid `#E0E0E0`
- **Total**: Bold, larger text

## Animation & Transitions

### Standard Transitions

- **Duration**: 200ms - 300ms
- **Easing**: `ease-in-out` or `cubic-bezier(0.4, 0, 0.2, 1)`
- **Properties**: opacity, transform, color, background-color

### Common Animations

- **Fade In**: For new content appearing
- **Slide**: For horizontal scrolling sections
- **Scale**: For button press feedback
- **Slide Up**: For modals and bottom sheets

## Accessibility

### Color Contrast

- Minimum contrast ratio of 4.5:1 for text
- Minimum contrast ratio of 3:1 for interactive elements

### Touch Targets

- Minimum size: 44px x 44px
- Adequate spacing between targets

### Typography

- Minimum font size: 12px for body text
- Use relative units (rem, em) for scalability

## Implementation Notes

### CSS Variables

Consider using CSS custom properties for theming:

```css
:root {
  --color-primary: #957f65;
  --color-secondary: #4caf50;
  --color-background: #ffffff;
  --color-surface: #f8f8f8;
  --color-text-primary: #333333;
  --color-text-secondary: #757575;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --border-radius: 12px;
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.1);
}
```

### Tailwind CSS Classes

If using Tailwind, create custom utilities:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: "#957F65",
        secondary: "#4CAF50",
      },
      borderRadius: {
        card: "16px",
      },
    },
  },
};
```

## Examples

### Primary Button

```html
<button
  class="bg-[#957F65] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#786450] transition-colors"
>
  Add to Cart
</button>
```

### Product Card

```html
<div class="bg-white rounded-2xl shadow-md p-4">
  <img src="..." class="w-full rounded-xl mb-4" />
  <h3 class="font-semibold text-lg mb-2">Product Name</h3>
  <p class="text-gray-600 text-sm mb-4">Description</p>
  <div class="flex justify-between items-center">
    <span class="text-red-600 font-bold">$12.99</span>
    <button class="w-10 h-10 bg-[#957F65] text-white rounded-full">+</button>
  </div>
</div>
```

## Always fix the max width at 767px for the frontend

**Last Updated**: [Current Date]
**Version**: 1.0
