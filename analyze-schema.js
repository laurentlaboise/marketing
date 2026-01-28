#!/usr/bin/env node

/**
 * Schema Structure Analyzer
 * Analyzes schema.org structured data (JSON-LD) across all HTML pages
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const SITE_ROOT = __dirname;
const REPORT_FILE = path.join(SITE_ROOT, 'schema-analysis-report.md');

// Results storage
const results = {
  totalPages: 0,
  pagesWithSchema: 0,
  pagesWithoutSchema: [],
  schemaByPage: {},
  schemaTypesSummary: {},
  errors: [],
  warnings: []
};

/**
 * Find all HTML files in the repository
 */
function findAllHtmlFiles() {
  try {
    const output = execSync(
      'find . -name "*.html" -type f ! -path "./node_modules/*" ! -path "./.git/*" ! -path "./public/*"',
      { cwd: SITE_ROOT, encoding: 'utf-8' }
    );
    return output.trim().split('\n').filter(f => f);
  } catch (error) {
    console.error('Error finding HTML files:', error.message);
    return [];
  }
}

/**
 * Extract JSON-LD schema from HTML content
 */
function extractSchemaFromHtml(htmlContent, filePath) {
  const schemas = [];
  
  // Match all script tags with type="application/ld+json"
  const jsonLdRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  
  while ((match = jsonLdRegex.exec(htmlContent)) !== null) {
    try {
      const jsonContent = match[1].trim();
      if (jsonContent) {
        const parsed = JSON.parse(jsonContent);
        schemas.push(parsed);
      }
    } catch (error) {
      results.errors.push({
        file: filePath,
        error: `Failed to parse JSON-LD: ${error.message}`,
        content: match[1].substring(0, 100) + '...'
      });
    }
  }
  
  return schemas;
}

/**
 * Get schema types from a parsed schema object
 */
function getSchemaTypes(schema, types = new Set()) {
  if (!schema) return types;
  
  if (schema['@type']) {
    if (Array.isArray(schema['@type'])) {
      schema['@type'].forEach(t => types.add(t));
    } else {
      types.add(schema['@type']);
    }
  }
  
  // Handle @graph array (multiple schemas in one)
  if (schema['@graph'] && Array.isArray(schema['@graph'])) {
    schema['@graph'].forEach(item => getSchemaTypes(item, types));
  }
  
  // Recursively check nested objects
  Object.keys(schema).forEach(key => {
    if (typeof schema[key] === 'object' && schema[key] !== null) {
      if (Array.isArray(schema[key])) {
        schema[key].forEach(item => {
          if (typeof item === 'object') {
            getSchemaTypes(item, types);
          }
        });
      } else {
        getSchemaTypes(schema[key], types);
      }
    }
  });
  
  return types;
}

/**
 * Analyze a single HTML file
 */
function analyzeHtmlFile(filePath) {
  const fullPath = path.join(SITE_ROOT, filePath);
  
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const schemas = extractSchemaFromHtml(content, filePath);
    
    results.totalPages++;
    
    if (schemas.length > 0) {
      results.pagesWithSchema++;
      
      const allTypes = new Set();
      schemas.forEach(schema => {
        getSchemaTypes(schema, allTypes);
      });
      
      results.schemaByPage[filePath] = {
        schemaCount: schemas.length,
        types: Array.from(allTypes),
        schemas: schemas
      };
      
      // Update summary
      allTypes.forEach(type => {
        results.schemaTypesSummary[type] = (results.schemaTypesSummary[type] || 0) + 1;
      });
    } else {
      results.pagesWithoutSchema.push(filePath);
    }
  } catch (error) {
    results.errors.push({
      file: filePath,
      error: `Failed to read/analyze file: ${error.message}`
    });
  }
}

/**
 * Validate schema best practices
 */
function validateSchemas() {
  const warnings = [];
  
  // Check for essential Organization schema
  const hasOrganization = Object.keys(results.schemaByPage).some(page => 
    results.schemaByPage[page].types.includes('Organization')
  );
  
  if (!hasOrganization) {
    warnings.push('⚠️  No Organization schema found on any page. Consider adding it to establish your business identity.');
  }
  
  // Check for LocalBusiness on homepage
  const homepageFiles = Object.keys(results.schemaByPage).filter(f => 
    f.includes('index.html') && !f.includes('backup')
  );
  
  const homeHasLocalBusiness = homepageFiles.some(page =>
    results.schemaByPage[page].types.includes('LocalBusiness')
  );
  
  if (!homeHasLocalBusiness && homepageFiles.length > 0) {
    warnings.push('ℹ️  Consider adding LocalBusiness schema to homepage for better local SEO.');
  }
  
  // Check for BreadcrumbList
  const hasBreadcrumbs = Object.keys(results.schemaByPage).some(page =>
    results.schemaByPage[page].types.includes('BreadcrumbList')
  );
  
  if (!hasBreadcrumbs) {
    warnings.push('ℹ️  No BreadcrumbList schema found. Breadcrumbs help search engines understand site structure.');
  }
  
  results.warnings = warnings;
}

/**
 * Generate markdown report
 */
function generateReport() {
  let report = `# Schema Structure Analysis Report\n\n`;
  report += `**Generated:** ${new Date().toLocaleString()}\n\n`;
  
  // Executive Summary
  report += `## Executive Summary\n\n`;
  report += `- **Total Pages Analyzed:** ${results.totalPages}\n`;
  report += `- **Pages with Schema:** ${results.pagesWithSchema}\n`;
  report += `- **Pages without Schema:** ${results.pagesWithoutSchema.length}\n`;
  report += `- **Schema Coverage:** ${((results.pagesWithSchema / results.totalPages) * 100).toFixed(1)}%\n`;
  report += `- **Unique Schema Types Found:** ${Object.keys(results.schemaTypesSummary).length}\n\n`;
  
  // Schema Types Summary
  report += `## Schema Types Summary\n\n`;
  report += `This section shows which schema.org types are used across the site:\n\n`;
  report += `| Schema Type | Page Count |\n`;
  report += `|-------------|------------|\n`;
  
  const sortedTypes = Object.entries(results.schemaTypesSummary)
    .sort((a, b) => b[1] - a[1]);
  
  sortedTypes.forEach(([type, count]) => {
    report += `| ${type} | ${count} |\n`;
  });
  report += `\n`;
  
  // Detailed Page Analysis
  report += `## Detailed Page Analysis\n\n`;
  
  const sortedPages = Object.keys(results.schemaByPage).sort();
  
  sortedPages.forEach(page => {
    const pageData = results.schemaByPage[page];
    report += `### ${page}\n\n`;
    report += `- **Schema Objects:** ${pageData.schemaCount}\n`;
    report += `- **Schema Types:** ${pageData.types.join(', ')}\n`;
    
    // Show schema structure
    report += `\n**Schema Details:**\n\n`;
    pageData.schemas.forEach((schema, idx) => {
      report += `\`\`\`json\n`;
      report += JSON.stringify(schema, null, 2);
      report += `\n\`\`\`\n\n`;
    });
  });
  
  // Pages Without Schema
  if (results.pagesWithoutSchema.length > 0) {
    report += `## Pages Without Schema\n\n`;
    report += `The following pages do not have any schema.org markup:\n\n`;
    results.pagesWithoutSchema.forEach(page => {
      report += `- ${page}\n`;
    });
    report += `\n`;
  }
  
  // Warnings and Recommendations
  if (results.warnings.length > 0) {
    report += `## Recommendations\n\n`;
    results.warnings.forEach(warning => {
      report += `${warning}\n\n`;
    });
  }
  
  // Errors
  if (results.errors.length > 0) {
    report += `## Errors Encountered\n\n`;
    results.errors.forEach(error => {
      report += `**File:** ${error.file}\n`;
      report += `**Error:** ${error.error}\n\n`;
    });
  }
  
  // Best Practices
  report += `## Schema Best Practices\n\n`;
  report += `### Recommended Schema Types by Page Type\n\n`;
  report += `- **Homepage:** Organization, LocalBusiness, WebSite, BreadcrumbList\n`;
  report += `- **About/Company Pages:** Organization, LocalBusiness, BreadcrumbList\n`;
  report += `- **Service Pages:** Service, Offer, BreadcrumbList\n`;
  report += `- **Article/Blog Pages:** Article, BreadcrumbList, Person (author)\n`;
  report += `- **Contact Pages:** Organization, ContactPoint, BreadcrumbList\n`;
  report += `- **Product Pages:** Product, Offer, AggregateRating, Review\n`;
  report += `- **FAQ Pages:** FAQPage\n\n`;
  
  report += `### Key Benefits of Schema Markup\n\n`;
  report += `1. **Improved Search Visibility:** Rich snippets in search results\n`;
  report += `2. **Better CTR:** Enhanced listings attract more clicks\n`;
  report += `3. **Local SEO:** LocalBusiness schema helps with local searches\n`;
  report += `4. **Voice Search:** Structured data helps voice assistants\n`;
  report += `5. **Knowledge Graph:** Helps Google understand your business\n\n`;
  
  report += `### Validation Tools\n\n`;
  report += `- [Google Rich Results Test](https://search.google.com/test/rich-results)\n`;
  report += `- [Schema.org Validator](https://validator.schema.org/)\n`;
  report += `- [Google Search Console](https://search.google.com/search-console)\n\n`;
  
  return report;
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Starting schema structure analysis...\n');
  
  // Find all HTML files
  console.log('📂 Finding HTML files...');
  const htmlFiles = findAllHtmlFiles();
  console.log(`   Found ${htmlFiles.length} HTML files\n`);
  
  // Analyze each file
  console.log('🔬 Analyzing schema markup...');
  htmlFiles.forEach((file, idx) => {
    if ((idx + 1) % 10 === 0) {
      process.stdout.write(`   Processed ${idx + 1}/${htmlFiles.length} files...\r`);
    }
    analyzeHtmlFile(file);
  });
  console.log(`   Processed ${htmlFiles.length}/${htmlFiles.length} files ✓\n`);
  
  // Validate schemas
  console.log('✅ Validating schema best practices...\n');
  validateSchemas();
  
  // Generate report
  console.log('📝 Generating report...');
  const report = generateReport();
  fs.writeFileSync(REPORT_FILE, report);
  console.log(`   Report saved to: ${REPORT_FILE}\n`);
  
  // Print summary
  console.log('📊 Analysis Complete!\n');
  console.log('Summary:');
  console.log(`  - Total Pages: ${results.totalPages}`);
  console.log(`  - Pages with Schema: ${results.pagesWithSchema}`);
  console.log(`  - Pages without Schema: ${results.pagesWithoutSchema.length}`);
  console.log(`  - Schema Coverage: ${((results.pagesWithSchema / results.totalPages) * 100).toFixed(1)}%`);
  console.log(`  - Unique Schema Types: ${Object.keys(results.schemaTypesSummary).length}\n`);
  
  if (results.warnings.length > 0) {
    console.log('⚠️  Recommendations:');
    results.warnings.forEach(w => console.log(`  ${w}`));
    console.log('');
  }
  
  if (results.errors.length > 0) {
    console.log(`❌ Errors: ${results.errors.length} errors encountered (see report for details)\n`);
  }
  
  console.log(`📄 Full report: ${REPORT_FILE}\n`);
}

// Run the analysis
if (require.main === module) {
  main();
}

module.exports = { analyzeHtmlFile, extractSchemaFromHtml, getSchemaTypes };
