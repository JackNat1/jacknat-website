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
    if (!formName || !FORM_LABELS[formName]) return;
    token = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    payload = JSON.stringify({ form: formName, token: token });
    try {
      sessionStorage.setItem(PENDING_KEY, payload);
    } catch (err) {}
  }

  function maybeFireConversion() {
    var expected = document.body ? document.body.getAttribute("data-conversion-form") : "";
    var pending, firedKey, settings, label;
    if (!expected) return;
    try {
      pending = parseJson(sessionStorage.getItem(PENDING_KEY));
    } catch (err) {
      pending = null;
    }
    if (!pending || pending.form !== expected || !pending.token) return;

    firedKey = "jacknat_conversion_fired_" + pending.token;
    try {
      if (sessionStorage.getItem(firedKey)) return;
      sessionStorage.setItem(firedKey, "1");
      sessionStorage.removeItem(PENDING_KEY);
    } catch (err) {
      return;
    }

    settings = adsSettings();
    label = labelForForm(expected, settings);
    if (!isRealAdsId(settings.googleAdsId) || isPlaceholder(label)) return;

    loadGtag(settings.googleAdsId);
    window.gtag("event", "conversion", {
      send_to: settings.googleAdsId + "/" + label
    });
  }

  document.addEventListener("submit", function (event) {
    var form = event.target;
    var stored;
    if (!form || !form.getAttribute || form.getAttribute("data-netlify") !== "true") return;
    try {
      stored = captureAttribution();
      fillForms(stored);
    } catch (err) {}
    markPending(form);
  }, true);

  try {
    fillForms(captureAttribution());
  } catch (err) {}

  if (isRealAdsId(adsSettings().googleAdsId)) {
    loadGtag(adsSettings().googleAdsId);
  }
  maybeFireConversion();
})();
