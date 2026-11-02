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
    payload = JSON.stringify({ form: formName, token: token });
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

  // Record an outbound conversion hit. gtag's event_callback also runs on its
  // own timeout, so a callback alone is not proof the hit was sent.
  function watchConversionSend(sendTo, onSent) {
    var idPart = sendTo.split("/")[0].replace(/^AW-/, "");
    var label = sendTo.split("/")[1] || "";

    function matches(value) {
      var text = value == null ? "" : String(value);
      if (!text || text.indexOf(idPart) === -1) return false;
      return !label || text.indexOf(label) !== -1;
    }

    if (navigator.sendBeacon && !navigator.__jacknatBeaconWrapped) {
      var originalBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) {
        var queued = originalBeacon(url, data);
        if (queued && (matches(url) || matches(data))) onSent();
        return queued;
      };
      navigator.__jacknatBeaconWrapped = true;
    }

    if (window.fetch && !window.__jacknatFetchWrapped) {
      var originalFetch = window.fetch;
      window.fetch = function (input, init) {
        var url = typeof input === "string" ? input : (input && input.url);
        var pending = originalFetch.apply(this, arguments);
        if (matches(url)) {
          pending.then(function (res) {
            if (res && res.ok) onSent();
          }, function () {});
        }
        return pending;
      };
      window.__jacknatFetchWrapped = true;
    }

    if (window.XMLHttpRequest && !window.__jacknatXhrWrapped) {
      var originalOpen = XMLHttpRequest.prototype.open;
      var originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        this.__jacknatUrl = url;
        return originalOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        var xhr = this;
        if (matches(xhr.__jacknatUrl)) {
          xhr.addEventListener("load", function () {
            if (xhr.status >= 200 && xhr.status < 300) onSent();
          });
        }
        return originalSend.apply(this, arguments);
      };
      window.__jacknatXhrWrapped = true;
    }
  }

  function maybeFireConversion() {
    var expected = document.body ? document.body.getAttribute("data-conversion-form") : "";
    var pending, firedKey, claimKey, settings, label, sendTo, completed, sent, callbackFired;
    if (!expected || window.__jacknatConversionBusy) return;
    try {
      pending = parseJson(sessionStorage.getItem(PENDING_KEY));
    } catch (err) {
      pending = null;
    }
    if (!pending || pending.form !== expected || !pending.token) return;

    firedKey = "jacknat_conversion_fired_" + pending.token;
    claimKey = "jacknat_conversion_claimed_" + pending.token;
    try {
      if (sessionStorage.getItem(firedKey) === "1") return;
      if (sessionStorage.getItem(claimKey) === "1") return;
    } catch (err) {
      return;
    }

    // Placeholders stay pending. Do not claim the token and do not load gtag.
    settings = adsSettings();
    label = labelForForm(expected, settings);
    if (!isRealAdsId(settings.googleAdsId) || isPlaceholder(label)) return;
    sendTo = settings.googleAdsId + "/" + label;

    // One shot per successful submission. Reload and back-forward reuse this claim
    // and do not call gtag again. The pending token itself is removed only after
    // the hit is actually sent.
    window.__jacknatConversionBusy = true;
    try {
      sessionStorage.setItem(claimKey, "1");
    } catch (err) {
      window.__jacknatConversionBusy = false;
      return;
    }

    completed = false;
    sent = false;
    callbackFired = false;

    function markComplete() {
      if (completed || !sent || !callbackFired) return;
      completed = true;
      try {
        sessionStorage.setItem(firedKey, "1");
        sessionStorage.removeItem(PENDING_KEY);
      } catch (err) {}
    }

    watchConversionSend(sendTo, function () {
      sent = true;
      markComplete();
    });

    loadGtag(settings.googleAdsId);
    window.gtag("event", "conversion", {
      send_to: sendTo,
      event_callback: function () {
        callbackFired = true;
        markComplete();
      }
    });

    // Timeout is not success. Leave the pending token in place.
    window.setTimeout(function () {}, 3000);
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
