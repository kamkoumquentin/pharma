import assert from "node:assert/strict";
import {
  CATEGORIE_CATALOGUE,
  CATEGORIE_DEMANDE,
  normaliserLigneActivite,
  calculerIndicateursActivite,
} from "../app/lib/activitePharmacie.mjs";

// 1. Cas vide
const vide = calculerIndicateursActivite([], new Date("2026-11-26T15:00:00Z"));
assert.equal(vide.totalActions, 0);
assert.equal(vide.derniereActivite, null);
assert.equal(vide.jourPlusActif, null);
assert.equal(vide.repartition.catalogue.count, 0);
assert.equal(vide.repartition.catalogue.pourcentage, 0);
assert.equal(vide.repartition.demande.count, 0);
assert.equal(vide.repartition.demande.pourcentage, 0);
assert.equal(vide.serie14Jours.length, 14);
assert.ok(vide.serie14Jours.every((j) => j.total === 0));

// 2. Anonymisation stricte des lignes normalisées
const ligneAvecChampsSuperflus = normaliserLigneActivite({
  id: 42,
  created_at: "2026-11-26T14:30:00Z",
  categorie: "Demande patient",
  resume: "Consultation produit",
  detail: "Consultation anonyme",
  utilisateur_id: 999,
  email: "test@example.com",
  nom: "Dupont",
  prenom: "Jean",
});
assert.deepEqual(Object.keys(ligneAvecChampsSuperflus).sort(), [
  "categorie",
  "dateFormatee",
  "dateIso",
  "detail",
  "id",
  "resume",
]);
assert.equal(ligneAvecChampsSuperflus.categorie, CATEGORIE_DEMANDE);

// 3. Calculs KPI et série 14 jours
const ref = new Date("2026-11-26T15:00:00");
const lignes = [
  {
    id: 1,
    created_at: "2026-11-26T14:00:00",
    categorie: "Catalogue & Prix",
    resume: "Mise à jour du prix",
    detail: "2 500 FCFA",
  },
  {
    id: 2,
    created_at: "2026-11-25T10:00:00",
    categorie: "Demande patient",
    resume: "Consultation produit",
    detail: "Consultation anonyme",
  },
  {
    id: 3,
    created_at: "2026-11-25T11:30:00",
    categorie: "Catalogue & Prix",
    resume: "Remise en stock",
    detail: "Disponible",
  },
  {
    id: 4,
    created_at: "2026-11-25T16:45:00",
    categorie: "Catalogue & Prix",
    resume: "Ajout médicament",
    detail: "1 200 FCFA",
  },
];

const stats = calculerIndicateursActivite(lignes, ref);
assert.equal(stats.totalActions, 4);
assert.equal(stats.derniereActivite.ancienneteRelative, "Il y a 1 h");
assert.equal(stats.jourPlusActif.count, 3);
assert.equal(stats.jourPlusActif.dateFormatee, "25/11/2026");
assert.equal(stats.repartition.catalogue.count, 3);
assert.equal(stats.repartition.catalogue.pourcentage, 75);
assert.equal(stats.repartition.demande.count, 1);
assert.equal(stats.repartition.demande.pourcentage, 25);

const jour25 = stats.serie14Jours.find((j) => j.label === "25/11");
const jour26 = stats.serie14Jours.find((j) => j.label === "26/11");
assert.equal(jour25?.total, 3);
assert.equal(jour26?.total, 1);
assert.equal(stats.donneesCategories[0].categorie, CATEGORIE_CATALOGUE);
assert.equal(stats.donneesCategories[1].categorie, CATEGORIE_DEMANDE);

console.log("Tests activité pharmacie : OK");
