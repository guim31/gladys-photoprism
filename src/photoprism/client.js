// -----------------------------------------------------------------------------
// PhotoPrism REST API client (/api/v1), checked against PhotoPrism 261007.
//
// Authentication, sent as a Bearer token, never in the URL nor in the logs:
// - an app password (Settings → Account → Apps and Devices, or
//   `photoprism auth add`): used as is;
// - a user name and password: a session is opened (POST /api/v1/session) and
//   opened again once when the server stops accepting its token;
// - nothing: a server in public mode (PHOTOPRISM_AUTH_MODE=public).
//
// Pitfalls of the real server:
// - /api/v1/config answers 200 to a refused token, with the public
//   configuration (`mode: "public"`, every count at 0): a refused token is
//   recognized there, not by the status;
// - POST /api/v1/index and POST /api/v1/import/ answer only once the work is
//   done (92 s for 150 pictures on a small machine), and HTTP 500
//   `{"error":"Already running"}` while another indexing or import runs;
// - the import route ends with a slash (without it: a 307 redirect).
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // app password, user name or password refused (401)
  FORBIDDEN: 'forbidden', // the account or app password lacks the right (403)
  NOT_PHOTOPRISM: 'not_photoprism', // something answers, not a PhotoPrism server
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, a login page)
  BUSY: 'busy', // an indexing or an import is already running
  HTTP: 'http', // any other HTTP error
});

export class PhotoprismError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'PhotoprismError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// An indexing of a large library takes hours, and the server sends nothing
// until it is done: the socket may stay silent that long.
export const JOB_TIMEOUT_MS = 12 * 60 * 60_000;

// Thumbnail size asked for the widget (square, 224 px): a list row renders it under 64 px.
export const THUMB_SIZE = 'tile_224';

export class PhotoprismClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, with the path of a reverse proxy if any
   * @param {string|null} [options.username] null: `password` is an app password
   * @param {string|null} [options.password]
   * @param {Function} [options.request] HTTP seam (src/photoprism/http.js)
   */
  constructor({ url, username = null, password = null, request = httpRequest }) {
    this.url = url;
    this.username = username;
    this.password = password;
    this.request = request;
    this.token = username ? null : password;
    this.login = null;
  }

  /** The session of a user name and password, opened once for concurrent calls. */
  async sessionToken() {
    if (!this.username || this.token) {
      return this.token;
    }
    this.login ??= this.send('/api/v1/session', {
      method: 'POST',
      json: { username: this.username, password: this.password },
    })
      .then((session) => {
        if (typeof session?.access_token !== 'string' || !session.access_token) {
          throw new PhotoprismError(ERROR_KINDS.NOT_PHOTOPRISM, 'The session answer has no token');
        }
        this.token = session.access_token;
        return this.token;
      })
      .finally(() => {
        this.login = null;
      });
    return this.login;
  }

  /** One request, authenticated; a session is opened again once when refused. */
  async call(path, options = {}) {
    const token = await this.sessionToken();
    try {
      return await this.send(path, { ...options, token });
    } catch (err) {
      if (err.kind !== ERROR_KINDS.AUTH || !this.username || this.token !== token) {
        throw err;
      }
      this.token = null; // expired or revoked session
      return this.send(path, { ...options, token: await this.sessionToken() });
    }
  }

  async send(path, { method = 'GET', json, binary = false, timeoutMs, token = null } = {}) {
    let answer;
    try {
      answer = await this.request(`${this.url}${path}`, {
        method,
        binary,
        json,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        ...(timeoutMs ? { timeoutMs } : {}),
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new PhotoprismError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      throw new PhotoprismError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
    }
    const route = path.split('?')[0];
    const { status, headers = {}, body } = answer;
    if (status === 401) {
      throw new PhotoprismError(ERROR_KINDS.AUTH, 'Credentials refused', { status });
    }
    if (status === 403) {
      throw new PhotoprismError(ERROR_KINDS.FORBIDDEN, `${route}: permission denied`, { status });
    }
    if (status >= 300 && status < 400) {
      throw new PhotoprismError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status < 200 || status >= 300) {
      if (/already running/i.test(String(body))) {
        throw new PhotoprismError(ERROR_KINDS.BUSY, `${route}: already running`, { status });
      }
      throw new PhotoprismError(ERROR_KINDS.HTTP, `${route} answered HTTP ${status}`, { status });
    }
    if (binary) {
      return { body, contentType: String(headers['content-type'] ?? '') };
    }
    try {
      return body === '' ? null : JSON.parse(body);
    } catch {
      // A reverse proxy's login page, another web application...
      throw new PhotoprismError(ERROR_KINDS.NOT_PHOTOPRISM, `${route} did not answer JSON`);
    }
  }

  /**
   * The client configuration: version, counts, preview token. A refused
   * token gets the public configuration: reported as such.
   */
  async config() {
    let config;
    try {
      config = await this.call('/api/v1/config');
    } catch (err) {
      if (err.kind === ERROR_KINDS.HTTP && err.status === 404) {
        throw new PhotoprismError(ERROR_KINDS.NOT_PHOTOPRISM, 'No PhotoPrism API at this address');
      }
      throw err;
    }
    if (!config || typeof config !== 'object' || !config.count || typeof config.mode !== 'string') {
      throw new PhotoprismError(ERROR_KINDS.NOT_PHOTOPRISM, 'No PhotoPrism API at this address');
    }
    if (config.mode === 'public' && config.authMode !== 'public') {
      if (this.username && this.token) {
        this.token = null; // the session expired: open another one, once
        return this.config();
      }
      throw new PhotoprismError(ERROR_KINDS.AUTH, 'Credentials refused', { status: 401 });
    }
    return config;
  }

  /** The last pictures and videos added to the library, the newest first. */
  recent(count) {
    return this.call(`/api/v1/photos?count=${count}&offset=0&order=added&merged=true`);
  }

  /** The albums made by the users (not the moments, folders or calendar). */
  albums(count = 1000) {
    return this.call(`/api/v1/albums?count=${count}&offset=0&type=album&order=name`);
  }

  /**
   * Index the originals (new and changed files; every file with `rescan`).
   * Answers once the indexing is done.
   */
  index({ path = '/', rescan = false } = {}) {
    return this.call('/api/v1/index', {
      method: 'POST',
      json: { path, rescan, cleanup: false },
      timeoutMs: JOB_TIMEOUT_MS,
    });
  }

  /**
   * Import the files of the import folder (copied, not moved), into an album
   * when one is named. Answers once the import is done.
   */
  import({ album = null } = {}) {
    return this.call('/api/v1/import/', {
      method: 'POST',
      json: { path: '/', move: false, ...(album ? { albums: [album] } : {}) },
      timeoutMs: JOB_TIMEOUT_MS,
    });
  }

  /** A thumbnail (JPEG), by file hash and preview token: no session needed. */
  thumbnail(hash, previewToken) {
    const segment = (value) => encodeURIComponent(String(value));
    return this.send(`/api/v1/t/${segment(hash)}/${segment(previewToken)}/${THUMB_SIZE}`, {
      binary: true,
    });
  }
}
