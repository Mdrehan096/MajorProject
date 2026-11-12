const ExpressError = require("./ExpressError.js");
const { DEFAULT_MAX_STAY_NIGHTS } = require("./pricing.js");

const MS_PER_DAY = 86_400_000;
const CALENDAR_DATE_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/;

function getTodayUtcMidnight(now = new Date()) {
  const ref = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate())
  );
}

function parseCalendarDate(rawValue, label = "date") {
  if (rawValue instanceof Date) {
    if (Number.isNaN(rawValue.getTime())) {
      throw new ExpressError(400, `Invalid ${label}.`);
    }
    return new Date(
      Date.UTC(
        rawValue.getUTCFullYear(),
        rawValue.getUTCMonth(),
        rawValue.getUTCDate()
      )
    );
  }

  if (typeof rawValue !== "string") {
    throw new ExpressError(400, `Invalid ${label}. Use YYYY-MM-DD format.`);
  }

  const trimmed = rawValue.trim();
  const match = CALENDAR_DATE_REGEX.exec(trimmed);
  if (!match) {
    throw new ExpressError(400, `Invalid ${label}. Use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new ExpressError(400, `Invalid calendar ${label}.`);
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ExpressError(400, `Invalid calendar ${label}.`);
  }

  return parsed;
}

function formatCalendarDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calculateStayNights(checkInDate, checkOutDate) {
  if (
    !(checkInDate instanceof Date) ||
    !(checkOutDate instanceof Date) ||
    Number.isNaN(checkInDate.getTime()) ||
    Number.isNaN(checkOutDate.getTime())
  ) {
    return 0;
  }
  return Math.round((checkOutDate.getTime() - checkInDate.getTime()) / MS_PER_DAY);
}

function normalizeStayDates(
  checkInRaw,
  checkOutRaw,
  {
    maxNights = DEFAULT_MAX_STAY_NIGHTS,
    now = new Date(),
    allowPastCheckIn = false,
  } = {}
) {
  const boundedMax =
    Number.isInteger(maxNights) && maxNights >= 1 && maxNights <= 365
      ? maxNights
      : DEFAULT_MAX_STAY_NIGHTS;

  const checkIn = parseCalendarDate(checkInRaw, "check-in date");
  const checkOut = parseCalendarDate(checkOutRaw, "check-out date");
  const todayUtc = getTodayUtcMidnight(now);

  if (!allowPastCheckIn && checkIn.getTime() < todayUtc.getTime()) {
    throw new ExpressError(400, "Check-in date cannot be in the past.");
  }

  if (checkOut.getTime() <= checkIn.getTime()) {
    throw new ExpressError(400, "Check-out date must be after check-in date.");
  }

  const nights = calculateStayNights(checkIn, checkOut);
  if (!Number.isSafeInteger(nights) || nights < 1 || nights > boundedMax) {
    throw new ExpressError(
      400,
      `Stay duration must be between 1 and ${boundedMax} nights.`
    );
  }

  return {
    checkIn,
    checkOut,
    checkInStr: formatCalendarDate(checkIn),
    checkOutStr: formatCalendarDate(checkOut),
    nights,
  };
}

function doDateRangesOverlap(startA, endA, startB, endB) {
  if (
    !(startA instanceof Date) ||
    !(endA instanceof Date) ||
    !(startB instanceof Date) ||
    !(endB instanceof Date)
  ) {
    return false;
  }
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

module.exports = {
  MS_PER_DAY,
  getTodayUtcMidnight,
  parseCalendarDate,
  formatCalendarDate,
  calculateStayNights,
  normalizeStayDates,
  doDateRangesOverlap,
};

