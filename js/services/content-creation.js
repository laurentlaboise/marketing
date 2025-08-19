      <script>
           document.addEventListener('DOMContentLoaded', () => {
            // --- Back to Top button logic ---
            const backToTopButton = document.querySelector('.back-to-top');
            if (backToTopButton) {
                window.addEventListener('scroll', () => {
                    backToTopButton.classList.toggle('show', window.scrollY > 300);
                });
            }

            // --- On-scroll reveal animations ---
            const revealObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) entry.target.classList.add('visible');
                });
            }, {
                threshold: 0.1
            });
            document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

           

            // --- SLIDE-IN PANEL LOGIC ---
            const slideInPanel = document.getElementById('details-slide-in');
            const overlay = document.getElementById('details-overlay');
            const closeBtn = document.getElementById('slide-in-close');
            const learnMoreBtns = document.querySelectorAll('.btn-learn-more');
            const slideInTitle = document.getElementById('slide-in-title');
            const slideInImage = document.getElementById('slide-in-image');
            const slideInContent = document.getElementById('slide-in-content');

            const serviceDetails = {
                copywriting: {
                    title: 'Website Copywriting',
                    img: 'https://placehold.co/800x400/1f85c9/ffffff?text=Copywriting',
                    content: `
                        <section class="service-section section-alt">
                            <div class="container">
                                <div class="section-header">
                                    <center>
                                        <div class="heading-accent-line"></div>
                                    </center>
                                    <h2>Website Copywriting That Captivates, Converts & Builds Your Brand</h2>
                                    <p class="service-description" style="font-size: var(--font-size-lg);">We don’t just write words — we craft strategic stories designed to engage visitors, inspire trust, and drive action.</p>
                                </div>
                                <div class="feature-visual" style="margin-bottom: var(--spacing-2xl);">
                                    <iframe width="100%" height="400" src="https://www.youtube.com/embed/ysz5S6PUM-U" title="Discover Our Website Copywriting Approach" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: var(--border-radius-lg);"></iframe>
                                </div>
                                <center>
                                    <div class="heading-accent-line"></div>
                                </center>
                                <div class="service-grid">
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">SEO-Driven Strategy</h3>
                                        <p class="service-description">Every word we write is optimized for search engines without sacrificing readability — ensuring your pages rank and resonate.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Consistent Brand Voice</h3>
                                        <p class="service-description">From your homepage to your FAQs, we maintain a seamless, recognizable tone that reinforces your brand identity.</p>
                                    </div>
                                </div>
                                <div class="feature-content" style="margin-top: var(--spacing-3xl);">
                                    <h2 class="service-title">What’s Included in Our Copywriting Service</h2>
                                    <ul>
                                        <li>SEO keyword integration to boost visibility on Google & Bing.</li>
                                        <li>A/B testing for headlines, calls-to-action, and value propositions.</li>
                                        <li>Story-driven copy to emotionally connect with your audience.</li>
                                        <li>Flexible packages — from one landing page to full enterprise websites.</li>
                                        <li>Ongoing optimization and performance monitoring.</li>
                                    </ul>
                                </div>
                            </div>
                        </section>`
                },
                blogging: {
                    title: 'Blog & Article Writing',
                    img: 'https://placehold.co/800x400/d62b83/ffffff?text=Blogging',
                    content: `
                        <section class="service-section section-alt">
                            <div class="container">
                                <div class="section-header">
                                    <center>
                                        <div class="heading-accent-line"></div>
                                    </center>
                                    <h2>Website Copywriting That Captivates, Converts & Builds Your Brand</h2>
                                    <p class="service-description" style="font-size: var(--font-size-lg);">We don’t just write words — we craft strategic stories designed to engage visitors, inspire trust, and drive action.</p>
                                </div>
                                <div class="feature-visual" style="margin-bottom: var(--spacing-2xl);">
                                    <iframe width="100%" height="400" src="https://www.youtube.com/embed/ysz5S6PUM-U" title="Discover Our Website Copywriting Approach" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: var(--border-radius-lg);"></iframe>
                                </div>
                                <center>
                                    <div class="heading-accent-line"></div>
                                </center>
                                <div class="service-grid">
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">SEO-Driven Strategy</h3>
                                        <p class="service-description">Every word we write is optimized for search engines without sacrificing readability — ensuring your pages rank and resonate.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Consistent Brand Voice</h3>
                                        <p class="service-description">From your homepage to your FAQs, we maintain a seamless, recognizable tone that reinforces your brand identity.</p>
                                    </div>
                                </div>
                                <div class="feature-content" style="margin-top: var(--spacing-3xl);">
                                    <h2 class="service-title">What’s Included in Our Copywriting Service</h2>
                                    <ul>
                                        <li>SEO keyword integration to boost visibility on Google & Bing.</li>
                                        <li>A/B testing for headlines, calls-to-action, and value propositions.</li>
                                        <li>Story-driven copy to emotionally connect with your audience.</li>
                                        <li>Flexible packages — from one landing page to full enterprise websites.</li>
                                        <li>Ongoing optimization and performance monitoring.</li>
                                    </ul>
                                </div>
                            </div>
                        </section>`
                },
                rss: {
                    title: 'RSS Feed Setup',
                    img: 'https://placehold.co/800x400/64748b/ffffff?text=RSS',
                    content: `
                        <section class="service-section section-alt">
                            <div class="container">
                                <div class="section-header">
                                    <center>
                                        <div class="heading-accent-line"></div>
                                    </center>
                                    <h2>Website Copywriting That Captivates, Converts & Builds Your Brand</h2>
                                    <p class="service-description" style="font-size: var(--font-size-lg);">We don’t just write words — we craft strategic stories designed to engage visitors, inspire trust, and drive action.</p>
                                </div>
                                <div class="feature-visual" style="margin-bottom: var(--spacing-2xl);">
                                    <iframe width="100%" height="400" src="https://www.youtube.com/embed/ysz5S6PUM-U" title="Discover Our Website Copywriting Approach" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: var(--border-radius-lg);"></iframe>
                                </div>
                                <center>
                                    <div class="heading-accent-line"></div>
                                </center>
                                <div class="service-grid">
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">SEO-Driven Strategy</h3>
                                        <p class="service-description">Every word we write is optimized for search engines without sacrificing readability — ensuring your pages rank and resonate.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Consistent Brand Voice</h3>
                                        <p class="service-description">From your homepage to your FAQs, we maintain a seamless, recognizable tone that reinforces your brand identity.</p>
                                    </div>
                                </div>
                                <div class="feature-content" style="margin-top: var(--spacing-3xl);">
                                    <h2 class="service-title">What’s Included in Our Copywriting Service</h2>
                                    <ul>
                                        <li>SEO keyword integration to boost visibility on Google & Bing.</li>
                                        <li>A/B testing for headlines, calls-to-action, and value propositions.</li>
                                        <li>Story-driven copy to emotionally connect with your audience.</li>
                                        <li>Flexible packages — from one landing page to full enterprise websites.</li>
                                        <li>Ongoing optimization and performance monitoring.</li>
                                    </ul>
                                </div>
                            </div>
                        </section>`
                },
                translation: {
                    title: 'Translation & Localization',
                    img: 'https://placehold.co/800x400/154266/ffffff?text=Translation',
                    content: `
                        <section class="service-section section-alt">
                            <div class="container">
                                <div class="section-header">
                                    <center>
                                        <div class="heading-accent-line"></div>
                                    </center>
                                    <h2>Website Copywriting That Captivates, Converts & Builds Your Brand</h2>
                                    <p class="service-description" style="font-size: var(--font-size-lg);">We don’t just write words — we craft strategic stories designed to engage visitors, inspire trust, and drive action.</p>
                                </div>
                                <div class="feature-visual" style="margin-bottom: var(--spacing-2xl);">
                                    <iframe width="100%" height="400" src="https://www.youtube.com/embed/ysz5S6PUM-U" title="Discover Our Website Copywriting Approach" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: var(--border-radius-lg);"></iframe>
                                </div>
                                <center>
                                    <div class="heading-accent-line"></div>
                                </center>
                                <div class="service-grid">
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">SEO-Driven Strategy</h3>
                                        <p class="service-description">Every word we write is optimized for search engines without sacrificing readability — ensuring your pages rank and resonate.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Consistent Brand Voice</h3>
                                        <p class="service-description">From your homepage to your FAQs, we maintain a seamless, recognizable tone that reinforces your brand identity.</p>
                                    </div>
                                </div>
                                <div class="feature-content" style="margin-top: var(--spacing-3xl);">
                                    <h2 class="service-title">What’s Included in Our Copywriting Service</h2>
                                    <ul>
                                        <li>SEO keyword integration to boost visibility on Google & Bing.</li>
                                        <li>A/B testing for headlines, calls-to-action, and value propositions.</li>
                                        <li>Story-driven copy to emotionally connect with your audience.</li>
                                        <li>Flexible packages — from one landing page to full enterprise websites.</li>
                                        <li>Ongoing optimization and performance monitoring.</li>
                                    </ul>
                                </div>
                            </div>
                        </section>`
                },
                logo: {
                    title: 'Logo Design Services',
                    img: 'https://placehold.co/800x400/185a8d/ffffff?text=Logo+Design',
                    content: `
                        <section class="service-section section-alt">
                            <div class="container">
                                <div class="section-header">
                                    <center>
                                        <div class="heading-accent-line"></div>
                                    </center>
                                    <h2>Website Copywriting That Captivates, Converts & Builds Your Brand</h2>
                                    <p class="service-description" style="font-size: var(--font-size-lg);">We don’t just write words — we craft strategic stories designed to engage visitors, inspire trust, and drive action.</p>
                                </div>
                                <div class="feature-visual" style="margin-bottom: var(--spacing-2xl);">
                                    <iframe width="100%" height="400" src="https://www.youtube.com/embed/ysz5S6PUM-U" title="Discover Our Website Copywriting Approach" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: var(--border-radius-lg);"></iframe>
                                </div>
                                <center>
                                    <div class="heading-accent-line"></div>
                                </center>
                                <div class="service-grid">
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">SEO-Driven Strategy</h3>
                                        <p class="service-description">Every word we write is optimized for search engines without sacrificing readability — ensuring your pages rank and resonate.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Consistent Brand Voice</h3>
                                        <p class="service-description">From your homepage to your FAQs, we maintain a seamless, recognizable tone that reinforces your brand identity.</p>
                                    </div>
                                </div>
                                <div class="feature-content" style="margin-top: var(--spacing-3xl);">
                                    <h2 class="service-title">What’s Included in Our Copywriting Service</h2>
                                    <ul>
                                        <li>SEO keyword integration to boost visibility on Google & Bing.</li>
                                        <li>A/B testing for headlines, calls-to-action, and value propositions.</li>
                                        <li>Story-driven copy to emotionally connect with your audience.</li>
                                        <li>Flexible packages — from one landing page to full enterprise websites.</li>
                                        <li>Ongoing optimization and performance monitoring.</li>
                                    </ul>
                                </div>
                            </div>
                        </section>`
                },
                banner: {
                    title: 'Digital Banner Design',
                    img: 'https://placehold.co/800x400/4b9edb/ffffff?text=Banners',
                    content: `
                        <section class="service-section section-alt">
                            <div class="container">
                                <div class="section-header">
                                    <center>
                                        <div class="heading-accent-line"></div>
                                    </center>
                                    <h2>Website Copywriting That Captivates, Converts & Builds Your Brand</h2>
                                    <p class="service-description" style="font-size: var(--font-size-lg);">We don’t just write words — we craft strategic stories designed to engage visitors, inspire trust, and drive action.</p>
                                </div>
                                <div class="feature-visual" style="margin-bottom: var(--spacing-2xl);">
                                    <iframe width="100%" height="400" src="https://www.youtube.com/embed/ysz5S6PUM-U" title="Discover Our Website Copywriting Approach" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: var(--border-radius-lg);"></iframe>
                                </div>
                                <center>
                                    <div class="heading-accent-line"></div>
                                </center>
                                <div class="service-grid">
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">SEO-Driven Strategy</h3>
                                        <p class="service-description">Every word we write is optimized for search engines without sacrificing readability — ensuring your pages rank and resonate.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Consistent Brand Voice</h3>
                                        <p class="service-description">From your homepage to your FAQs, we maintain a seamless, recognizable tone that reinforces your brand identity.</p>
                                    </div>
                                </div>
                                <div class="feature-content" style="margin-top: var(--spacing-3xl);">
                                    <h2 class="service-title">What’s Included in Our Copywriting Service</h2>
                                    <ul>
                                        <li>SEO keyword integration to boost visibility on Google & Bing.</li>
                                        <li>A/B testing for headlines, calls-to-action, and value propositions.</li>
                                        <li>Story-driven copy to emotionally connect with your audience.</li>
                                        <li>Flexible packages — from one landing page to full enterprise websites.</li>
                                        <li>Ongoing optimization and performance monitoring.</li>
                                    </ul>
                                </div>
                            </div>
                        </section>`
                },
                photo: {
                    title: 'Photography Services',
                    img: 'https://placehold.co/800x400/a3cce8/122a3f?text=Photography',
                    content: `
                        <section class="service-section section-alt">
                            <div class="container">
                                <div class="section-header">
                                    <center>
                                        <div class="heading-accent-line"></div>
                                    </center>
                                    <h2>Website Copywriting That Captivates, Converts & Builds Your Brand</h2>
                                    <p class="service-description" style="font-size: var(--font-size-lg);">We don’t just write words — we craft strategic stories designed to engage visitors, inspire trust, and drive action.</p>
                                </div>
                                <div class="feature-visual" style="margin-bottom: var(--spacing-2xl);">
                                    <iframe width="100%" height="400" src="https://www.youtube.com/embed/ysz5S6PUM-U" title="Discover Our Website Copywriting Approach" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: var(--border-radius-lg);"></iframe>
                                </div>
                                <center>
                                    <div class="heading-accent-line"></div>
                                </center>
                                <div class="service-grid">
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">SEO-Driven Strategy</h3>
                                        <p class="service-description">Every word we write is optimized for search engines without sacrificing readability — ensuring your pages rank and resonate.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Consistent Brand Voice</h3>
                                        <p class="service-description">From your homepage to your FAQs, we maintain a seamless, recognizable tone that reinforces your brand identity.</p>
                                    </div>
                                </div>
                                <div class="feature-content" style="margin-top: var(--spacing-3xl);">
                                    <h2 class="service-title">What’s Included in Our Copywriting Service</h2>
                                    <ul>
                                        <li>SEO keyword integration to boost visibility on Google & Bing.</li>
                                        <li>A/B testing for headlines, calls-to-action, and value propositions.</li>
                                        <li>Story-driven copy to emotionally connect with your audience.</li>
                                        <li>Flexible packages — from one landing page to full enterprise websites.</li>
                                        <li>Ongoing optimization and performance monitoring.</li>
                                    </ul>
                                </div>
                            </div>
                        </section>`
                },
                menu: {
                    title: 'Photography Services',
                    img: 'https://placehold.co/800x400/a3cce8/122a3f?text=Photography',
                    content: `
                        <section class="service-section section-alt">
                            <div class="container">
                                <div class="section-header">
                                    <center>
                                        <div class="heading-accent-line"></div>
                                    </center>
                                    <h2>Website Copywriting That Captivates, Converts & Builds Your Brand</h2>
                                    <p class="service-description" style="font-size: var(--font-size-lg);">We don’t just write words — we craft strategic stories designed to engage visitors, inspire trust, and drive action.</p>
                                </div>
                                <div class="feature-visual" style="margin-bottom: var(--spacing-2xl);">
                                    <iframe width="100%" height="400" src="https://www.youtube.com/embed/ysz5S6PUM-U" title="Discover Our Website Copywriting Approach" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: var(--border-radius-lg);"></iframe>
                                </div>
                                <center>
                                    <div class="heading-accent-line"></div>
                                </center>
                                <div class="service-grid">
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">SEO-Driven Strategy</h3>
                                        <p class="service-description">Every word we write is optimized for search engines without sacrificing readability — ensuring your pages rank and resonate.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Consistent Brand Voice</h3>
                                        <p class="service-description">From your homepage to your FAQs, we maintain a seamless, recognizable tone that reinforces your brand identity.</p>
                                    </div>
                                </div>
                                <div class="feature-content" style="margin-top: var(--spacing-3xl);">
                                    <h2 class="service-title">What’s Included in Our Copywriting Service</h2>
                                    <ul>
                                        <li>SEO keyword integration to boost visibility on Google & Bing.</li>
                                        <li>A/B testing for headlines, calls-to-action, and value propositions.</li>
                                        <li>Story-driven copy to emotionally connect with your audience.</li>
                                        <li>Flexible packages — from one landing page to full enterprise websites.</li>
                                        <li>Ongoing optimization and performance monitoring.</li>
                                    </ul>
                                </div>
                            </div>
                        </section>`
                },
                car: {
                    title: 'Custom Digital Tools',
                    img: 'https://placehold.co/800x400/122a3f/ffffff?text=Digital+Tools',
                    content: `
                        <section class="service-section section-alt">
                            <div class="container">
                                <div class="section-header">
                                    <center>
                                        <div class="heading-accent-line"></div>
                                    </center>
                                    <h2>Website Copywriting That Captivates, Converts & Builds Your Brand</h2>
                                    <p class="service-description" style="font-size: var(--font-size-lg);">We don’t just write words — we craft strategic stories designed to engage visitors, inspire trust, and drive action.</p>
                                </div>
                                <div class="feature-visual" style="margin-bottom: var(--spacing-2xl);">
                                    <iframe width="100%" height="400" src="https://www.youtube.com/embed/ysz5S6PUM-U" title="Discover Our Website Copywriting Approach" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: var(--border-radius-lg);"></iframe>
                                </div>
                                <center>
                                    <div class="heading-accent-line"></div>
                                </center>
                                <div class="service-grid">
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">SEO-Driven Strategy</h3>
                                        <p class="service-description">Every word we write is optimized for search engines without sacrificing readability — ensuring your pages rank and resonate.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Conversion-Optimized Headlines</h3>
                                        <p class="service-description">We use A/B testing to refine your headlines, calls-to-action, and key messaging for maximum engagement and sales.</p>
                                    </div>
                                    <div class="service-card">
                                        <div class="icon kinetic-rotate"><i class="fas fa-pen-nib"></i></div>
                                        <h3 class="service-title">Consistent Brand Voice</h3>
                                        <p class="service-description">From your homepage to your FAQs, we maintain a seamless, recognizable tone that reinforces your brand identity.</p>
                                    </div>
                                </div>
                                <div class="feature-content" style="margin-top: var(--spacing-3xl);">
                                    <h2 class="service-title">What’s Included in Our Copywriting Service</h2>
                                    <ul>
                                        <li>SEO keyword integration to boost visibility on Google & Bing.</li>
                                        <li>A/B testing for headlines, calls-to-action, and value propositions.</li>
                                        <li>Story-driven copy to emotionally connect with your audience.</li>
                                        <li>Flexible packages — from one landing page to full enterprise websites.</li>
                                        <li>Ongoing optimization and performance monitoring.</li>
                                    </ul>
                                </div>
                            </div>
                        </section>`
                }
            };

            function openPanel(serviceKey) {
                const details = serviceDetails[serviceKey];
                if (!details) return;
                slideInTitle.textContent = details.title;
                slideInImage.src = details.img;
                slideInImage.alt = details.title + ' detail image';
                slideInContent.innerHTML = details.content;
                document.body.classList.add('no-scroll');
                overlay.classList.add('is-open');
                slideInPanel.classList.add('is-open');
            }

            function closePanel() {
                document.body.classList.remove('no-scroll');
                overlay.classList.remove('is-open');
                slideInPanel.classList.remove('is-open');
            }

            learnMoreBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const serviceKey = btn.dataset.service;
                    openPanel(serviceKey);
                });
            });

            closeBtn.addEventListener('click', closePanel);
            overlay.addEventListener('click', closePanel);

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && slideInPanel.classList.contains('is-open')) {
                    closePanel();
                }
            });

      
        });
    </script>
