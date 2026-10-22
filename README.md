# PhotoPrism for Gladys Assistant

External integration connecting a [PhotoPrism](https://www.photoprism.app)
server (self-hosted photo library) to
[Gladys Assistant](https://gladysassistant.com), built on the official
[JavaScript SDK](https://github.com/GladysAssistant/integration-sdk-js) and the
[integration template](https://github.com/GladysAssistant/integration-template-js).

## Features

| Surface          | What you get                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Library device   | Photos, videos, albums, places, photos to review, last photo added (day taken and place), indexing in progress                     |
| Scene triggers   | `photos_added` (any upload, import or indexing), `album_photos_added` (filter: album), `indexing_finished` (filters: kind, result) |
| Scene actions    | `start_indexing` (whole library or one folder, optional complete rescan), `start_import` (into an album if named)                  |
| Dashboard widget | `library`: counters, the last photos added, "Index" and "Import" buttons; thumbnails only when the widget setting asks for them    |

Texts and documentation in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- A PhotoPrism server on the local network, and an **app password** with full
  access (Settings → Account → Apps and Devices, or
  `photoprism auth add -n Gladys -s "*" -e -1 admin`). The user name and
  password of an admin account work too, and a server in public mode needs
  neither.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-photoprism`
   (or install **PhotoPrism** from the catalog once it is listed).
2. In **Configuration**, enter the address of your server
   (`http://192.168.1.20:2342`, or `https://example.org/photos` behind a reverse
   proxy) and the app password. Save, then click **Test the connection**.
3. Open the **Discover** tab and add the **PhotoPrism** device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- REST API (`/api/v1`) only, with the app password (or the token of a session
  opened with the user name and password) as a Bearer token.
- One reading every 1, 5 (default) or 15 minutes, on a timer of the container
  (`should_poll: false`): `/api/v1/config` (version, counters),
  `/api/v1/photos?order=added` (the last 50 additions), `/api/v1/albums`.
- New photos are announced from a cursor kept in `/data` (the newest addition
  seen), album growth from the photo count of each album: once, also across
  restarts.
- PhotoPrism answers `POST /api/v1/index` and `POST /api/v1/import/` only once
  the work is done, and has no route telling whether one runs: the scene
  actions return within three seconds, and `indexing_finished` fires at the end.
  "Indexing in progress" follows the jobs started from Gladys.
- The widget thumbnails (224 px tiles, opt-in) go through the widget image proxy
  of Gladys, for the photos the widget lists only.
- Quiet logs: the lifecycle, the jobs and the errors at info, once; the photo
  titles only at debug.

## Checked against a real server

The client, the parsers and the scenarios were checked against
**PhotoPrism 261007** (the official image `photoprism/photoprism`, SQLite) with
generated test pictures (EXIF dates and GPS of public places), an album, app
passwords of two scopes, a user session, an indexing of 150 files (92 s), an
import, and a second indexing refused while the first ran. The answers in
`test/fixtures/photoprism/` are real (tokens removed, addresses anonymized), and
the integration ran in its locked-down container against that server. It has
not yet run in a real Gladys installation: feedback welcome.

## Limitations

- Polling, not push: new photos reach Gladys at the next reading.
- An indexing started outside Gladys (the PhotoPrism interface, auto-index) is
  not seen as "in progress": PhotoPrism does not expose it.
- Behind a reverse proxy with a short timeout, a long indexing is cut on the
  Gladys side (PhotoPrism carries on): prefer the local address.
- Only the albums made by the users are followed (not moments, folders,
  calendar).
- One server per installation of the integration.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against a fake PhotoPrism server built from real answers
(`test/fixtures/photoprism/`) and the fake Gladys of the SDK; they never touch
the network. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [PhotoPrism](https://github.com/photoprism/photoprism) (AGPL-3.0) by
  PhotoPrism UG and contributors, and its
  [documentation](https://docs.photoprism.app). No code was copied from it.
- The cover shows the PhotoPrism logo, taken from the official repository
  (`assets/static/img/logo.svg`); PhotoPrism is a registered trademark of
  PhotoPrism UG.
- Built on the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and [SDK](https://github.com/GladysAssistant/integration-sdk-js).

## Disclaimer

Not affiliated with, nor endorsed by, PhotoPrism UG.

## License

[Apache-2.0](LICENSE)
