(() => {
  const mapEl = document.getElementById("map");
  const statusEl = document.getElementById("mapStatus");

  function showMapStatus(message) {
    if (!statusEl) return;
    statusEl.classList.remove("d-none");
    statusEl.textContent = "";

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-location-dot text-secondary mb-2 fs-4";
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("p");
    text.className = "mb-0 text-muted small";
    text.textContent = message;

    statusEl.appendChild(icon);
    statusEl.appendChild(text);
  }

  function hideMapStatus() {
    if (statusEl) {
      statusEl.classList.add("d-none");
    }
  }

  if (!mapEl) {
    return;
  }

  const coords = mapListing?.geometry?.coordinates;
  const hasValidCoordinates =
    typeof mapListing !== "undefined" &&
    Array.isArray(coords) &&
    coords.length >= 2 &&
    Number.isFinite(Number(coords[0])) &&
    Number.isFinite(Number(coords[1]));

  if (!hasValidCoordinates) {
    showMapStatus(
      "Exact map coordinates are not available for this listing."
    );
    return;
  }

  if (typeof mapToken !== "string" || !mapToken.trim()) {
    showMapStatus(
      "Interactive map preview is currently unavailable (Mapbox token not configured)."
    );
    return;
  }

  if (typeof mapboxgl === "undefined") {
    showMapStatus(
      "Interactive map library could not be loaded. Location summary is displayed above."
    );
    return;
  }

  try {
    mapboxgl.accessToken = mapToken;
    const lngLat = [Number(coords[0]), Number(coords[1])];

    const map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/standard",
      center: lngLat,
      zoom: 9,
      interactive: false,
    });

    map.on("load", () => {
      hideMapStatus();
    });

    map.on("error", () => {
      showMapStatus(
        "Interactive map preview could not be loaded right now. Refer to the listing location details above."
      );
    });

    const popupContent = document.createElement("div");
    const titleEl = document.createElement("h6");
    titleEl.className = "fw-semibold mb-1";
    titleEl.textContent = mapListing.title || "Listing Location";
    const noteEl = document.createElement("p");
    noteEl.className = "small text-muted mb-0";
    noteEl.textContent = "Exact location will be provided after booking.";
    popupContent.appendChild(titleEl);
    popupContent.appendChild(noteEl);

    const popup = new mapboxgl.Popup({ offset: 25 }).setDOMContent(
      popupContent
    );

    new mapboxgl.Marker({ color: "#fe424d" })
      .setLngLat(lngLat)
      .setPopup(popup)
      .addTo(map);
  } catch {
    showMapStatus(
      "Interactive map preview could not be initialized for this listing."
    );
  }
})();
