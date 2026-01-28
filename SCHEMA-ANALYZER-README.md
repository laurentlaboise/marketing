# Schema Structure Analyzer

## Overview

The Schema Structure Analyzer is a comprehensive tool that analyzes schema.org structured data (JSON-LD) across all HTML pages in the website. It provides detailed insights into schema markup usage, coverage, and recommendations for improvement.

## Features

- 🔍 **Automatic Discovery**: Finds and analyzes all HTML files in the repository
- 📊 **Comprehensive Analysis**: Extracts and parses all JSON-LD schema markup
- 📈 **Coverage Metrics**: Calculates schema coverage across the site
- 🏷️ **Type Detection**: Identifies all schema.org types used
- ✅ **Validation**: Checks for schema best practices
- 📝 **Detailed Reporting**: Generates a comprehensive markdown report
- ⚠️ **Error Detection**: Identifies parsing errors and issues

## Usage

### Running the Analyzer

You can run the schema analyzer in two ways:

#### Option 1: Using npm script (Recommended)
```bash
npm run analyze-schema
```

#### Option 2: Direct execution
```bash
node analyze-schema.js
```

### Output

The analyzer generates a detailed report file: `schema-analysis-report.md`

The report includes:
- Executive summary with key metrics
- Schema types summary table
- Detailed analysis of each page
- List of pages without schema
- Recommendations and best practices
- Validation warnings
- Errors encountered

### Console Output

When running, you'll see:
- Progress indicator
- Summary statistics
- Coverage percentage
- List of recommendations
- Path to the generated report

## Report Sections

### 1. Executive Summary
- Total pages analyzed
- Pages with/without schema
- Schema coverage percentage
- Unique schema types count

### 2. Schema Types Summary
A table showing each schema.org type found and on how many pages it appears.

### 3. Detailed Page Analysis
For each page with schema markup:
- Number of schema objects
- Schema types present
- Full JSON-LD content

### 4. Pages Without Schema
Complete list of pages that don't have any schema markup.

### 5. Recommendations
Best practice suggestions based on the analysis:
- Missing essential schema types
- Pages that should have specific schemas
- SEO improvement opportunities

### 6. Schema Best Practices
Guide to recommended schema types for different page types:
- Homepage
- About/Company pages
- Service pages
- Article/Blog pages
- Contact pages
- Product pages
- FAQ pages

## Understanding the Results

### Schema Coverage
- **Good**: 80%+ coverage indicates most pages have schema
- **Fair**: 50-80% coverage suggests room for improvement
- **Poor**: <50% coverage means significant optimization opportunity

### Common Schema Types

#### Essential for All Sites
- **Organization**: Your business identity
- **LocalBusiness**: For local SEO (if applicable)
- **BreadcrumbList**: Site navigation structure
- **WebSite**: Website identity and search action

#### Content Pages
- **Article**: Blog posts and articles
- **FAQPage**: FAQ sections
- **WebPage**: General pages

#### Business Pages
- **Service**: Service offerings
- **Product**: Products with pricing
- **Offer**: Special offers and deals
- **Review**: Customer reviews
- **AggregateRating**: Overall ratings

## Schema Best Practices

### 1. Organization Schema
Every site should have Organization schema on the homepage and key pages:
```json
{
  "@type": "Organization",
  "name": "Your Company",
  "url": "https://yoursite.com",
  "logo": "https://yoursite.com/logo.png"
}
```

### 2. LocalBusiness Schema
For businesses with physical locations:
```json
{
  "@type": "LocalBusiness",
  "name": "Your Business",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "City",
    "postalCode": "12345",
    "addressCountry": "US"
  }
}
```

### 3. BreadcrumbList Schema
Helps search engines understand site structure:
```json
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://yoursite.com"
    }
  ]
}
```

## Validation Tools

After implementing schema markup, validate it using:

1. **Google Rich Results Test**
   - URL: https://search.google.com/test/rich-results
   - Tests if your markup is eligible for rich results

2. **Schema.org Validator**
   - URL: https://validator.schema.org/
   - Validates schema.org markup syntax

3. **Google Search Console**
   - URL: https://search.google.com/search-console
   - Shows how Google sees your structured data

## Benefits of Schema Markup

1. **🔍 Improved Search Visibility**
   - Rich snippets in search results
   - Enhanced SERP appearance
   - Higher click-through rates

2. **📍 Better Local SEO**
   - LocalBusiness schema improves local search
   - Shows business hours, location, contact info
   - Helps with Google Maps integration

3. **🎯 Enhanced User Experience**
   - Provides context to search engines
   - Helps users find relevant information quickly
   - Improves content categorization

4. **🗣️ Voice Search Optimization**
   - Structured data helps voice assistants
   - Better featured snippet opportunities
   - Improved answer extraction

5. **📊 Knowledge Graph Integration**
   - Helps Google understand your business
   - Can appear in knowledge panels
   - Builds brand authority

## Troubleshooting

### Common Issues

1. **Parsing Errors**
   - Check for HTML comments inside JSON-LD scripts
   - Validate JSON syntax
   - Ensure proper escaping of special characters

2. **Missing Schema**
   - Add schema to important pages first (homepage, services, about)
   - Use a template approach for consistent markup
   - Consider page type when choosing schema types

3. **Incomplete Schema**
   - Fill in all required properties
   - Add optional but beneficial properties
   - Link related schemas using @id and references

## Maintenance

Run the analyzer regularly:
- ✅ After adding new pages
- ✅ When updating existing pages
- ✅ Before major site updates
- ✅ Monthly for ongoing optimization

## Technical Details

### Files Analyzed
- All `.html` files in the repository
- Excludes: `node_modules`, `.git`, `public` directories

### Schema Extraction
- Searches for `<script type="application/ld+json">` tags
- Parses JSON-LD content
- Handles both single schemas and @graph arrays
- Recursively identifies all schema types

### Error Handling
- Continues analysis even if individual files fail
- Reports all errors in the final report
- Provides context for debugging

## Support

For issues or questions about the schema analyzer:
1. Check the generated report for specific issues
2. Review the Schema Best Practices section
3. Consult the validation tools listed above
4. Refer to schema.org documentation: https://schema.org/

## License

This tool is part of the marketing website project and follows the same license.
