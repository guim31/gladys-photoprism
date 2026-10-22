// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `library`, the counters
// of the PhotoPrism library, the last pictures added (date, place, a video
// badge), and two direct buttons to start an indexing or an import.
//
// The figures are sent as values, not bound to device features, so the
// widget works before the device is added to Gladys.
//
// Thumbnails only when the widget setting asks for them: a picture of the
// family then reaches every screen showing the dashboard (a public one, Gladys
// Plus). The content declares a key per picture, Gladys asks for its bytes
// through onWidgetGetImage, and the hub reads the 224 px tile from the server:
// the browser never loads a PhotoPrism URL.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { MEDIA_TYPES } from './photoprism/model.js';
import { JOB_KINDS, WIDGET_KEYS } from './hub.js';
import { dayOf, pick } from './texts.js';

// Action keys of the buttons: permanent once published.
export const ACTIONS = Object.freeze({
  START_INDEXING: 'start_indexing',
  START_IMPORT: 'start_import',
});

const MAX_ROWS = 8;
const MAX_IMAGE_BYTES = 300 * 1024;
const THUMB_KEY = /^thumb-([0-9a-f]{40})$/;

export const TEXT = {
  configure: {
    en: 'Enter the address of your PhotoPrism server and an app password in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre serveur PhotoPrism et un mot de passe d'application dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines PhotoPrism-Servers und ein App-Passwort in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su servidor PhotoPrism y una contraseña de aplicación en la configuración de la integración.',
  },
  unreachable: {
    en: 'The PhotoPrism server does not answer: see the status of the integration.',
    fr: "Le serveur PhotoPrism ne répond pas : voyez l'état de l'intégration.",
    de: 'Der PhotoPrism-Server antwortet nicht: Sieh dir den Status der Integration an.',
    es: 'El servidor PhotoPrism no responde: consulte el estado de la integración.',
  },
  empty: {
    en: 'No photo in the library yet.',
    fr: 'Aucune photo dans la photothèque pour le moment.',
    de: 'Noch keine Fotos in der Bibliothek.',
    es: 'Todavía no hay fotos en la biblioteca.',
  },
  photos: { en: 'Photos', fr: 'Photos', de: 'Fotos', es: 'Fotos' },
  videos: { en: 'Videos', fr: 'Vidéos', de: 'Videos', es: 'Vídeos' },
  albums: { en: 'Albums', fr: 'Albums', de: 'Alben', es: 'Álbumes' },
  review: { en: 'To review', fr: 'À valider', de: 'Zu prüfen', es: 'Por revisar' },
  video: { en: 'Video', fr: 'Vidéo', de: 'Video', es: 'Vídeo' },
  added: { en: 'Added', fr: 'Ajoutée le', de: 'Hinzugefügt', es: 'Añadida el' },
  indexing: {
    en: 'Indexing in progress',
    fr: 'Indexation en cours',
    de: 'Indexierung läuft',
    es: 'Indexación en curso',
  },
  inProgress: { en: 'In progress', fr: 'En cours', de: 'Läuft', es: 'En curso' },
  startIndexing: { en: 'Index', fr: 'Indexer', de: 'Indexieren', es: 'Indexar' },
  startImport: { en: 'Import', fr: 'Importer', de: 'Importieren', es: 'Importar' },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

const isTrue = (value) => value === true || value === 'true';

/** Image key of the thumbnail of a picture (its file hash). */
export const thumbKey = (hash) => (hash ? `thumb-${hash}` : null);

function rowOf(photo, language, thumbnails) {
  const shot = photo.takenAt ?? photo.addedAt;
  const description = [
    photo.title,
    photo.place,
    `${t(TEXT.added, language)} ${dayOf(photo.addedAt, language, null)}`,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    title: fit(photo.place ?? photo.title, 60),
    subtitle: fit(
      [dayOf(shot, language), photo.place ? photo.title : null].filter(Boolean).join(' · '),
      120,
    ),
    ...(thumbnails && photo.hash ? { image: thumbKey(photo.hash) } : {}),
    ...(photo.type === MEDIA_TYPES.VIDEO
      ? { badge: { text: t(TEXT.video, language), color: WIDGET_COLORS.INFO } }
      : {}),
    description: fit(description, 2000),
  };
}

async function getLibrary(hub, { settings = {}, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  const counts = hub.snapshot.counts;
  if (!counts) {
    return message(TEXT.unreachable, language);
  }
  const components = [
    { type: 'value', value: counts.photos, label: t(TEXT.photos, language), icon: 'image' },
    { type: 'value', value: counts.videos, label: t(TEXT.videos, language), icon: 'film' },
    { type: 'value', value: counts.albums, label: t(TEXT.albums, language), icon: 'book-open' },
    {
      type: 'value',
      value: counts.review,
      label: t(TEXT.review, language),
      icon: 'eye',
      color: counts.review > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (hub.error) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.unreachable, language) });
  }
  if (hub.recent.length === 0) {
    if (!hub.error) {
      components.push({ type: 'text', variant: 'body', text: t(TEXT.empty, language) });
    }
  } else {
    const thumbnails = isTrue(settings.thumbnails);
    components.push({
      type: 'card-list',
      display: 'list',
      items: hub.recent.slice(0, MAX_ROWS).map((photo) => rowOf(photo, language, thumbnails)),
    });
  }
  if (hub.snapshot.indexing) {
    components.push({
      type: 'status',
      items: [
        {
          label: t(TEXT.indexing, language),
          value: t(TEXT.inProgress, language),
          icon: 'loader',
          color: WIDGET_COLORS.INFO,
        },
      ],
    });
  } else if (!hub.error) {
    components.push(
      {
        type: 'button',
        label: t(TEXT.startIndexing, language),
        icon: 'refresh-cw',
        style: 'secondary',
        action: { key: ACTIONS.START_INDEXING },
      },
      {
        type: 'button',
        label: t(TEXT.startImport, language),
        icon: 'download',
        style: 'secondary',
        action: { key: ACTIONS.START_IMPORT },
      },
    );
  }
  return { ttl_seconds: 300, components };
}

async function libraryAction(hub, { actionKey }) {
  const kind = {
    [ACTIONS.START_INDEXING]: JOB_KINDS.INDEX,
    [ACTIONS.START_IMPORT]: JOB_KINDS.IMPORT,
  }[actionKey];
  if (!kind) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  const { message: text } = await hub.startJob(kind);
  return { message: text };
}

/**
 * Bytes of a thumbnail, as raw base64 (onWidgetGetImage). Only the pictures
 * the widget shows, only from the configured server.
 */
export async function getImage(hub, imageKey) {
  const match = THUMB_KEY.exec(String(imageKey));
  if (!match || !hub.recent.some((photo) => photo.hash === match[1]) || !hub.previewToken) {
    throw new Error(`Unknown image ${imageKey}`);
  }
  const client = hub.requireClient();
  const { body } = await client.thumbnail(match[1], hub.previewToken);
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_IMAGE_BYTES) {
    throw new Error(`Thumbnail ${imageKey} is empty or too large`);
  }
  const image = body.toString('base64');
  // The checks of the core (format, header, size): refused here, explained in the logs.
  const problems = validateWidgetImage(image);
  if (problems.length > 0) {
    throw new Error(`Thumbnail ${imageKey} refused: ${problems.join('; ')}`);
  }
  return image;
}

export const WIDGETS = {
  [WIDGET_KEYS.LIBRARY]: { get: getLibrary, action: libraryAction },
};
