MassProv Website Rebuild Plan

Current state (repo review)
- Hugo site using the Ananke starter theme (`massprov-hugo/`), with pages for Home, About, Calendar (Google Calendar + Google Form embed), Contact (Google Form), and two resource posts (practice spaces, theater list).
- Branding, layout, and typography are minimal; colors default to Ananke (`bg-black`) with little imagery and no custom favicon. New logo assets added in `/images/massprov.logo.png` and `/images/massprove_small_logo.png` (not yet wired into the theme).
- Content architecture is flat: landing page has no hero narrative, CTAs, or resource highlights; posts are simple Markdown lists.
- Base URL in config still set to `https://example.org/` (needs `https://www.massprov.org/` for production URLs).

Goals to hit
- Warm, welcoming, high-end feel that invites Greater Boston improvisers to join/participate.
- Clear pathways to: learn what MassProv is, see upcoming events, submit events, browse helpful articles/resources, and contact/join the community.
- Primary CTA: drive to a contact form that handles both questions and “add me to the WhatsApp group.”
- Mobile-first responsive experience with strong accessibility, performant static delivery, and easy content editing via Hugo/GitHub Pages + custom domain (`www.massprov.org`).

Recommended approach
- Stay on Hugo but replace Ananke with a custom theme tailored to MassProv (keeps static-site simplicity and existing content structure).
- Visual direction: warm palette (amber/coral + deep navy/charcoal accents), soft gradients, friendly serif/sans pairing for a modern “arts nonprofit” vibe; generous whitespace, rounded cards, subtle shadows. Use logo assets in header/footer and social previews.
- Content patterns: hero with bold CTA to the contact form, short mission copy, “What we do” tiles, upcoming events preview, featured articles, community testimonials/pull quotes, and clear “Submit an event / Join us” buttons.
- Keep Google Calendar embed for now; build a styled inline submission form for events (can still POST to Google Form backend) to improve visual integration.
- No photos planned (privacy), so lean on illustration shapes, gradients, and typography; optional abstract pattern background.

Information architecture (pages/sections)
- Home: hero (mission + CTA to contact form/WhatsApp request), highlights of programs/resources, 3-card “Upcoming events” preview (link to full calendar), featured article, testimonial/values band, secondary CTA (submit event).
- About: origin story, mission/values, who we serve, simple leadership/volunteer spotlight, and links to get involved.
- Articles/Resources: category tags (e.g., Practice Spaces, Theaters, Getting Started), featured resources at top, pagination for posts.
- Calendar: styled intro, Google Calendar embed, primary CTA to “Submit an event” via inline form (backed by existing Google Form), notes on what to submit and SLA/expectations.
- Contact: inline form (questions + “add me to WhatsApp”), optional mailing list link, general inbox, and accessibility statement.
- Global: top nav, footer with contact + WhatsApp linkage, favicon/logo, SEO metadata and social sharing defaults.

Implementation plan
- Create a new custom Hugo theme (or heavily customize a fork) with reusable partials for hero, CTA bands, cards, and section layouts; define theme params for colors, typography, and CTAs.
- Update `config.toml`: baseURL `https://www.massprov.org/`, brand metadata, favicon/logo paths, nav labels/order, social links, default images, Open Graph/Twitter metadata, and pagination settings.
- Define a design token file (CSS variables) for palette, typography scale, spacing, and radii; add utility classes for gradients/shadows/cards; include accent gradient option.
- Build page templates: `layouts/index.html`, `layouts/_default/list.html` (articles), `layouts/_default/single.html`, `layouts/page/calendar.html`, `layouts/page/contact.html`, and reusable partials for hero/sections/cards; wire logo into header/footer and meta images.
- Content refresh: rewrite landing copy (mission, value props), add 1–2 featured testimonials/quotes, clean up posts (headings/links), and ensure alt text/meta descriptions; add inline contact and event submission forms (POST to existing Google Forms endpoints).
- Performance/accessibility: semantic HTML, ARIA labels on embeds/buttons, color contrast checks, responsive breakpoints, lazy-loaded images, minified assets.
- Forms UX: map inline fields to Google Form entry IDs, include success/error states, privacy note that submissions go to Google Forms; add simple anti-spam (honeypot/time check).
- SEO/metadata: set favicon/manifest, generate social preview image using logo/gradient, add robots.txt/sitemap (Hugo auto) and 404 page; update page-level meta descriptions.
- QA & deployment: local Hugo build, responsive spot-check (mobile/desktop), verify embeds and nav, then deploy via GitHub Pages (custom domain already set); check cache headers/asset minification.

Open questions for you (remaining)
- Please confirm the Google Form endpoints/field IDs for the contact form and the event submission form so I can wire the inline forms correctly (can grab from your existing forms if you share links).

Palette + type recommendation (to match logo)
- Navy: #1D2A39 (anchors brand text/buttons; matches logo text)
- Deep teal: #2E6B73 (pulls from center figure)
- Terracotta: #C55A3A (matches right figure)
- Golden ochre: #D29A3A (matches left figure)
- Warm sand: #F1E6C5 (triangle backdrop; great for subtle background panels)
- Accent gradient: linear-gradient(135deg, #2E6B73 0%, #C55A3A 50%, #D29A3A 100%)
- Typography: Heading—"DM Sans" or "Manrope" (friendly geometric), Body—"Source Sans 3" or "Public Sans"; for a softer artsy feel, pair "Fraunces" (display) with "Inter" (body) but avoid default stacks.

Forms plan (constraints noted)
- Keep Google Form backend (free) but build inline forms styled to the site. We can either:
  - Direct-submit to the Google Form endpoint (recommended: least friction, retains free tier).
  - Or, optionally add a small third-party form endpoint later if you choose (currently no subscription, so we’ll stick with Google Form submission).
