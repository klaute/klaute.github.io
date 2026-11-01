/*
 * Consent-gated Google Analytics 4 for the engineering site.
 *
 * GA4 is loaded only after the visitor explicitly accepts in the banner.
 * Without consent no request is sent to Google and no cookie is set.
 * The choice is kept in localStorage together with its date and the consent
 * version. The banner asks again when CONSENT_VERSION changes or the choice is
 * older than CONSENT_MAX_AGE_DAYS. The footer button "Cookie-Einstellungen" /
 * "Cookie settings" reopens the banner so consent can be withdrawn; other open
 * tabs follow a changed choice via the storage event.
 *
 * Contact clicks are sent as GA4 events from links marked with data-track.
 */
(function () {
  "use strict";

  var GA_ID = "G-1EEWX9ZJJH";
  var STORAGE_KEY = "lt-analytics-consent";
  // Bump when the privacy policy or the analytics scope changes materially.
  var CONSENT_VERSION = "2026-10-07";
  var CONSENT_MAX_AGE_DAYS = 365;
  var GRANTED = "granted";
  var DENIED = "denied";

  var script = document.currentScript;
  var privacyHref = (script && script.getAttribute("data-privacy")) || "privacy.html";
  var lang = (document.documentElement.lang || "de").slice(0, 2) === "en" ? "en" : "de";

  var TEXT = {
    de: {
      label: "Einwilligung zur Webanalyse",
      message:
        "Diese Website verwendet Google Analytics, um zu verstehen, wie die Seiten " +
        "und Kontaktwege genutzt werden. Dabei werden Cookies gesetzt und Daten an " +
        "Google übertragen, auch in die USA. Google Analytics wird nur geladen, wenn " +
        "Sie zustimmen. Ihre Entscheidung können Sie jederzeit über " +
        "„Cookie-Einstellungen“ im Fußbereich ändern.",
      privacy: "Datenschutzerklärung",
      accept: "Akzeptieren",
      decline: "Ablehnen"
    },
    en: {
      label: "Consent to web analytics",
      message:
        "This website uses Google Analytics to understand how its pages and contact " +
        "options are used. This sets cookies and transfers data to Google, including " +
        "to the USA. Google Analytics is only loaded if you agree. You can change " +
        "your choice at any time via “Cookie settings” in the footer.",
      privacy: "Privacy policy",
      accept: "Accept",
      decline: "Decline"
    }
  }[lang];

  var analyticsLoaded = false;
  var banner = null;
  // Fallback when localStorage is unavailable: the choice lives for this page view.
  var storageUsable = true;
  var memoryChoice = null;

  // Returns GRANTED or DENIED for a current, valid record; otherwise null.
  // Legacy plain-string values, other versions and expired records count as
  // no decision, so the banner asks again.
  function parseChoice(raw) {
    var record;
    try {
      record = JSON.parse(raw);
    } catch (error) {
      return null;
    }
    if (!record || record.version !== CONSENT_VERSION) {
      return null;
    }
    if (record.value !== GRANTED && record.value !== DENIED) {
      return null;
    }
    var age = Date.now() - Date.parse(record.timestamp);
    if (!(age >= 0) || age > CONSENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
      return null;
    }
    return record.value;
  }

  function readChoice() {
    if (!storageUsable) {
      return memoryChoice;
    }
    try {
      return parseChoice(window.localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      storageUsable = false;
      return memoryChoice;
    }
  }

  function storeChoice(value) {
    memoryChoice = value;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          value: value,
          version: CONSENT_VERSION,
          timestamp: new Date().toISOString()
        })
      );
    } catch (error) {
      // Storage blocked: the choice applies to this page view only.
      storageUsable = false;
    }
  }

  function loadAnalytics() {
    if (analyticsLoaded) {
      return;
    }
    analyticsLoaded = true;
    window["ga-disable-" + GA_ID] = false;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };

    // Consent Mode v2: analytics only, no advertising storage or signals.
    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted"
    });
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });

    var tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(tag);
  }

  // Remove GA cookies after consent is withdrawn (host and parent domain).
  function clearAnalyticsCookies() {
    var host = window.location.hostname;
    var domains = ["", host, "." + host, "." + host.split(".").slice(-2).join(".")];

    document.cookie.split(";").forEach(function (cookie) {
      var name = cookie.split("=")[0].trim();
      if (name !== "_ga" && name.indexOf("_ga_") !== 0) {
        return;
      }
      domains.forEach(function (domain) {
        document.cookie =
          name + "=; Max-Age=0; path=/" + (domain ? "; domain=" + domain : "");
      });
    });
  }

  // After withdrawal, drop every request to Google Analytics hosts. gtag
  // flushes its queue of already collected events when the page unloads; the
  // opt-out flag does not stop that flush, so the transport itself is closed.
  function blockAnalyticsTransport() {
    var analyticsHost = /(^|\.)(google-analytics\.com|analytics\.google\.com|googletagmanager\.com)$/;
    function isAnalyticsUrl(url) {
      try {
        return analyticsHost.test(new URL(String(url), window.location.href).hostname);
      } catch (error) {
        return false;
      }
    }

    if (navigator.sendBeacon) {
      var nativeBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) {
        return isAnalyticsUrl(url) ? true : nativeBeacon(url, data);
      };
    }
    if (window.fetch) {
      var nativeFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        var url = input && input.url ? input.url : input;
        if (isAnalyticsUrl(url)) {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return nativeFetch(input, init);
      };
    }
  }

  // Applies a decision to this tab. gtag cannot be unloaded: on withdrawal
  // the transport is closed and Google's opt-out flag is set first
  // (analytics_storage "denied" alone still allows cookieless pings such as
  // user_engagement), then storage is denied, cookies are removed and the
  // page reloads.
  function enforceChoice(value) {
    hideBanner();
    if (value === GRANTED) {
      loadAnalytics();
      return;
    }
    if (analyticsLoaded) {
      blockAnalyticsTransport();
      window["ga-disable-" + GA_ID] = true;
      window.gtag("consent", "update", { analytics_storage: "denied" });
    }
    clearAnalyticsCookies();
    if (analyticsLoaded) {
      window.location.reload();
    }
  }

  // Withdraw in this tab if the stored decision no longer grants analytics.
  function recheckStoredChoice() {
    var choice = readChoice();
    if (choice) {
      enforceChoice(choice);
    } else if (analyticsLoaded) {
      enforceChoice(DENIED);
    }
  }

  function applyChoice(value) {
    storeChoice(value);
    enforceChoice(value);
  }

  // Keep other open tabs in line with a choice made in this one. The storage
  // event covers open tabs; the visibility check covers a missed event.
  function followOtherTabs() {
    window.addEventListener("storage", function (event) {
      if (event.key === STORAGE_KEY || event.key === null) {
        recheckStoredChoice();
      }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && analyticsLoaded) {
        recheckStoredChoice();
      }
    });
  }

  function buildBanner() {
    var root = document.createElement("div");
    root.className = "consent-banner";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", TEXT.label);

    var inner = document.createElement("div");
    inner.className = "consent-inner";

    var text = document.createElement("p");
    text.className = "consent-text";
    text.appendChild(document.createTextNode(TEXT.message + " "));
    var link = document.createElement("a");
    link.href = privacyHref;
    link.textContent = TEXT.privacy;
    text.appendChild(link);

    var actions = document.createElement("div");
    actions.className = "consent-actions";
    [[DENIED, TEXT.decline], [GRANTED, TEXT.accept]].forEach(function (entry) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "consent-button";
      button.textContent = entry[1];
      button.addEventListener("click", function () {
        applyChoice(entry[0]);
      });
      actions.appendChild(button);
    });

    inner.appendChild(text);
    inner.appendChild(actions);
    root.appendChild(inner);
    return root;
  }

  function showBanner() {
    if (!banner) {
      banner = buildBanner();
      document.body.appendChild(banner);
    }
    banner.hidden = false;
  }

  function hideBanner() {
    if (banner) {
      banner.hidden = true;
    }
  }

  function trackContactClicks() {
    document.addEventListener("click", function (event) {
      var target = event.target.closest ? event.target.closest("[data-track]") : null;
      if (!target || !analyticsLoaded) {
        return;
      }
      // Never send an event if consent was withdrawn in another tab.
      if (readChoice() !== GRANTED) {
        recheckStoredChoice();
        return;
      }
      window.gtag("event", target.getAttribute("data-track"), {
        link_url: target.getAttribute("href") || "",
        transport_type: "beacon"
      });
    });
  }

  function init() {
    document.querySelectorAll("[data-consent-open]").forEach(function (button) {
      button.addEventListener("click", showBanner);
    });
    trackContactClicks();
    followOtherTabs();

    var choice = readChoice();
    if (choice === GRANTED) {
      loadAnalytics();
    } else if (choice !== DENIED) {
      showBanner();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
