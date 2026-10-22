// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// Start an indexing of the originals, or an import of the import folder.
// PhotoPrism answers only once the work is done: the action returns after a
// few seconds at most, and the `indexing_finished` trigger tells the end.
// Nothing destructive: no cleanup, files copied by the import, never moved.
// -----------------------------------------------------------------------------

import { JOB_KINDS } from './hub.js';
import { ACTION_TEXT, pick } from './texts.js';

// A sub-folder of the originals, as PhotoPrism shows it ("2026/05"); "/" for all.
export function folderOf(value) {
  const path = typeof value === 'string' ? value.trim().replace(/^\/+|\/+$/g, '') : '';
  if (path.split('/').some((part) => part === '..')) {
    return null;
  }
  return path ? `/${path}` : '/';
}

const isTrue = (value) => value === true || value === 'true';

export const SCENE_ACTIONS = {
  async start_indexing(hub, { fields = {} }) {
    const path = folderOf(fields.folder);
    if (path === null) {
      throw new Error(pick(ACTION_TEXT.invalidFolder, hub.config.language));
    }
    const { finished } = await hub.startJob(JOB_KINDS.INDEX, {
      path,
      rescan: isTrue(fields.rescan),
    });
    return { finished };
  },

  async start_import(hub, { fields = {} }) {
    const album = typeof fields.album === 'string' ? fields.album.trim().slice(0, 160) : '';
    const { finished } = await hub.startJob(JOB_KINDS.IMPORT, { album: album || null });
    return { finished };
  },
};
