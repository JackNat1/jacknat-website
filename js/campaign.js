// First-touch lead attribution and Google Ads conversion events.
// Loaded once per page, after js/ads-config.js.
(function () {
  var TRACK_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"];
  var ALL_KEYS = TRACK_KEYS.concat(["landing_page"]);
  var STORAGE_KEY = "jacknat_lead_attribution";
  var COOKIE_NAME = "jacknat_lead";
  var PENDING_KEY = "jacknat_conversion_pending";
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

  function readSession() {
    try {
      return parseJson(sessionStorage.getItem(STORAGE_KEY));
    } catch (err) {
      return null;
    }
  }

  function readCookie() {
    var parts = document.cookie ? document.cookie.split("; ") : [];
    var i, idx, name, value;
    for (i = 0; i < parts.length; i++) {
      idx = parts[i].indexOf("=");
      if (idx === -1) continue;
      name = parts[i].slice(0, idx);
      if (name !== COOKIE_NAME) continue;
      value = parts[i].slice(idx + 1);
      try {
        return parseJson(decodeURIComponent(value));
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  function pickKnown(source) {
    var out = {};
    var i, key;
    if (!source) return out;
    for (i = 0; i < ALL_KEYS.length; i++) {
      key = ALL_KEYS[i];
      if (typeof source[key] === "string" && source[key]) out[key] = source[key];
    }
    return out;
  }

  function writeStore(data) {
    var json = JSON.stringify(data);
    var secure = location.protocol === "https:" ? "; Secure" : "";
    try {
      sessionStorage.setItem(STORAGE_KEY, json);
    } catch (err) {}
    try {
      document.cookie = COOKIE_NAME + "=" + encodeURIComponent(json) + "; Path=/; SameSite=Lax" + secure;
    } catch (err) {}
  }

  function urlHasTracking() {
    var params = new URLSearchParams(location.search);
    var i;
    for (i = 0; i < TRACK_KEYS.length; i++) {
      if (params.get(TRACK_KEYS[i])) return true;
    }
    return false;
  }

  function captureAttribution() {
    var sessionData = pickKnown(readSession());
    var stored, params, i, key, value;

    // Already captured in this tab. Later pages must not overwrite first touch.
    if (sessionData.landing_page) {
      writeStore(sessionData);
      return sessionData;
    }

    // New tab with no ad parameters: restore the session cookie if this browser
    // session already recorded a landing. A URL that carries tracking starts fresh.
    if (!urlHasTracking()) {
      stored = pickKnown(readCookie());
      if (stored.landing_page) {
        writeStore(stored);
        return stored;
      }
    }

    stored = {};
    params = new URLSearchParams(location.search);
    for (i = 0; i < TRACK_KEYS.length; i++) {
      key = TRACK_KEYS[i];
      value = params.get(key);
      if (value) stored[key] = value;
    }
    stored.landing_page = location.origin + location.pathname + location.search + location.hash;
    writeStore(stored);
    return stored;
  }

  function fillForms(stored) {
    var forms = document.querySelectorAll("form[data-netlify='true']");
    var f, i, key, input;
    for (f = 0; f < forms.length; f++) {
      for (i = 0; i < ALL_KEYS.length; i++) {
        key = ALL_KEYS[i];
        input = forms[f].querySelector('input[name="' + key + '"]');
        if (!input) continue;
        input.value = stored[key] || "";
      }
    }
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
    var body;
    hideFormError(form);
    try {
      fillForms(captureAttribution());
    } catch (err) {}

    body = new URLSearchParams(new FormData(form)).toString();

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
    if (!form || !form.getAttribute || form.getAttribute("data-netlify") !== "true") return;
    // No-JS fallback: without fetch, let the browser POST to the thank-you action.
    if (!window.fetch || !window.FormData || !window.URLSearchParams) return;
    event.preventDefault();
    if (form.getAttribute("data-submitting") === "true") return;
    form.setAttribute("data-submitting", "true");
    button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    submitForm(form);
  });

  try {
    fillForms(captureAttribution());
  } catch (err) {}

  if (isRealAdsId(adsSettings().googleAdsId)) {
    loadGtag(adsSettings().googleAdsId);
  }
  maybeFireConversion();
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) maybeFireConversion();
  });
})();
