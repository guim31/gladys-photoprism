// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake PhotoPrism server on a
// fake network, a temporary /data and a manual clock, with the integration
// wired on top through registerHandlers. No timer runs unless
// `timers: true`: the tests read the server with `world.hub.refresh()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { APP_PASSWORD, FakePhotoprism, TILE, createNetwork, makePhoto } from './fakePhotoprism.js';

process.env.LOG_LEVEL ??= 'silent';

export const SERVER_URL = 'http://192.0.2.20:2342';

/** A manual clock: a few minutes after the real captures. */
export function createClock(start = Date.parse('2026-10-22T16:10:00Z')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { server_url: SERVER_URL, password: APP_PASSWORD, language: 'en' };

/**
 * @param {object} [options]
 * @param {FakePhotoprism} [options.server]
 * @param {object} [options.config] raw integration config
 */
export async function createWorld({
  clock = createClock(),
  server = new FakePhotoprism(),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-photoprism-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork({ [SERVER_URL]: server });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings: { earlyMs: 20, ...timings },
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, server, app, hub: app.hub, clock, dataDir };
}

export const libraryDevice = (gladys) => gladys.externalIds('library', 'main').device;
export const feature = (gladys, key) => gladys.externalIds('library', 'main').feature(key);

/** Resolves once `predicate()` holds (background work of the hub). */
export async function until(predicate, label = 'condition') {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export { APP_PASSWORD, FakePhotoprism, TILE, makePhoto };
