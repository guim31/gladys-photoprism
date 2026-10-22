# PhotoPrism

Votre photothèque [PhotoPrism](https://www.photoprism.app) dans Gladys, sur
votre réseau local : le nombre de photos, de vidéos, d'albums, de lieux et de
photos à valider, la date et le lieu de la dernière photo ajoutée, des scènes
qui réagissent à l'arrivée de nouvelles photos ou à un album qui grandit, et
des actions de scène qui lancent une indexation ou une importation, avec un
déclencheur à la fin.

L'intégration a été testée contre un vrai serveur PhotoPrism (l'image Docker
officielle, version 261007), pas encore dans une vraie installation de Gladys :
vos retours sont les bienvenus sur le
[forum Gladys](https://community.gladysassistant.com) ou dans les
[issues](https://github.com/guim31/gladys-photoprism/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un serveur **PhotoPrism** joignable depuis Gladys (même réseau).
- Un **mot de passe d'application** à accès complet : dans PhotoPrism,
  **Paramètres** → **Compte** → **Applications et appareils** → **Ajouter**,
  portée « accès complet » (ou sur le serveur :
  `photoprism auth add -n Gladys -s "*" -e -1 admin`). L'importation demande
  l'accès complet ; une portée plus étroite suffit pour les compteurs.
- Sans mots de passe d'application (anciens serveurs, double authentification
  désactivée), le nom et le mot de passe d'un compte **admin** conviennent
  aussi.
- Un serveur en mode public (`PHOTOPRISM_AUTH_MODE=public`) n'a besoin ni de
  l'un ni de l'autre.

## Mise en place

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, saisissez l'**Adresse du serveur** avec son port
   (par exemple `http://192.168.1.20:2342` ; derrière un proxy inverse,
   `https://example.org/photos`) et le **mot de passe d'application**. Laissez
   le nom d'utilisateur vide avec un mot de passe d'application.
3. Choisissez le **Rafraîchissement** (5 minutes par défaut) et la **Langue des
   noms**, puis enregistrez. **Tester la connexion** lit le serveur tout de
   suite.
4. Dans **Découverte**, ajoutez l'appareil **PhotoPrism**.

## Appareils

Un appareil **PhotoPrism**, avec ces fonctionnalités (en lecture seule) :

| Fonctionnalité         | Ce qu'elle indique                                                         |
| ---------------------- | -------------------------------------------------------------------------- |
| Photos                 | Photos de la photothèque (hors archives)                                   |
| Vidéos                 | Vidéos de la photothèque                                                   |
| Albums                 | Albums créés par les utilisateurs                                          |
| Lieux                  | Lieux des photos (demande le géocodage de PhotoPrism)                      |
| À valider              | Photos que PhotoPrism met de côté (qualité faible, date manquante)         |
| Dernière photo ajoutée | Jour de prise de vue et lieu : `14 mai 2026 · Toulouse, Occitanie, France` |
| Indexation en cours    | 1 pendant une indexation ou une importation lancée depuis Gladys           |

L'intégration lit le serveur elle-même (trois requêtes par lecture) : rien à
régler côté Gladys. Le badge de connexion de l'appareil passe au rouge quand
le serveur ne répond plus.

## Tableau de bord

Le widget **Photothèque** affiche les compteurs de photos, de vidéos, d'albums
et de photos à valider, les dernières photos ajoutées (lieu, jour de prise de
vue, un badge pour les vidéos ; un appui montre le titre et le jour d'ajout),
et deux boutons : **Indexer** (fichiers nouveaux et modifiés) et **Importer**
(le dossier d'import). Pendant une tâche, une ligne d'état remplace les
boutons.

Les miniatures sont **désactivées par défaut** : avec le réglage **Afficher les
miniatures**, la vignette de 224 pixels de chaque photo s'affiche, et vos photos
apparaissent alors sur tout écran qui montre ce tableau de bord (une tablette
partagée, un tableau de bord public, Gladys Plus). Le navigateur ne charge
jamais PhotoPrism directement : Gladys demande l'image à l'intégration, qui ne
sert que les photos listées par le widget.

## Scènes

### Déclencheurs

- **Nouvelles photos ajoutées** : des photos ou vidéos ont été ajoutées à la
  photothèque, quel que soit le moyen (envoi depuis l'application, WebDAV,
  importation, indexation), vues à la lecture suivante. Variables : nombre de
  photos et vidéos ajoutées, photos, vidéos, titre, lieu et jour de prise de
  vue de la dernière.
- **Photos ajoutées à un album** : un album contient plus de photos qu'à la
  lecture précédente (un nouvel album compte depuis zéro). Filtre : le titre de
  l'album, exactement comme dans PhotoPrism. Variables : titre de l'album,
  photos ajoutées, photos dans l'album.
- **Indexation ou importation terminée** : une indexation ou une importation
  lancée depuis Gladys (scène ou widget) est terminée. Filtres : type
  (indexation, importation) et résultat (réussite, échec). Variables : type,
  résultat, durée en secondes, photos et vidéos ajoutées.

Les ajouts d'une indexation ou d'une importation lancée depuis Gladys sont
annoncés ensemble à sa fin, juste avant **Indexation ou importation terminée**.

### Actions

- **Lancer une indexation** : PhotoPrism indexe les fichiers nouveaux et
  modifiés des originaux, ou d'un seul dossier (`2026/05`). **Réindexation
  complète (lente)** relit tous les fichiers. Résultat : **Déjà terminée** (une
  indexation de quelques fichiers finit en moins de trois secondes).
- **Lancer une importation** : PhotoPrism copie les fichiers de son dossier
  d'import dans la photothèque (ils sont copiés, pas déplacés), dans un album
  si vous en nommez un (créé au besoin). Résultat : **Déjà terminée**.

Les deux actions rendent la main en quelques secondes : PhotoPrism continue de
travailler, et le déclencheur **Indexation ou importation terminée** en
signale la fin. Une seule tâche lancée depuis Gladys tourne à la fois ;
PhotoPrism refuse aussi une tâche pendant qu'une autre tourne (lancée depuis
son interface, par exemple).

### Idées de scènes

- Chaque nuit à 3 h, **Lancer une indexation** ; sur **Indexation ou
  importation terminée** avec le résultat « échec », vous envoyer un message.
- Sur **Nouvelles photos ajoutées**, envoyer à la famille un message avec le
  nombre de nouvelles photos et le lieu de la dernière (variables du
  déclencheur).
- Sur **Photos ajoutées à un album** « Vacances 2026 », afficher un message sur
  la tablette du salon.

## Dépannage

- **« mot de passe d'application, nom d'utilisateur ou mot de passe refusé »** :
  le mot de passe d'application a été supprimé ou mal saisi ; avec un nom
  d'utilisateur, vérifiez le mot de passe. Un compte avec double
  authentification demande un mot de passe d'application.
- **« permission refusée »** : il manque une portée au mot de passe
  d'application (l'importation demande l'accès complet), ou le compte n'est
  pas admin.
- **« le serveur ne répond pas »** : vérifiez l'adresse et le port (2342 pour
  l'image Docker) depuis la machine de Gladys.
- **« certificat refusé »** : un certificat auto-signé ; utilisez l'adresse en
  `http://` de votre réseau.
- **« une indexation ou une importation est déjà en cours »** : PhotoPrism est
  occupé ; réessayez une fois qu'il a fini.
- **L'indexation finit en échec au bout d'une minute derrière un proxy
  inverse** : le proxy a coupé la requête (PhotoPrism ne répond qu'à la fin).
  Utilisez l'adresse locale, ou allongez le délai du proxy.
- `LOG_LEVEL=debug` dans les logs de l'intégration montre chaque lecture.

## Limites

- PhotoPrism ne permet pas de savoir si une indexation tourne : **Indexation en
  cours** ne suit que les tâches lancées depuis Gladys.
- Les nouvelles photos sont vues à la lecture suivante (5 minutes par défaut).
- Albums : seulement les albums créés par les utilisateurs, pas les moments,
  dossiers ni le calendrier.
- Aucune photo ne quitte votre réseau par l'intégration, sauf si vous activez
  les miniatures du widget, et rien n'est supprimé ni déplacé : pas de
  nettoyage, l'importation copie.
- Sans lien avec PhotoPrism UG. PhotoPrism est une marque déposée de
  PhotoPrism UG.
