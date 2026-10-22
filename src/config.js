// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One PhotoPrism server: its address, and either an app password (no user
// name: sent as a Bearer token) or the user name and password of an account
// (a session is opened with them). Neither: a server in public mode.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Reading intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '300', '900'];

export const DEFAULT_CONFIG = {
  server_url: '',
  username: '',
  password: '',
  poll_interval: '300',
  language: 'fr',
};

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.20:2342`), or the URL copied from the browser, with the path of
 * a server behind a reverse proxy (`https://example.org/photos/library/browse`).
 * HTTP by default; the query, the fragment, a trailing slash and the page of
 * the web client dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/base]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  // A page of the web client (/library/...) or the API copied: keep the base.
  const path = url.pathname.replace(/\/(library|api)(\/.*)?$/i, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const typed = text('server_url');
  const url = parseServerUrl(typed);
  const username = text('username');
  // An app password pasted with its "Bearer " prefix still works.
  const password = username ? text('password') : text('password').replace(/^bearer\s+/i, '');
  // A user name needs its password; a password alone is an app password.
  const usable = Boolean(url) && !(username && !password);
  return {
    url: usable ? url : null,
    username: usable && username ? username : null,
    password: usable && password ? password : null,
    // Something typed, but not usable: the status says so.
    incomplete: Boolean(typed || username || password) && !usable,
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
