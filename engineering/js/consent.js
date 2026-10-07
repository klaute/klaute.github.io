/*
 * Consent-gated Google Analytics 4 for the engineering site.
 *
 * GA4 is loaded only after the visitor explicitly accepts in the banner.
 * Without consent no request is sent to Google and no cookie is set.
 * The choice is kept in localStorage; the footer button "Cookie-Einstellungen"
 * / "Cookie settings" reopens the banner so consent can be withdrawn.
 *
 * Contact clicks are sent as GA4 events from links marked with data-track.
 */
(function () {
  "use strict";

  var GA_ID = "G-FL4YM2QDDM";
  var STORAGE_KEY = "lt-analytics-consent";
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

  function readChoice() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function storeChoice(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      // Storage blocked: the choice applies to this page view only.
    }
  }

  function loadAnalytics() {
    if (analyticsLoaded) {
      return;
    }
    analyticsLoaded = true;

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

  function applyChoice(value) {
    var wasLoaded = analyticsLoaded;
    storeChoice(value);
    hideBanner();

    if (value === GRANTED) {
      loadAnalytics();
      return;
    }

    clearAnalyticsCookies();
    if (wasLoaded) {
      // gtag cannot be unloaded; a reload guarantees no further tracking.
      window.location.reload();
    }
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
