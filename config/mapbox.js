const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const { env } = require("./env.js");
const ExpressError = require("../utils/ExpressError.js");
const { logWarn } = require("../utils/logger.js");

const mapToken = env.mapbox.token;
let geocodingClient = null;

function getGeocodingClient() {
  if (!mapToken) {
    throw new ExpressError(500, "Map service is not configured.");
  }
  if (!geocodingClient) {
    geocodingClient = mbxGeocoding({ accessToken: mapToken });
  }
  return geocodingClient;
}

async function geocodeLocation(location, { limit = 1 } = {}) {
  const client = getGeocodingClient();
  let response;
  try {
    response = await client
      .forwardGeocode({
        query: location,
        limit,
      })
      .send();
  } catch (err) {
    if (err instanceof ExpressError) {
      throw err;
    }
    logWarn("mapbox.geocode_failed", {
      message: err?.message || "Unknown geocoding error",
      statusCode: err?.statusCode || err?.status || undefined,
    });
    throw new ExpressError(
      502,
      "Location geocoding service is temporarily unavailable. Please try again."
    );
  }

  if (!response?.body?.features || response.body.features.length === 0) {
    throw new ExpressError(400, "Invalid location: could not geocode location");
  }

  return response.body.features[0].geometry;
}

module.exports = {
  mapToken,
  getGeocodingClient,
  geocodeLocation,
};

