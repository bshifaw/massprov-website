# MassProv Website

Hugo static site for MassProv, using a custom theme in `massprov-hugo/themes/massprov`.

## Structure
- `massprov-hugo/` – Hugo project (content, layouts, static assets, config).
- `massprov-hugo/themes/massprov/` – custom theme (templates, CSS, images).
- Key pages: Home (`layouts/index.html`), Contact (`layouts/page/contact.html`), Calendar (`layouts/page/calendar.html`), Submit Event (`layouts/_default/submit-event.html`), About (`content/about/`), Posts (`content/posts/`).

## Design tokens
- Palette: Navy `#1D2A39`, Teal `#2E6B73`, Terracotta `#C55A3A`, Ochre `#D29A3A`, Sand `#F1E6C5`.
- Typography: Headings use DM Sans; body uses Public Sans (see `static/css/main.css`).
- Cards use soft shadows and rounded radii; background uses subtle radial gradients.

## Forms (Google Forms)
- Inline forms post to Google Forms endpoints. If you edit the Google Form and IDs change, open “Get pre-filled link” in Google Forms to copy the current `entry.*` names, then update the Hugo templates (`layouts/page/contact.html`, `layouts/_default/submit-event.html`).
- Contact form action: `https://docs.google.com/forms/u/0/d/e/1FAIpQLScs6MR174VH7H2PvKi8HgEngw4LfTYf6wG3SWT8fUWQboqJag/formResponse`
- Submit event form action: `https://docs.google.com/forms/u/0/d/e/1FAIpQLScvhS_ZFt9PyWyBwYdmuc09NyPAomYMxY2XSVTV8MPm_PDH6w/formResponse`

## Config
- Production base URL should be `https://www.massprov.org/` (set in `massprov-hugo/config.toml`).
- Navigation, metadata, and branding assets are configured in `config.toml` and the theme layout files.
