-- Create database
-- Run this command in psql: CREATE DATABASE blog_cms;
-- Then connect to the database: \c blog_cms

-- Create articles table
CREATE TABLE IF NOT EXISTS articles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  sidebar_content TEXT NOT NULL,
  full_article_content TEXT,
  featured_image_url VARCHAR(500),
  categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_published BOOLEAN DEFAULT FALSE,
  time_to_read INTEGER
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(is_published);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update updated_at
CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data (optional - uncomment to insert sample articles)
/*
INSERT INTO articles (title, slug, description, sidebar_content, full_article_content, featured_image_url, categories, is_published)
VALUES
  (
    'Mastering SEO for Small Businesses in Southeast Asia',
    'mastering-seo-southeast-asia',
    'Boost your business online visibility with essential SEO strategies tailored for the Southeast Asian market.',
    '<p>Search Engine Optimization (SEO) is crucial for small businesses looking to compete in the digital marketplace. In Southeast Asia, where mobile usage is dominant and local search is critical, understanding regional SEO strategies can make all the difference.</p><p>This comprehensive guide covers keyword research, local SEO tactics, mobile optimization, and content strategies specifically designed for Southeast Asian markets.</p>',
    '<p>Search Engine Optimization (SEO) is crucial for small businesses looking to compete in the digital marketplace. In Southeast Asia, where mobile usage is dominant and local search is critical, understanding regional SEO strategies can make all the difference.</p><p>This comprehensive guide covers keyword research, local SEO tactics, mobile optimization, and content strategies specifically designed for Southeast Asian markets.</p>',
    'https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a',
    ARRAY['SEO', 'Marketing Strategy', 'Local SEO'],
    TRUE
  ),
  (
    'Social Media: From Likes to Leads',
    'social-media-likes-to-leads',
    'Transform your social media presence into a lead generation machine with proven strategies.',
    '<p>Social media isn''t just about getting likes anymore - it''s about converting engagement into real business leads. Learn how to create compelling content that drives conversions.</p><p>We''ll cover platform-specific strategies, content calendars, engagement techniques, and lead capture methods that work.</p>',
    '<p>Social media isn''t just about getting likes anymore - it''s about converting engagement into real business leads. Learn how to create compelling content that drives conversions.</p><p>We''ll cover platform-specific strategies, content calendars, engagement techniques, and lead capture methods that work.</p>',
    'https://images.unsplash.com/photo-1611162617474-5b21e879e113',
    ARRAY['Social Media', 'Lead Generation', 'Marketing Strategy'],
    TRUE
  ),
  (
    'E-commerce for Beginners: How to Set Up an Online Store',
    'ecommerce-beginners-online-store',
    'Step-by-step guide to launching your first online store, from platform selection to your first sale.',
    '<p>Starting an e-commerce business can feel overwhelming, but with the right approach, anyone can launch a successful online store. This guide walks you through every step of the process.</p><p>Learn about choosing the right platform, setting up payment gateways, optimizing product pages, and marketing your store effectively.</p>',
    '<p>Starting an e-commerce business can feel overwhelming, but with the right approach, anyone can launch a successful online store. This guide walks you through every step of the process.</p><p>Learn about choosing the right platform, setting up payment gateways, optimizing product pages, and marketing your store effectively.</p>',
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d',
    ARRAY['E-commerce', 'Web Development', 'Marketing Strategy'],
    TRUE
  ),
  (
    'WordPress SEO: The Ultimate Guide for Beginners',
    'wordpress-seo-guide-beginners',
    'Master WordPress SEO with this comprehensive guide covering plugins, optimization techniques, and best practices.',
    '<p>WordPress powers over 40% of websites, but many site owners don''t take full advantage of its SEO capabilities. This guide will help you optimize your WordPress site for search engines.</p><p>Discover the best SEO plugins, how to optimize your content, improve site speed, and implement technical SEO best practices.</p>',
    '<p>WordPress powers over 40% of websites, but many site owners don''t take full advantage of its SEO capabilities. This guide will help you optimize your WordPress site for search engines.</p><p>Discover the best SEO plugins, how to optimize your content, improve site speed, and implement technical SEO best practices.</p>',
    'https://images.unsplash.com/photo-1504691342899-4d92b50853e1',
    ARRAY['SEO', 'Web Development', 'Content Strategy'],
    TRUE
  );
*/
