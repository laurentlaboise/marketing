# Article Images Feature - UI Guide

## Feature Location
**URL:** `https://admin.wordsthatsells.website/content/articles/[article-id]/edit`
**Section:** Below "Article Code" field in the article edit form

## UI Components

### 1. Article Images Section
Located in the main form after the "Article Code" textarea:

```
┌─────────────────────────────────────────────────────────┐
│ Article Images                                           │
│ Add images from the library to this article             │
│                                                          │
│ [+ Add Article Image]  (Secondary button - gray)        │
│                                                          │
│ ┌─────────────────────────────────────────────────┐    │
│ │ Selected Images List (initially empty)          │    │
│ │                                                  │    │
│ │ When images are added, they appear here as:     │    │
│ │ ┌──────────────────────────────────────────┐    │    │
│ │ │ [IMG] image-name.webp        [🗑️]        │    │    │
│ │ │       ID: abc-123-def                    │    │    │
│ │ └──────────────────────────────────────────┘    │    │
│ └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 2. Image Selector Modal
Appears when "Add Article Image" button is clicked:

```
┌──────────────────────────────────────────────────────────┐
│ Select Image from Library                           [×]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ [Search images...        ] [All Categories ▼] [Search]  │
│                                                          │
│ ┌─────────────────────────────────────────────────┐    │
│ │ Image Grid (4 columns)                          │    │
│ │                                                  │    │
│ │ [IMG] [IMG] [IMG] [IMG]                         │    │
│ │ [IMG] [IMG] [IMG] [IMG]                         │    │
│ │ [IMG] [IMG] [IMG] [IMG]                         │    │
│ │                                                  │    │
│ │ (Scrollable if more than 12 images)             │    │
│ └─────────────────────────────────────────────────┘    │
│                                                          │
│           [<] [1] [2] [3] ... [>]                       │
│           (Pagination controls)                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## User Interactions

### Adding an Image
1. Click "Add Article Image" button
2. Modal opens showing image grid
3. Optionally search/filter images
4. Click on any image to select it
5. Modal closes automatically
6. Selected image appears in the list below the button

### Removing an Image
1. Click the trash icon (🗑️) next to any selected image
2. Confirmation dialog appears
3. Click OK to remove
4. Image is removed from the list

### Searching Images
1. Type in the search box in the modal
2. Select a category from the dropdown (optional)
3. Click "Search" button
4. Grid updates with filtered results

### Pagination
1. If more than 12 images exist, pagination appears
2. Click page numbers to navigate
3. Use arrow buttons for previous/next page

## Button Styling

### "Add Article Image" Button
- **Class:** `btn btn-secondary`
- **Icon:** Font Awesome plus icon (`fas fa-plus`)
- **Color:** Gray background (matching other secondary buttons)
- **Text:** "Add Article Image"
- **Position:** Below the "Article Code" textarea

### Remove Button
- **Class:** `btn btn-sm btn-danger`
- **Icon:** Font Awesome trash icon (`fas fa-trash`)
- **Color:** Red (danger style)
- **Size:** Small

## Data Storage

### Hidden Form Field
```html
<input type="hidden" 
       id="article_images" 
       name="article_images" 
       value='[{"id":"...","cdn_url":"...","filename":"...","alt_text":"..."}]'>
```

### Database Storage
- **Column:** `article_images`
- **Type:** JSONB
- **Structure:**
```json
[
  {
    "id": "uuid-of-image",
    "cdn_url": "https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/...",
    "filename": "example-image.webp",
    "alt_text": "Description of the image"
  }
]
```

## Integration with Existing UI

The feature seamlessly integrates with the existing article form:
- Uses the same button styles as other form buttons
- Follows the same form group layout pattern
- Uses the existing color scheme and typography
- Modal matches the application's design system
- Responsive grid layout adapts to different screen sizes

## Mobile Responsiveness

- Modal is scrollable on small screens
- Image grid adjusts to 2 columns on tablets
- Image grid becomes single column on mobile phones
- Touch-friendly button sizes
- Modal can be closed by tapping outside

## Accessibility Features

- Keyboard navigation support
- Screen reader friendly labels
- Alt text displayed for each image
- Clear visual feedback on hover
- Confirmation before deleting images
- Error handling with user-friendly messages
