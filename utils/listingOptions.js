const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 48;
const MAX_PAGE = 10000;
const MAX_SEARCH_LENGTH = 100;

const LISTING_CATEGORIES = Object.freeze([
  Object.freeze({ slug: "trending", label: "Trending", icon: "fa-solid fa-fire" }),
  Object.freeze({ slug: "rooms", label: "Rooms", icon: "fa-solid fa-bed" }),
  Object.freeze({ slug: "iconic-cities", label: "Iconic Cities", icon: "fa-solid fa-mountain-city" }),
  Object.freeze({ slug: "mountains", label: "Mountains", icon: "fa-solid fa-mountain" }),
  Object.freeze({ slug: "castles", label: "Castles", icon: "fa-brands fa-fort-awesome" }),
  Object.freeze({ slug: "amazing-pools", label: "Amazing Pools", icon: "fa-solid fa-person-swimming" }),
  Object.freeze({ slug: "camping", label: "Camping", icon: "fa-solid fa-campground" }),
  Object.freeze({ slug: "farms", label: "Farms", icon: "fa-solid fa-cow" }),
  Object.freeze({ slug: "arctic", label: "Arctic", icon: "fa-solid fa-snowflake" }),
  Object.freeze({ slug: "domes", label: "Domes", icon: "fa-solid fa-igloo" }),
]);

const LISTING_CATEGORY_SLUGS = Object.freeze(
  LISTING_CATEGORIES.map((category) => category.slug)
);

const LISTING_CATEGORY_MAP = new Map(
  LISTING_CATEGORIES.map((category) => [category.slug, category])
);

const SORT_OPTIONS = Object.freeze([
  Object.freeze({
    key: "newest",
    label: "Newest First",
    sortSpec: Object.freeze({ _id: -1 }),
  }),
  Object.freeze({
    key: "oldest",
    label: "Oldest First",
    sortSpec: Object.freeze({ _id: 1 }),
  }),
  Object.freeze({
    key: "price_asc",
    label: "Price: Low to High",
    sortSpec: Object.freeze({ price: 1, _id: 1 }),
  }),
  Object.freeze({
    key: "price_desc",
    label: "Price: High to Low",
    sortSpec: Object.freeze({ price: -1, _id: -1 }),
  }),
]);

const SORT_OPTION_MAP = new Map(
  SORT_OPTIONS.map((option) => [option.key, option])
);

function getDefaultListingQuery() {
  return {
    q: "",
    category: "",
    minPrice: undefined,
    maxPrice: undefined,
    sort: "newest",
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
  };
}

function buildListingsUrl(filters = {}, overrides = {}) {
  const merged = {
    ...getDefaultListingQuery(),
    ...(filters && typeof filters === "object" ? filters : {}),
    ...(overrides && typeof overrides === "object" ? overrides : {}),
  };

  const params = new URLSearchParams();
  if (typeof merged.q === "string" && merged.q.trim()) {
    params.set("q", merged.q.trim());
  }
  if (typeof merged.category === "string" && merged.category.trim()) {
    params.set("category", merged.category.trim());
  }
  if (
    merged.minPrice !== undefined &&
    merged.minPrice !== null &&
    String(merged.minPrice).trim() !== ""
  ) {
    params.set("minPrice", String(merged.minPrice).trim());
  }
  if (
    merged.maxPrice !== undefined &&
    merged.maxPrice !== null &&
    String(merged.maxPrice).trim() !== ""
  ) {
    params.set("maxPrice", String(merged.maxPrice).trim());
  }
  if (typeof merged.sort === "string" && merged.sort.trim() && merged.sort.trim() !== "newest") {
    params.set("sort", merged.sort.trim());
  }
  const numericLimit = Number(merged.limit);
  if (Number.isInteger(numericLimit) && numericLimit > 0 && numericLimit !== DEFAULT_LIMIT) {
    params.set("limit", String(numericLimit));
  }
  const numericPage = Number(merged.page);
  if (Number.isInteger(numericPage) && numericPage > 1) {
    params.set("page", String(numericPage));
  }

  const queryString = params.toString();
  return queryString ? `/listings?${queryString}` : "/listings";
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_PAGE,
  MAX_SEARCH_LENGTH,
  LISTING_CATEGORIES,
  LISTING_CATEGORY_SLUGS,
  LISTING_CATEGORY_MAP,
  SORT_OPTIONS,
  SORT_OPTION_MAP,
  getDefaultListingQuery,
  buildListingsUrl,
};

