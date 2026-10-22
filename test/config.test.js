// -----------------------------------------------------------------------------
// Normalization of the configuration: the address typed by the user, the app
// password or the account, the interval and the language; and the parsing of
// the real PhotoPrism answers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseServerUrl } from '../src/config.js';
import { parseAlbums, parseConfig, parsePhotos } from '../src/photoprism/model.js';
import { folderOf } from '../src/scenes.js';
import { describePhoto } from '../src/texts.js';
import { fixture } from './helpers/fakePhotoprism.js';

test('the address: bare host, page of the web client, reverse proxy path', () => {
  assert.equal(parseServerUrl('192.0.2.20:2342'), 'http://192.0.2.20:2342');
  assert.equal(parseServerUrl(' http://192.0.2.20:2342/ '), 'http://192.0.2.20:2342');
  assert.equal(
    parseServerUrl('http://192.0.2.20:2342/library/browse?view=cards'),
    'http://192.0.2.20:2342',
  );
  assert.equal(
    parseServerUrl('https://example.org/photos/library/albums'),
    'https://example.org/photos',
  );
  assert.equal(parseServerUrl('https://example.org/photos/api/v1/'), 'https://example.org/photos');
  assert.equal(parseServerUrl('ftp://192.0.2.20'), null);
  assert.equal(parseServerUrl('http://user:secret@192.0.2.20'), null, 'no credentials');
  assert.equal(parseServerUrl(''), null);
  assert.equal(parseServerUrl(42), null);
});

test('defaults, app password, account, public server, incomplete', () => {
  assert.deepEqual(normalizeConfig(), {
    url: null,
    username: null,
    password: null,
    incomplete: false,
    pollIntervalMs: 300_000,
    language: DEFAULT_CONFIG.language,
  });
  const app = normalizeConfig({ server_url: '192.0.2.20:2342', password: ' Bearer abc ' });
  assert.equal(app.url, 'http://192.0.2.20:2342');
  assert.equal(app.username, null);
  assert.equal(app.password, 'abc');
  const account = normalizeConfig({
    server_url: '192.0.2.20:2342',
    username: ' admin ',
    password: ' bearer pass ',
    poll_interval: '60',
    language: 'de',
  });
  assert.deepEqual(account, {
    url: 'http://192.0.2.20:2342',
    username: 'admin',
    password: 'bearer pass',
    incomplete: false,
    pollIntervalMs: 60_000,
    language: 'de',
  });
  assert.equal(normalizeConfig({ server_url: '192.0.2.20' }).incomplete, false, 'public mode');
  assert.equal(normalizeConfig({ server_url: '192.0.2.20', username: 'admin' }).incomplete, true);
  assert.equal(normalizeConfig({ password: 'p' }).incomplete, true);
  assert.equal(normalizeConfig({ poll_interval: '5', language: 'it' }).pollIntervalMs, 300_000);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});

test('the real answers: counters, pictures, albums', () => {
  const config = parseConfig(fixture('config'));
  assert.equal(config.version, '261007');
  assert.deepEqual(config.counts, { photos: 155, videos: 0, albums: 1, places: 2, review: 153 });
  const photos = parsePhotos(fixture('photos-added'));
  assert.equal(photos.length, 4);
  assert.equal(photos[0].place, null, '"Unknown" is no place');
  assert.match(photos[0].hash, /^[0-9a-f]{40}$/);
  assert.deepEqual(parseAlbums(fixture('albums')), [
    { uid: 'atnbgioid3pw7rir', title: 'Holidays', photos: 2 },
  ]);
  assert.deepEqual(parsePhotos({ error: 'x' }), []);
  assert.equal(parseConfig({}).counts.photos, 0);
});

test('the "last photo added" text, in the four languages', () => {
  const photo = {
    type: 'video',
    takenAt: Date.parse('2026-05-14T09:30:00Z'),
    addedAt: 0,
    place: 'Toulouse, Occitanie, France',
  };
  assert.equal(describePhoto(photo, 'en'), 'Video · May 14, 2026 · Toulouse, Occitanie, France');
  assert.equal(describePhoto(photo, 'fr'), 'Vidéo · 14 mai 2026 · Toulouse, Occitanie, France');
  assert.match(describePhoto(photo, 'de'), /^Video · 14\. Mai 2026 · Toulouse/);
  assert.match(describePhoto({ ...photo, type: 'photo', place: null }, 'es'), /^14 may 2026$/);
});

test('the folder of an indexing stays inside the originals', () => {
  assert.equal(folderOf(undefined), '/');
  assert.equal(folderOf(' /2026/05/ '), '/2026/05');
  assert.equal(folderOf('../secret'), null);
  assert.equal(folderOf('a/../../b'), null);
});
