// -----------------------------------------------------------------------------
// The "Photo library" widget: content validated by the SDK's own validator
// (what the core accepts), the opt-in thumbnails served through
// onWidgetGetImage, and the indexing and import buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/hub.js';
import { ACTIONS } from '../src/widgets.js';
import { SERVER_URL, TILE, createWorld, makePhoto } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => {
    w.server.release();
    return w.app.stop();
  });
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet(WIDGET_KEYS.LIBRARY, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const body = ack.data.content;
  assert.deepEqual(validateWidgetContent(body), [], JSON.stringify(body));
  assert.ok(body.components.length <= 8, 'the budget of the core');
  return body;
}

const ofType = (body, type) => body.components.filter((component) => component.type === type);

test('counters, the last pictures without thumbnails, and the two buttons', async (t) => {
  const w = await world(t);
  w.server.add(makePhoto(w.clock.now(), { type: 'video' }));
  await w.hub.refresh();
  const body = await content(w);
  assert.deepEqual(
    ofType(body, 'value').map((tile) => [tile.label, tile.value]),
    [
      ['Photos', 155],
      ['Videos', 1],
      ['Albums', 1],
      ['To review', 153],
    ],
  );
  const [list] = ofType(body, 'card-list');
  assert.equal(list.display, 'list');
  assert.equal(list.items.length, 5);
  const [first] = list.items;
  assert.equal(first.title, 'Lyon, Auvergne-Rhône-Alpes, France');
  assert.match(first.subtitle, /^Jul 14, 2026 · Test \d+$/);
  assert.equal(first.badge.text, 'Video');
  assert.ok(
    list.items.every((item) => item.image === undefined),
    'no picture by default',
  );
  assert.deepEqual(
    ofType(body, 'button').map((button) => button.action.key),
    [ACTIONS.START_INDEXING, ACTIONS.START_IMPORT],
  );
});

test('thumbnails when asked, served only for the pictures shown', async (t) => {
  const w = await world(t);
  const body = await content(w, { thumbnails: true }, 'fr');
  const [list] = ofType(body, 'card-list');
  const key = list.items[0].image;
  assert.match(key, /^thumb-[0-9a-f]{40}$/);
  const ack = await w.fake.widgetGetImage(key);
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.image, TILE.toString('base64'));
  const other = await w.fake.widgetGetImage(`thumb-${'a'.repeat(40)}`);
  assert.equal(other.success, false, 'a picture the widget does not show');
  const refused = await w.fake.widgetGetImage('../api/v1/config');
  assert.equal(refused.success, false);
});

test('the buttons start an indexing; a running one shows instead of the buttons', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetAction(WIDGET_KEYS.LIBRARY, ACTIONS.START_INDEXING, {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.en, 'Indexing finished in 92 s.');

  w.server.hold = true;
  const started = await w.fake.widgetAction(WIDGET_KEYS.LIBRARY, ACTIONS.START_IMPORT, {});
  assert.equal(started.success, true, started.error);
  assert.match(started.data.message.fr, /^Importation lancée/);
  const body = await content(w);
  assert.equal(ofType(body, 'button').length, 0);
  assert.equal(ofType(body, 'status')[0].items[0].label, 'Indexing in progress');
});

test('without configuration, before the first answer, server down: the widget says so', async (t) => {
  const empty = await world(t, { config: { language: 'en' } });
  assert.match((await content(empty)).components[0].text, /Enter the address/);

  const w = await world(t, { config: { server_url: SERVER_URL, password: 'wrong' } });
  assert.match((await content(w)).components[0].text, /does not answer/);

  const down = await world(t);
  down.server.online = false;
  await down.hub.refresh();
  const body = await content(down);
  // The last figures read stay shown, with the warning, without buttons.
  assert.equal(ofType(body, 'value').length, 4);
  assert.match(ofType(body, 'text')[0].text, /does not answer/);
  assert.equal(ofType(body, 'button').length, 0);
});
