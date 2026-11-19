import assert from "node:assert/strict";
import {
  DISPONIBILITE_EN_STOCK,
  DISPONIBILITE_RUPTURE,
  basculerDisponibilite,
  mettreAJourDisponibiliteLot,
  mettreAJourDisponibiliteOffre,
  validerDisponibilite,
} from "../app/lib/disponibiliteOffres.mjs";

function creerClientMock(repondeur) {
  const appels = [];

  return {
    appels,
    from(table) {
      const etat = { table, payload: null, eqs: [], ins: [], selected: null };
      const chaine = {
        update(payload) {
          etat.payload = payload;
          return chaine;
        },
        eq(colonne, valeur) {
          etat.eqs.push([colonne, valeur]);
          return chaine;
        },
        in(colonne, valeurs) {
          etat.ins.push([colonne, valeurs]);
          return chaine;
        },
        select(colonnes) {
          etat.selected = colonnes;
          appels.push(etat);
          return Promise.resolve(repondeur(etat));
        },
      };
      return chaine;
    },
  };
}

// 1. Validation & bascule stricte entre 'disponible' et 'indisponible'
assert.equal(validerDisponibilite("disponible"), DISPONIBILITE_EN_STOCK);
assert.equal(validerDisponibilite("indisponible"), DISPONIBILITE_RUPTURE);
assert.throws(() => validerDisponibilite("rupture"));
assert.equal(basculerDisponibilite("disponible"), "indisponible");
assert.equal(basculerDisponibilite("indisponible"), "disponible");

// 2. Mise à jour unitaire : ne modifie que disponibilite, filtre sur id + id_pharmacie, vérifie 1 ligne
const clientOk = creerClientMock(() => ({ data: [{ id: "offre-1" }], error: null }));
const maj = await mettreAJourDisponibiliteOffre(clientOk, {
  idOffre: "offre-1",
  pharmacieId: "pharma-42",
  disponibilite: DISPONIBILITE_RUPTURE,
});
assert.deepEqual(maj, { id: "offre-1" });
assert.equal(clientOk.appels.length, 1);
assert.deepEqual(clientOk.appels[0].payload, { disponibilite: "indisponible" });
assert.deepEqual(clientOk.appels[0].eqs, [
  ["id", "offre-1"],
  ["id_pharmacie", "pharma-42"],
]);

// 3. Mise à jour unitaire : échoue si 0 ligne touchée
const clientVide = creerClientMock(() => ({ data: [], error: null }));
await assert.rejects(
  () =>
    mettreAJourDisponibiliteOffre(clientVide, {
      idOffre: "offre-1",
      pharmacieId: "pharma-42",
      disponibilite: DISPONIBILITE_EN_STOCK,
    }),
  /aucune offre/i
);

// 4. Mise à jour en lot : un seul appel update ... in (ids), limité à id_pharmacie
const clientLot = creerClientMock(() => ({
  data: [{ id: "o1" }, { id: "o2" }],
  error: null,
}));
const idsMaj = await mettreAJourDisponibiliteLot(clientLot, {
  idsOffres: ["o1", "o2", "o1"],
  pharmacieId: "pharma-42",
  disponibilite: DISPONIBILITE_EN_STOCK,
});
assert.deepEqual(idsMaj, ["o1", "o2"]);
assert.equal(clientLot.appels.length, 1);
assert.deepEqual(clientLot.appels[0].payload, { disponibilite: "disponible" });
assert.deepEqual(clientLot.appels[0].ins, [["id", ["o1", "o2"]]]);
assert.deepEqual(clientLot.appels[0].eqs, [["id_pharmacie", "pharma-42"]]);

// 5. Mise à jour en lot : échoue si 0 ligne touchée
const clientLotVide = creerClientMock(() => ({ data: [], error: null }));
await assert.rejects(
  () =>
    mettreAJourDisponibiliteLot(clientLotVide, {
      idsOffres: ["o1", "o2"],
      pharmacieId: "pharma-42",
      disponibilite: DISPONIBILITE_RUPTURE,
    }),
  /aucune offre/i
);

console.log("Disponibilité des offres (unitaire et en lot) : OK");
