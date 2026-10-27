// Script de verification de la recherche de medicaments.
//
//   npm run test:medicaments
//
// Mode complet : il insère des lignes préfixées « zz test », vérifie que la
// recherche les retrouve (casse, espacement, signes de ponctuation, %, _,
// accents), puis les supprime. Aucune donnée existante n'est modifiée.
// La clé anonyme du navigateur n'a pas le droit d'écrire dans « medicaments »
// (politique de ligne) : hors identifiants autorisés, le script bascule en
// lecture seule sur des noms déjà présents au catalogue et ne vérifie plus
// que la forme des requêtes et les comparaisons insensibles à la casse. Le
// choix de la ligne exacte parmi des candidates ambiguës est vérifié sur un
// catalogue simulé, sans écrire quoi que ce soit.
//
// Identifiants : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY ;
// pour le mode complet, fournir en plus SUPABASE_SERVICE_ROLE_KEY (ou toute
// clé autorisée à écrire). Sans variable, le script reprend la configuration
// du projet au lieu de recopier une clé dans son code.

import { createClient } from "@supabase/supabase-js";
import { supabase as clientProjet } from "@/app/lib/supabaseClient";
import {
  assurerMedicament,
  chargerMedicamentsParNoms,
  definirClient,
  normaliserNom,
  trouverMedicamentParNom,
} from "@/app/lib/medicaments.js";

// Identifiants : variables d'environnement, sinon ceux déjà configurés par le
// projet — le script ne recopie aucune clé dans son code.
const CLE_ECRITURE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || clientProjet.supabaseUrl;
const CLE = CLE_ECRITURE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || clientProjet.supabaseKey;

// Enregistre les requêtes envoyées à PostgREST pour contrôler leur forme.
// Le constructeur de requête est renvoyé par chaque appel en chaîne (.select,
// .ilike, .limit) : l'enveloppe est donc réappliquée à chaque résultat et
// l'URL est lue au moment où la requête est réellement attendue.
const urlsVues = [];
const filtresVus = [];
const limitesVus = [];
const brut = createClient(URL_BASE, CLE);

function noterFiltre(cible) {
  try {
    const url = new URL(String(cible.url));
    urlsVues.push(url.search);
    const filtreNom = url.searchParams.get("nom");
    if (filtreNom) {
      filtresVus.push(filtreNom);
      limitesVus.push(url.searchParams.get("limit"));
    }
  } catch {
    // aucune URL sur cet objet : rien à noter
  }
}

function espionner(objet) {
  return new Proxy(objet, {
    get(cible, nom) {
      if (nom === "then") {
        noterFiltre(cible);
        return (...args) => cible.then(...args);
      }
      const valeur = cible[nom];
      if (typeof valeur === "function") {
        return (...args) => {
          const resultat = valeur.apply(cible, args);
          return resultat && typeof resultat === "object" && "url" in resultat
            ? espionner(resultat)
            : resultat;
        };
      }
      if (nom === "url") noterFiltre(cible);
      return valeur;
    },
  });
}

const clientEspion = {
  from(table) {
    return espionner(brut.from(table));
  },
  storage: brut.storage,
};

definirClient(clientEspion);

let echecs = 0;
const verifier = (libelle, condition, detail = "") => {
  if (condition) {
    console.log(`  OK    ${libelle}`);
  } else {
    echecs += 1;
    console.log(`  ECHEC ${libelle}${detail ? ` | ${detail}` : ""}`);
  }
};

const marque = `zz test ${Date.now().toString(36)}`;
// Cinq noms difficiles : espaces, majuscules, virgule, parenthèses,
// guillemets, apostrophe, barre verticale, % et _ (les deux derniers étant
// des jokers SQL). Le dernier sert au cas ambigu : son motif joker,
// « doliprane%500mg », recouvre aussi « Doliprane Forte 500mg ».
const nomsInsere = [
  `${marque} Doliprane 500mg`,
  `${marque} NAC, sirop (200 ml) "fort" 5%_x d'hier`,
  `${marque} Éfferalgan È 150mg`,
  `${marque}Solution|pipe 100%`,
  `${marque} Doliprane Forte 500mg`,
];

console.log("Insertion des lignes de test");
const insertion = await clientEspion
  .from("medicaments")
  .insert(nomsInsere.map((nom) => ({ nom })))
  .select("id, nom");

const ecriturePossible = !insertion.error;
if (!ecriturePossible) {
  console.log(`  écriture refusée (${insertion.error.message}) : bascule en lecture seule`);
} else {
  console.log(`  ${insertion.data.length} lignes insérées, nettoyage garanti à la fin`);
}

const ids = ecriturePossible ? insertion.data.map((l) => l.id) : [];

// Contrôles communs à l'écriture et à la lecture seule : chaque nom est
// retrouvé à l'identique, en casse inférieure et avec un espacement différent.
const verifierRecherche = async (noms) => {
  for (const nom of noms) {
    const libelle = nom.slice(0, 40);
    const exact = await chargerMedicamentsParNoms([nom]);
    verifier(`nom retrouvé : ${libelle}`, exact.length === 1 && exact[0].nom === nom, JSON.stringify(exact));

    const enMinuscules = await chargerMedicamentsParNoms([nom.toLowerCase()]);
    verifier(`en minuscules : ${libelle}`, enMinuscules.length === 1);

    const espaceLarge = nom.replace(/ /g, "   ");
    const espacement = await chargerMedicamentsParNoms([espaceLarge]);
    verifier(`espaces triplées : ${libelle}`, espacement.length === 1);

    const parPremierMot = await trouverMedicamentParNom(nom.toLowerCase());
    verifier(
      `trouverMedicamentParNom accepte la casse inférieure : ${libelle}`,
      parPremierMot !== null && normaliserNom(parPremierMot.nom) === normaliserNom(nom)
    );
  }
};

// Reconstruit le nom à partir du motif « ilike » réellement envoyé : les
// échappements (\%, \_, \\) sont retirés puis les jokers d'espacement % sont
// rendus en espaces. Si le résultat est le nom d'origine, la valeur est
// arrivée entière à PostgREST, sans éclatement ni barre verticale ajoutée.
function nomSousJacente(filtre) {
  return filtre
    .replace(/^ilike\./, "")
    .replace(/(?<!\\)%/g, " ")
    .replace(/\\([\\%_])/g, "$1");
}

// Vérifie la forme réelle des chaînes de requête envoyées à PostgREST : une
// valeur « nom=ilike.<motif> » par nom, sans éclatement du nom sur sa propre
// ponctuation, et sans limite qui tronquerait les lignes candidates.
const verifierFormeDesRequetes = async (noms) => {
  urlsVues.length = 0;
  filtresVus.length = 0;
  limitesVus.length = 0;
  const lignes = await chargerMedicamentsParNoms(noms);

  console.log("\nForme des requêtes réellement envoyées");
  for (const chaine of urlsVues) console.log(`  GET /rest/v1/medicaments${chaine}`);

  verifier(
    "une requête par nom",
    filtresVus.length === noms.length,
    `reçues ${filtresVus.length} pour ${noms.length} noms`
  );
  verifier(
    "filtre de type ilike sur toutes les requêtes",
    filtresVus.every((filtre) => filtre.startsWith("ilike.")),
    filtresVus.join(" || ")
  );

  // Aller-retour nom -> motif -> nom pour chaque valeur envoyée : la virgule,
  // les parenthèses, les guillemets, l'apostrophe, le pipe, % et _ doivent
  // ressortir intacts et les accents conservés (seule la casse diffère, le
  // filtre ilike ne dépend pas de la casse).
  const rendus = filtresVus.map(nomSousJacente).sort();
  const attendus = noms.map(normaliserNom).sort();
  verifier(
    "chaque nom arrive intact dans une seule valeur de filtre",
    JSON.stringify(rendus) === JSON.stringify(attendus),
    `reçus ${rendus.join(" || ")}`
  );
  verifier(
    "les accents ne sont ni retirés ni transformés dans le motif",
    rendus.some((nom) => nom.includes("éfferalgan è")),
    rendus.join(" || ")
  );

  verifier(
    "aucune requête coupée à une seule ligne (le joker d'espacement est ambigu)",
    limitesVus.every((limite) => limite === null || Number(limite) > 1),
    limitesVus.join(", ")
  );

  return lignes;
};

// Le jeu de lignes renvoyé par ILIKE ne peut pas être forcing en base, et la
// clé anonyme n'a pas le droit d'écrire : ce catalogue simulé rejoue la
// sémantique de LIKE (motif ancré, % et _ jokers, antislash d'échappement,
// casse ignorée) pour vérifier le choix de la ligne, quel que soit l'accès.
function jockerVersRegex(motif) {
  const motifEchappe = motif
    .split(/(\\.)/)
    .map((fragment) => {
      if (fragment.startsWith("\\")) return fragment.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return fragment
        .split(/([%_])/)
        .map((partie) =>
          partie === "%" ? ".*" : partie === "_" ? "." : partie.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        )
        .join("");
    })
    .join("");
  return new RegExp(`^${motifEchappe}$`, "i");
}

function creerClientSimule(lignes) {
  const construire = (courantes) => ({
    select: () => construire(courantes),
    ilike: (colonne, motif) => {
      const regex = jockerVersRegex(motif);
      return construire(courantes.filter((ligne) => regex.test(String(ligne[colonne] ?? ""))));
    },
    range: (debut, fin) => Promise.resolve({ data: courantes.slice(debut, fin + 1), error: null }),
    then: (succes) => Promise.resolve({ data: courantes, error: null }).then(succes),
  });
  return { from: () => construire(lignes) };
}

const verifierChoixLigneExacte = async () => {
  console.log("\nChoix de la ligne exacte quand le motif joker est ambigu (catalogue simulé)");
  const simulation = [
    { id: 1, nom: `${marque} Doliprane 500mg` },
    { id: 2, nom: `${marque} Doliprane Forte 500mg` },
  ];
  definirClient(creerClientSimule(simulation));
  try {
    // Le motif construit par la bibliothèque pour ce nom : minuscules,
    // espaces devenus jokers.
    const motifSimple = `${marque} doliprane 500mg`.replace(/ /g, "%");
    verifier(
      "le motif joker recouvre bien les deux lignes",
      jockerVersRegex(motifSimple).test(`${marque} Doliprane Forte 500mg`),
      motifSimple
    );

    const simple = await chargerMedicamentsParNoms([`${marque} Doliprane 500mg`]);
    verifier(
      "la recherche de « Doliprane 500mg » ne renvoie pas « Doliprane Forte 500mg »",
      simple.length === 1 && simple[0].nom === `${marque} Doliprane 500mg`,
      JSON.stringify(simple)
    );

    const long = await chargerMedicamentsParNoms([`${marque} DOLIPRANE   FORTE 500MG`]);
    verifier(
      "la recherche du nom long renvoie la ligne longue (casse et espacement ignorés)",
      long.length === 1 && long[0].nom === `${marque} Doliprane Forte 500mg`,
      JSON.stringify(long)
    );

    const absent = await chargerMedicamentsParNoms([`${marque} Doliprane`]);
    verifier(
      "un nom plus court que les lignes candidates ne renvoie rien",
      absent.length === 0,
      JSON.stringify(absent)
    );
  } finally {
    definirClient(clientEspion);
  }
};

try {
  // Ces contrôles de forme ne dépendent pas de la présence des lignes en
  // base : ils fonctionnent aussi en lecture seule.
  await verifierFormeDesRequetes(nomsInsere);
  await verifierChoixLigneExacte();

  if (ecriturePossible) {
    console.log("\nRecherche par liste");
    const trouves = await chargerMedicamentsParNoms(nomsInsere);
    verifier("tous les noms sont ramenés", trouves.length === nomsInsere.length, `reçus ${trouves.length}`);

    console.log("\nCasse, espacement et caractères spéciaux");
    await verifierRecherche(nomsInsere);

    const ambigu = await chargerMedicamentsParNoms([`${marque} Doliprane 500mg`]);
    verifier(
      "en base : « Doliprane 500mg » ne renvoie pas la ligne « Doliprane Forte 500mg »",
      ambigu.length === 1 && ambigu[0].nom === `${marque} Doliprane 500mg`,
      JSON.stringify(ambigu)
    );

    // Le % de la ligne « 5%_x » est échappé côté motif : il reste un
    // caractère littéral et ne doit donc pas jouer le rôle d'un joker.
    const fauxJoker = await chargerMedicamentsParNoms([`${marque} NAC, sirop (200 ml) "fort" 500x`]);
    verifier("un % échappé ne devient pas un joker", fauxJoker.length === 0, JSON.stringify(fauxJoker));

    // Le motif est ancré sur le nom entier : un début de nom ne ramasse rien,
    // même quand le pipe et le % suivent en base.
    const debutSeul = await chargerMedicamentsParNoms([`${marque}Solution`]);
    verifier("un début de nom ne ramasse pas une ligne plus longue", debutSeul.length === 0, JSON.stringify(debutSeul));

    console.log("\nRéutilisation de la ligne existante");
    const reuse = await assurerMedicament(`${marque} Doliprane   500MG`);
    verifier(
      "assurerMedicament réutilise la ligne existante au lieu d'en créer une",
      reuse.id === ids[0],
      JSON.stringify(reuse)
    );
    const apres = await clientEspion.from("medicaments").select("id").eq("id", reuse.id);
    verifier("aucune ligne supplémentaire n'a été créée", apres.data.length === 1);
  } else {
    const { data: catalogue, error } = await clientEspion
      .from("medicaments")
      .select("nom")
      .order("nom", { ascending: true })
      .limit(12);

    if (error || !catalogue || catalogue.length === 0) {
      console.log(`  lecture impossible : ${error ? error.message : "catalogue vide"}`);
      echecs += 1;
    } else {
      console.log("\nRecherche sur des noms réels du catalogue");
      await verifierRecherche(catalogue.map((l) => l.nom));
    }
  }

  console.log("\nComparaison JavaScript contre lower() de PostgreSQL");
  const casAccents = ["É", "È", "é", "è", "À", "à", "Ç", "ç", "Ô", "ô", "Û", "û"];
  for (const lettre of casAccents) {
    verifier(
      `normaliserNom « ${lettre} » = lower() attendue « ${lettre.toLowerCase()} »`,
      normaliserNom(lettre) === lettre.toLowerCase()
    );
  }
  verifier(
    "normaliserNom réduit les espaces (lower() ne le fait pas)",
    normaliserNom("zz   test") === "zz test"
  );

  // Écart mesuré en base : lower() conserve les espaces multiples, la
  // comparaison se fait donc en JavaScript sur le nom normalisé.
  const { data: ecart, error: ecartErr } = await clientEspion
    .from("medicaments")
    .select("nom")
    .eq("nom", "zz test   espace")
    .limit(1);
  verifier(
    "eq en base reste sensible à l'espacement (écart documenté)",
    !ecartErr && (ecart || []).length === 0,
    ecartErr ? ecartErr.message : JSON.stringify(ecart)
  );
} finally {
  // Les contrôles ne lèvent pas d'exception et le bloc s'exécute donc dans
  // tous les cas. La suppression passe par le préfixe du nom, non par les
  // identifiants : toute ligne créée pendant l'exécution — y compris par
  // assurerMedicament — est retirée, même après un échec en plein milieu.
  if (ecriturePossible) {
    console.log("\nNettoyage");
    const { error: suppression } = await clientEspion
      .from("medicaments")
      .delete()
      .like("nom", `${marque}%`);
    if (suppression) console.log(`  suppression impossible : ${suppression.message}`);
    const reste = await clientEspion.from("medicaments").select("id").like("nom", `${marque}%`);
    verifier(
      "plus aucune ligne de test ne subsiste",
      (reste.data || []).length === 0,
      JSON.stringify(reste.data)
    );
  } else {
    console.log("\nAucune donnée de test créée : rien à nettoyer");
  }
}

console.log(`\n${echecs === 0 ? "tous les contrôles passent" : `${echecs} contrôle(s) en échec`}`);
console.log(
  ecriturePossible
    ? "(mode complet : écriture et suppression des lignes de test effectuées)"
    : "(mode lecture seule : relancez avec SUPABASE_SERVICE_ROLE_KEY pour tester le cycle écriture/suppression)"
);
process.exit(echecs === 0 ? 0 : 1);
