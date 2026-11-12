(() => {
  const data =
    typeof bookingReviewData !== "undefined" && bookingReviewData
      ? bookingReviewData
      : null;

  const form = document.getElementById("bookingReviewForm");
  const checkInEl = document.getElementById("bookingCheckIn");
  const checkOutEl = document.getElementById("bookingCheckOut");
  const guestsEl = document.getElementById("bookingGuests");
  const errorEl = document.getElementById("bookingReviewError");
  const nightsLabelEl = document.getElementById("reviewPricingNightsLabel");
  const subtotalEl = document.getElementById("reviewPricingSubtotal");
  const taxAmountEl = document.getElementById("reviewPricingTaxAmount");
  const totalEl = document.getElementById("reviewPricingTotal");

  if (!data || !form || !checkInEl || !checkOutEl || !guestsEl) {
    return;
  }

  const MS_PER_DAY = 86400000;
  const maxGuests = Number(data.maxGuests) || 8;
  const maxStayNights = Number(data.maxStayNights) || 90;

  function parseUtcMs(dateStr) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
    if (!match) return null;
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

  function addDaysStr(dateStr, days) {
    const ms = parseUtcMs(dateStr);
    if (ms === null) return data.todayStr;
    const d = new Date(ms + days * MS_PER_DAY);
    const y = String(d.getUTCFullYear()).padStart(4, "0");
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function showError(msg) {
    if (!errorEl) return;
    if (!msg) {
      errorEl.textContent = "";
      errorEl.classList.add("d-none");
      return;
    }
    errorEl.textContent = msg;
    errorEl.classList.remove("d-none");
  }

  function syncMinCheckOut() {
    const inVal = String(checkInEl.value || "").trim();
    checkOutEl.min = parseUtcMs(inVal) !== null ? addDaysStr(inVal, 1) : data.todayStr;
  }

  async function refreshPreviewFromServer() {
    if (typeof fetch !== "function" || typeof URLSearchParams !== "function") {
      return;
    }
    const checkInVal = String(checkInEl.value || "").trim();
    const checkOutVal = String(checkOutEl.value || "").trim();
    const guestsVal = String(guestsEl.value || "1").trim();
    if (!checkInVal || !checkOutVal) {
      return;
    }

    const inMs = parseUtcMs(checkInVal);
    const outMs = parseUtcMs(checkOutVal);
    const todayMs = parseUtcMs(data.todayStr);
    if (inMs === null || outMs === null) return;
    if (todayMs !== null && inMs < todayMs) {
      showError("Check-in date cannot be in the past.");
      return;
    }
    if (outMs <= inMs) {
      showError("Check-out date must be after check-in date.");
      return;
    }
    const nights = Math.round((outMs - inMs) / MS_PER_DAY);
    if (nights > maxStayNights) {
      showError(`Stay duration cannot exceed ${maxStayNights} nights.`);
      return;
    }

    try {
      const params = new URLSearchParams({
        checkIn: checkInVal,
        checkOut: checkOutVal,
        guests: guestsVal,
      });
      const res = await fetch(
        `/listings/${encodeURIComponent(data.listingId)}/availability?${params.toString()}`,
        { headers: { Accept: "application/json" } }
      );
      const body = await res.json();
      if (!res.ok) {
        showError(body?.error || "Invalid reservation parameters.");
        return;
      }

      if (body.pricing && body.pricing.isPriceAvailable && nightsLabelEl && subtotalEl && taxAmountEl && totalEl) {
        const nightWord = body.pricing.nights === 1 ? "night" : "nights";
        nightsLabelEl.textContent = `\u20B9 ${body.pricing.formattedBasePrice} \u00D7 ${body.pricing.nights} ${nightWord}`;
        subtotalEl.textContent = `\u20B9 ${body.pricing.formattedSubtotal}`;
        taxAmountEl.textContent = `\u20B9 ${body.pricing.formattedTaxAmount}`;
        totalEl.textContent = `\u20B9 ${body.pricing.formattedEstimatedTotal}`;
      }

      if (!body.available) {
        showError(
          body.message ||
            "Selected dates overlap an existing active reservation. Please choose different dates."
        );
      } else {
        showError("");
      }
    } catch {
      // Fall back to server validation on submit if transient network failure occurs
    }
  }

  syncMinCheckOut();
  checkInEl.addEventListener("change", () => {
    syncMinCheckOut();
    refreshPreviewFromServer();
  });
  checkOutEl.addEventListener("change", refreshPreviewFromServer);
  guestsEl.addEventListener("change", refreshPreviewFromServer);

  form.addEventListener("submit", (event) => {
    const checkInVal = String(checkInEl.value || "").trim();
    const checkOutVal = String(checkOutEl.value || "").trim();
    const guestsRaw = String(guestsEl.value || "").trim();
    const inMs = parseUtcMs(checkInVal);
    const outMs = parseUtcMs(checkOutVal);
    const todayMs = parseUtcMs(data.todayStr);

    if (inMs === null) {
      event.preventDefault();
      showError("Please select a valid check-in date.");
      return;
    }
    if (todayMs !== null && inMs < todayMs) {
      event.preventDefault();
      showError("Check-in date cannot be in the past.");
      return;
    }
    if (outMs === null || outMs <= inMs) {
      event.preventDefault();
      showError("Check-out date must be after check-in date.");
      return;
    }
    const nights = Math.round((outMs - inMs) / MS_PER_DAY);
    if (nights < 1 || nights > maxStayNights) {
      event.preventDefault();
      showError(`Stay duration must be between 1 and ${maxStayNights} nights.`);
      return;
    }
    const gNum = Number(guestsRaw);
    if (!/^\d+$/.test(guestsRaw) || !Number.isSafeInteger(gNum) || gNum < 1 || gNum > maxGuests) {
      event.preventDefault();
      showError(`Guest count must be an integer between 1 and ${maxGuests}.`);
      return;
    }
  });
})();

