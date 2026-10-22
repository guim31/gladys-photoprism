// -----------------------------------------------------------------------------
// The one Gladys device of the integration: the "PhotoPrism" library
// (identity `library:main`: moving the server to another address keeps the
// device and its history):
//   photos, videos, albums, places, review (counter-sensor/integer),
//   latest (text/text: date and place of the last picture added),
//   indexing (input/binary: an indexing or import started from Gladys runs).
//
// Every feature is read-only (category/type couples of the core table, see
// test/gladys-rules.test.js). should_poll: false: the integration reads the
// server on its own timer (src/hub.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const LIBRARY_TYPE = 'library';
export const LIBRARY_ID = 'main';
export const URL_PARAM = 'PHOTOPRISM_URL';

// Suffixes of the feature external ids: permanent once published.
export const KEYS = Object.freeze({
  PHOTOS: 'photos',
  VIDEOS: 'videos',
  ALBUMS: 'albums',
  PLACES: 'places',
  REVIEW: 'review',
  LATEST: 'latest',
  INDEXING: 'indexing',
});

// Feature names, per language (Gladys does not tell a device integration the
// user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [KEYS.PHOTOS]: 'Photos',
    [KEYS.VIDEOS]: 'Videos',
    [KEYS.ALBUMS]: 'Albums',
    [KEYS.PLACES]: 'Places',
    [KEYS.REVIEW]: 'To review',
    [KEYS.LATEST]: 'Last photo added',
    [KEYS.INDEXING]: 'Indexing in progress',
  },
  fr: {
    [KEYS.PHOTOS]: 'Photos',
    [KEYS.VIDEOS]: 'Vidéos',
    [KEYS.ALBUMS]: 'Albums',
    [KEYS.PLACES]: 'Lieux',
    [KEYS.REVIEW]: 'À valider',
    [KEYS.LATEST]: 'Dernière photo ajoutée',
    [KEYS.INDEXING]: 'Indexation en cours',
  },
  de: {
    [KEYS.PHOTOS]: 'Fotos',
    [KEYS.VIDEOS]: 'Videos',
    [KEYS.ALBUMS]: 'Alben',
    [KEYS.PLACES]: 'Orte',
    [KEYS.REVIEW]: 'Zu prüfen',
    [KEYS.LATEST]: 'Zuletzt hinzugefügtes Foto',
    [KEYS.INDEXING]: 'Indexierung läuft',
  },
  es: {
    [KEYS.PHOTOS]: 'Fotos',
    [KEYS.VIDEOS]: 'Vídeos',
    [KEYS.ALBUMS]: 'Álbumes',
    [KEYS.PLACES]: 'Lugares',
    [KEYS.REVIEW]: 'Por revisar',
    [KEYS.LATEST]: 'Última foto añadida',
    [KEYS.INDEXING]: 'Indexación en curso',
  },
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 10_000_000;

const readOnly = { read_only: true, has_feedback: false };

const counter = (key, value, max = COUNTER_MAX) => ({
  key,
  definition: {
    ...readOnly,
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    keep_history: true,
    min: 0,
    max,
  },
  value,
});

// Order = display order in Gladys. `value` reads the snapshot of the hub.
export const FEATURES = [
  counter(KEYS.PHOTOS, (s) => s.counts?.photos ?? null),
  counter(KEYS.VIDEOS, (s) => s.counts?.videos ?? null),
  counter(KEYS.ALBUMS, (s) => s.counts?.albums ?? null, 100_000),
  counter(KEYS.PLACES, (s) => s.counts?.places ?? null, 100_000),
  counter(KEYS.REVIEW, (s) => s.counts?.review ?? null),
  {
    key: KEYS.LATEST,
    text: true,
    definition: {
      ...readOnly,
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      keep_history: true,
      min: 0,
      max: 0,
    },
    value: (s) => s.latest || null,
  },
  {
    key: KEYS.INDEXING,
    definition: {
      ...readOnly,
      category: DEVICE_FEATURE_CATEGORIES.INPUT,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      keep_history: true,
      min: 0,
      max: 1,
    },
    value: (s) => (s.indexing === null ? null : s.indexing ? 1 : 0),
  },
];

export const libraryIds = (gladys) => gladys.externalIds(LIBRARY_TYPE, LIBRARY_ID);

/** The discovery payload of the library. */
export function buildLibraryDevice(gladys, { url }, language = 'en') {
  const ids = libraryIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: 'PhotoPrism',
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: url }],
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The value of every feature (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|string|null, text: boolean }>}
 */
export function featureValues(gladys, snapshot) {
  const ids = libraryIds(gladys);
  return FEATURES.map(({ key, value, text = false }) => ({
    key,
    externalId: ids.feature(key),
    value: value(snapshot),
    text,
  }));
}
