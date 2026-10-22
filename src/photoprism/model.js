// -----------------------------------------------------------------------------
// Parsing of the PhotoPrism answers into the few values the integration uses.
// Tolerant: a missing or odd field gives a neutral value, never an exception
// (test/fixtures/photoprism/ holds the real answers).
// -----------------------------------------------------------------------------

export const MEDIA_TYPES = Object.freeze({ PHOTO: 'photo', VIDEO: 'video' });

// The file hash of PhotoPrism (SHA-1), the key of its thumbnails.
const HASH = /^[0-9a-f]{40}$/;

const count = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);
const string = (value) => (typeof value === 'string' ? value.trim() : '');

/** Milliseconds of an ISO date, null for none (PhotoPrism writes year 1 for "none"). */
export function timeOf(value) {
  const time = Date.parse(string(value));
  return Number.isFinite(time) && time > Date.UTC(1900, 0, 1) ? time : null;
}

/** The counters of /api/v1/config. */
export function parseConfig(config) {
  const counts = config?.count ?? {};
  return {
    version: string(config?.version).split('-')[0] || null,
    previewToken: string(config?.previewToken) || null,
    counts: {
      photos: count(counts.photos),
      videos: count(counts.videos),
      albums: count(counts.albums),
      places: count(counts.places),
      review: count(counts.review),
    },
  };
}

// "Unknown" is what PhotoPrism writes for a picture without a place.
const placeOf = (photo) => {
  const label = string(photo?.PlaceLabel);
  return label && label.toLowerCase() !== 'unknown' ? label : null;
};

/** The pictures of /api/v1/photos, as the hub keeps them. */
export function parsePhotos(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((photo) => photo && typeof photo.UID === 'string' && timeOf(photo.CreatedAt) !== null)
    .map((photo) => {
      const hash = string(photo.Hash).toLowerCase();
      return {
        uid: photo.UID,
        type: ['video', 'live', 'animated'].includes(photo.Type)
          ? MEDIA_TYPES.VIDEO
          : MEDIA_TYPES.PHOTO,
        title: string(photo.Title) || string(photo.OriginalName) || string(photo.Name) || photo.UID,
        // Local wall time of the shot, written as UTC by PhotoPrism.
        takenAt: timeOf(photo.TakenAtLocal) ?? timeOf(photo.TakenAt),
        addedAt: timeOf(photo.CreatedAt),
        place: placeOf(photo),
        hash: HASH.test(hash) ? hash : null,
      };
    });
}

/** The albums of /api/v1/albums: uid, title, number of pictures. */
export function parseAlbums(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((album) => album && typeof album.UID === 'string')
    .map((album) => ({
      uid: album.UID,
      title: string(album.Title) || album.UID,
      photos: count(album.PhotoCount),
    }));
}

/** Seconds of an "Indexing completed in 92 s" answer, null when absent. */
export function parseJobSeconds(answer) {
  const [seconds] = Array.isArray(answer?.messageParams) ? answer.messageParams : [];
  return Number.isFinite(seconds) ? seconds : null;
}
