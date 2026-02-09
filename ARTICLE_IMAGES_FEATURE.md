# Article Images Feature

## Overview
This feature allows users to add multiple images from the application's image library to articles via the article edit form.

## Changes Made

### 1. Database Changes
- **File**: `wts-admin/database/db.js`
- Added new column `article_images` (JSONB type) to the `articles` table
- Stores array of image objects with CDN URL and ID
- Default value: empty array `[]`

### 2. Backend Changes

#### Content Routes (`wts-admin/src/routes/content.js`)
- Updated article creation endpoint to handle `article_images` field
- Updated article update endpoint to handle `article_images` field
- Parses JSON string to array before storing in database

#### Images Routes (`wts-admin/src/routes/images.js`)
- Added new API endpoint: `GET /images/api/list`
- Returns paginated list of images in JSON format
- Supports search and category filtering
- Used by the image selector modal

### 3. Frontend Changes

#### Article Form (`wts-admin/src/views/content/articles/form.ejs`)

**New UI Components:**
1. **Article Images Section** - Added below the "Article Code" field
   - Label: "Article Images"
   - Help text: "Add images from the library to this article"
   - "Add Article Image" button (styled like other secondary buttons)
   - Hidden input field to store JSON data
   - Container to display selected images

2. **Image Selector Modal**
   - Modal overlay with centered content
   - Search input field
   - Category filter dropdown
   - Grid view of available images (4 columns)
   - Pagination controls
   - Click to select functionality

**JavaScript Functions:**
- `openImageSelector()` - Opens the modal and loads images
- `closeImageSelector()` - Closes the modal
- `searchImages()` - Performs search/filter
- `loadImages(page)` - Fetches images via API
- `selectImage(image)` - Adds selected image to article
- `removeArticleImage(index)` - Removes image from article
- `renderArticleImages()` - Updates the display of selected images
- `updateArticleImagesField()` - Updates hidden form field

**CSS Styling:**
- Modal styles matching the application theme
- Grid layout for image selection
- Image cards with hover effects
- Selected article images display with thumbnails
- Remove button for each selected image

## Data Structure

### article_images (JSONB Array)
```json
[
  {
    "id": "uuid-of-image",
    "cdn_url": "https://cdn.jsdelivr.net/gh/...",
    "filename": "image-name.webp",
    "alt_text": "Alternative text for the image"
  }
]
```

## User Flow

1. User opens article edit form at `/content/articles/:id/edit`
2. User scrolls to "Article Images" section below "Article Code"
3. User clicks "Add Article Image" button
4. Image selector modal opens with all available images
5. User can search/filter images by category
6. User clicks on an image to select it
7. Modal closes and selected image appears in the article images list
8. User can add multiple images by repeating the process
9. User can remove any image by clicking the trash icon
10. When form is submitted, all selected images are saved with the article

## Location in Application

- **URL**: `https://admin.wordsthatsells.website/content/articles/[article-id]/edit`
- **Section**: Below "Article Code" textarea
- **Button Text**: "Add Article Image"
- **Button Style**: Secondary button (gray) with plus icon

## Technical Notes

- Images are stored as JSONB in PostgreSQL for efficient querying
- The modal fetches images from the existing image library
- No duplicate images allowed in the same article
- Images maintain their CDN URLs and IDs for consistent reference
- The feature integrates seamlessly with the existing image management system
