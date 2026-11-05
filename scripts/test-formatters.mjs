import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { formaterNomPharmacie } from "../app/lib/formatNomPharmacie.mjs";
import { construireNomFichierImage } from "../app/lib/nomFichierImage.mjs";

const noms = [
  ["pharmacie du centre", "Pharmacie du Centre"],
  ["PHARMACIE DES MONTAGNE", "Pharmacie des Montagne"],
  ["pharmacie de l'espoir", "Pharmacie de l'Espoir"],
  ["pharmacie d'abidjan", "Pharmacie d'Abidjan"],
  ["", ""],
  [null, ""],
];

for (const [entree, attendu] of noms) {
  assert.equal(formaterNomPharmacie(entree), attendu);
}

const fichierA1 = { name: "boite.png", bytes: Buffer.from("same image bytes") };
const fichierA2 = { name: "boite.png", bytes: Buffer.from("same image bytes") };
const fichierB = { name: "boite-differente.png", bytes: Buffer.from("different image bytes") };
const nomFichier = (fichier) => {
  const empreinte = createHash("sha256").update(fichier.bytes).digest("hex");
  const extension = fichier.name.split(".").pop();
  return construireNomFichierImage(empreinte, extension);
};

assert.equal(nomFichier(fichierA1), nomFichier(fichierA2));
assert.notEqual(nomFichier(fichierA1), nomFichier(fichierB));

console.log("Formatage des noms et nommage SHA-256 des images : OK");
