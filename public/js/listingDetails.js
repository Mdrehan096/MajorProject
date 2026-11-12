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

  const nightsInput = document.getElementById("stayNightsInput");
  const nightsForm = document.getElementById("stayPricingForm");
  const feedbackEl = document.getElementById("stayNightsFeedback");
  const nightsLabelEl = document.getElementById("pricingNightsLabel");
  const subtotalEl = document.getElementById("pricingSubtotal");
  const taxAmountEl = document.getElementById("pricingTaxAmount");
  const totalEl = document.getElementById("pricingTotal");

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

  function applyServerPricingBreakdown(serverPricing) {
    if (
      !serverPricing ||
      !serverPricing.isPriceAvailable ||
      !nightsLabelEl ||
      !subtotalEl ||
      !taxAmountEl ||
      !totalEl
    ) {
      return;
    }
    const nightWord = serverPricing.nights === 1 ? "night" : "nights";
    if (nightsInput) {
      nightsInput.value = String(serverPricing.nights);
      nightsInput.classList.remove("is-invalid");
    }
    if (feedbackEl) {
      feedbackEl.textContent = "";
      feedbackEl.classList.add("d-none");
    }
    nightsLabelEl.textContent = `\u20B9 ${serverPricing.formattedBasePrice} \u00D7 ${serverPricing.nights} ${nightWord}`;
    subtotalEl.textContent = `\u20B9 ${serverPricing.formattedSubtotal}`;
    taxAmountEl.textContent = `\u20B9 ${serverPricing.formattedTaxAmount}`;
    totalEl.textContent = `\u20B9 ${serverPricing.formattedEstimatedTotal}`;
  }

  if (
    pricingData &&
    pricingData.isPriceAvailable &&
    nightsInput &&
    nightsLabelEl &&
    subtotalEl &&
    taxAmountEl &&
    totalEl
  ) {
    const maxNights = Number(pricingData.maxStayNights) || 90;
    const basePrice = Number(pricingData.basePrice);
    const taxRatePercent = Number(pricingData.taxRatePercent) || 0;

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
  }

  // Phase 4.3: Date & guest availability checks (supplementary client check + authoritative server query)
  const availData =
    typeof availabilityPreviewData !== "undefined" && availabilityPreviewData
      ? availabilityPreviewData
      : null;

  const availForm = document.getElementById("availabilityCheckForm");
  const checkInEl = document.getElementById("availabilityCheckIn");
  const checkOutEl = document.getElementById("availabilityCheckOut");
  const guestsEl = document.getElementById("availabilityGuests");
  const availBtn = document.getElementById("checkAvailabilityBtn");
  const availFeedbackEl = document.getElementById("availabilityFeedback");
  const blockedContainerEl = document.getElementById("blockedDatesContainer");
  const proceedToBookForm = document.getElementById("proceedToBookForm");
  const bookFlowCheckIn = document.getElementById("bookFlowCheckIn");
  const bookFlowCheckOut = document.getElementById("bookFlowCheckOut");
  const bookFlowGuests = document.getElementById("bookFlowGuests");

  function syncProceedToBookInputs() {
    if (bookFlowCheckIn && checkInEl) {
      bookFlowCheckIn.value = String(checkInEl.value || "").trim();
    }
    if (bookFlowCheckOut && checkOutEl) {
      bookFlowCheckOut.value = String(checkOutEl.value || "").trim();
    }
    if (bookFlowGuests && guestsEl) {
      bookFlowGuests.value = String(guestsEl.value || "1").trim() || "1";
    }
  }

  if (
    !availData ||
    !availForm ||
    !checkInEl ||
    !checkOutEl ||
    !guestsEl ||
    !availFeedbackEl
  ) {
    return;
  }

  const MS_PER_DAY = 86400000;
  const maxGuests = Number(availData.maxGuests) || 8;
  const maxStayNights = Number(availData.maxStayNights) || 90;
  let knownBlockedDates = Array.isArray(availData.blockedDates)
    ? availData.blockedDates.slice()
    : [];

  function parseCalendarUtcMs(dateStr) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (
      d.getUTCFullYear() !== year ||
      d.getUTCMonth() !== month - 1 ||
      d.getUTCDate() !== day
    ) {
      return null;
    }
    return d.getTime();
  }

  function addCalendarDaysStr(dateStr, days) {
    const ms = parseCalendarUtcMs(dateStr);
    if (ms === null) {
      return availData.todayStr;
    }
    const next = new Date(ms + days * MS_PER_DAY);
    const y = String(next.getUTCFullYear()).padStart(4, "0");
    const m = String(next.getUTCMonth() + 1).padStart(2, "0");
    const d = String(next.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function setFeedback(tone, text) {
    availFeedbackEl.classList.remove(
      "d-none",
      "alert-success",
      "alert-danger",
      "alert-warning",
      "alert-info"
    );
    if (!text) {
      availFeedbackEl.textContent = "";
      availFeedbackEl.classList.add("d-none");
      return;
    }
    availFeedbackEl.classList.add(`alert-${tone}`);
    availFeedbackEl.textContent = text;
  }

  function clearInvalidMarkers() {
    checkInEl.classList.remove("is-invalid");
    checkOutEl.classList.remove("is-invalid");
    guestsEl.classList.remove("is-invalid");
  }

  function renderBlockedDates(slots) {
    if (!blockedContainerEl || typeof document.createElement !== "function") {
      return;
    }
    blockedContainerEl.textContent = "";
    const list = Array.isArray(slots) ? slots.slice(0, 8) : [];
    if (list.length === 0) {
      const p = document.createElement("p");
      p.id = "blockedDatesEmpty";
      p.className = "small text-muted mb-0 mt-1";
      p.textContent = "No upcoming unavailable dates.";
      blockedContainerEl.appendChild(p);
      return;
    }

    const ul = document.createElement("ul");
    ul.id = "blockedDatesList";
    ul.className = "blocked-dates-list list-unstyled mb-0 mt-2";
    for (const slot of list) {
      const li = document.createElement("li");
      li.className =
        "blocked-date-item d-flex justify-content-between align-items-center small py-1";

      const rangeSpan = document.createElement("span");
      rangeSpan.textContent = `${slot.checkIn} \u2192 ${slot.checkOut}`;

      const badge = document.createElement("span");
      badge.className =
        "badge text-bg-secondary-subtle border text-secondary-emphasis";
      badge.textContent = "Unavailable";

      li.appendChild(rangeSpan);
      li.appendChild(badge);
      ul.appendChild(li);
    }
    blockedContainerEl.appendChild(ul);
  }

  function validateClientInputs() {
    clearInvalidMarkers();
    const checkInVal = String(checkInEl.value || "").trim();
    const checkOutVal = String(checkOutEl.value || "").trim();
    const guestsRaw = String(guestsEl.value || "").trim();

    if (!checkInVal) {
      checkInEl.classList.add("is-invalid");
      return { valid: false, message: "Please select a check-in date." };
    }
    const inMs = parseCalendarUtcMs(checkInVal);
    const todayMs = parseCalendarUtcMs(availData.todayStr);
    if (inMs === null) {
      checkInEl.classList.add("is-invalid");
      return { valid: false, message: "Please enter a valid check-in date." };
    }
    if (todayMs !== null && inMs < todayMs) {
      checkInEl.classList.add("is-invalid");
      return { valid: false, message: "Check-in date cannot be in the past." };
    }

    if (!checkOutVal) {
      checkOutEl.classList.add("is-invalid");
      return { valid: false, message: "Please select a check-out date." };
    }
    const outMs = parseCalendarUtcMs(checkOutVal);
    if (outMs === null) {
      checkOutEl.classList.add("is-invalid");
      return { valid: false, message: "Please enter a valid check-out date." };
    }
    if (outMs <= inMs) {
      checkOutEl.classList.add("is-invalid");
      return {
        valid: false,
        message: "Check-out date must be after check-in date.",
      };
    }

    const nights = Math.round((outMs - inMs) / MS_PER_DAY);
    if (nights < 1 || nights > maxStayNights) {
      checkOutEl.classList.add("is-invalid");
      return {
        valid: false,
        message: `Stay duration must be between 1 and ${maxStayNights} nights.`,
      };
    }

    if (!/^\d+$/.test(guestsRaw)) {
      guestsEl.classList.add("is-invalid");
      return { valid: false, message: "Guest count must be a whole number." };
    }
    const guests = Number(guestsRaw);
    if (!Number.isSafeInteger(guests) || guests < 1 || guests > maxGuests) {
      guestsEl.classList.add("is-invalid");
      return {
        valid: false,
        message: `Guest count must be between 1 and ${maxGuests}.`,
      };
    }

    const overlapsLocally = knownBlockedDates.some(
      (slot) =>
        slot &&
        typeof slot.checkIn === "string" &&
        typeof slot.checkOut === "string" &&
        slot.checkIn < checkOutVal &&
        slot.checkOut > checkInVal
    );

    return {
      valid: true,
      checkIn: checkInVal,
      checkOut: checkOutVal,
      nights,
      guests,
      overlapsLocally,
    };
  }

  function syncMinCheckOut() {
    const checkInVal = String(checkInEl.value || "").trim();
    if (parseCalendarUtcMs(checkInVal) !== null) {
      checkOutEl.min = addCalendarDaysStr(checkInVal, 1);
    } else {
      checkOutEl.min = availData.todayStr;
    }
  }

  syncMinCheckOut();
  syncProceedToBookInputs();

  checkInEl.addEventListener("change", () => {
    syncMinCheckOut();
    syncProceedToBookInputs();
    if (checkOutEl.value) {
      const check = validateClientInputs();
      if (!check.valid) {
        setFeedback("danger", check.message);
      } else if (check.overlapsLocally) {
        setFeedback(
          "warning",
          "Selected dates appear to overlap an unavailable period. Click Check Availability to verify live status."
        );
      } else {
        setFeedback("", "");
      }
    }
  });

  checkOutEl.addEventListener("change", () => {
    syncProceedToBookInputs();
    const check = validateClientInputs();
    if (!check.valid) {
      setFeedback("danger", check.message);
    } else if (check.overlapsLocally) {
      setFeedback(
        "warning",
        "Selected dates appear to overlap an unavailable period. Click Check Availability to verify live status."
      );
    } else {
      setFeedback("", "");
    }
  });

  guestsEl.addEventListener("input", () => {
    syncProceedToBookInputs();
    clearInvalidMarkers();
    const raw = String(guestsEl.value || "").trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > maxGuests) {
      guestsEl.classList.add("is-invalid");
      setFeedback("danger", `Guest count must be between 1 and ${maxGuests}.`);
    } else if (checkInEl.value && checkOutEl.value) {
      setFeedback("", "");
    }
  });

  if (proceedToBookForm) {
    proceedToBookForm.addEventListener("submit", () => {
      syncProceedToBookInputs();
    });
  }

  availForm.addEventListener("submit", async (event) => {
    const check = validateClientInputs();
    if (!check.valid) {
      event.preventDefault();
      event.stopPropagation();
      setFeedback("danger", check.message);
      return;
    }

    if (typeof fetch !== "function" || typeof URLSearchParams !== "function") {
      return;
    }

    event.preventDefault();
    const originalBtnText = availBtn ? availBtn.textContent : "Check Availability";
    if (availBtn) {
      availBtn.disabled = true;
      availBtn.textContent = "Checking...";
    }

    try {
      const params = new URLSearchParams({
        checkIn: check.checkIn,
        checkOut: check.checkOut,
        guests: String(check.guests),
      });
      const response = await fetch(
        `/listings/${encodeURIComponent(availData.listingId)}/availability?${params.toString()}`,
        {
          headers: { Accept: "application/json" },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setFeedback(
          "danger",
          data?.error || "Unable to verify availability for these dates."
        );
        return;
      }

      if (Array.isArray(data.blockedDates)) {
        knownBlockedDates = data.blockedDates;
        renderBlockedDates(knownBlockedDates);
      }

      if (data.pricing && data.pricing.isPriceAvailable) {
        applyServerPricingBreakdown(data.pricing);
      }

      if (data.available) {
        setFeedback("success", data.message || "Selected dates are available.");
      } else {
        setFeedback(
          "warning",
          data.message || "Selected dates are not available."
        );
      }
    } catch {
      setFeedback(
        "danger",
        "Could not contact server to verify availability. Please try again."
      );
    } finally {
      if (availBtn) {
        availBtn.disabled = false;
        availBtn.textContent = originalBtnText;
      }
    }
  });
})();

