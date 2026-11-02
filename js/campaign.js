// First-touch lead attribution and Google Ads conversion events.
// Loaded once per page, after js/ads-config.js.
(function () {
  var TRACK_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"];
  var ALL_KEYS = TRACK_KEYS.concat(["landing_page"]);
  var STORAGE_KEY = "jacknat_lead_attribution";
  var DEBUG_KEY = "jacknat_attr_debug";
  var PENDING_KEY = "jacknat_conversion_pending";
  // Keep first-touch landing_page, and any utm/gclid updates, for 90 days.
  var ATTR_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  var FORM_LABELS = {
    "homeowner-consultation": "homeownerConsultation",
    "builder-meeting": "builderMeeting"
  };

  function parseJson(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function pageUrl() {
    // href includes the query. Drop only the hash. Do not rebuild from
    // pathname alone, or a tagged arrival loses ?utm_...&gclid=...
    return String(location.href || "").split("#")[0];
  }

  function parsedSearch() {
    var url;
    var params;
    var values = {};
    var any = false;
    var i, key, value;
    try {
      url = new URL(location.href);
      params = url.searchParams;
    } catch (err) {
      params = new URLSearchParams(location.search || "");
    }
    for (i = 0; i < TRACK_KEYS.length; i++) {
      key = TRACK_KEYS[i];
      value = params.get(key);
      if (value) {
        values[key] = value;
        any = true;
      }
    }
    return { any: any, values: values, href: location.href, search: location.search || "" };
  }

  function freshRecord(raw) {
    var data = parseJson(raw);
    var out = {};
    var i, key;
    if (!data || typeof data.savedAt !== "number") return null;
    if (Date.now() - data.savedAt > ATTR_TTL_MS) return null;
    for (i = 0; i < ALL_KEYS.length; i++) {
      key = ALL_KEYS[i];
      if (typeof data[key] === "string" && data[key]) out[key] = data[key];
    }
    if (!out.landing_page) return null;
    out.savedAt = data.savedAt;
    return out;
  }

  function readStored() {
    var fromSession = null;
    var fromLocal = null;
    try {
      fromSession = freshRecord(sessionStorage.getItem(STORAGE_KEY));
    } catch (err) {}
    try {
      fromLocal = freshRecord(localStorage.getItem(STORAGE_KEY));
    } catch (err) {}
    if (fromSession && fromLocal) {
      return fromSession.savedAt >= fromLocal.savedAt ? fromSession : fromLocal;
    }
    return fromSession || fromLocal;
  }

  function writeStore(data) {
    var json = JSON.stringify(data);
    try {
      sessionStorage.setItem(STORAGE_KEY, json);
    } catch (err) {}
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch (err) {}
  }

  function recordDebug(stage, detail) {
    var entry = { stage: stage, at: Date.now() };
    var key;
    for (key in detail) {
      if (Object.prototype.hasOwnProperty.call(detail, key)) entry[key] = detail[key];
    }
    var log = [];
    try {
      log = parseJson(sessionStorage.getItem(DEBUG_KEY)) || [];
    } catch (err) {
      log = [];
    }
    if (!log || !log.length) log = [];
    log.push(entry);
    if (log.length > 40) log = log.slice(log.length - 40);
    try {
      sessionStorage.setItem(DEBUG_KEY, JSON.stringify(log));
    } catch (err) {}
    window.JACKNAT_ATTR_DEBUG = log;
  }

  // landing_page and utm_*/gclid are first-touch. Once a value is stored it is
  // not replaced, including by a later tagged URL. form_page is not stored here.
  function captureAttribution() {
    var stored = readStored() || {};
    var incoming = parsedSearch();
    var changed = !stored.landing_page;
    var i, key;

    recordDebug("url", {
      href: incoming.href,
      search: incoming.search,
      parsed: incoming.values,
      pageUrl: pageUrl()
    });

    if (!stored.landing_page) stored.landing_page = pageUrl();

    if (incoming.any) {
      for (i = 0; i < TRACK_KEYS.length; i++) {
        key = TRACK_KEYS[i];
        if (stored[key] || !incoming.values[key]) continue;
        stored[key] = incoming.values[key];
        changed = true;
      }
    }

    if (changed || !stored.savedAt) {
      stored.savedAt = Date.now();
      writeStore(stored);
    }
    recordDebug("storage", {
      landing_page: stored.landing_page || "",
      utm_source: stored.utm_source || "",
      utm_medium: stored.utm_medium || "",
      utm_campaign: stored.utm_campaign || "",
      utm_term: stored.utm_term || "",
      utm_content: stored.utm_content || "",
      gclid: stored.gclid || ""
    });
    return stored;
  }

  function campaignForms() {
    return document.querySelectorAll(
      "form[data-conversion-form='homeowner-consultation'], form[data-conversion-form='builder-meeting']"
    );
  }

  function isCampaignForm(form) {
    if (!form || !form.getAttribute) return false;
    var marker = form.getAttribute("data-conversion-form") || form.getAttribute("name") || "";
    return !!FORM_LABELS[marker];
  }

  function setNamed(form, name, value) {
    var input = form.querySelector('input[name="' + name + '"]');
    if (!input) return "";
    input.value = value || "";
    return input.value;
  }

  function fillForms(stored) {
    var forms = campaignForms();
    var here = pageUrl();
    var f, i, key, seen;
    stored = stored || {};
    for (f = 0; f < forms.length; f++) {
      seen = {};
      for (i = 0; i < ALL_KEYS.length; i++) {
        key = ALL_KEYS[i];
        seen[key] = setNamed(forms[f], key, stored[key] || "");
      }
      seen.form_page = setNamed(forms[f], "form_page", here);
      recordDebug("fields", seen);
    }
  }

  function encodeForm(form, stored) {
    var params = new URLSearchParams();
    var data = new FormData(form);
    var skip = { "bot-field": true };
    var honeypot = "";
    var honeypotInput = form.querySelector('input[name="bot-field"]');
    var i, key, raw, parsed;
    stored = stored || {};
    for (i = 0; i < ALL_KEYS.length; i++) skip[ALL_KEYS[i]] = true;
    skip.form_page = true;

    data.forEach(function (value, name) {
      if (skip[name]) return;
      params.append(name, value);
    });
    for (i = 0; i < ALL_KEYS.length; i++) {
      key = ALL_KEYS[i];
      params.set(key, stored[key] || "");
    }
    if (!params.get("landing_page")) params.set("landing_page", pageUrl());
    params.set("form_page", pageUrl());
    honeypot = honeypotInput ? honeypotInput.value : "";
    params.set("bot-field", honeypot);

    raw = params.toString();
    parsed = new URLSearchParams(raw);
    recordDebug("post", {
      landing_page: parsed.get("landing_page") || "",
      form_page: parsed.get("form_page") || "",
      utm_source: parsed.get("utm_source") || "",
      utm_medium: parsed.get("utm_medium") || "",
      utm_campaign: parsed.get("utm_campaign") || "",
      gclid: parsed.get("gclid") || "",
      bot_field: parsed.get("bot-field") || "",
      raw_has_bare_amp_in_landing: /(?:^|&)landing_page=[^&]*&utm_/.test(raw) && raw.indexOf("landing_page=") !== -1 && raw.indexOf("%26") === -1
    });
    return raw;
  }

  function adsSettings() {
    var cfg = window.JACKNAT_ADS || {};
    var labels = cfg.labels || {};
    return {
      googleAdsId: typeof cfg.googleAdsId === "string" ? cfg.googleAdsId.trim() : "",
      labels: {
        homeownerConsultation: typeof labels.homeownerConsultation === "string" ? labels.homeownerConsultation.trim() : "",
        builderMeeting: typeof labels.builderMeeting === "string" ? labels.builderMeeting.trim() : ""
      }
    };
  }

  function isPlaceholder(value) {
    return !value || /replace_me|placeholder|xxxx+/i.test(value);
  }

  function isRealAdsId(id) {
    return /^AW-\d{5,}$/.test(id) && !isPlaceholder(id);
  }

  function labelForForm(formName, settings) {
    var key = FORM_LABELS[formName];
    if (!key) return "";
    return settings.labels[key] || "";
  }

  function loadGtag(googleAdsId) {
    var script;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    if (window.__jacknatGtagLoaded) return;
    window.__jacknatGtagLoaded = true;
    window.gtag("js", new Date());
    window.gtag("config", googleAdsId);
    script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(googleAdsId);
    document.head.appendChild(script);
  }

  function markPending(form) {
    var formName = form.getAttribute("data-conversion-form");
    var token, payload;
    if (!formName || !FORM_LABELS[formName]) return false;
    token = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    payload = JSON.stringify({ form: formName, token: token, state: "pending" });
    try {
      sessionStorage.setItem(PENDING_KEY, payload);
      return true;
    } catch (err) {
      return false;
    }
  }

  function releaseForm(form) {
    form.removeAttribute("data-submitting");
    var button = form.querySelector('[type="submit"]');
    if (button) button.disabled = false;
  }

  function showFormError(form) {
    var errorEl = form.querySelector("[data-form-error]");
    releaseForm(form);
    if (!errorEl) return;
    errorEl.hidden = false;
    errorEl.textContent = "We couldn't send your request. Please try again, or email smart.living@jacknat.com.";
  }

  function hideFormError(form) {
    var errorEl = form.querySelector("[data-form-error]");
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

  function completedKey(token) {
    return "jacknat_conversion_completed_" + token;
  }

  function isCompleted(token) {
    try {
      return sessionStorage.getItem(completedKey(token)) === "completed";
    } catch (err) {
      return false;
    }
  }

  function markCompleted(token) {
    var current;
    try {
      sessionStorage.setItem(completedKey(token), "completed");
      current = parseJson(sessionStorage.getItem(PENDING_KEY));
      if (current && current.token === token) sessionStorage.removeItem(PENDING_KEY);
    } catch (err) {}
  }

  function maybeFireConversion() {
    var expected = document.body ? document.body.getAttribute("data-conversion-form") : "";
    var pending, settings, label, sendTo, token, settled;
    if (!expected) return;
    try {
      pending = parseJson(sessionStorage.getItem(PENDING_KEY));
    } catch (err) {
      pending = null;
    }
    if (!pending || pending.state === "completed" || pending.form !== expected || !pending.token) return;
    if (isCompleted(pending.token)) return;

    // A placeholder label never fires a conversion and never completes the token.
    // The base gtag config is loaded separately when the ID itself is real.
    settings = adsSettings();
    label = labelForForm(expected, settings);
    if (!isRealAdsId(settings.googleAdsId) || isPlaceholder(label)) return;

    // This page load only. Not stored, so a later visit can retry after a timeout.
    if (window.__jacknatConversionInFlight === pending.token) return;
    window.__jacknatConversionInFlight = pending.token;

    sendTo = settings.googleAdsId + "/" + label;
    token = pending.token;
    settled = false;

    function finishInFlight() {
      if (window.__jacknatConversionInFlight === token) window.__jacknatConversionInFlight = "";
    }

    function onDone() {
      if (settled) return;
      settled = true;
      finishInFlight();
      markCompleted(token);
    }

    function onTimeout() {
      if (settled) return;
      settled = true;
      finishInFlight();
      // Leave the pending record in place. transaction_id dedupes a later retry.
    }

    try {
      loadGtag(settings.googleAdsId);
      window.gtag("event", "conversion", {
        send_to: sendTo,
        transaction_id: token,
        event_callback: onDone,
        // Above this page's 2s limit so Google's own timeout does not mark a missed hit completed.
        event_timeout: 2500
      });
    } catch (err) {
      onTimeout();
      return;
    }

    window.setTimeout(onTimeout, 2000);
  }

  function submitForm(form) {
    var stored, body;
    hideFormError(form);
    try {
      stored = captureAttribution();
    } catch (err) {
      stored = { landing_page: pageUrl() };
    }
    if (!stored.landing_page) stored.landing_page = pageUrl();
    fillForms(stored);
    // Write attribution into the POST body itself. Netlify removes
    // data-netlify from the published form, and a body built only from
    // inputs that were never filled submits those fields blank.
    body = encodeForm(form, stored);

    // Netlify registers the AJAX post from the site root when form-name is present.
    // The action attribute remains the no-JS success URL.
    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body
    }).then(function (res) {
      var action;
      if (!res || res.status < 200 || res.status >= 300) throw new Error("rejected");
      markPending(form);
      action = form.getAttribute("action") || "/";
      window.location.assign(action);
    }).catch(function () {
      // Network failure or non-2xx: stay on the form and keep typed values.
      showFormError(form);
    });
  }

  document.addEventListener("submit", function (event) {
    var form = event.target;
    var button;
    if (!isCampaignForm(form)) return;
    // No-JS fallback: without fetch, let the browser POST to the thank-you action.
    if (!window.fetch || !window.FormData || !window.URLSearchParams) return;
    event.preventDefault();
    if (form.getAttribute("data-submitting") === "true") return;
    form.setAttribute("data-submitting", "true");
    button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    submitForm(form);
  });

  function bootAttribution() {
    try {
      fillForms(captureAttribution());
    } catch (err) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAttribution);
  } else {
    bootAttribution();
    document.addEventListener("DOMContentLoaded", bootAttribution);
  }

  if (isRealAdsId(adsSettings().googleAdsId)) {
    loadGtag(adsSettings().googleAdsId);
  }
  maybeFireConversion();
  window.addEventListener("pageshow", function (event) {
    bootAttribution();
    if (event.persisted) maybeFireConversion();
  });
})();
