// -----------------------------------------------------------------------------
// An in-memory PhotoPrism server behind the `request` seam of the client
// (src/photoprism/http.js). Answers come from a real PhotoPrism 261007
// (test/fixtures/photoprism/), with the behaviors that matter: app
// passwords and sessions, the public configuration answered to a refused
// token, pictures and albums that grow, an indexing or import that answers
// only once done (and "Already running" meanwhile), thumbnails by preview
// token, a server that does not answer.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/photoprism/${name}.json`, import.meta.url), 'utf8'));

// A real 224 × 224 tile of a test picture, as the server renders it.
export const TILE = readFileSync(new URL('../fixtures/photoprism/tile_224.jpg', import.meta.url));

export const APP_PASSWORD = 'AbCdEf-GhIjKl-MnOpQr-StUvWx';
export const PREVIEW_TOKEN = fixture('config').previewToken;

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

let sequence = 0;

/** A picture like the ones of /api/v1/photos, added at `at` (ms). */
export function makePhoto(
  at,
  { type = 'image', place = 'Lyon, Auvergne-Rhône-Alpes, France' } = {},
) {
  sequence += 1;
  const uid = `pt${String(sequence).padStart(14, '0')}`;
  const hash = sequence.toString(16).padStart(40, '0');
  const iso = new Date(at).toISOString().replace(/\.\d+Z$/, 'Z');
  return {
    ...fixture('photos-added')[0],
    UID: uid,
    Type: type,
    Title: `Test ${sequence}`,
    OriginalName: `test-${sequence}.jpg`,
    Hash: hash,
    PlaceLabel: place ?? 'Unknown',
    TakenAt: '2026-07-14T08:00:00Z',
    TakenAtLocal: '2026-07-14T10:00:00Z',
    CreatedAt: iso,
    UpdatedAt: iso,
  };
}

export class FakePhotoprism {
  constructor({ appPassword = APP_PASSWORD, users = { admin: 'secret-1' } } = {}) {
    this.appPasswords = new Set(appPassword ? [appPassword] : []);
    this.users = users;
    this.sessions = new Set();
    this.authMode = 'password';
    this.online = true;
    this.config = fixture('config');
    this.photos = fixture('photos-added');
    this.albums = fixture('albums');
    this.counts = { ...this.config.count };
    /** Pictures an indexing or an import adds when it ends. */
    this.pending = [];
    /** When set, an indexing or import waits for `release()`. */
    this.hold = false;
    this.job = null;
    this.forbidImport = false;
    this.requests = [];
  }

  /** A picture uploaded outside Gladys (WebDAV, the app, the web UI). */
  add(photo) {
    this.photos.unshift(photo);
    if (photo.Type === 'video') {
      this.counts.videos += 1;
    } else {
      this.counts.photos += 1;
    }
    return photo;
  }

  /** Let a held indexing or import answer. */
  release() {
    const job = this.job;
    this.job = null;
    job?.resolve();
  }

  authorized(headers) {
    if (this.authMode === 'public') {
      return true;
    }
    const token = String(headers?.Authorization ?? '').replace(/^Bearer /, '');
    return this.appPasswords.has(token) || this.sessions.has(token);
  }

  /** Expire every session (the user changed the password, the token aged). */
  expireSessions() {
    this.sessions.clear();
  }

  async handle(path, { method = 'GET', headers = {}, json: body, binary = false } = {}) {
    const url = new URL(path, 'http://photoprism');
    this.requests.push({
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      binary,
    });
    if (!this.online) {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    const route = url.pathname;
    if (route === '/api/v1/session' && method === 'POST') {
      if (this.users[body?.username] !== body?.password) {
        return json(401, fixture('invalid-credentials'));
      }
      const session = fixture('session');
      const token = `session-${this.sessions.size + 1}-${Date.now()}`;
      this.sessions.add(token);
      return json(200, { ...session, access_token: token, id: token });
    }
    const thumb = /^\/api\/v1\/t\/([0-9a-f]{40})\/([^/]+)\/tile_224$/.exec(route);
    if (thumb) {
      return thumb[2] === PREVIEW_TOKEN
        ? { status: 200, headers: { 'content-type': 'image/jpeg' }, body: TILE }
        : { status: 403, headers: {}, body: Buffer.alloc(0) };
    }
    const authorized = this.authorized(headers);
    if (route === '/api/v1/config') {
      if (!authorized) {
        return json(200, fixture('config-public'));
      }
      return json(200, {
        ...this.config,
        mode: this.authMode === 'public' ? 'public' : 'user',
        authMode: this.authMode,
        count: { ...this.counts, albums: this.albums.length },
      });
    }
    if (!authorized) {
      return json(401, fixture('unauthorized'));
    }
    if (route === '/api/v1/photos') {
      const count = Number(url.searchParams.get('count'));
      const sorted = [...this.photos].sort((a, b) => b.CreatedAt.localeCompare(a.CreatedAt));
      return json(200, sorted.slice(0, count));
    }
    if (route === '/api/v1/albums') {
      return json(200, this.albums);
    }
    if ((route === '/api/v1/index' || route === '/api/v1/import/') && method === 'POST') {
      if (route === '/api/v1/import/' && this.forbidImport) {
        return json(403, fixture('permission-denied'));
      }
      if (this.job) {
        return json(500, fixture('already-running'));
      }
      if (this.hold) {
        await new Promise((resolve) => {
          this.job = { resolve };
        });
      }
      for (const photo of this.pending.splice(0)) {
        this.add(photo);
        for (const title of body?.albums ?? []) {
          const album = this.albums.find((item) => item.Title === title);
          if (album) {
            album.PhotoCount += 1;
          } else {
            this.albums.push({
              ...fixture('albums')[0],
              UID: `at${title}`,
              Title: title,
              PhotoCount: 1,
            });
          }
        }
      }
      return json(200, fixture(route === '/api/v1/index' ? 'index-completed' : 'import-completed'));
    }
    if (route === '/api/v1/import' && method === 'POST') {
      return { status: 307, headers: { location: '/api/v1/import/' }, body: '' };
    }
    return json(404, { error: 'Not found' });
  }
}

/** The `request` seam on a fake network of servers, by origin. */
export function createNetwork(servers) {
  return {
    async request(url, options) {
      const target = new URL(url);
      const server = servers[target.origin];
      if (!server) {
        throw Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' });
      }
      return server.handle(`${target.pathname}${target.search}`, options);
    },
  };
}
