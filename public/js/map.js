(() => {
  const mapEl = document.getElementById("map");
  if (
    !mapEl ||
    typeof mapboxgl === "undefined" ||
    typeof mapToken !== "string" ||
    !mapToken ||
    typeof mapListing === "undefined" ||
    !mapListing?.geometry?.coordinates ||
    !Array.isArray(mapListing.geometry.coordinates) ||
    mapListing.geometry.coordinates.length < 2
  ) {
    return;
  }

  mapboxgl.accessToken = mapToken;
  const coordinates = mapListing.geometry.coordinates;

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/standard",
    center: coordinates,
    zoom: 9,
    interactive: false,
  });

  const popupContent = document.createElement("div");
  const titleEl = document.createElement("h1");
  titleEl.textContent = mapListing.title || "Listing Location";
  const noteEl = document.createElement("p");
  noteEl.textContent = "Exact Location will be provided after bookings";
  popupContent.appendChild(titleEl);
  popupContent.appendChild(noteEl);

  const popup = new mapboxgl.Popup({ offset: 25 }).setDOMContent(popupContent);

  new mapboxgl.Marker({ color: "red" })
    .setLngLat(coordinates)
    .setPopup(popup)
    .addTo(map);
})();
