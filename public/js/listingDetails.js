(() => {
  // Progressive image fallback (CSP-safe: no inline onerror attributes)
  const heroImg = document.querySelector("[data-listing-hero-img]");
  const heroFallback = document.querySelector("[data-listing-hero-fallback]");
  if (heroImg && heroFallback) {
    const activateFallback = () => {
      heroImg.classList.add("d-none");
      heroFallback.classList.remove("d-none");
    };
    heroImg.addEventListener("error", activateFallback);
    if (heroImg.complete && heroImg.naturalWidth === 0) {
      activateFallback();
    }
  }

  // Progressive stay duration breakdown updates using server-resolved pricing rules
  const pricingData =
    typeof pricingPreviewData !== "undefined" && pricingPreviewData
      ? pricingPreviewData
      : null;

  if (!pricingData || !pricingData.isPriceAvailable) {
    return;
  }

  const nightsInput = document.getElementById("stayNightsInput");
  const nightsForm = document.getElementById("stayPricingForm");
  const feedbackEl = document.getElementById("stayNightsFeedback");
  const nightsLabelEl = document.getElementById("pricingNightsLabel");
  const subtotalEl = document.getElementById("pricingSubtotal");
  const taxAmountEl = document.getElementById("pricingTaxAmount");
  const totalEl = document.getElementById("pricingTotal");

  if (
    !nightsInput ||
    !nightsLabelEl ||
    !subtotalEl ||
    !taxAmountEl ||
    !totalEl
  ) {
    return;
  }

  const maxNights = Number(pricingData.maxStayNights) || 90;
  const basePrice = Number(pricingData.basePrice);
  const taxRatePercent = Number(pricingData.taxRatePercent) || 0;

  function roundCurrency(amount) {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  function formatINR(amount) {
    const rounded = roundCurrency(amount);
    const hasFraction = Math.abs(rounded % 1) > 0.0001;
    return rounded.toLocaleString("en-IN", {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }

  function updateBreakdown(nights) {
    const subtotal = roundCurrency(basePrice * nights);
    const taxAmount = roundCurrency((subtotal * taxRatePercent) / 100);
    const total = roundCurrency(subtotal + taxAmount);
    const nightWord = nights === 1 ? "night" : "nights";

    nightsLabelEl.textContent = `\u20B9 ${formatINR(basePrice)} \u00D7 ${nights} ${nightWord}`;
    subtotalEl.textContent = `\u20B9 ${formatINR(subtotal)}`;
    taxAmountEl.textContent = `\u20B9 ${formatINR(taxAmount)}`;
    totalEl.textContent = `\u20B9 ${formatINR(total)}`;
  }

  function handleNightsChange() {
    const raw = String(nightsInput.value || "").trim();
    if (!/^\d+$/.test(raw)) {
      if (feedbackEl) {
        feedbackEl.textContent = `Enter a whole number between 1 and ${maxNights} nights.`;
        feedbackEl.classList.remove("d-none");
      }
      nightsInput.classList.add("is-invalid");
      return false;
    }

    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maxNights) {
      if (feedbackEl) {
        feedbackEl.textContent = `Stay duration must be between 1 and ${maxNights} nights.`;
        feedbackEl.classList.remove("d-none");
      }
      nightsInput.classList.add("is-invalid");
      return false;
    }

    if (feedbackEl) {
      feedbackEl.textContent = "";
      feedbackEl.classList.add("d-none");
    }
    nightsInput.classList.remove("is-invalid");
    updateBreakdown(parsed);
    return true;
  }

  nightsInput.addEventListener("input", handleNightsChange);
  nightsInput.addEventListener("change", handleNightsChange);

  if (nightsForm) {
    nightsForm.addEventListener("submit", (event) => {
      if (!handleNightsChange()) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }
})();

