# Article Images Feature - Visual Reference Guide

## Button Appearance

### "Add Article Image" Button
```
Location: Below "Article Code" textarea field
Style: Secondary button (matches other gray buttons in the form)
Icon: Plus icon (fas fa-plus)
Text: "Add Article Image"

Visual:
┌────────────────────────────────┐
│  +  Add Article Image         │
└────────────────────────────────┘
   Gray background
   White text
   Rounded corners
   Hover: Slightly darker gray
```

### CSS Classes Used
```css
.btn {
  /* Base button styles from existing CSS */
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  /* Matches other secondary buttons */
  background-color: var(--gray-200);
  color: var(--gray-900);
  border: 1px solid var(--gray-300);
}

.btn-secondary:hover {
  background-color: var(--gray-300);
}
```

## Form Section Layout

### Complete Article Images Section
```
┌──────────────────────────────────────────────────────────────┐
│  Article Code                                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ <textarea>                                            │   │
│  │ HTML5 code for the article...                        │   │
│  │                                                       │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│  HTML5 code for the article                                  │
│                                                               │
│  Article Images                        ← Section Label        │
│  Add images from the library to this article ← Help Text     │
│                                                               │
│  ┌────────────────────────────────┐                         │
│  │  +  Add Article Image         │    ← Click to open modal │
│  └────────────────────────────────┘                         │
│                                                               │
│  Selected Images (when images are added):                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ┌────┐                                              │   │
│  │  │IMG │  example-image-1.webp              [🗑️]     │   │
│  │  └────┘  ID: abc-123-def-456                        │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ┌────┐                                              │   │
│  │  │IMG │  another-image.webp                 [🗑️]     │   │
│  │  └────┘  ID: xyz-789-ghi-012                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  Or (when no images):                                        │
│  No images added yet                                         │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Image Selector Modal

### Modal Layout (Full Size)
```
Background Overlay: rgba(0, 0, 0, 0.6)

┌────────────────────────────────────────────────────────────────┐
│  Select Image from Library                                 [×] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────────────┐ ┌───────────────┐ ┌──────────┐   │
│  │ Search images...       │ │Category ▼     │ │ 🔍Search│   │
│  └────────────────────────┘ └───────────────┘ └──────────┘   │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Image Grid (Scrollable)                             │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │    │
│  │  │        │ │        │ │        │ │        │        │    │
│  │  │  IMG   │ │  IMG   │ │  IMG   │ │  IMG   │        │    │
│  │  │        │ │        │ │        │ │        │        │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘        │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │    │
│  │  │        │ │        │ │        │ │        │        │    │
│  │  │  IMG   │ │  IMG   │ │  IMG   │ │  IMG   │        │    │
│  │  │        │ │        │ │        │ │        │        │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘        │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │    │
│  │  │        │ │        │ │        │ │        │        │    │
│  │  │  IMG   │ │  IMG   │ │  IMG   │ │  IMG   │        │    │
│  │  │        │ │        │ │        │ │        │        │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘        │    │
│  │                                                       │    │
│  │  (Hover: Blue border on image)                       │    │
│  │  (Click: Select and close modal)                     │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
│       [◄] [1] [2] [3] ... [►]    ← Pagination                │
│                                                                │
└────────────────────────────────────────────────────────────────┘

Modal Width: 900px (max-width)
Modal Position: Centered on screen (5% from top, auto margins)
Background: White (#ffffff)
Border Radius: 8px
Box Shadow: 0 4px 6px rgba(0, 0, 0, 0.1)
```

## Selected Image Card Design

### Individual Image Card
```
┌──────────────────────────────────────────────────────────┐
│  ┌──────┐                                                │
│  │      │  filename: example-article-image.webp         │
│  │ IMG  │  ID: 550e8400-e29b-41d4-a716-446655440000     │
│  │      │                                        [🗑️]   │
│  │60x60 │                                                │
│  └──────┘                                                │
└──────────────────────────────────────────────────────────┘

Card Background: var(--gray-50)
Border: 1px solid var(--gray-200)
Border Radius: 4px
Padding: 8px
Margin: 8px 0

Image:
- Size: 60x60px
- Object-fit: cover
- Border-radius: 4px

Text:
- Filename: Bold, 14px, black
- ID: Small, 12px, gray-600

Trash Button:
- Small red button (btn-sm btn-danger)
- Positioned on the right
- Shows trash icon
```

## Color Scheme

```css
/* Colors used in the feature */
--primary: #3b82f6;      /* Blue for selected/active states */
--gray-50: #f9fafb;      /* Light gray background */
--gray-200: #e5e7eb;     /* Button background */
--gray-300: #d1d5db;     /* Button border */
--gray-500: #6b7280;     /* Help text */
--gray-600: #4b5563;     /* Secondary text */
--gray-900: #111827;     /* Primary text */
--white: #ffffff;        /* Modal background */
--danger: #ef4444;       /* Delete button */
```

## Typography

```css
/* Font styles used */
Section Label: 
  - Font-weight: 600
  - Font-size: 16px
  - Color: var(--gray-900)

Help Text:
  - Font-size: 14px
  - Color: var(--gray-500)

Button Text:
  - Font-size: 14px
  - Font-weight: 500

Image Filename:
  - Font-weight: 600
  - Font-size: 14px

Image ID:
  - Font-size: 12px
  - Color: var(--gray-600)
```

## Responsive Breakpoints

### Desktop (Default)
- Modal width: 900px
- Image grid: 4 columns
- Button full text visible

### Tablet (< 768px)
- Modal width: 90% of screen
- Image grid: 2 columns
- Adjusted padding

### Mobile (< 480px)
- Modal width: 95% of screen
- Image grid: 1 column
- Stacked layout
- Touch-optimized spacing

## Interactive States

### Button States
```
Default:
┌────────────────────────────────┐
│  +  Add Article Image         │  Gray background
└────────────────────────────────┘

Hover:
┌────────────────────────────────┐
│  +  Add Article Image         │  Darker gray
└────────────────────────────────┘

Active/Pressed:
┌────────────────────────────────┐
│  +  Add Article Image         │  Even darker
└────────────────────────────────┘
```

### Image Selector States
```
Default Image:
┌────────┐
│        │
│  IMG   │  Border: 2px solid gray-200
│        │
└────────┘

Hover:
┌────────┐
│        │
│  IMG   │  Border: 2px solid blue (primary)
│        │  Box-shadow: 0 2px 8px rgba(0,0,0,0.1)
└────────┘

Selected (brief flash before closing):
┌────────┐
│        │
│  IMG   │  Border: 2px solid blue
│        │  Box-shadow: 0 0 0 2px blue
└────────┘
```

## Animation Effects

### Modal
- Fade in: 200ms ease
- Scale up from 95% to 100%
- Background overlay fade in

### Image Grid
- Images fade in as they load
- Lazy loading for performance
- Smooth scroll in container

### Selected Images List
- New items slide in from top
- Remove items fade out
- Height transitions smoothly

## Accessibility Features

### Keyboard Support
- Tab through all interactive elements
- Enter to select image
- Escape to close modal
- Focus indicators on all buttons

### Screen Reader Support
- Proper ARIA labels
- Alt text for all images
- Descriptive button text
- Status announcements for actions

### Visual Indicators
- Clear hover states
- Focus outlines
- Error messages in red
- Success feedback
- Loading states

## Browser Compatibility

✅ Chrome 90+
✅ Firefox 88+
✅ Safari 14+
✅ Edge 90+
✅ Opera 76+

Features used:
- CSS Grid (modern browsers)
- Fetch API (all modern browsers)
- ES6 JavaScript (all modern browsers)
- CSS Custom Properties (all modern browsers)

## Print Styles

When printing the article form:
- Modal is hidden
- Selected images list is visible
- Image thumbnails are visible
- URLs are preserved

## Dark Mode Support

Currently uses light theme only. If dark mode is added to the application in the future, the feature will need:
- Inverted background colors
- Adjusted text colors
- Modified border colors
- Updated shadow values
