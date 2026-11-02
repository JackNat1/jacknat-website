// Local browser checks for the campaign forms and conversion states.
// Requires puppeteer-core and Chrome, plus a static server at http://127.0.0.1:8080.
//   node tests/campaign-browser-check.js
const puppeteer = require("puppeteer-core");

const BASE = "http://127.0.0.1:8080";
const errors = [];
function fail(msg) { errors.push(msg); console.error("FAIL", msg); }
function ok(msg) { console.log("OK", msg); }

async function launch() {
  return puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
}

async function prepareForm(page) {
  await page.goto(BASE + "/smart-living/", { waitUntil: "networkidle0" });
  await page.type("#hl-name", "Ada Homeowner");
  await page.type("#hl-email", "ada@example.com");
  await page.type("#hl-phone", "502-555-0100");
  await page.type("#hl-address", "Prospect");
  await page.type("#hl-notes", "Keep this note");
  await page.select("#hl-hear", "Other");
}

(async () => {
  const source = require("fs").readFileSync("/workspace/js/campaign.js", "utf8");
  ["navigator.sendBeacon", "XMLHttpRequest", "__jacknatFetchWrapped", "jacknat_conversion_claimed_"].forEach((needle) => {
    if (source.indexOf(needle) !== -1) fail("campaign.js still contains " + needle);
  });
  if (source.indexOf("transaction_id: token") === -1) fail("conversion event is missing transaction_id");
  const configSource = require("fs").readFileSync("/workspace/js/ads-config.js", "utf8");
  if (configSource.indexOf('googleAdsId: "AW-18552161836"') === -1) fail("ads-config.js is missing AW-18552161836");
  if (configSource.indexOf('homeownerConsultation: "STqxCNC2z7AdEKyMro5F"') === -1) fail("homeowner label missing");
  if (configSource.indexOf('builderMeeting: "IMFyCNO2z7AdEKyMro5F"') === -1) fail("builder label missing");
  if (!errors.length) ok("campaign.js does not wrap fetch, sendBeacon, or XHR");

  const browser = await launch();

  // Rejected submission keeps fields and stays put.
  {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.method() === "POST") req.respond({ status: 500, contentType: "text/plain", body: "no" });
      else req.continue();
    });
    await prepareForm(page);
    await page.click("#homeowner-consultation-form button[type=submit]");
    await page.waitForSelector("[data-form-error]:not([hidden])");
    const state = await page.evaluate(() => ({
      url: location.pathname,
      name: document.querySelector("#hl-name").value,
      email: document.querySelector("#hl-email").value,
      phone: document.querySelector("#hl-phone").value,
      address: document.querySelector("#hl-address").value,
      notes: document.querySelector("#hl-notes").value,
      hear: document.querySelector("#hl-hear").value,
      disabled: document.querySelector("#homeowner-consultation-form button[type=submit]").disabled,
      submitting: document.querySelector("form").getAttribute("data-submitting"),
      pending: sessionStorage.getItem("jacknat_conversion_pending"),
      error: document.querySelector("[data-form-error]").textContent
    }));
    console.log("500", state);
    if (state.url !== "/smart-living/") fail("500 navigated away " + state.url);
    if (state.name !== "Ada Homeowner" || state.notes !== "Keep this note" || state.hear !== "Other") fail("500 cleared fields");
    if (state.disabled) fail("500 left button disabled");
    if (state.submitting) fail("500 left in-flight set");
    if (state.pending) fail("500 stored a conversion token");
    if (!state.error.includes("smart.living@jacknat.com")) fail("500 missing error");
    else ok("non-2xx keeps fields and re-enables the button");
    await page.close();
  }

  // Network failure.
  {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.method() === "POST") req.abort("failed");
      else req.continue();
    });
    await prepareForm(page);
    await page.click("#homeowner-consultation-form button[type=submit]");
    await page.waitForSelector("[data-form-error]:not([hidden])");
    const state = await page.evaluate(() => ({
      url: location.pathname,
      name: document.querySelector("#hl-name").value,
      disabled: document.querySelector("button[type=submit]").disabled,
      pending: sessionStorage.getItem("jacknat_conversion_pending")
    }));
    console.log("network", state);
    if (state.url !== "/smart-living/" || state.name !== "Ada Homeowner" || state.disabled || state.pending) {
      fail("network failure did not keep the form " + JSON.stringify(state));
    } else ok("network failure keeps fields and stays on the form");
    await page.close();
  }

  // One POST for a double click, then redirect and token.
  {
    const page = await browser.newPage();
    let posts = 0;
    const gtagUrls = [];
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.method() === "POST") {
        posts += 1;
        const body = req.postData() || "";
        setTimeout(() => {
          req.respond({ status: 200, contentType: "text/plain", body: "ok" });
        }, 400);
        page.__body = body;
      } else if (req.url().includes("/__saw_conversion")) {
        gtagUrls.push(req.url());
        req.respond({ status: 204, body: "" });
      } else if (req.url().includes("googletagmanager.com/gtag/js")) {
        gtagUrls.push(req.url());
        req.respond({
          status: 200,
          contentType: "application/javascript",
          body: `
            (function () {
              function handle(args) {
                var list = Array.prototype.slice.call(args);
                if (list[0] !== "event" || list[1] !== "conversion") return;
                var params = list[2] || {};
                fetch("/__saw_conversion?send_to=" + encodeURIComponent(params.send_to || "") + "&id=" + encodeURIComponent(params.transaction_id || ""));
                if (params.event_callback) params.event_callback();
              }
              var queued = window.dataLayer ? window.dataLayer.slice() : [];
              window.dataLayer = { push: function (item) { handle(item); } };
              queued.forEach(function (item) { handle(item); });
            })();
          `
        });
      } else req.continue();
    });
    await prepareForm(page);
    await page.evaluate(() => {
      const form = document.querySelector("#homeowner-consultation-form");
      form.requestSubmit();
      form.requestSubmit();
    });
    await page.waitForFunction(() => location.pathname.indexOf("thank-you") !== -1, { timeout: 4000 });
    for (let i = 0; i < 30 && !gtagUrls.some((url) => url.includes("/__saw_conversion")); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    console.log("double posts", posts);
    if (posts !== 1) fail("expected 1 POST, got " + posts);
    else ok("in-flight guard blocked a duplicate lead");
    const homeownerHits = gtagUrls.filter((url) => url.includes("/__saw_conversion"));
    console.log("homeowner hits", homeownerHits);
    if (homeownerHits.length !== 1) fail("homeowner thank-you fired " + homeownerHits.length + " conversions");
    const homeownerHit = new URL(homeownerHits[0]);
    const homeownerId = homeownerHit.searchParams.get("id");
    if (homeownerHit.searchParams.get("send_to") !== "AW-18552161836/STqxCNC2z7AdEKyMro5F") {
      fail("homeowner send_to " + homeownerHit.searchParams.get("send_to"));
    }
    if (homeownerHits[0].includes("IMFyCNO2z7AdEKyMro5F")) fail("homeowner page fired the builder label");
    const homeownerState = await page.evaluate((id) => ({
      pending: sessionStorage.getItem("jacknat_conversion_pending"),
      completed: sessionStorage.getItem("jacknat_conversion_completed_" + id)
    }), homeownerId);
    if (homeownerState.pending) fail("homeowner callback left the token pending");
    if (homeownerState.completed !== "completed") fail("homeowner callback did not complete the token");
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 300));
    if (gtagUrls.filter((url) => url.includes("/__saw_conversion")).length !== 1) {
      fail("completed homeowner token fired again on reload");
    } else ok("homeowner thank-you fires only its label once");
    if (!gtagUrls.some((url) => url.includes("id=AW-18552161836"))) fail("gtag.js was not requested for AW-18552161836");
    await page.close();
  }

  // Builder thank-you fires only the builder label. The other page ignores that token.
  {
    const page = await browser.newPage();
    const seen = [];
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/__saw_conversion")) {
        seen.push(url);
        req.respond({ status: 204, body: "" });
        return;
      }
      if (url.includes("googletagmanager.com/gtag/js")) {
        req.respond({
          status: 200,
          contentType: "application/javascript",
          body: `
            (function () {
              function handle(args) {
                var list = Array.prototype.slice.call(args);
                if (list[0] !== "event" || list[1] !== "conversion") return;
                var params = list[2] || {};
                fetch("/__saw_conversion?send_to=" + encodeURIComponent(params.send_to || "") + "&id=" + encodeURIComponent(params.transaction_id || ""));
                if (params.event_callback) params.event_callback();
              }
              var queued = window.dataLayer ? window.dataLayer.slice() : [];
              window.dataLayer = { push: function (item) { handle(item); } };
              queued.forEach(function (item) { handle(item); });
            })();
          `
        });
        return;
      }
      req.continue();
    });
    await page.goto(BASE + "/smart-living/thank-you/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      sessionStorage.setItem("jacknat_conversion_pending", JSON.stringify({ form: "builder-meeting", token: "builder-on-homeowner", state: "pending" }));
    });
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    if (seen.length) fail("homeowner thank-you fired a builder token: " + seen.join(" "));
    else ok("homeowner thank-you ignores a builder token");

    await page.evaluate(() => {
      sessionStorage.setItem("jacknat_conversion_pending", JSON.stringify({ form: "builder-meeting", token: "builder-token", state: "pending" }));
    });
    await page.goto(BASE + "/builder-partners/thank-you/", { waitUntil: "networkidle0" });
    for (let i = 0; i < 30 && seen.length < 1; i++) await new Promise((r) => setTimeout(r, 100));
    console.log("builder hits", seen);
    if (seen.length !== 1) fail("builder thank-you fired " + seen.length + " conversions");
    const builderHit = new URL(seen[0]);
    if (builderHit.searchParams.get("send_to") !== "AW-18552161836/IMFyCNO2z7AdEKyMro5F") {
      fail("builder send_to " + builderHit.searchParams.get("send_to"));
    }
    if (builderHit.searchParams.get("id") !== "builder-token") fail("builder transaction_id " + builderHit.searchParams.get("id"));
    if (seen[0].includes("STqxCNC2z7AdEKyMro5F")) fail("builder page fired the homeowner label");
    const builderState = await page.evaluate(() => ({
      pending: sessionStorage.getItem("jacknat_conversion_pending"),
      completed: sessionStorage.getItem("jacknat_conversion_completed_builder-token")
    }));
    if (builderState.pending || builderState.completed !== "completed") fail("builder token was not completed once");
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 300));
    if (seen.length !== 1) fail("completed builder token fired again");
    else ok("builder thank-you fires only its label once");
    await page.close();
  }

  // Configured conversion fires once; reload and a second call do not.
  {
    const page = await browser.newPage();
    const hits = [];
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/js/ads-config.js")) {
        req.respond({
          status: 200,
          contentType: "application/javascript",
          body: 'window.JACKNAT_ADS={googleAdsId:"AW-1234567890",labels:{homeownerConsultation:"AbC123xYz",builderMeeting:"REPLACE_ME"}};'
        });
        return;
      }
      if (url.includes("/__saw_conversion")) {
        hits.push(url);
        req.respond({ status: 204, body: "" });
        return;
      }
      if (url.includes("googletagmanager.com/gtag/js")) {
        hits.push("gtag-js");
        req.respond({
          status: 200,
          contentType: "application/javascript",
          body: `
            (function () {
              function handle(args) {
                var list = Array.prototype.slice.call(args);
                if (list[0] !== "event" || list[1] !== "conversion") return;
                var params = list[2] || {};
                fetch("/__saw_conversion?id=" + encodeURIComponent(params.transaction_id || "") + "&send_to=" + encodeURIComponent(params.send_to || ""));
                if (params.event_callback) params.event_callback();
              }
              var queued = window.dataLayer ? window.dataLayer.slice() : [];
              window.dataLayer = { push: function (item) { handle(item); } };
              queued.forEach(function (item) { handle(item); });
            })();
          `
        });
        return;
      }
      if (url.includes("googleadservices.com/pagead/conversion")) {
        hits.push("beacon");
        req.respond({ status: 204, body: "" });
        return;
      }
      req.continue();
    });
    await page.goto(BASE + "/smart-living/thank-you/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      sessionStorage.setItem("jacknat_conversion_pending", JSON.stringify({ form: "homeowner-consultation", token: "once-token" }));
    });
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 500));
    const first = await page.evaluate(() => ({
      pending: sessionStorage.getItem("jacknat_conversion_pending"),
      completed: sessionStorage.getItem("jacknat_conversion_completed_once-token")
    }));
    console.log("first conversion", first, "hits", hits);
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    const conversionHits = hits.filter((h) => h.indexOf("/__saw_conversion") !== -1);
    const second = await page.evaluate(() => sessionStorage.getItem("jacknat_conversion_completed_once-token"));
    console.log("conversion events", conversionHits, "completed", second);
    if (first.completed !== "completed") fail("callback did not mark the token completed");
    if (first.pending) fail("pending token remained after the callback");
    if (conversionHits.length !== 1) fail("completed token fired more than once: " + conversionHits.join(" "));
    if (conversionHits[0].indexOf("id=once-token") === -1 || conversionHits[0].indexOf("AW-1234567890") === -1) {
      fail("conversion missing transaction_id or send_to: " + conversionHits[0]);
    } else ok("callback completes the token once and reload does not fire again");
    await page.close();
  }

  // No callback within 2s leaves pending, and a later visit retries the same transaction_id.
  {
    const page = await browser.newPage();
    let gtagLoads = 0;
    const saw = [];
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/__saw_conversion")) {
        saw.push(url);
        req.respond({ status: 204, body: "" });
        return;
      }
      if (url.includes("/js/ads-config.js")) {
        req.respond({
          status: 200,
          contentType: "application/javascript",
          body: 'window.JACKNAT_ADS={googleAdsId:"AW-1234567890",labels:{homeownerConsultation:"AbC123xYz",builderMeeting:"REPLACE_ME"}};'
        });
        return;
      }
      if (url.includes("googletagmanager.com/gtag/js")) {
        gtagLoads += 1;
        req.respond({
          status: 200,
          contentType: "application/javascript",
          body: `
            (function () {
              function handle(args) {
                var list = Array.prototype.slice.call(args);
                if (list[0] !== "event" || list[1] !== "conversion") return;
                var params = list[2] || {};
                fetch("/__saw_conversion?id=" + encodeURIComponent(params.transaction_id || ""));
              }
              var queued = window.dataLayer ? window.dataLayer.slice() : [];
              window.dataLayer = { push: function (item) { handle(item); } };
              queued.forEach(function (item) { handle(item); });
            })();
          `
        });
        return;
      }
      req.continue();
    });
    await page.goto(BASE + "/smart-living/thank-you/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      sessionStorage.setItem("jacknat_conversion_pending", JSON.stringify({ form: "homeowner-consultation", token: "timeout-token" }));
    });
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 2300));
    const mid = await page.evaluate(() => ({
      pending: sessionStorage.getItem("jacknat_conversion_pending"),
      completed: sessionStorage.getItem("jacknat_conversion_completed_timeout-token")
    }));
    console.log("timeout path", mid, "loads", gtagLoads, "events", saw);
    if (!mid.pending || mid.pending.indexOf("timeout-token") === -1) fail("timeout dropped the pending token");
    if (mid.completed) fail("timeout marked the token completed");
    if (saw.length !== 1) fail("timeout path did not fire the first attempt");
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    console.log("timeout retry events", saw);
    if (saw.length !== 2) fail("later visit did not retry a pending token: " + saw.length);
    if (saw[1].indexOf("id=timeout-token") === -1) fail("retry did not reuse transaction_id");
    else ok("timeout leaves pending and a later visit retries the same transaction_id");
    await page.close();
  }

  // No-JS form still posts to the thank-you action.
  {
    const page = await browser.newPage();
    let postedTo = "";
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.method() === "POST") {
        postedTo = req.url();
        req.respond({ status: 200, contentType: "text/html", body: "<!doctype html><title>posted</title>" });
      } else req.continue();
    });
    await prepareForm(page);
    await page.evaluate(() => { window.fetch = undefined; });
    await page.click("#homeowner-consultation-form button[type=submit]");
    await new Promise((r) => setTimeout(r, 500));
    console.log("no-js post", postedTo);
    if (postedTo.indexOf("/smart-living/thank-you/") === -1) fail("no-JS post did not use the thank-you action: " + postedTo);
    else ok("no-JS fallback posts to the thank-you action");
    await page.close();
  }

  // Existing contact form is still a mailto draft.
  {
    const page = await browser.newPage();
    await page.goto(BASE + "/contact.html", { waitUntil: "networkidle0" });
    const contact = await page.evaluate(() => {
      const form = document.getElementById("contact-form");
      return {
        action: form.getAttribute("action"),
        netlify: form.getAttribute("data-netlify"),
        erp: document.body.innerText.includes("erp@jacknat.com"),
        smart: document.body.innerText.includes("smart.living@jacknat.com")
      };
    });
    console.log("contact", contact);
    if (contact.action !== "mailto:erp@jacknat.com" || contact.netlify) fail("contact form changed");
    else ok("existing contact form is unchanged");
    await page.close();
  }

  await browser.close();
  if (errors.length) {
    console.error("ERRORS", errors.length);
    process.exit(1);
  }
  console.log("ALL PASSED");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
