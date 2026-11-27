/**
 * Minimal HTML escaping for values that end up in markup built as strings.
 *
 * Repository file names and EEPROM fields (part number, serial, vendor) come
 * from outside the app - a profile dump or a fork of the repository can carry
 * arbitrary bytes - and are interpolated into `<option>` markup. Escaping them
 * keeps a hostile or simply unusual dump from injecting markup into the page.
 *
 * Prefer jQuery's `.text()` / `.val()` where a single element is built; this
 * helper is for the template-literal appends.
 *
 * @param {unknown} value - The value to escape (coerced to string).
 * @return {string} The escaped text, safe inside an element's content or an
 *                  attribute value wrapped in double quotes.
 */
export function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
