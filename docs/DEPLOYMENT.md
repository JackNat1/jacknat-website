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

`contact.html` is a mailto draft. Enterprise ERP inquiries open `erp@jacknat.com`. Residential Smart Living inquiries, including connected-home messages, open `smart.living@jacknat.com`. Nothing on that form is stored by the site.

Residential Smart Living pages, homeowner and builder forms, thank-you pages, and follow-up mail use **smart.living@jacknat.com** only. ERP pages keep **erp@jacknat.com**.

## Campaign forms

Two static forms are registered by Netlify at deploy time:

| Form name | Page | Success URL | Notification and follow-up |
|---|---|---|---|
| `homeowner-consultation` | `/smart-living/` | `/smart-living/thank-you/` | `smart.living@jacknat.com` only |
| `builder-meeting` | `/builder-partners/` | `/builder-partners/thank-you/` | `smart.living@jacknat.com` only |

Each form posts with `netlify-honeypot="bot-field"`. The static HTML includes hidden inputs named `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, and `landing_page` so Netlify's form detection registers them. `js/campaign.js` fills those inputs on load and also writes the same values into the `fetch` body. A visible "How did you hear about us?" field is included.

Attribution rule: `landing_page` is the first page URL (origin, path, and query, including campaign parameters when the first page had them). It is stored even when there is no `utm` or `gclid`, and it is not replaced. `utm_*` and `gclid` are saved when present. A later URL that carries a new `gclid` or `utm` parameter updates those keys and leaves `landing_page` alone. The record is kept in `sessionStorage` and in `localStorage` for 90 days.

On the f7213d3 preview, every attribution field arrived blank. Netlify removes `data-netlify` from the published form after it detects the form. The script only filled and AJAX-submitted forms that still had that attribute, so the browser fell through to a normal POST of the static `value=""`. Netlify still showed the fields, because they were in the HTML, with empty values. `landing_page` was never copied into the request body. The fetch path now selects the forms by `data-conversion-form` and sets the attribution fields on the POST body itself.

With JavaScript, the form is sent with `fetch` as `application/x-www-form-urlencoded` to `/`, including `form-name` and the honeypot field. The submit button is disabled and an in-flight flag is set for that request. A second click does not send another lead. The one-time conversion token is stored only after a 2xx response, and the browser then goes to the thank-you page. A network failure or any non-2xx response shows an inline error, turns the button back on, and leaves every typed field as it was. Without JavaScript, the browser uses the form's normal POST and `action` (the thank-you URL).

Netlify filters every submission with its spam filter (Akismet). Honeypot hits are rejected and do not appear in the submissions list. Spam-flagged tests can sit under Forms → the form → Spam submissions.

### Email notifications (Netlify UI)

The notification recipient cannot be set in this repo. Netlify only allows the email address under site configuration. A hidden `subject` field is set in each form so the message subject is version-controlled. Do not also set a different subject in the UI; the HTML subject wins.

Both forms notify **smart.living@jacknat.com** only. Customer follow-ups for homeowner consultations and builder meetings use that same address. Do not add `erp@jacknat.com` to these two forms. `erp@jacknat.com` stays the address for ERP and enterprise consulting.

For each form, add one email notification:

1. Open https://app.netlify.com/projects/superlative-licorice-54daa4
2. Go to **Forms → Submission notifications → Add notification → Email notification**. (Older nav: **Configuration → Notifications → Form submission notifications**.)
3. Event: new verified form submission. Choose `homeowner-consultation`, then repeat for `builder-meeting`.
4. Email to notify: `smart.living@jacknat.com`
5. Save. Confirm no other address is on either form. Then run the preview check below and confirm the message arrives only at `smart.living@jacknat.com`. Also check spam, and the form's Spam submissions list, because test entries are often flagged.

If form submissions 404, open **Forms → Form detection**, turn detection on, and redeploy.

### Verify a real submission on the deploy preview

Deploy previews for this site ask for a Netlify login. Open the preview while logged in, or run the script from a session that can fetch it. The script checks the pages first. `--submit` posts one labeled TEST lead to each form.

```bash
node tests/verify-netlify-preview.mjs https://deploy-preview-5--superlative-licorice-54daa4.netlify.app
node tests/verify-netlify-preview.mjs https://deploy-preview-5--superlative-licorice-54daa4.netlify.app --submit
```

After `--submit`:

1. In Netlify, open **Forms** for `homeowner-consultation` and `builder-meeting`. Look in Verified submissions and in Spam submissions.
2. Confirm each TEST entry includes the hidden UTM / `gclid` / `landing_page` fields and "How did you hear about us?".
3. Confirm the notification email arrived at `smart.living@jacknat.com` and not at the ERP address.
4. Open each thank-you URL after a real submit. `/smart-living/thank-you/` should fire only `AW-18552161836/STqxCNC2z7AdEKyMro5F`. `/builder-partners/thank-you/` should fire only `AW-18552161836/IMFyCNO2z7AdEKyMro5F`. Confirm the hit was recorded and attributed in Google Ads conversion diagnostics or Tag Assistant. The page callback only shows that the tag fired.

A local `python3 -m http.server` cannot accept these posts. Use the deploy preview for the real Netlify check.

## Google Ads measurement

`js/ads-config.js` sets the Google Ads ID to `AW-18552161836`. The labels are set too:

| Form | Thank-you page | Conversion action | send_to |
|---|---|---|---|
| `homeowner-consultation` | `/smart-living/thank-you/` | Smart Living - Homeowner Consultation Lead | `AW-18552161836/STqxCNC2z7AdEKyMro5F` |
| `builder-meeting` | `/builder-partners/thank-you/` | Smart Living - Builder Partner Meeting Lead | `AW-18552161836/IMFyCNO2z7AdEKyMro5F` |

`js/campaign.js` loads `gtag/js` once per page and sends `gtag('config', 'AW-18552161836')` so Tag Assistant can detect the tag. Each thank-you page then sends only its own label, once per accepted submission, with that submission's token as `transaction_id`. The homeowner page does not send the builder label, and the builder page does not send the homeowner label.

After a 2xx form response, the page stores one token with state `pending`, then opens the thank-you page. The consultation event is sent only from `/smart-living/thank-you/` for `homeowner-consultation`. `/builder-partners/thank-you/` sends only the builder meeting conversion.

The event is `gtag('event', 'conversion', { send_to, transaction_id, event_callback })`. `transaction_id` is that submission's token. `event_callback` moves the token to `completed` and removes `pending`. A callback that already completed does not fire again on reload or back navigation. If the callback has not run within about 2 seconds, or `gtag` throws, the token stays `pending` so a later thank-you visit can retry. Google dedupes those retries with `transaction_id`. Nothing is written to storage before the callback except the original `pending` record from the successful form post.

The browser callback only shows that the tag fired. Whether Google Ads recorded the conversion and attributed it has to be checked in Google Ads conversion diagnostics or Tag Assistant.

No conversion value is sent. Enhanced conversions and GA4 are not installed.

Thank-you pages use `noindex, nofollow` and a matching `X-Robots-Tag` header. They are not linked from the header or footer.

## Local preview

From the repository root:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/`. Netlify will not accept form posts on that server. Use a deploy preview to test submissions.

## Launch checklist

Do these in order. Leave the Google Ads campaign **Paused** until conversion tracking is active and a test conversion has been confirmed.

- [ ] Test submissions received for `homeowner-consultation` and `builder-meeting` (Verified or reviewed out of Spam).
- [ ] Both forms notify `smart.living@jacknat.com` only. Customer follow-ups use that address. ERP mail stays on `erp@jacknat.com`.
- [ ] Conversion ID `AW-18552161836` and both labels are set. The thank-you callback only shows the tag fired. On the deploy preview and again on production, confirm each action was recorded and attributed in Google Ads conversion diagnostics or Tag Assistant: homeowner `AW-18552161836/STqxCNC2z7AdEKyMro5F`, builder `AW-18552161836/IMFyCNO2z7AdEKyMro5F`. A completed token does not fire again on reload.
- [ ] Award wording "2026 Homearama Best Use of Technology Award Winner" is confirmed, and the privacy page is approved.
- [ ] This pull request is merged, and production `https://jacknat.com/smart-living/`, `/builder-partners/`, `/privacy/`, and both thank-you URLs are checked.
- [ ] Google Ads stays **Paused** until the conversion above is active and tested. Then it can be enabled in Google Ads. This repo does not turn the campaign on.

Phase 2, not required to launch: ProjectOps webhook, project photos, the Homearama case study, and the builder overview PDF. The form body already includes the tracking fields for a later outgoing webhook (**Forms → Submission notifications → Outgoing webhook**).
