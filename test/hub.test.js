// -----------------------------------------------------------------------------
// The hub against the fake PhotoPrism server: the device and its states, the
// new photos and album events (once, also across restarts), the indexing and
// import jobs, the sessions of a user name and password, the error statuses.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOB_KINDS, TRIGGERS } from '../src/hub.js';
import {
  CONFIG,
  FakePhotoprism,
  SERVER_URL,
  createClock,
  createWorld,
  feature,
  libraryDevice,
  makePhoto,
  until,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);
const state = (w, key) => w.fake.lastState(feature(w.gladys, key));

test('discovers one library device, read by the container', async (t) => {
  const w = await world(t);
  const [device, ...others] = w.fake.discoveredDevices;
  assert.deepEqual(others, []);
  assert.equal(device.name, 'PhotoPrism');
  assert.equal(device.external_id, libraryDevice(w.gladys));
  assert.equal(device.should_poll, false);
  assert.deepEqual(device.params, [{ name: 'PHOTOPRISM_URL', value: SERVER_URL }]);
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: libraryDevice(w.gladys),
    transport: 'local',
  });
});

test('publishes the counters of the real configuration at the first reading', async (t) => {
  const w = await world(t);
  assert.equal(state(w, 'photos'), 155);
  assert.equal(state(w, 'videos'), 0);
  assert.equal(state(w, 'albums'), 1);
  assert.equal(state(w, 'places'), 2);
  assert.equal(state(w, 'review'), 153);
  assert.equal(state(w, 'indexing'), 0);
  // The last picture of the captures has no place: its day only.
  assert.equal(state(w, 'latest'), 'Jan 19, 2026');
  assert.deepEqual(w.fake.sceneEvents, [], 'the first reading announces nothing');
});

test('new pictures fire photos_added once, with the last one described', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock, config: { ...CONFIG, language: 'fr' } });
  clock.advance(60_000);
  w.server.add(makePhoto(clock.now() - 2000));
  w.server.add(makePhoto(clock.now() - 1000, { type: 'video' }));
  const last = w.server.add(makePhoto(clock.now()));
  await w.hub.refresh();
  await w.hub.refresh();
  const fired = events(w, TRIGGERS.PHOTOS_ADDED);
  assert.equal(fired.length, 1);
  assert.deepEqual(fired[0].data, {
    device: libraryDevice(w.gladys),
    count: 3,
    photos: 2,
    videos: 1,
    title: last.Title,
    place: 'Lyon, Auvergne-Rhône-Alpes, France',
    taken_at: '2026-07-14',
  });
  assert.equal(state(w, 'latest'), '14 juil. 2026 · Lyon, Auvergne-Rhône-Alpes, France');
  assert.equal(state(w, 'photos'), 157);
  assert.equal(state(w, 'videos'), 1);
});

test('pictures added in the same second as the cursor are not missed nor repeated', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  const at = Date.parse('2026-10-22T17:00:00Z');
  w.server.add(makePhoto(at));
  await w.hub.refresh();
  w.server.add(makePhoto(at));
  await w.hub.refresh();
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.PHOTOS_ADDED).map((event) => event.data.count),
    [1, 1],
  );
});

test('more pictures than one page: the count comes from the counters', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock, timings: { recentCount: 5 } });
  for (let i = 0; i < 12; i += 1) {
    w.server.add(makePhoto(clock.now() + i * 1000));
  }
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.PHOTOS_ADDED)[0].data.count, 12);
});

test('the cursor survives a restart: nothing announced twice, the gap announced', async (t) => {
  const clock = createClock();
  const server = new FakePhotoprism();
  const first = await createWorld({ clock, server });
  const dataDir = first.dataDir;
  server.add(makePhoto(clock.now()));
  await first.hub.refresh();
  assert.equal(events(first, TRIGGERS.PHOTOS_ADDED).length, 1);
  await first.app.stop();

  clock.advance(3600_000);
  server.add(makePhoto(clock.now()));
  const second = await world(t, { clock, server, dataDir });
  assert.deepEqual(
    events(second, TRIGGERS.PHOTOS_ADDED).map((event) => event.data.count),
    [1],
    'only the picture added while stopped',
  );
});

test('an album that grows fires album_photos_added; a new album counts from zero', async (t) => {
  const w = await world(t);
  w.server.albums[0].PhotoCount += 3;
  w.server.albums.push({ ...w.server.albums[0], UID: 'atnew', Title: 'Birthday', PhotoCount: 2 });
  await w.hub.refresh();
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).map((event) => event.data),
    [
      { device: libraryDevice(w.gladys), album: 'Holidays', count: 3, total: 5 },
      { device: libraryDevice(w.gladys), album: 'Birthday', count: 2, total: 2 },
    ],
  );
  // Removing pictures fires nothing.
  w.server.albums[0].PhotoCount = 1;
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).length, 2);
});

test('a quick indexing answers in the action and fires indexing_finished', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  w.server.pending.push(makePhoto(clock.now()), makePhoto(clock.now()));
  const ack = await w.fake.sceneAction('start_indexing', { folder: '2026/05/', rescan: true });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { finished: true });
  const request = w.server.requests.find((item) => item.path === '/api/v1/index');
  assert.deepEqual(request.body, { path: '/2026/05', rescan: true, cleanup: false });
  assert.equal(events(w, TRIGGERS.PHOTOS_ADDED)[0].data.count, 2);
  assert.deepEqual(events(w, TRIGGERS.INDEXING_FINISHED)[0].data, {
    device: libraryDevice(w.gladys),
    kind: JOB_KINDS.INDEX,
    result: 'success',
    seconds: 92,
    added: 2,
  });
});

test('a long import: indexing 1, additions held back, then announced with its end', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  w.server.hold = true;
  w.server.pending.push(makePhoto(clock.now()));
  const ack = await w.fake.sceneAction('start_import', { album: 'Phone' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { finished: false });
  assert.equal(state(w, 'indexing'), 1);
  const request = w.server.requests.find((item) => item.path === '/api/v1/import/');
  assert.deepEqual(request.body, { path: '/', move: false, albums: ['Phone'] });

  // A picture uploaded meanwhile waits for the end of the import.
  w.server.add(makePhoto(clock.now()));
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.PHOTOS_ADDED).length, 0);

  // A second job is refused while the first runs.
  const second = await w.fake.sceneAction('start_indexing', {});
  assert.equal(second.success, false);
  assert.match(second.error, /still running/);

  w.server.release();
  await until(() => events(w, TRIGGERS.INDEXING_FINISHED).length === 1, 'the end');
  assert.equal(state(w, 'indexing'), 0);
  assert.equal(events(w, TRIGGERS.PHOTOS_ADDED)[0].data.count, 2);
  assert.deepEqual(
    events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).map((event) => [event.data.album, event.data.count]),
    [['Phone', 1]],
  );
  assert.equal(events(w, TRIGGERS.INDEXING_FINISHED)[0].data.kind, JOB_KINDS.IMPORT);
});

test('an indexing already running elsewhere, or a refused import, fails the action', async (t) => {
  const w = await world(t);
  w.server.job = { resolve() {} }; // started from the PhotoPrism interface
  const busy = await w.fake.sceneAction('start_indexing', {});
  assert.equal(busy.success, false);
  assert.match(busy.error, /already running/);
  w.server.job = null;
  w.server.forbidImport = true;
  const denied = await w.fake.sceneAction('start_import', {});
  assert.equal(denied.success, false);
  assert.match(denied.error, /permission denied/);
  assert.equal(events(w, TRIGGERS.INDEXING_FINISHED).length, 0, 'nothing ran');
  assert.equal(state(w, 'indexing'), 0);
  const parent = await w.fake.sceneAction('start_indexing', { folder: '../etc' });
  assert.equal(parent.success, false);
});

test('a user name and password open a session, opened again when it expires', async (t) => {
  const w = await world(t, {
    config: { server_url: SERVER_URL, username: 'admin', password: 'secret-1' },
  });
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.server.requests.filter((item) => item.path === '/api/v1/session').length, 1);
  w.server.expireSessions();
  await w.hub.refresh();
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.server.requests.filter((item) => item.path === '/api/v1/session').length, 2);
});

test('refused credentials, a server down, a public server: the status says so', async (t) => {
  const refused = await world(t, { config: { server_url: SERVER_URL, password: 'wrong' } });
  assert.equal(refused.fake.connectionStatus.connected, false);
  assert.match(refused.fake.connectionStatus.message.en, /refused/);
  assert.deepEqual(refused.fake.sceneEvents, []);

  const w = await world(t);
  w.server.online = false;
  await w.hub.refresh();
  assert.match(w.fake.connectionStatus.message.fr, /^PhotoPrism : le serveur ne répond pas/);
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  w.server.online = true;
  await w.hub.refresh();
  assert.equal(w.fake.connectionStatus.connected, true);

  const server = new FakePhotoprism();
  server.authMode = 'public';
  const open = await world(t, { server, config: { server_url: SERVER_URL } });
  assert.equal(open.fake.connectionStatus.connected, true);
  assert.equal(open.fake.lastState(feature(open.gladys, 'photos')), 155);
});

test('without configuration: no device, the status asks for the address', async (t) => {
  const w = await world(t, { config: { language: 'en' } });
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.match(w.fake.connectionStatus.message.en, /Enter the address/);
  const ack = await w.fake.sceneAction('start_indexing', {});
  assert.equal(ack.success, false);
  const incomplete = await world(t, { config: { server_url: SERVER_URL, username: 'admin' } });
  assert.match(incomplete.fake.connectionStatus.message.en, /incomplete/);
});

test('the device added later gets every state again', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[0]);
  const sent = w.fake.states.slice(before);
  assert.equal(sent.length, 7);
});

test('an unchanged value is republished after 12 hours only', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  const count = () =>
    w.fake.states.filter((s) => s.device_feature_external_id === feature(w.gladys, 'photos'))
      .length;
  await w.hub.refresh();
  assert.equal(count(), 1);
  clock.advance(12 * 3600_000);
  await w.hub.refresh();
  assert.equal(count(), 2);
});

test('past the cap, the other albums are announced at the next reading', async (t) => {
  const w = await world(t, { timings: { maxEventsPerRead: 1 } });
  w.server.albums[0].PhotoCount += 1;
  w.server.albums.push({ ...w.server.albums[0], UID: 'atnew', Title: 'Birthday', PhotoCount: 2 });
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).length, 1);
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).map((event) => event.data.album),
    ['Holidays', 'Birthday'],
  );
});

test('a session whose token is ignored (a proxy dropping the header) logs in once per reading', async (t) => {
  const server = new FakePhotoprism();
  const w = await world(t, {
    server,
    config: { server_url: SERVER_URL, username: 'admin', password: 'secret-1' },
  });
  server.authorized = () => false; // the Authorization header never arrives
  await w.hub.refresh();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /refused/);
  assert.ok(server.requests.filter((item) => item.path === '/api/v1/session').length <= 3);
});
