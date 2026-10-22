# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- PhotoPrism device: photos, videos, albums, places, photos to review, the day
  and place of the last photo added, and an "indexing in progress" state.
- Scene triggers: new photos added (any upload, import or indexing), photos
  added to an album (filter: album title), indexing or import finished
  (filters: kind and result).
- Scene actions: start an indexing (whole library or one folder, optional
  complete rescan), start an import (into an album when one is named).
- "Photo library" dashboard widget: the counters, the last photos added, and
  "Index" and "Import" buttons; thumbnails only when the widget setting asks for
  them.
- Sign-in with an app password, or with the user name and password of an
  account, or none for a server in public mode.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-photoprism/commits/main
