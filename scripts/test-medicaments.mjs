// Script de verification de la recherche de medicaments.
//
//   npm run test:medicaments
//
// Mode complet : il insère des lignes préfixées « zz test », vérifie que la
// recherche les retrouve (casse, espacement, signes de ponctuation, %, _,
// accents), puis les supprime. Aucune donnée existante n'est modifiée.
// La clé anonymes du navigateur n'a pas le droit d'écrire dans « medicaments »
// (politique de ligne) : hors identifiants autorisés, le script bascule en
// lecture seule sur des noms déjà présents au catalogue et ne vérifie plus
// que la forme des requêtes et les comparaisons insensibles à la casse.
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
const brut = createClient(URL_BASE, CLE);

function noterFiltre(cible) {
  try {
    const url = new URL(String(cible.url));
    urlsVues.push(url.search);
    const filtreNom = url.searchParams.get("nom");
    if (filtreNom) filtresVus.push(filtreNom);
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
// Quatre noms difficiles : espaces, majuscules, virgule, parenthèses,
// guillemets, apostrophe, % et _ (les deux derniers étant des jokers SQL).
const nomsInsere = [
  `${marque} Doliprane 500mg`,
  `${marque} NAC, sirop (200 ml) "fort" 5%_x d'hier`,
  `${marque} Éfferalgan È 150mg`,
  `${marque}Solution|pipe 100%`,
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

// Vérifie la forme réelle des chaînes de requête envoyées à PostgREST : une
// valeur « nom=ilike.<motif> » par nom, sans barre verticale, sans éclatement
// du nom sur sa propre ponctuation, et avec % et _ échappés.
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

const verifierFormeDesRequetes = async (noms) => {
  urlsVues.length = 0;
  filtresVus.length = 0;
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
  // les parenthèses, les guillemets, l'apostrophe, le pipe, % et _ et les
  // majuscules accentuées doivent ressortir intacts.
  const rendus = filtresVus.map(nomSousJacente).sort();
  const attendus = [...noms].sort();
  verifier(
    "chaque nom arrive intact dans une seule valeur de filtre",
    JSON.stringify(rendus) === JSON.stringify(attendus),
    `reçus ${rendus.join(" || ")}`
  );

  return lignes;
};

try {
  // Ces contrôles de forme ne dépendent pas de la présence des lignes en
  // base : ils fonctionnent aussi en lecture seule.
  await verifierFormeDesRequetes(nomsInsere);

  if (ecriturePossible) {
    console.log("\nRecherche par liste");
    const trouves = await chargerMedicamentsParNoms(nomsInsere);
    verifier("tous les noms sont ramenés", trouves.length === nomsInsere.length, `reçus ${trouves.length}`);

    console.log("\nCasse, espacement et caractères spéciaux");
    await verifierRecherche(nomsInsere);

    // Le % du nom est un joker échappé : « 5%_x » ne doit pas récupérer
    // une ligne « 500x ».
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
  if (ecriturePossible) {
    console.log("\nNettoyage");
    const { error: suppression } = await clientEspion.from("medicaments").delete().in("id", ids);
    if (suppression) console.log(`  suppression impossible : ${suppression.message}`);
    const reste = await clientEspion.from("medicaments").select("id").like("nom", `${marque}%`);
    verifier("plus aucune ligne de test ne subsiste", (reste.data || []).length === 0);
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
