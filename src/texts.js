// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widgets (src/widgets.js):
// connection status, errors, the "Test the connection" report, the messages
// of the indexing and import, and the "last photo added" feature. Four
// languages, the four of the Gladys interface; German says "du", Spanish
// "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './photoprism/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your PhotoPrism server and an app password in the configuration.',
    fr: "Saisissez l'adresse de votre serveur PhotoPrism et un mot de passe d'application dans la configuration.",
    de: 'Gib die Adresse deines PhotoPrism-Servers und ein App-Passwort in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor PhotoPrism y una contraseña de aplicación en la configuración.',
  },
  invalid: {
    en: 'The configuration is incomplete: address (e.g. http://192.168.1.2:2342), and the password of the user name.',
    fr: "La configuration est incomplète : adresse (ex. http://192.168.1.2:2342), et mot de passe du nom d'utilisateur.",
    de: 'Die Konfiguration ist unvollständig: Adresse (z. B. http://192.168.1.2:2342) und das Passwort zum Benutzernamen.',
    es: 'La configuración está incompleta: dirección (p. ej. http://192.168.1.2:2342) y la contraseña del nombre de usuario.',
  },
};

// One short explanation per error kind (src/photoprism/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'the server does not answer',
    fr: 'le serveur ne répond pas',
    de: 'der Server antwortet nicht',
    es: 'el servidor no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use the http:// address on your network',
    fr: 'certificat refusé : utilisez l’adresse en http:// de votre réseau',
    de: 'Zertifikat abgelehnt: Verwende die http://-Adresse in deinem Netzwerk',
    es: 'certificado rechazado: use la dirección http:// de su red',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'app password, user name or password refused',
    fr: "mot de passe d'application, nom d'utilisateur ou mot de passe refusé",
    de: 'App-Passwort, Benutzername oder Passwort abgelehnt',
    es: 'contraseña de aplicación, usuario o contraseña rechazados',
  },
  [ERROR_KINDS.FORBIDDEN]: {
    en: 'permission denied: use an admin account, or an app password with full access',
    fr: "permission refusée : utilisez un compte admin, ou un mot de passe d'application à accès complet",
    de: 'Zugriff verweigert: Verwende ein Admin-Konto oder ein App-Passwort mit vollem Zugriff',
    es: 'permiso denegado: use una cuenta de administrador o una contraseña de aplicación con acceso completo',
  },
  [ERROR_KINDS.NOT_PHOTOPRISM]: {
    en: 'no PhotoPrism server at this address',
    fr: 'aucun serveur PhotoPrism à cette adresse',
    de: 'kein PhotoPrism-Server unter dieser Adresse',
    es: 'no hay ningún servidor PhotoPrism en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the final address, with its path',
    fr: "l'adresse redirige : saisissez l'adresse finale, avec son chemin",
    de: 'die Adresse leitet um: Gib die endgültige Adresse mit ihrem Pfad ein',
    es: 'la dirección redirige: introduzca la dirección final, con su ruta',
  },
  [ERROR_KINDS.BUSY]: {
    en: 'an indexing or an import is already running',
    fr: 'une indexation ou une importation est déjà en cours',
    de: 'eine Indexierung oder ein Import läuft bereits',
    es: 'ya hay una indexación o una importación en curso',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version) => `PhotoPrism ${version}: connected`,
    library: (photos, videos, albums) =>
      `${photos} photo(s), ${videos} video(s), ${albums} album(s)`,
    review: (count) => `${count} to review`,
  },
  fr: {
    ok: (version) => `PhotoPrism ${version} : connecté`,
    library: (photos, videos, albums) =>
      `${photos} photo(s), ${videos} vidéo(s), ${albums} album(s)`,
    review: (count) => `${count} à valider`,
  },
  de: {
    ok: (version) => `PhotoPrism ${version}: verbunden`,
    library: (photos, videos, albums) =>
      `${photos} Foto(s), ${videos} Video(s), ${albums} Album/Alben`,
    review: (count) => `${count} zu prüfen`,
  },
  es: {
    ok: (version) => `PhotoPrism ${version}: conectado`,
    library: (photos, videos, albums) =>
      `${photos} foto(s), ${videos} vídeo(s), ${albums} álbum(es)`,
    review: (count) => `${count} por revisar`,
  },
};

// Answers of "Start an indexing" / "Start an import" (toasts ≤ 200 characters).
export const JOB_TEXT = {
  en: {
    index: 'Indexing',
    import: 'Import',
    started: (job) => `${job} started: a trigger fires when it is finished.`,
    finished: (job, seconds) => `${job} finished in ${seconds} s.`,
  },
  fr: {
    index: 'Indexation',
    import: 'Importation',
    started: (job) => `${job} lancée : un déclencheur s'active à la fin.`,
    finished: (job, seconds) => `${job} terminée en ${seconds} s.`,
  },
  de: {
    index: 'Indexierung',
    import: 'Import',
    started: (job) => `${job} gestartet: Ein Auslöser meldet das Ende.`,
    finished: (job, seconds) => `${job} in ${seconds} s abgeschlossen.`,
  },
  es: {
    index: 'Indexación',
    import: 'Importación',
    started: (job) => `${job} iniciada: un disparador se activa al terminar.`,
    finished: (job, seconds) => `${job} terminada en ${seconds} s.`,
  },
};

// Errors of the scene actions and widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  noServer: {
    en: 'No PhotoPrism server is configured.',
    fr: "Aucun serveur PhotoPrism n'est configuré.",
    de: 'Kein PhotoPrism-Server ist konfiguriert.',
    es: 'No hay ningún servidor PhotoPrism configurado.',
  },
  running: {
    en: 'An indexing or an import started from Gladys is still running.',
    fr: 'Une indexation ou une importation lancée depuis Gladys est encore en cours.',
    de: 'Eine von Gladys gestartete Indexierung oder ein Import läuft noch.',
    es: 'Una indexación o una importación iniciada desde Gladys sigue en curso.',
  },
};

// "Video", before the date of a video in the "last photo added" feature.
export const VIDEO_TEXT = { en: 'Video', fr: 'Vidéo', de: 'Video', es: 'Vídeo' };

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** Every language of a table, rendered by `render(table[language], language)`. */
export const everyLanguage = (table, render) =>
  Object.fromEntries(
    Object.entries(table).map(([language, text]) => [language, render(text, language)]),
  );

/** "14 May 2026": the day of a PhotoPrism local time (stored as UTC). */
export function dayOf(time, language) {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(time));
}

/** "14 May 2026 · Toulouse, Occitanie, France": the "last photo added" feature. */
export function describePhoto(photo, language) {
  const time = photo.takenAt ?? photo.addedAt;
  return [
    photo.type === 'video' ? pick(VIDEO_TEXT, language) : null,
    time === null ? null : dayOf(time, language),
    photo.place,
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 200);
}
