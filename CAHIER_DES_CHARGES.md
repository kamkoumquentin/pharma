# Cahier des Charges — Medipharmac (Espace Administration Pharmacie)

**Nom du projet :** `medipharmac` (interface pharmacie de la plateforme **Mediskip**)  
**Version :** `0.1.0`  
**Langue de l'interface :** Français (`lang="fr"`)  
**Zone géographique et fuseau horaire cibles :** Cameroun (`Africa/Douala`, indicatif `+237`)

---

## 1. Objet et périmètre du projet

**Medipharmac** est une application web destinée aux pharmacies partenaires. Elle permet à chaque officine de :
- créer et gérer son compte et sa fiche établissement (coordonnées, position GPS, horaires, fermetures, gardes) ;
- gérer son catalogue de médicaments (ajout manuel, import automatisé par IA à partir d'une photo ou d'un PDF, mise à jour des prix, gestion des ruptures de stock et des photos) ;
- suivre ses performances et la demande locale via un tableau de bord analytique et l'historique des consultations de sa ville ;
- échanger en temps réel avec les patients (demandes clients) et avec l'administration de la plateforme ;
- consulter l'offre des autres pharmacies actives sur une carte interactive.

---

## 2. Stack technique et dépendances

### 2.1 Socle applicatif
- **Framework :** Next.js `16.2.12` (App Router, Turbopack)
- **Bibliothèque UI :** React `19.2.4` / React DOM `19.2.4`
- **Style :** Tailwind CSS `^4` (`@tailwindcss/postcss`), police Google Font `Roboto` (graisses 300, 400, 500, 700)
- **Icônes :** `@heroicons/react` `^2.2.0` (variantes `solid` et `outline`)
- **Composants complémentaires :** `@mui/material` `^5.15.20`, `@mui/x-data-grid` `^7.8.0`, `@emotion/react`, `@emotion/styled`

### 2.2 Services, visualisation et utilitaires
- **Backend / Base de données / Auth / Temps réel / Stockage :** `@supabase/supabase-js` `^2.112.3`
- **Intelligence Artificielle (extraction de documents) :** `@google/genai` `^2.16.0`
- **Graphiques (Tableau de bord) :** `recharts`
- **Cartographie :** `leaflet` `^1.9.4` et `react-leaflet` `^5.0.0`
- **Client HTTP :** `axios` `^1.7.2` (client configuré dans `app/lib/api.js` pointant par défaut vers `http://localhost:8080/api`)
- **Qualité de code :** ESLint `^9` avec `eslint-config-next` `16.2.12`

### 2.3 Variables d'environnement requises
Définies dans `.env.example` et côté serveur :
- `NEXT_PUBLIC_SUPABASE_URL` : URL du projet Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` : clé publique anonyme Supabase (obligatoire au démarrage dans `app/lib/supabaseClient.js`).
- `NEXT_PUBLIC_SITE_URL` : URL de redirection pour la réinitialisation de mot de passe (par défaut `https://auth.mediskip.space`).
- `GEMINI_API_KEY` : clé API Google Gemini utilisée côté serveur par `/api/import-ai`.

---

## 3. Architecture du projet

```text
c:\pharma\
├── app/
│   ├── layout.js                     # Layout racine (Roboto, métadonnées, ToastProvider)
│   ├── globals.css                   # Styles globaux Tailwind CSS
│   ├── page.js                       # Redirection immédiate vers /admin/connexion
│   ├── api/
│   │   └── import-ai/route.js        # Endpoint POST d'extraction IA (Gemini) de listes de médicaments
│   ├── components/
│   │   ├── ChatMessageThread.js      # Fil de messages réutilisable (édition, suppression, pagination)
│   │   ├── OtpModal.js               # Modale de vérification par code OTP (type signup)
│   │   └── Toast.js                  # Système de notifications toast global
│   ├── lib/
│   │   ├── api.js                    # Instance Axios avec injection du token_pharmacie
│   │   ├── supabaseClient.js         # Client Supabase + compteur de requêtes en dev
│   │   ├── statistiques.js           # Agrégation des KPIs, séries, top produits, ruptures et opportunités
│   │   ├── disponibiliteOffres.mjs   # Constantes et mise à jour unitaire/lot de disponibilité
│   │   ├── medicaments.js            # Normalisation, recherche paginée et création sûre de médicaments
│   │   ├── demandes.js               # Hook useDemandes (chat client <-> pharmacie en Realtime)
│   │   ├── messagerie.js             # Hook useMessagerie (chat pharmacie <-> administration en Realtime)
│   │   ├── formatNomPharmacie.mjs    # Formatage typographique des noms de pharmacies/villes
│   │   ├── nomFichierImage.mjs       # Génération du chemin Storage produits/<sha256>.<ext>
│   │   └── telephonePharmacie.js     # Validation/normalisation du téléphone (+237 + 9 chiffres)
│   └── admin/
│       ├── page.js                   # Shell principal de l'espace pharmacie (sidebar, navigation, garde de session)
│       ├── contenu.js                # Écran "Voir le stock"
│       ├── ma-pharmacie.js           # Conteneur à onglets "Ma pharmacie"
│       ├── connexion/page.js         # Page de connexion + demande de réinitialisation
│       ├── inscription/page.js       # Page d'inscription pharmacie + géolocalisation + OTP
│       ├── reinitialiser/page.js     # Page de définition du nouveau mot de passe
│       ├── dashboard/dashboard.js    # Écran "Tableau de bord"
│       ├── ajouter/ajouter.js        # Écran "Ajouter un médicament"
│       ├── import/import.js          # Écran "Importation automatique"
│       ├── consultations/consultations.js # Écran "Consultations" par ville
│       ├── demandes/demandes.js      # Écran "Demandes clients"
│       ├── messages/messages.js      # Écran "Administration"
│       ├── recherche/
│       │   ├── recherche.js          # Écran "Recherche globale"
│       │   └── MapComponent.js       # Carte Leaflet des pharmacies
│       ├── modifier/modifier.js      # Édition des infos générales, adresse, photo et GPS
│       └── informations/informations.js # Édition téléphone, horaires, fermetures et gardes
├── sql/                              # Scripts de migration SQL Supabase (002 à 010)
└── scripts/                          # Scripts de tests unitaires Node.js
```

---

## 4. Modèle de données et services Supabase

### 4.1 Tables utilisées par l'application
| Table | Rôle | Colonnes principales observées |
| :--- | :--- | :--- |
| `pharmacies` | Profil de chaque officine | `id`, `owner_id`, `nom`, `ville`, `emplacement`, `telephone`, `latitude`, `longitude`, `photo`, `statut`, `etat`, `visible` |
| `pharmacie_horaires` | Plages horaires hebdomadaires | `id_pharmacie`, jour (`1` à `7`), heure d'ouverture, heure de fermeture |
| `pharmacie_fermetures` | Périodes de fermeture exceptionnelle | `id_pharmacie`, `debut`, `fin` |
| `pharmacie_gardes` | Périodes de garde | `id_pharmacie`, `debut`, `fin` |
| `pharmacies_statut` | Statut calculé d'ouverture en temps réel | `statut_actuel` / `texte` (`ouvert`, `ferme`, `garde`), `change_a` |
| `medicaments` | Catalogue global des médicaments | `id`, `nom` (index unique sur le nom normalisé) |
| `offres` | Stock d'une pharmacie pour un médicament | `id`, `id_pharmacie`, `id_medicament`, `prix`, `disponibilite`, `image` |
| `offres_historique` | Historique des modifications d'offres | `id`, `id_offre`, `id_pharmacie`, `id_medicament`, `disponibilite`, `prix`, `operation`, `enregistre_le` |
| `consultations` | Vues/sélections d'offres par les patients | `id`, `id_pharmacie`, `id_medicament`, `created_at` |
| `abonnements_medicament` | Alertes de retour en stock demandées par les patients | `id`, `id_medicament`, `id_pharmacie` (nullable), `actif` |
| `notifications` | Notifications in-app clients | `type` (`medicament_disponible`, `suivi_retire`) |
| `discussions` | Fils de chat patient ↔ pharmacie | `id`, `utilisateur_id`, `pharmacie_id`, `dernier_message_at`, `dernier_extrait`, `dernier_auteur_role`, `non_lus_client`, `non_lus_pharmacie`, `alerte_modification_pharmacie`, `cree_le` |
| `discussion_messages` | Messages du chat patient ↔ pharmacie | `id`, `discussion_id`, `auteur_role` (`client` \| `pharmacie`), `contenu` (1–500 car.), `id_medicament`, `cree_le`, `lu_le`, `modifie_le`, `supprime_le` |
| `conversations` | Fils de chat pharmacie ↔ administration | `id`, `pharmacie_id`, `dernier_message_at`, `non_lus_pharmacie` |

### 4.2 Fonctions RPC et Stockage
- **`get_consultations_ville`** : retourne les consultations agrégées par médicament dans la ville de la pharmacie (`id_medicament`, `nom_medicament`, `total_consultations`).
- **`lister_medicaments_avec_offres`** : retourne la liste (`id`, `nom`) des médicaments ayant au moins une offre active dans une pharmacie.
- **Supabase Storage (`offres-images`)** : stockage des images produits sous le chemin `produits/<sha256>.<extension>`.

---

## 5. Spécifications fonctionnelles détaillées

### 5.1 Authentification, inscription et garde de session
- **Connexion (`/admin/connexion`) :** authentification e-mail/mot de passe via Supabase Auth, gestion des comptes non confirmés (ouverture de `OtpModal`), envoi de lien de réinitialisation vers `${NEXT_PUBLIC_SITE_URL}/admin/reinitialiser`.
- **Inscription (`/admin/inscription`) :** saisie des informations de l'officine (nom, e-mail, mot de passe, téléphone validé au format `+237[62]\d{8}`, ville, emplacement, coordonnées GPS avec capture automatique du navigateur), création du compte et confirmation par code OTP, création automatique de la ligne `pharmacies` si absente lors de la première connexion.
- **Réinitialisation (`/admin/reinitialiser`) :** gestion des liens PKCE (`?code=...`) ou hash d'erreur, mise à jour du mot de passe.
- **Garde de session (`app/admin/page.js`) :**
  - Vérifie l'utilisateur authentifié et charge la pharmacie liée à `owner_id` (jusqu'à 5 tentatives).
  - Écoute en temps réel (`postgres_changes` sur `pharmacies`) les changements de `statut` et `visible`.
  - Si `statut` est suspendu (`suspendu`, `suspended`, `bloque`, `bloqué`, `blocked`), bloque toute l'interface avec écran d'alerte et bouton de déconnexion.
  - Affiche un bandeau d'information si `statut === "en_attente"` ou si `visible === false`.
  - Protège contre la perte de modifications non enregistrées dans « Ma pharmacie » lors de la navigation ou fermeture de l'onglet.

### 5.2 Navigation principale (`app/admin/page.js`)
La barre latérale gauche donne accès aux écrans suivants (vue par défaut à l'ouverture : `l` — Voir le stock) :
1. **`dashboard`** — Tableau de bord
2. **`l`** — Voir le stock (et `p` pour ouverture directe d'une offre à modifier)
3. **`a`** — Ajouter un médicament
4. **`i`** — Importation automatique
5. **`c`** — Consultations
6. **`d`** — Demandes clients (avec badge de messages non lus)
7. **`m`** — Administration (avec badge de messages non lus)
8. **`r`** — Rechercher un produit
9. **`pharmacie`** — Ma pharmacie

### 5.3 Tableau de bord (`app/admin/dashboard/dashboard.js` & `app/lib/statistiques.js`)
- **Filtre temporel :** sélecteur `7j`, `30j` (défaut), `90j` + bouton d'actualisation manuelle.
- **4 cartes KPI :**
  1. *Vues de vos produits* : total des `consultations` sur la période, comparé au volume de recherches de la ville (`% captées`).
  2. *Disponibilité du stock* : pourcentage d'offres `"disponible"` sur le total des offres.
  3. *Réactivité clients* : temps médian de première réponse (`auteur_role === "pharmacie"` après le premier message `"client"`) et taux de réponse sur la période.
  4. *Produits en rupture* : nombre d'offres actuellement `"indisponible"`.
- **2 graphiques Recharts (`ResponsiveContainer`) :**
  1. `AreaChart` : évolution quotidienne des consultations sur la période.
  2. `BarChart` horizontal : top 7 des médicaments les plus consultés de la pharmacie.
- **2 listes actionnables :**
  1. *Demande locale non couverte* : top 6 des médicaments consultés en ville absents ou en rupture dans la pharmacie, avec bouton « Ajouter » redirigeant vers l'écran `a`.
  2. *Ruptures de stock à réactiver* : top 6 des produits en rupture triés en priorité par nombre de patients abonnés à une alerte (`nbPatientsEnAttente`) puis par durée de rupture en jours (calculée depuis `offres_historique`), affichant le prix en FCFA, le badge `"X patient(s) en attente"` si > 0, et le bouton « Gérer le stock » redirigeant vers l'écran `l`.
- **États UX :** skeleton de chargement et écran d'erreur avec bouton « Réessayer ».

### 5.4 Gestion du stock (`app/admin/contenu.js` & `app/lib/disponibiliteOffres.mjs`)
- Chargement des `offres` avec jointure `medicaments(id, nom)`.
- Barre de recherche textuelle et filtre par statut (`all`, `disponible`, `indisponible`).
- Actions unitaires : modifier le prix (modale), basculer la disponibilité (`disponible` ↔ `indisponible`), téléverser/remplacer/agrandir l'image produit, renommer le médicament associé, supprimer l'offre avec confirmation.
- Actions par lot : mode sélection multiple (activable par appui long de 450 ms) permettant de passer un lot d'offres en stock ou en rupture via `mettreAJourDisponibiliteLot` (avec confirmation de réapprovisionnement).

### 5.5 Ajout de médicament (`app/admin/ajouter/ajouter.js`)
- Chargement des suggestions via `lister_medicaments_avec_offres`.
- Création ou récupération sécurisée du médicament via `assurerMedicament` (gestion des collisions d'unicité PostgreSQL code `23505` et pagination PostgREST par tranches de 1000 lignes).
- Détection si la pharmacie possède déjà une offre pour ce médicament afin de proposer sa modification directe.
- Gestion d'image : sélection d'une image déjà existante sur le médicament ou upload d'un nouveau fichier.

### 5.6 Importation automatique par IA (`app/admin/import/import.js` & `app/api/import-ai/route.js`)
- Zone de dépôt (drag & drop) acceptant images ou PDF.
- Envoi `FormData` vers `POST /api/import-ai`.
- Extraction structurée en JSON `[{"produit": "...", "prix": number|null}]` via `@google/genai` avec stratégie de repli sur les modèles `gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`.
- Tableau de prévisualisation éditable : correction des noms et prix, ajout de photos, suppression de lignes, détection des offres existantes, puis import en lot dans Supabase avec barre de progression et nettoyage des images orphelines en cas d'échec.

### 5.7 Consultations locales (`app/admin/consultations/consultations.js`)
- Appel à `supabase.rpc("get_consultations_ville")` pour afficher le classement des médicaments les plus consultés dans la ville de la pharmacie et le total général.
- Affiche une invitation à renseigner la ville dans « Ma pharmacie » si `ville` est vide.

### 5.8 Demandes clients & Administration (`demandes.js`, `messages.js`, `ChatMessageThread.js`)
- **Demandes clients (`useDemandes`) :** liste des `discussions` triée par `dernier_message_at`, synchronisation temps réel Supabase Realtime, chargement incrémental des anciens messages, résolution des noms de médicaments (`id_medicament`), envoi/modification/suppression de messages (dans la fenêtre de 15 minutes autorisée par RLS), marquage comme lu et mise à jour du compteur de non-lus.
- **Administration (`useMessagerie`) :** fil unique entre la pharmacie et l'administration via `conversations`, pagination des anciens messages et compteur de non-lus.

### 5.9 Recherche globale & Carte (`app/admin/recherche/recherche.js` & `MapComponent.js`)
- Recherche par nom de médicament sur toutes les `offres` dont la pharmacie a `statut = "actif"`.
- Affichage des résultats en liste et sur carte interactive **Leaflet** (chargée dynamiquement côté client avec `ssr: false`).

### 5.10 Ma pharmacie (`ma-pharmacie.js`, `modifier/modifier.js`, `informations/informations.js`)
Interface organisée en 4 onglets :
1. **Général :** nom, téléphone (format Cameroun `+237[62]\d{8}`), photo de l'officine.
2. **Adresse et position :** ville, emplacement/quartier, capture GPS (`latitude`, `longitude`).
3. **Horaires :** configuration des plages d'ouverture/fermeture pour chacun des 7 jours de la semaine (`pharmacie_horaires`).
4. **Fermetures et gardes :** ajout/suppression de périodes datées (`pharmacie_fermetures`, `pharmacie_gardes`) validées sur le fuseau `Africa/Douala` (fin postérieure au début, non entièrement dans le passé) et affichage du statut d'ouverture en cours (`pharmacies_statut`).

---

## 6. Provenance des données, définitions et formules de calcul

Cette section détaille **d'où vient chaque chiffre affiché**, **ce qu'il mesure exactement** et **quelle formule est appliquée** dans le code ([app/lib/statistiques.js](file:///c:/pharma/app/lib/statistiques.js), [app/admin/dashboard/dashboard.js](file:///c:/pharma/app/admin/dashboard/dashboard.js) et [app/admin/consultations/consultations.js](file:///c:/pharma/app/admin/consultations/consultations.js)).

### 6.1 Qu'est-ce qu'une « vue » (ou consultation) et comment est-elle mesurée ?
- **Définition :** Une **vue** correspond à une ligne enregistrée dans la table `consultations` (`id`, `id_pharmacie`, `id_medicament`, `created_at`).
- **Ce qui est mesuré :** Ce n'est pas un simple affichage de liste ni une recherche tapée dans le vide : une ligne `consultations` est créée côté application client lorsqu'un patient **sélectionne/consulte l'offre d'un médicament** auprès d'une pharmacie donnée.
- **Fenêtre de calcul (`nbJours` = `7`, `30` ou `90`) :**
  - Le point de départ `dateDebutIso` est fixé à **minuit (`00:00:00.000`, heure locale)** il y a `nbJours - 1` jours (ex. pour `30j`, aujourd'hui + les 29 jours précédents).
  - Requête exécutée : toutes les lignes de `consultations` avec `id_pharmacie = pharmacieId` et `created_at >= dateDebutIso`.
- **Total des vues de la pharmacie (`totalVuesPharmacie`) :**
  $$\text{totalVuesPharmacie} = \text{nombre de lignes } \texttt{consultations} \text{ retournées sur la période}$$
- **Courbe quotidienne (`serieQuotidienne`) :** Pour chaque jour calendaire local (`YYYY-MM-DD`) entre `dateDebutIso` et aujourd'hui, on compte le nombre de consultations dont `created_at` tombe ce jour-là (`0` s'il n'y en a aucune).
- **Top produits (`topProduitsPharmacie`) :** Les consultations de la période sont regroupées par `id_medicament`, comptées, triées par ordre décroissant, et les **7 premiers** médicaments sont affichés.

### 6.2 Comment différencie-t-on les recherches par ville (ex. Bafoussam vs Douala) ?
- Chaque pharmacie possède un champ `ville` dans la table `pharmacies` (renseigné à l'inscription ou dans « Ma pharmacie »).
- L'application appelle la fonction base de données (RPC) **`supabase.rpc("get_consultations_ville")`** sans argument depuis le client.
- **Fonctionnement côté serveur Supabase :** La fonction identifie l'utilisateur connecté (et donc sa pharmacie et sa `ville`, ex. Bafoussam ou Douala), puis agrège les `consultations` des pharmacies situées dans **cette même ville** pour retourner `{ id_medicament, nom_medicament, total_consultations }`.
  - Ainsi, une pharmacie enregistrée à **Bafoussam** ne reçoit que les consultations des pharmacies de Bafoussam, et une pharmacie enregistrée à **Douala** ne reçoit que celles de Douala.
  - Si le champ `ville` n'est pas encore renseigné sur la fiche de la pharmacie, l'écran « Consultations » invite le pharmacien à le compléter dans « Ma pharmacie ».
  - *(Note : la définition SQL interne de `get_consultations_ville` est hébergée directement dans Supabase et ne figure pas dans le dossier `sql/` de ce dépôt.)*
- **Total des recherches en ville (`totalVuesVille`) :**
  $$\text{totalVuesVille} = \sum \text{Number}(\text{total\_consultations})$$
  (somme de toutes les lignes retournées par `get_consultations_ville`).

### 6.3 Comment obtient-on le pourcentage de vues captées ?
Affiché sous la carte KPI *« Vues de vos produits »* (`partVuesVille`) lorsque `totalVuesVille > 0` :
$$\text{partVuesVille (\%)} = \text{Math.round}\left(\frac{\text{totalVuesPharmacie}}{\text{totalVuesVille}} \times 100\right)$$
> **Point d'attention :** `totalVuesPharmacie` est filtré sur la période sélectionnée (`7j`, `30j` ou `90j`), tandis que `totalVuesVille` provient de `get_consultations_ville` qui ne reçoit pas de paramètre de période depuis le client.

### 6.4 Disponibilité du stock
- Une offre est considérée **en stock** (`estEnStock`) si `(disponibilite || "disponible") === "disponible"`, et **en rupture** si elle vaut `"indisponible"`.
- **Formule du taux de disponibilité (`tauxDisponibilite`) :**
  $$\text{tauxDisponibilite (\%)} = \begin{cases} \text{Math.round}\left(\dfrac{\text{nbEnStock}}{\text{totalOffres}} \times 100\right) & \text{si } \text{totalOffres} > 0 \\ 0 & \text{sinon} \end{cases}$$

### 6.5 Réactivité clients (Temps médian et Taux de réponse)
Les calculs portent sur `discussions` et `discussion_messages` (en excluant les messages ayant `supprime_le` non nul, et en triant les messages de chaque discussion par `cree_le` croissant) :
1. **Demande reçue (`demandesRecues`) :** Une discussion est comptée sur la période si son **premier message client** (`auteur_role === "client"`) a une date `cree_le >= dateDebutIso`.
2. **Demande répondue (`demandesRepondues`) :** Parmi ces demandes reçues, celles qui possèdent au moins un message `auteur_role === "pharmacie"` avec `cree_le >= cree_le(1er message client)`.
3. **Taux de réponse (`tauxReponse`) :**
   $$\text{tauxReponse (\%)} = \begin{cases} \text{Math.round}\left(\dfrac{\text{demandesRepondues}}{\text{demandesRecues}} \times 100\right) & \text{si } \text{demandesRecues} > 0 \\ \text{null (affiché « Aucune demande reçue »)} & \text{sinon} \end{cases}$$
4. **Temps médian de première réponse (`tempsMedianMinutes`) :**
   - Pour chaque demande répondue, on calcule le délai en minutes :
     $$\Delta t = \frac{\text{timestamp}(\text{1re réponse pharmacie}) - \text{timestamp}(\text{1er message client})}{60\,000}$$
   - On trie toutes les durées $\Delta t$ par ordre croissant et on prend la **médiane** (valeur du milieu si le nombre de valeurs est impair, moyenne des deux valeurs centrales s'il est pair), ce qui évite qu'un message resté sans réponse pendant plusieurs jours ne fausse l'indicateur comme le ferait une moyenne.
   - Formatage affiché : `< 1 min`, `X min`, `Xh YYmin` ou `Xj Yh`.

### 6.6 Durée des ruptures et Patients en attente
- **Durée de rupture (`joursRupture`) :**
  - L'application charge les **500 dernières lignes** de `offres_historique` pour la pharmacie, triées de la plus récente à la plus ancienne (`enregistre_le DESC`).
  - Pour chaque offre actuellement en rupture, la fonction `trouverDebutRupture` parcourt cet historique à rebours tant que l'état est en rupture et s'arrête dès qu'elle rencontre une entrée « en stock ». La date la plus ancienne de cette séquence continue devient `depuisLe`.
  - Formule :
    $$\text{joursRupture} = \text{Math.max}\left(0, \left\lfloor \frac{\text{maintenant} - \text{timestamp}(\text{depuisLe})}{86\,400\,000} \right\rfloor\right)$$
    *(Si aucune entrée d'historique n'existe dans les 500 dernières lignes, la durée vaut `null` et l'interface affiche « En rupture ».)*
- **Patients en attente (`nbPatientsEnAttente` et `patientsEnAttente`) :**
  - Requête sur `abonnements_medicament` avec `actif = true` et (`id_pharmacie = pharmacieId` **ou** `id_pharmacie IS NULL`, c'est-à-dire les patients qui attendent le produit dans cette pharmacie ou dans n'importe quelle pharmacie).
  - Les abonnements actifs sont comptés par `id_medicament`.
  - `kpis.patientsEnAttente` additionne ces comptes sur l'ensemble des `id_medicament` uniques actuellement en rupture dans la pharmacie.
  - La liste *« Ruptures de stock à réactiver »* trie les produits par **`nbPatientsEnAttente` décroissant**, puis par **`joursRupture` décroissant**, et affiche les **6 premiers**.

### 6.7 Demande locale non couverte (`opportunitesVille`)
- Prend les résultats de `get_consultations_ville`.
- Filtre uniquement les médicaments qui **ne sont pas en stock** dans la pharmacie (soit absents du catalogue de la pharmacie → statut `"absent"`, soit présents mais indisponibles → statut `"en_rupture"`).
- Trie par `total_consultations` décroissant et conserve les **6 premiers**.

---

## 7. Tests et qualité logicielle

Le projet dispose de scripts de tests automatisés exécutables via Node.js :
- `npm run test:formatters` : teste le formatage des noms de pharmacies (`scripts/test-formatters.mjs`).
- `npm run test:medicaments` : teste la normalisation et la logique de recherche/création de médicaments avec client mocké (`scripts/test-medicaments.mjs` via `scripts/amorcer-tests.mjs`).
- `scripts/test-disponibilite.mjs` : teste la validation et le basculement de disponibilité.
- `npm run lint` : vérification ESLint sur l'ensemble du code.
- `npm run build` : compilation de production Next.js (nécessite les variables Supabase dans `.env.local`).
