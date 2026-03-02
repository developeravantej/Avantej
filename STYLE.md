# Design Style Guide

This document outlines the design system and style guidelines for the EasyEats food delivery application.

## Color Palette

### Primary Colours

- **Colour 1**: `#000000` (Black)
  - Used for: Primary text, active states, primary buttons, active navigation items

- **Colour 2**: `#FFFFFF` (White)
  - Used for: Backgrounds, card surfaces, primary button text on dark

- **Colour 3**: `#F3F3F3` (Light Gray)
  - Used for: Secondary backgrounds, subtle surfaces

### Secondary Colours

- **Colour 1**: `#8A8F91` (Gray)
  - Used for: Secondary text, inactive navigation, placeholders

- **Colour 2**: `#D9D9CA` (Warm Gray)
  - Used for: Borders, dividers, subtle accents

- **Colour 3**: `#EDEDE4` (Light Warm Gray)
  - Used for: Light backgrounds, borders, card outlines

### Shadows

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

- **Background**: Primary Colour 1 (`#000000`)
- **Text Color**: Primary Colour 2 (`#FFFFFF`)
- **Padding**: 14px 24px
- **Border Radius**: 12px (rounded rectangle)
- **Font Weight**: 600 (Semi-Bold)
- **Font Size**: 16px
- **Hover**: Darker black / reduced opacity
- **Active**: Pressed state with reduced opacity

#### Secondary Button (Outline)

- **Background**: Transparent
- **Border**: 2px solid Primary Colour 1
- **Text Color**: Primary Colour 1
- **Padding**: 14px 24px
- **Border Radius**: 12px
- **Hover**: Primary Colour 1 background with Primary Colour 2 text

#### Icon Button (Circular)

- **Size**: 40px - 48px diameter
- **Background**: Primary Colour 2 (White) or Primary Colour 1 (Black)
- **Border Radius**: 50% (perfect circle)
- **Icon**: Centered, 24px size
- **Shadow**: Subtle shadow for elevation

### Cards

- **Background**: Primary Colour 2 (`#FFFFFF`)
- **Border Radius**: 16px - 20px (rounded corners)
- **Shadow**: `0 2px 8px rgba(0, 0, 0, 0.1)` - Subtle elevation
- **Padding**: 16px - 20px
- **Margin**: 8px - 16px between cards

### Input Fields

- **Background**: Primary Colour 2 (White)
- **Border**: 1px solid Secondary Colour 3 (`#EDEDE4`)
- **Border Radius**: 12px
- **Padding**: 12px 16px
- **Font Size**: 16px
- **Focus State**:
  - Border color: Primary Colour 1
  - Border width: 2px
  - Shadow: Subtle focus glow

### Navigation

#### Bottom Navigation Bar

- **Background**: Primary Colour 2 (White)
- **Height**: 64px - 72px
- **Top Border**: 1px solid Secondary Colour 3 (`#EDEDE4`) or subtle shadow
- **Icon Size**: 24px
- **Active State**: Primary Colour 1 (Black) icon and text
- **Inactive State**: Secondary Colour 1 (Gray) icon and text
- **Text Size**: 12px labels below icons

#### Category Icons (Home Screen)

- **Size**: 56px - 64px diameter
- **Background**: Primary Colour 2 (White)
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

- **Background**: Primary Colour 1 (Black)
- **Padding**: 20px - 24px
- **Border Radius**: 16px
- **Text Color**: Primary Colour 2 (White)
- **Icon**: Primary Colour 2, 24px - 32px

#### Timeline Steps

- **Completed**: Primary Colour 1 circle with checkmark
- **Active**: Primary Colour 1 circle with border
- **Pending**: Secondary Colour 1 circle
- **Connecting Line**: Secondary Colour 3, 2px width

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
- **Background**: Primary Colour 2 (White) or transparent
- **Padding**: 16px horizontal
- **Elements**: Logo/App name, Search icon, Notification bell

### Promotional Banner

- **Background**: Primary Colour 1 or gradient
- **Padding**: 24px
- **Border Radius**: 16px
- **Text**: Primary Colour 2 (White), bold
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

- **Background**: Secondary Colour 3 or Primary Colour 2
- **Padding**: 20px
- **Divider**: 1px solid Secondary Colour 3 (`#EDEDE4`)
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
  /* Primary Colours */
  --color-primary-1: #000000;
  --color-primary-2: #ffffff;
  --color-primary-3: #f3f3f3;
  /* Secondary Colours */
  --color-secondary-1: #8a8f91;
  --color-secondary-2: #d9d9ca;
  --color-secondary-3: #edede4;
  /* Convenience */
  --color-background: #ffffff;
  --color-surface: #f3f3f3;
  --color-text-primary: #000000;
  --color-text-secondary: #8a8f91;
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
        primary: {
          1: "#000000",
          2: "#FFFFFF",
          3: "#F3F3F3",
        },
        secondary: {
          1: "#8A8F91",
          2: "#D9D9CA",
          3: "#EDEDE4",
        },
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
  class="bg-primary-1 text-primary-2 px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-colors"
>
  Add to Cart
</button>
```

### Product Card

```html
<div class="bg-primary-2 rounded-2xl shadow-md p-4">
  <img src="..." class="w-full rounded-xl mb-4" />
  <h3 class="font-semibold text-lg mb-2 text-primary-1">Product Name</h3>
  <p class="text-secondary-1 text-sm mb-4">Description</p>
  <div class="flex justify-between items-center">
    <span class="text-primary-1 font-bold">$12.99</span>
    <button class="w-10 h-10 bg-primary-1 text-primary-2 rounded-full">+</button>
  </div>
</div>
```

## Always fix the max width at 767px for the frontend

**Last Updated**: [Current Date]
**Version**: 1.0
