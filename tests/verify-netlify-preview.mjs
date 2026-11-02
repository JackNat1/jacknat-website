#!/usr/bin/env node
/**
 * Check the Google Ads landing pages on a Netlify deploy preview, and
 * optionally post one TEST lead to each form.
 *
 * The preview often returns 401 until you are logged into Netlify. A 401
 * here means this environment cannot see the HTML or the form inbox.
 *
 * Usage:
 *   node tests/verify-netlify-preview.mjs https://deploy-preview-5--superlative-licorice-54daa4.netlify.app
 *   node tests/verify-netlify-preview.mjs https://deploy-preview-5--....netlify.app --submit
 *
 * --submit posts application/x-www-form-urlencoded to / with form-name and
 * the honeypot field. After a 2xx, confirm the entry in Netlify Forms
 * (Verified and Spam) and that the only notification is smart.living@jacknat.com.
 * Do not treat a 2xx as proof the inbox received it.
 */

const preview = (process.argv[2] || "").replace(/\/$/, "");
const submit = process.argv.includes("--submit");

if (!preview.startsWith("http")) {
  console.error("Pass the deploy preview origin as the first argument.");
  process.exit(1);
}

const pages = [
  "/smart-living/",
  "/smart-living/thank-you/",
  "/builder-partners/",
  "/builder-partners/thank-you/",
  "/privacy/",
  "/enterprise.html",
  "/contact.html"
];

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

async function get(path) {
  const res = await fetch(preview + path, { redirect: "manual" });
  const text = await res.text();
  return { status: res.status, text, location: res.headers.get("location") };
}

const residentialPaths = [
  "/smart-living/",
  "/smart-living/thank-you/",
  "/builder-partners/",
  "/builder-partners/thank-you/"
];

let blocked = false;
for (const path of pages) {
  const res = await get(path);
  if (res.status === 401 || (res.text && res.text.includes("edge-access"))) {
    blocked = true;
    console.log("BLOCKED", res.status, path, "Netlify login required");
    continue;
  }
  if (res.status !== 200) {
    fail(path + " status " + res.status);
    continue;
  }
  console.log("OK", res.status, path);
  if (res.text.includes("googletagmanager.com/gtag/js")) {
    fail(path + " pastes a raw gtag snippet; the shared loader should inject it");
  }
  if (residentialPaths.includes(path)) {
    if (!res.text.includes("mailto:smart.living@jacknat.com")) {
      fail(path + " is missing mailto:smart.living@jacknat.com");
    }
    if (res.text.includes("jack@jacknat.com") || res.text.includes("erp@jacknat.com")) {
      fail(path + " shows an address other than smart.living@jacknat.com");
    }
  }
}

const config = await get("/js/ads-config.js");
if (!blocked && config.status === 200) {
  if (!config.text.includes('googleAdsId: "AW-18552161836"')) {
    fail("ads-config.js is missing AW-18552161836");
  } else if (!config.text.includes('homeownerConsultation: "STqxCNC2z7AdEKyMro5F"') || !config.text.includes('builderMeeting: "IMFyCNO2z7AdEKyMro5F"')) {
    fail("ads-config.js is missing a conversion label");
  } else {
    console.log("OK ads-config.js has AW-18552161836 and both conversion labels");
  }
}

const homeowner = await get("/smart-living/");
if (!blocked && homeowner.status === 200) {
  const html = homeowner.text;
  if (!html.includes('method="POST"') || !html.includes('action="/smart-living/thank-you/"')) {
    fail("homeowner form is missing the no-JS POST action");
  }
  if (!html.includes('name="form-name"') || !html.includes('name="bot-field"')) {
    fail("homeowner form is missing form-name or honeypot");
  }
}

if (blocked) {
  console.log("Stop. Log into Netlify and open the preview, then rerun this script. Do not submit from an unauthenticated 401.");
  process.exit(process.exitCode || 2);
}

if (!submit) {
  console.log("Page checks finished. Re-run with --submit to post one TEST lead to each form.");
  process.exit(process.exitCode || 0);
}

async function postForm(fields) {
  const body = new URLSearchParams(fields);
  const res = await fetch(preview + "/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  console.log("POST", fields["form-name"], res.status);
  if (res.status < 200 || res.status >= 300) {
    fail(fields["form-name"] + " was not accepted (" + res.status + ")");
  }
  return res.status;
}

await postForm({
  "form-name": "homeowner-consultation",
  "bot-field": "",
  subject: "TEST Smart Living consultation request",
  name: "TEST LEAD homeowner preview",
  email: "smart.living@jacknat.com",
  phone: "000-000-0000",
  address_or_town: "TEST La Grange",
  interests: "Not sure yet. Help me figure it out",
  notes: "TEST submission from tests/verify-netlify-preview.mjs. Not a customer. Please ignore.",
  hear_about: "Other",
  utm_source: "test",
  utm_medium: "preview",
  utm_campaign: "verify-netlify-preview",
  utm_term: "",
  utm_content: "",
  gclid: "TESTGCLID",
  landing_page: preview + "/smart-living/"
});

await postForm({
  "form-name": "builder-meeting",
  "bot-field": "",
  subject: "TEST Builder partner meeting request",
  name: "TEST LEAD builder preview",
  company: "TEST Company",
  email: "smart.living@jacknat.com",
  phone: "000-000-0000",
  notes: "TEST submission from tests/verify-netlify-preview.mjs. Not a partner. Please ignore.",
  hear_about: "Other",
  utm_source: "test",
  utm_medium: "preview",
  utm_campaign: "verify-netlify-preview",
  utm_term: "",
  utm_content: "",
  gclid: "",
  landing_page: preview + "/builder-partners/"
});

console.log("If those POSTs were 2xx, confirm both TEST entries in the Netlify Forms UI and a notification only at smart.living@jacknat.com.");
process.exit(process.exitCode || 0);
