
   mapboxgl.accessToken = mapToken;
   const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/standard",
    center: listing.geometry.coordinates,
    zoom: 9,
    interactive: false
});

       const marker = new mapboxgl.Marker({ color: 'red'})
        .setLngLat(listing.geometry.coordinates) // listing.geometry.cpprdinates
        .setPopup(new mapboxgl.Popup({offset: 25})
        .setHTML(
            `<h1>${listing.title}</h1><p> Exact Location will be provided after bookings </p>`
        )
    )
        .addTo(map);
