# JackNat Consulting — Marketing Site

Static multi-page marketing website for **JackNat Consulting, LLC**.

**Site root:** this folder (`/workspace/jacknat/site/` locally). Upload its contents to your web root on GoDaddy.

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Home — dual-practice positioning, how we work, differentiators |
| `enterprise.html` | Enterprise ERP & business technology |
| `connected-home.html` | Residential smart living + **4-level integration** visual |
| `services.html` | Full service catalog (residential + enterprise highlights) |
| `about.html` | Company / experience / dual-practice story |
| `contact.html` | Phone, address, hours, mailto-based contact form |
| `css/styles.css` | Shared styles |
| `js/main.js` | Mobile nav toggle |

## Local preview

Open `index.html` in a browser, or from this directory:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Deploy to GoDaddy (File Manager)

1. Log in to [GoDaddy](https://www.godaddy.com/) → **My Products** → your hosting for **jacknat.com**.
2. Open **Web Hosting** → **File Manager** (or cPanel **File Manager**).
3. Navigate to the site document root (often `public_html` or `httpdocs`).
4. **Back up** any existing files you may want to keep (download a zip first).
5. Upload **all files and folders** from this `site/` directory:
   - HTML files at the root of `public_html`
   - `css/` and `js/` folders intact (preserve relative paths)
6. Confirm `index.html` loads at `https://jacknat.com/`.
7. Spot-check `/enterprise.html`, `/connected-home.html`, `/contact.html`, and mobile nav.

### Optional: replace via ZIP

1. Zip the *contents* of `site/` (not the parent folder name).
2. Upload the ZIP into `public_html`.
3. Extract in File Manager, then delete the ZIP.

## Deploy to GoDaddy (FTP / SFTP)

1. In GoDaddy hosting, find **FTP credentials** (hostname, username, password; SFTP preferred if available).
2. Connect with FileZilla, Cyberduck, or `lftp`.
3. Remote path: usually `/` or `/public_html`.
4. Upload the **contents** of this `site/` folder so that `index.html` lands in the web root.

Example with `lftp`:

```bash
lftp -u YOUR_FTP_USER,YOUR_FTP_PASSWORD ftp.YOUR_HOST.godaddy.com
cd public_html
mirror -R /path/to/jacknat/site .
bye
```

## Post-deploy checklist

- [ ] Confirm contact emails still match your inboxes (see below).
- [ ] Optionally replace the mailto form with Formspree (or similar) and update `contact.html`.
- [ ] Confirm phone `tel:+16577479755` and address are correct.
- [ ] Test on phone + desktop; check mobile menu.
- [ ] If using HTTPS already on GoDaddy, no further SSL steps for this static site.

## Contact emails

| Practice | Address | Where used |
|----------|---------|------------|
| Enterprise ERP & business technology | `erp@jacknat.com` | Enterprise page, contact dual labels, form when interest = Enterprise / Both / Other |
| Residential smart living | `smart.living@jacknat.com` | Connected Home page, contact dual labels, form when interest = Connected Home |

Home, About, Contact, and Services footers show **both** addresses labeled. Enterprise vs Connected Home footers/CTAs use the practice-specific address.

## Content TODOs

- **Contact form backend:** Currently client-side mailto only—no server processing. Wire Formspree or GoDaddy’s form tools if you need inbox delivery without a mail client.
- No client logos, testimonials, or metrics were invented per brief.

## Design notes

- Palette: deep navy / charcoal with teal accent.
- Text wordmark: **JackNat** / Consulting (no separate logo asset).
- Integration levels (Connected Home): SVG pyramid + four detailed level cards (L1–L4).
- Enterprise parallel: Operate → Optimize → Architect → Lead.

## License / ownership

Content and site files are for JackNat Consulting, LLC. Do not invent clients or case studies when extending the site.
