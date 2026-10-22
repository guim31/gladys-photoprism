# PhotoPrism

Deine [PhotoPrism](https://www.photoprism.app)-Fotobibliothek in Gladys, über
dein lokales Netzwerk: die Anzahl der Fotos, Videos, Alben, Orte und zu
prüfenden Fotos, Datum und Ort des zuletzt hinzugefügten Fotos, Szenen, die
auf neue Fotos oder ein wachsendes Album reagieren, und Szenenaktionen, die
eine Indexierung oder einen Import starten, mit einem Auslöser an ihrem Ende.

Die Integration wurde mit einem echten PhotoPrism-Server getestet (dem
offiziellen Docker-Image, Version 261007), noch nicht in einer echten
Gladys-Installation: Rückmeldungen sind willkommen im
[Gladys-Forum](https://community.gladysassistant.com) oder in den
[Issues](https://github.com/guim31/gladys-photoprism/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Einen **PhotoPrism**-Server, den Gladys erreicht (gleiches Netzwerk).
- Ein **App-Passwort** mit vollem Zugriff: in PhotoPrism unter
  **Einstellungen** → **Konto** → **Apps und Geräte** → **Hinzufügen**, Bereich
  „voller Zugriff“ (oder auf dem Server:
  `photoprism auth add -n Gladys -s "*" -e -1 admin`). Der Import braucht vollen
  Zugriff; für die Zähler reicht ein engerer Bereich.
- Ohne App-Passwörter (ältere Server, Zwei-Faktor-Authentifizierung aus) gehen
  auch Benutzername und Passwort eines **Admin**-Kontos.
- Ein Server im öffentlichen Modus (`PHOTOPRISM_AUTH_MODE=public`) braucht
  nichts davon.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Katalog.
2. Gib in der **Konfiguration** die **Server-Adresse** mit Port ein (zum
   Beispiel `http://192.168.1.20:2342`; hinter einem Reverse-Proxy
   `https://example.org/photos`) und das **App-Passwort**. Lass den
   Benutzernamen mit einem App-Passwort leer.
3. Wähle die **Aktualisierung** (standardmäßig 5 Minuten) und die **Sprache der
   Namen** und speichere. **Verbindung testen** liest den Server sofort.
4. Füge unter **Erkennung** das Gerät **PhotoPrism** hinzu.

## Geräte

Ein Gerät **PhotoPrism** mit diesen Funktionen (nur lesend):

| Funktion                   | Was sie zeigt                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Fotos                      | Fotos der Bibliothek (ohne archivierte)                                            |
| Videos                     | Videos der Bibliothek                                                              |
| Alben                      | Von den Benutzern angelegte Alben                                                  |
| Orte                       | Orte der Fotos (braucht die Geocodierung von PhotoPrism)                           |
| Zu prüfen                  | Fotos, die PhotoPrism zur Prüfung zurückstellt (geringe Qualität, fehlendes Datum) |
| Zuletzt hinzugefügtes Foto | Aufnahmetag und Ort: `14. Mai 2026 · Toulouse, Occitanie, France`                  |
| Indexierung läuft          | 1, solange eine von Gladys gestartete Indexierung oder ein Import läuft            |

Die Integration liest den Server selbst (drei Anfragen pro Abfrage): In Gladys
ist nichts einzustellen. Das Verbindungsabzeichen des Geräts wird rot, wenn
der Server nicht mehr antwortet.

## Dashboard

Das Widget **Fotobibliothek** zeigt die Zähler der Fotos, Videos, Alben und zu
prüfenden Fotos, die zuletzt hinzugefügten Fotos (Ort, Aufnahmetag, ein
Abzeichen für Videos; ein Tippen zeigt Titel und Tag des Hinzufügens) und zwei
Knöpfe: **Indexieren** (neue und geänderte Dateien) und **Importieren** (der
Import-Ordner). Während eine Aufgabe läuft, ersetzt eine Statuszeile die
Knöpfe.

Vorschaubilder sind **standardmäßig aus**: Mit der Einstellung
**Vorschaubilder anzeigen** erscheint das 224-Pixel-Bild jedes Fotos, deine
Fotos erscheinen dann also auf jedem Bildschirm mit diesem Dashboard (ein
gemeinsames Tablet, ein öffentliches Dashboard, Gladys Plus). Der Browser lädt
PhotoPrism nie direkt: Gladys fragt die Integration, die nur die Fotos
ausliefert, die das Widget auflistet.

## Szenen

### Auslöser

- **Neue Fotos hinzugefügt**: Fotos oder Videos wurden der Bibliothek
  hinzugefügt, egal auf welchem Weg (Upload aus der App, WebDAV, Import,
  Indexierung), bei der nächsten Abfrage erkannt. Variablen: Anzahl
  hinzugefügter Fotos und Videos, Fotos, Videos, Titel, Ort und Aufnahmetag des
  letzten.
- **Fotos zu einem Album hinzugefügt**: Ein Album enthält mehr Fotos als bei
  der letzten Abfrage (ein neues Album zählt ab null). Filter: der Albumtitel,
  genau wie in PhotoPrism. Variablen: Albumtitel, hinzugefügte Fotos, Fotos im
  Album.
- **Indexierung oder Import beendet**: Eine von Gladys (Szene oder Widget)
  gestartete Indexierung oder ein Import ist beendet. Filter: Art (Indexierung,
  Import) und Ergebnis (Erfolg, Fehler). Variablen: Art, Ergebnis, Dauer in
  Sekunden, hinzugefügte Fotos und Videos.

Was eine von Gladys gestartete Indexierung oder ein Import hinzufügt, wird an
ihrem Ende gemeinsam gemeldet, kurz vor **Indexierung oder Import beendet**.

### Aktionen

- **Indexierung starten**: PhotoPrism indexiert die neuen und geänderten
  Dateien der Originale oder eines Ordners (`2026/05`). **Vollständiger Rescan
  (langsam)** liest jede Datei neu. Ergebnis: **Bereits beendet** (eine
  Indexierung weniger Dateien endet in unter drei Sekunden).
- **Import starten**: PhotoPrism kopiert die Dateien seines Import-Ordners in
  die Bibliothek (kopiert, nicht verschoben), in ein Album, wenn du eins nennst
  (bei Bedarf angelegt). Ergebnis: **Bereits beendet**.

Beide Aktionen antworten in wenigen Sekunden: PhotoPrism arbeitet weiter, und
der Auslöser **Indexierung oder Import beendet** meldet das Ende. Es läuft
immer nur eine von Gladys gestartete Aufgabe; PhotoPrism lehnt auch eine
Aufgabe ab, solange eine andere läuft (zum Beispiel aus seiner eigenen
Oberfläche gestartet).

### Szenenideen

- Jede Nacht um 3 Uhr **Indexierung starten**; bei **Indexierung oder Import
  beendet** mit dem Ergebnis „Fehler“ dir eine Nachricht schicken.
- Bei **Neue Fotos hinzugefügt** der Familie eine Nachricht mit der Anzahl der
  neuen Fotos und dem Ort des letzten schicken (Variablen des Auslösers).
- Bei **Fotos zu einem Album hinzugefügt** „Urlaub 2026“ eine Nachricht auf
  dem Tablet im Wohnzimmer anzeigen.

## Fehlerbehebung

- **„App-Passwort, Benutzername oder Passwort abgelehnt“**: Das App-Passwort
  wurde gelöscht oder falsch eingegeben; prüfe mit einem Benutzernamen das
  Passwort. Ein Konto mit Zwei-Faktor-Authentifizierung braucht ein
  App-Passwort.
- **„Zugriff verweigert“**: Dem App-Passwort fehlt ein Bereich (der Import
  braucht vollen Zugriff), oder das Konto ist kein Admin.
- **„der Server antwortet nicht“**: Prüfe Adresse und Port (2342 beim
  Docker-Image) vom Gladys-Rechner aus.
- **„Zertifikat abgelehnt“**: ein selbstsigniertes Zertifikat; verwende die
  `http://`-Adresse in deinem Netzwerk.
- **„eine Indexierung oder ein Import läuft bereits“**: PhotoPrism ist
  beschäftigt; versuch es erneut, wenn es fertig ist.
- **Die Indexierung endet hinter einem Reverse-Proxy nach einer Minute mit
  einem Fehler**: Der Proxy hat die Anfrage abgebrochen (PhotoPrism antwortet
  erst am Ende). Verwende die lokale Adresse oder erhöhe das Zeitlimit des
  Proxys.
- `LOG_LEVEL=debug` in den Protokollen der Integration zeigt jede Abfrage.

## Grenzen

- PhotoPrism verrät nicht, ob eine Indexierung läuft: **Indexierung läuft**
  folgt nur den von Gladys gestarteten Aufgaben.
- Neue Fotos werden bei der nächsten Abfrage erkannt (standardmäßig nach 5
  Minuten).
- Alben: nur die von den Benutzern angelegten, nicht Momente, Ordner oder
  Kalender.
- Kein Foto verlässt dein Netzwerk über die Integration, außer du schaltest die
  Vorschaubilder des Widgets ein, und nichts wird gelöscht oder verschoben:
  keine Bereinigung, der Import kopiert.
- Nicht mit PhotoPrism UG verbunden. PhotoPrism ist eine eingetragene Marke der
  PhotoPrism UG.
