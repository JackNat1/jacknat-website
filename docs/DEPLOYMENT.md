# Deployment

jacknat.com is a static site on Netlify. There is no framework and no build step. This file describes the setup that was already in production, then the form and measurement pieces added for the homeowner campaign.

## Production

| Item | Value |
|---|---|
| Host | Netlify |
| Site | `superlative-licorice-54daa4` |
| Production URL | https://jacknat.com |
| www | `https://www.jacknat.com` redirects to the apex |
| Netlify project | https://app.netlify.com/projects/superlative-licorice-54daa4 |
| Repository | https://github.com/JackNat1/jacknat-website |
| Production branch | `main` |
| Deploy previews | Enabled. Pull requests publish to `https://deploy-preview-{number}--superlative-licorice-54daa4.netlify.app` |
| Framework | None. Plain HTML, CSS, and JavaScript. No `package.json`. |
| Build command | None in the repo. The public site API reports empty `build_settings`. The current production deploy (commit `c767b2e`, 2026-09-17) finished in about 4 seconds and reported a static file publish: no functions, no redirects, and no header rules. |
| Publish directory | Repository root. `index.html`, `css/`, `js/`, and `images/` are served from `/`. |
| `netlify.toml` before this change | Not present. Netlify published the repo root by default. |

`netlify.toml` now sets `publish = "."` so that directory is explicit. It does not set a build `command`, so it does not add a build step or override a command that exists only in the Netlify UI.

The README still includes older GoDaddy upload steps. Those are not how this site is deployed. Pushing `main` is what updates production. Do not merge campaign work until the preview has been checked.

## Existing forms and analytics

Before this change the site had no analytics snippet and no Netlify Forms.

`contact.html` is a mailto draft. Choosing an interest opens the visitor's mail app to `erp@jacknat.com` (enterprise, business and home, or other) or `smart.living@jacknat.com` (connected home). Nothing on that form is stored by the site. Those two addresses are the only inboxes referenced in the repo. `jack@jacknat.com` does not appear in the existing pages.

## Campaign forms

Two static forms are registered by Netlify at deploy time:

| Form name | Page | Success URL |
|---|---|---|
| `homeowner-consultation` | `/smart-living/` | `/smart-living/thank-you/` |
| `builder-meeting` | `/builder-partners/` | `/builder-partners/thank-you/` |

Each form posts with `data-netlify="true"` and `netlify-honeypot="bot-field"`. Hidden fields `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, and `landing_page` are filled from the URL on the first page of the visit and kept for the session (`sessionStorage` plus a first-party session cookie named `jacknat_lead`). A visible "How did you hear about us?" field is included. `js/campaign.js`, loaded with `js/ads-config.js` on every page, does that capture.

Netlify filters every submission with its spam filter (Akismet). Honeypot hits are rejected and do not appear in the submissions list. Spam-flagged tests can sit under Forms → the form → Spam submissions.

### Email notifications (Netlify UI)

The notification recipient cannot be set in this repo. Netlify only allows the email address under site configuration. A hidden `subject` field is set in each form so the message subject is version-controlled. Do not also set a different subject in the UI; the HTML subject wins.

For each form, add one email notification:

1. Open https://app.netlify.com/projects/superlative-licorice-54daa4
2. Go to **Forms → Submission notifications → Add notification → Email notification**. (Older nav: **Configuration → Notifications → Form submission notifications**.)
3. Event: new verified form submission. Choose `homeowner-consultation`, then repeat for `builder-meeting`.
4. Email to notify: `jack@jacknat.com`
5. Save, then submit a tagged test on a deploy preview and confirm the message arrives. Also check spam, and the form's Spam submissions list, because test entries are often flagged.

If form submissions 404, open **Forms → Form detection**, turn detection on, and redeploy.

There is no ProjectOps URL, webhook, or inbox integration in this repo. The form body already includes the hidden tracking fields and "How did you hear about us?" so a notification email or a later outgoing webhook can carry them. Adding that webhook is a Netlify UI step once the destination exists: **Forms → Submission notifications → Add notification → Outgoing webhook**.

## Google Ads measurement

`js/ads-config.js` holds the conversion ID and the two conversion labels. They ship as named placeholders (`AW-REPLACE_ME`, `REPLACE_ME`). `js/campaign.js` loads gtag once per page only when the ID matches a real `AW-` number. It does not load Google's script while the placeholder is in place.

The consultation conversion event is sent only from `/smart-living/thank-you/` after a `homeowner-consultation` submit, and only once for that submission (a `sessionStorage` token blocks reloads and direct visits). `/builder-partners/thank-you/` does not send the consultation conversion. It sends a builder conversion only after a `builder-meeting` submit and only when that form's own label has been replaced.

No conversion value is sent. Enhanced conversions and GA4 are not installed.

Thank-you pages use `noindex, nofollow` and a matching `X-Robots-Tag` header. They are not linked from the header or footer.

## Local preview

From the repository root:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/`. Netlify will not accept form posts on that server. Use a deploy preview to test submissions.
