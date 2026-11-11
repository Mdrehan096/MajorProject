/**
 * Safely serialize JavaScript values for embedding inside <script> tags.
 * Escapes HTML-significant characters and Unicode line separators so
 * payloads like `</script>` cannot break out of script context.
 */
function safeJson(value) {
  const json = JSON.stringify(value === undefined ? null : value);
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\//g, "\\u002f")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

module.exports = safeJson;

