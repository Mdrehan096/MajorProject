const ExpressError = require("./ExpressError.js");

const DEFAULT_STAY_NIGHTS = 1;
const DEFAULT_MAX_STAY_NIGHTS = 90;

// Verified Indian GST slabs for hotel accommodation tariffs (SAC 996311)
// per CBIC Notification No. 15/2025-Central Tax (Rate), effective Sept 22, 2025.
const INDIAN_GST_SLABS = Object.freeze([
  Object.freeze({
    code: "exempt",
    maxNightlyRate: 1000,
    ratePercent: 0,
    description: "0% GST (Exempt tariff up to ₹1,000/night)",
  }),
  Object.freeze({
    code: "standard_5",
    maxNightlyRate: 7500,
    ratePercent: 5,
    description: "5% GST (₹1,001–₹7,500/night tariff slab)",
  }),
  Object.freeze({
    code: "higher_18",
    maxNightlyRate: Infinity,
    ratePercent: 18,
    description: "18% GST (Above ₹7,500/night tariff slab)",
  }),
]);

const ESTIMATED_TOTAL_DISCLAIMER =
  "Estimated breakdown for reference only. Actual tax applicability and final booking total may depend on host GST registration, stay dates, discounts, and applicable platform fees.";

function isPlainQueryObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function roundCurrency(amount) {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function formatINR(amount) {
  if (!Number.isFinite(amount)) {
    return "0";
  }
  const rounded = roundCurrency(amount);
  const hasFraction = Math.abs(rounded % 1) > 0.0001;
  return rounded.toLocaleString("en-IN", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function normalizeStayNights(rawQuery = {}, maxNights = DEFAULT_MAX_STAY_NIGHTS) {
  const boundedMax =
    Number.isInteger(maxNights) && maxNights >= 1 && maxNights <= 365
      ? maxNights
      : DEFAULT_MAX_STAY_NIGHTS;

  if (rawQuery === undefined || rawQuery === null) {
    return DEFAULT_STAY_NIGHTS;
  }
  if (!isPlainQueryObject(rawQuery)) {
    throw new ExpressError(400, "Invalid listing query parameters");
  }

  if (!Object.prototype.hasOwnProperty.call(rawQuery, "nights")) {
    return DEFAULT_STAY_NIGHTS;
  }

  const rawNights = rawQuery.nights;
  if (rawNights === undefined) {
    return DEFAULT_STAY_NIGHTS;
  }

  let parsed;
  if (typeof rawNights === "number") {
    parsed = rawNights;
  } else if (typeof rawNights === "string") {
    const trimmed = rawNights.trim();
    if (trimmed === "") {
      return DEFAULT_STAY_NIGHTS;
    }
    if (!/^\d+$/.test(trimmed)) {
      throw new ExpressError(
        400,
        `Stay duration must be an integer between 1 and ${boundedMax}`
      );
    }
    parsed = Number(trimmed);
  } else {
    throw new ExpressError(400, "Invalid stay duration");
  }

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > boundedMax) {
    throw new ExpressError(
      400,
      `Stay duration must be an integer between 1 and ${boundedMax}`
    );
  }

  return parsed;
}

function resolveTaxConfig(taxConfig = {}) {
  const mode =
    typeof taxConfig?.taxMode === "string" &&
    ["indian_gst_slabs", "flat", "none"].includes(taxConfig.taxMode)
      ? taxConfig.taxMode
      : "indian_gst_slabs";
  const label =
    typeof taxConfig?.taxLabel === "string" && taxConfig.taxLabel.trim()
      ? taxConfig.taxLabel.trim()
      : mode === "indian_gst_slabs"
        ? "Estimated GST"
        : "Estimated Tax";
  const rawRate = taxConfig?.taxRate;
  const parsedRate =
    typeof rawRate === "number" && Number.isFinite(rawRate) && rawRate >= 0 && rawRate <= 100
      ? rawRate
      : 0;
  const maxStayNights =
    Number.isInteger(taxConfig?.maxStayNights) &&
    taxConfig.maxStayNights >= 1 &&
    taxConfig.maxStayNights <= 365
      ? taxConfig.maxStayNights
      : DEFAULT_MAX_STAY_NIGHTS;

  return {
    taxMode: mode,
    taxRate: parsedRate,
    taxLabel: label,
    maxStayNights,
  };
}

function resolveTaxRule(nightlyPrice, taxConfig = {}) {
  const resolved = resolveTaxConfig(taxConfig);

  if (resolved.taxMode === "none") {
    return {
      taxMode: "none",
      taxLabel: resolved.taxLabel,
      taxRatePercent: 0,
      taxDescription: "Taxes excluded (not configured)",
      slabCode: "none",
    };
  }

  if (resolved.taxMode === "flat") {
    return {
      taxMode: "flat",
      taxLabel: resolved.taxLabel,
      taxRatePercent: resolved.taxRate,
      taxDescription: `${resolved.taxRate}% configured rate`,
      slabCode: "flat",
    };
  }

  const numericPrice = Number(nightlyPrice);
  const matchedSlab =
    INDIAN_GST_SLABS.find((slab) => numericPrice <= slab.maxNightlyRate) ||
    INDIAN_GST_SLABS[INDIAN_GST_SLABS.length - 1];

  return {
    taxMode: "indian_gst_slabs",
    taxLabel: resolved.taxLabel,
    taxRatePercent: matchedSlab.ratePercent,
    taxDescription: matchedSlab.description,
    slabCode: matchedSlab.code,
  };
}

function isValidNonNegativePrice(rawPrice) {
  if (rawPrice === null || rawPrice === undefined || typeof rawPrice === "boolean") {
    return false;
  }
  if (typeof rawPrice === "string" && rawPrice.trim() === "") {
    return false;
  }
  const numeric = Number(rawPrice);
  return Number.isFinite(numeric) && numeric >= 0;
}

function calculatePriceBreakdown({
  nightlyPrice,
  nights = DEFAULT_STAY_NIGHTS,
  taxConfig = {},
} = {}) {
  const resolved = resolveTaxConfig(taxConfig);
  const normalizedNights =
    Number.isSafeInteger(nights) && nights >= 1 && nights <= resolved.maxStayNights
      ? nights
      : DEFAULT_STAY_NIGHTS;

  if (!isValidNonNegativePrice(nightlyPrice)) {
    return {
      isPriceAvailable: false,
      nights: normalizedNights,
      maxStayNights: resolved.maxStayNights,
      basePrice: null,
      subtotal: null,
      taxMode: resolved.taxMode,
      taxLabel: resolved.taxLabel,
      taxRatePercent: 0,
      taxDescription: "Price unavailable",
      taxAmount: null,
      estimatedTotal: null,
      estimatedNightlyTotal: null,
      formattedBasePrice: null,
      formattedSubtotal: null,
      formattedTaxAmount: null,
      formattedEstimatedTotal: null,
      formattedEstimatedNightlyTotal: null,
      isEstimate: true,
      disclaimer: ESTIMATED_TOTAL_DISCLAIMER,
    };
  }

  const basePrice = roundCurrency(Number(nightlyPrice));
  const taxRule = resolveTaxRule(basePrice, resolved);
  const subtotal = roundCurrency(basePrice * normalizedNights);
  const taxAmount = roundCurrency((subtotal * taxRule.taxRatePercent) / 100);
  const estimatedTotal = roundCurrency(subtotal + taxAmount);
  const nightlyTax = roundCurrency((basePrice * taxRule.taxRatePercent) / 100);
  const estimatedNightlyTotal = roundCurrency(basePrice + nightlyTax);

  return {
    isPriceAvailable: true,
    nights: normalizedNights,
    maxStayNights: resolved.maxStayNights,
    basePrice,
    subtotal,
    taxMode: taxRule.taxMode,
    taxLabel: taxRule.taxLabel,
    taxRatePercent: taxRule.taxRatePercent,
    taxDescription: taxRule.taxDescription,
    slabCode: taxRule.slabCode,
    taxAmount,
    estimatedTotal,
    estimatedNightlyTotal,
    formattedBasePrice: formatINR(basePrice),
    formattedSubtotal: formatINR(subtotal),
    formattedTaxAmount: formatINR(taxAmount),
    formattedEstimatedTotal: formatINR(estimatedTotal),
    formattedEstimatedNightlyTotal: formatINR(estimatedNightlyTotal),
    isEstimate: true,
    disclaimer: ESTIMATED_TOTAL_DISCLAIMER,
  };
}

module.exports = {
  DEFAULT_STAY_NIGHTS,
  DEFAULT_MAX_STAY_NIGHTS,
  INDIAN_GST_SLABS,
  ESTIMATED_TOTAL_DISCLAIMER,
  roundCurrency,
  formatINR,
  normalizeStayNights,
  resolveTaxConfig,
  resolveTaxRule,
  isValidNonNegativePrice,
  calculatePriceBreakdown,
};
