// -----------------------------------------------------------------------------
// The hub: reads the PhotoPrism server on a timer of the container, publishes
// the states of the library device when they change, fires the scene events,
// and runs the indexing and the imports asked by the scenes and the widget.
//
// One reading (every `pollIntervalMs`, 1 to 15 min, configuration) is three
// requests: the configuration (version, counters), the last pictures added,
// the albums. The pictures newer than a cursor fire `photos_added`; an album
// holding more pictures than at the previous reading fires
// `album_photos_added`. The cursor and the album counts live under /data:
// an addition is announced once, also across restarts.
//
// PhotoPrism answers an indexing or an import only once it is done, and has
// no route telling whether one runs: "indexing in progress" is the job
// started from Gladys. While it runs, the additions it makes are held back,
// then announced together at its end, before `indexing_finished`.
//
// Gladys never polls the device (should_poll: false): the scene events must
// fire even before the device is added.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { PhotoprismClient } from './photoprism/client.js';
import {
  MEDIA_TYPES,
  parseAlbums,
  parseConfig,
  parseJobSeconds,
  parsePhotos,
} from './photoprism/model.js';
import { buildLibraryDevice, featureValues, libraryIds } from './devices.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  JOB_TEXT,
  REPORT_TEXT,
  describePhoto,
  everyLanguage,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'photoprism-hub' });

// Widget keys (manifest `widgets`): permanent once published.
export const WIDGET_KEYS = Object.freeze({
  LIBRARY: 'library',
});

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  PHOTOS_ADDED: 'photos_added',
  ALBUM_PHOTOS_ADDED: 'album_photos_added',
  INDEXING_FINISHED: 'indexing_finished',
});

// Values of the `kind` and `result` fields of `indexing_finished`: permanent.
export const JOB_KINDS = Object.freeze({ INDEX: 'index', IMPORT: 'import' });
export const JOB_RESULTS = Object.freeze({ SUCCESS: 'success', ERROR: 'error' });

export const HUB_TIMINGS = {
  // Pictures read at each reading (the newest first).
  recentCount: 50,
  // Pictures kept for the widget.
  shownCount: 8,
  // An indexing or import answering before this is reported by the action itself.
  earlyMs: 3000,
  // At most this many album events per reading.
  maxEventsPerRead: 10,
  // Republish an unchanged value this often (Gladys flags a value older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
};

const signature = (config) => JSON.stringify([config.url, config.username, config.password]);

const emptySnapshot = () => ({ counts: null, latest: null, indexing: false });

// Not unref'd: while a job request is pending, this timer is what keeps the loop alive.
const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class PhotoprismHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/photoprism/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.signature = null;
    this.reachable = null;
    this.error = null;
    this.version = null;
    this.previewToken = null;
    this.snapshot = emptySnapshot();
    /** The last pictures added, the newest first (parsePhotos). */
    this.recent = [];
    this.albums = [];
    /** Last value published per feature external id: { value, at }. */
    this.published = new Map();
    this.transport = null;
    this.connection = null;
    this.devicesKey = null;
    this.saved = { url: null, cursor: null, albums: null };
    /** The indexing or import started from Gladys: { kind, startedAt, client }. */
    this.job = null;
    this.timer = null;
    this.running = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      url: typeof saved.url === 'string' ? saved.url : null,
      cursor: validCursor(saved.cursor),
      albums: saved.albums && typeof saved.albums === 'object' ? saved.albums : null,
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transport = null;
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    if (signature(config) !== this.signature) {
      this.signature = signature(config);
      this.reset();
      this.client = config.url
        ? new PhotoprismClient({
            url: config.url,
            username: config.username,
            password: config.password,
            request: this.request,
          })
        : null;
      // Another server: its additions are counted again from now.
      if (config.url && this.saved.url !== config.url) {
        this.saved = { url: config.url, cursor: null, albums: null };
        this.store.save(this.saved);
      }
    }
    try {
      await this.publishDevices();
      await this.refresh();
    } finally {
      // Even after a failure: the next tick tries again.
      this.schedule();
    }
  }

  reset() {
    this.published.clear();
    this.reachable = null;
    this.error = null;
    this.version = null;
    this.previewToken = null;
    this.snapshot = emptySnapshot();
    this.snapshot.indexing = Boolean(this.job);
    this.recent = [];
    this.albums = [];
    this.transport = null;
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    // A running indexing is not waited for: it may last hours, PhotoPrism carries on.
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(async () => {
      try {
        await this.refresh();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Reading failed', err, 'error');
      }
      this.schedule();
    }, this.config.pollIntervalMs);
  }

  // --- Reading the server ------------------------------------------------------

  /** One reading. Concurrent calls share the reading in progress. */
  refresh() {
    if (this.running && this.runningClient === this.client) {
      return this.running;
    }
    // A reading of a previous configuration may still run: this one follows it.
    const previous = this.running ?? Promise.resolve();
    const run = previous
      .catch(() => {})
      .then(() => this.read())
      .finally(() => {
        if (this.running === run) {
          this.running = null;
        }
      });
    this.running = run;
    this.runningClient = this.client;
    return run;
  }

  async read() {
    const client = this.client;
    if (!client) {
      await this.afterChanges(false);
      return;
    }
    let changed;
    try {
      const config = parseConfig(await client.config());
      const photos = parsePhotos(await client.recent(this.timings.recentCount));
      const albums = parseAlbums(await client.albums());
      if (client !== this.client) {
        return; // reconfigured meanwhile: this reading is dropped
      }
      if (this.error) {
        logger.info('PhotoPrism: connection restored');
      } else if (this.reachable === null) {
        logger.info(`PhotoPrism: connected, version ${config.version}`);
      }
      changed = this.reachable !== true || this.changedForWidget(config, photos);
      this.error = null;
      this.reachable = true;
      this.version = config.version;
      this.previewToken = config.previewToken;
      this.snapshot.counts = config.counts;
      this.snapshot.latest = photos[0] ? describePhoto(photos[0], this.config.language) : null;
      this.recent = photos.slice(0, this.timings.shownCount);
      this.albums = albums;
      // The additions of a job started from Gladys are announced at its end.
      if (!this.job) {
        await this.announcePhotos(photos, config.counts);
        await this.announceAlbums(albums);
      }
      await this.publishStates();
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      if (client !== this.client) {
        return;
      }
      changed = this.reachable !== false;
      await this.applyFailure(err);
    }
    await this.afterChanges(changed);
  }

  changedForWidget(config, photos) {
    const shown = (counts, list) =>
      JSON.stringify([counts, list.slice(0, this.timings.shownCount).map((photo) => photo.uid)]);
    return shown(config.counts, photos) !== shown(this.snapshot.counts, this.recent);
  }

  async applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.reachable = false;
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`PhotoPrism: ${err.message}`);
    } else {
      logger.debug(`PhotoPrism: ${err.message} (again)`);
    }
  }

  /**
   * Announce the pictures added since the cursor (the newest addition seen).
   * The first reading of a server is the starting point, not news.
   */
  async announcePhotos(photos, counts) {
    const total = totalOf(counts);
    const newest = cursorOf(photos);
    const cursor = this.saved.cursor;
    const previousTotal = this.lastTotal;
    this.lastTotal = total;
    if (!cursor) {
      this.saved.cursor = newest ?? { at: 0, uids: [] };
      this.store.save(this.saved);
      return;
    }
    const fresh = photos.filter(
      (photo) =>
        photo.addedAt > cursor.at ||
        (photo.addedAt === cursor.at && !cursor.uids.includes(photo.uid)),
    );
    if (fresh.length === 0) {
      return;
    }
    this.saved.cursor = mergeCursor(cursor, newest);
    this.store.save(this.saved);
    // Every picture read is new: more may have come than the page holds.
    const more =
      fresh.length === photos.length && Number.isFinite(previousTotal)
        ? Math.max(0, total - previousTotal)
        : 0;
    const videos = fresh.filter((photo) => photo.type === MEDIA_TYPES.VIDEO).length;
    const [latest] = fresh;
    logger.debug(`New pictures: ${Math.max(fresh.length, more)}`);
    await this.fire(TRIGGERS.PHOTOS_ADDED, {
      count: Math.max(fresh.length, more),
      photos: fresh.length - videos,
      videos,
      title: latest.title,
      place: latest.place,
      taken_at:
        latest.takenAt === null ? null : new Date(latest.takenAt).toISOString().slice(0, 10),
    });
  }

  /** Announce the albums holding more pictures than at the previous reading. */
  async announceAlbums(albums) {
    const previous = this.saved.albums;
    const current = Object.fromEntries(albums.map((album) => [album.uid, album.photos]));
    const grown = previous
      ? albums
          .map((album) => ({ album, added: album.photos - (previous[album.uid] ?? 0) }))
          .filter(({ added }) => added > 0)
      : []; // the first reading of the albums is the starting point
    // Past the cap, an album keeps its previous count: announced at the next reading.
    for (const { album } of grown.slice(this.timings.maxEventsPerRead)) {
      current[album.uid] = previous[album.uid] ?? 0;
    }
    this.saved.albums = current;
    this.store.save(this.saved);
    for (const { album, added } of grown.slice(0, this.timings.maxEventsPerRead)) {
      logger.debug(`Album "${album.title}": ${added} new picture(s)`);
      await this.fire(TRIGGERS.ALBUM_PHOTOS_ADDED, {
        album: album.title,
        count: added,
        total: album.photos,
      });
    }
  }

  /** Fire a scene event on the library device. */
  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, { device: libraryIds(this.gladys).device, ...data });
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishDevices() {
    const devices = this.config?.url
      ? [buildLibraryDevice(this.gladys, { url: this.config.url }, this.config.language)]
      : [];
    const key = JSON.stringify(devices);
    if (key === this.devicesKey) {
      return;
    }
    // Even an empty list: the Discovery tab then shows no stale device.
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
      this.resolved('devices');
    } catch (err) {
      // Sent again at the next reading.
      this.problem('devices', `Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: publish the device again, read the server. */
  async rediscover() {
    this.devicesKey = null;
    await this.publishDevices();
    await this.refresh();
  }

  /** The user added the device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (device.external_id !== libraryIds(this.gladys).device) {
      return;
    }
    await this.publishStates({ force: true });
    this.gladys.requestWidgetRefresh(WIDGET_KEYS.LIBRARY);
  }

  /** One publication at a time: a late answer never records an older value. */
  publishStates(options) {
    const run = (this.publishing ?? Promise.resolve()).then(() => this.publishNow(options));
    this.publishing = run;
    return run;
  }

  async publishNow({ force = false } = {}) {
    const now = this.now();
    const states = [];
    for (const { key, externalId, value, text } of featureValues(this.gladys, this.snapshot)) {
      if (value === null) {
        continue;
      }
      // While the server is down, the last counts are not republished as fresh.
      if (this.reachable === false && key !== 'indexing' && !force) {
        continue;
      }
      const last = this.published.get(externalId);
      if (!force && last && last.value === value && now - last.at < this.timings.heartbeatMs) {
        continue;
      }
      states.push(
        text
          ? { device_feature_external_id: externalId, text: String(value) }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
      for (const state of states) {
        this.published.set(state.device_feature_external_id, {
          value: state.text ?? state.state,
          at: now,
        });
      }
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(changed) {
    await this.publishTransport();
    await this.publishConnectionStatus();
    if (changed) {
      this.gladys.requestWidgetRefresh(WIDGET_KEYS.LIBRARY);
    }
  }

  async publishTransport() {
    if (this.reachable === null || !this.config?.url) {
      return;
    }
    const transport = this.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    if (transport === this.transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: libraryIds(this.gladys).device, transport },
      ]);
      this.transport = transport;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config?.url) {
      return {
        connected: false,
        message: this.config?.incomplete ? CONNECTION_TEXT.invalid : CONNECTION_TEXT.noServer,
      };
    }
    if (this.error) {
      return {
        connected: false,
        message: everyLanguage(ERROR_TEXT[this.error.kind], (text, language) =>
          labelled('PhotoPrism', text, language).slice(0, 200),
        ),
      };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------------------

  requireClient() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.noServer, this.config?.language));
    }
    return this.client;
  }

  /** The error of an action, in the language of the configuration. */
  actionError(err) {
    if (!err.kind) {
      return err;
    }
    const text = pick(ERROR_TEXT[err.kind], this.config.language);
    return new Error(labelled('PhotoPrism', text, this.config.language));
  }

  /**
   * Start an indexing (`options.path`, `options.rescan`) or an import
   * (`options.album`). Answers once PhotoPrism has finished, or after
   * `earlyMs` while it carries on: `indexing_finished` then tells its end.
   * @returns {Promise<{ finished: boolean, seconds: number|null, message: object }>}
   */
  async startJob(kind, options = {}) {
    const client = this.requireClient();
    if (this.job) {
      throw new Error(pick(ACTION_TEXT.running, this.config.language));
    }
    const job = { kind, startedAt: this.now(), client, total: this.total() };
    this.job = job;
    logger.info(`${kind === JOB_KINDS.INDEX ? 'Indexing' : 'Import'} started from Gladys`);
    const work = kind === JOB_KINDS.INDEX ? client.index(options) : client.import(options);
    const settled = work.then(
      (answer) => ({ answer }),
      (error) => ({ error }),
    );
    // Hold while the request runs: the end is handled in the background.
    const done = settled.then((result) => this.finishJob(job, result));
    const early = await Promise.race([settled, wait(this.timings.earlyMs).then(() => null)]);
    if (early) {
      await done;
      if (early.error) {
        throw this.actionError(early.error);
      }
    } else {
      this.snapshot.indexing = true;
      await this.publishStates();
      this.gladys.requestWidgetRefresh(WIDGET_KEYS.LIBRARY);
    }
    const seconds = early ? (parseJobSeconds(early.answer) ?? 0) : null;
    return {
      finished: Boolean(early),
      seconds,
      message: everyLanguage(JOB_TEXT, (text) =>
        early ? text.finished(text[kind], seconds) : text.started(text[kind]),
      ),
    };
  }

  /** The job ended: publish, announce its additions, fire `indexing_finished`. */
  async finishJob(job, { answer, error }) {
    if (this.job === job) {
      this.job = null;
    }
    this.snapshot.indexing = Boolean(this.job);
    const elapsed = this.now() - job.startedAt;
    const seconds = parseJobSeconds(answer) ?? Math.round(elapsed / 1000);
    const name = job.kind === JOB_KINDS.INDEX ? 'Indexing' : 'Import';
    // Refused at once (credentials, already running): the action reports it.
    const refused = error && elapsed < this.timings.earlyMs;
    if (error) {
      logger.warn(`${name} failed: ${error.message}`);
    } else {
      logger.info(`${name} finished in ${seconds} s`);
    }
    if (job.client !== this.client || this.stopped) {
      return;
    }
    try {
      // A reading in progress may predate the end of the job: read again after it.
      await this.running?.catch(() => {});
      await this.refresh();
    } catch (err) {
      this.problem('poll', 'Reading failed', err, 'error');
    }
    await this.publishStates();
    if (!refused) {
      await this.fire(TRIGGERS.INDEXING_FINISHED, {
        kind: job.kind,
        result: error ? JOB_RESULTS.ERROR : JOB_RESULTS.SUCCESS,
        seconds,
        added: this.reachable && job.total !== null ? Math.max(0, this.total() - job.total) : 0,
      });
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEYS.LIBRARY);
  }

  /** Pictures and videos of the library, null before the first reading. */
  total() {
    const counts = this.snapshot.counts;
    return counts ? totalOf(counts) : null;
  }

  /** "Test the connection": read the server now, one line. */
  async testConnection() {
    await this.refresh();
    const status = this.connectionStatus();
    if (!status.connected) {
      return status.message;
    }
    const counts = this.snapshot.counts;
    return everyLanguage(REPORT_TEXT, (text) =>
      [
        text.ok(this.version),
        text.library(counts.photos, counts.videos, counts.albums),
        text.review(counts.review),
      ].join(', '),
    );
  }
}

// Live and animated pictures have their own counters in PhotoPrism.
const totalOf = (counts) => counts.photos + counts.videos + counts.live + counts.animated;

const validCursor = (cursor) =>
  cursor && Number.isFinite(cursor.at) && Array.isArray(cursor.uids)
    ? { at: cursor.at, uids: cursor.uids.filter((uid) => typeof uid === 'string') }
    : null;

/** The newest addition of a list: its time and the pictures added at that second. */
function cursorOf(photos) {
  if (photos.length === 0) {
    return null;
  }
  const at = Math.max(...photos.map((photo) => photo.addedAt));
  return { at, uids: photos.filter((photo) => photo.addedAt === at).map((photo) => photo.uid) };
}

function mergeCursor(cursor, newest) {
  if (!newest || newest.at < cursor.at) {
    return cursor;
  }
  if (newest.at === cursor.at) {
    return { at: cursor.at, uids: [...new Set([...cursor.uids, ...newest.uids])].slice(-200) };
  }
  return newest;
}
