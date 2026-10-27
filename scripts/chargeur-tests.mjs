// Résout l'alias « @/* » du projet pour que le script de test, exécuté par
// Node, puisse importer directement app/lib/medicaments.js.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RACINE = new URL("../", import.meta.url);

function versFichier(dossier, sansExtension) {
  const base = new URL(`${dossier}${sansExtension}`, RACINE);
  const candidats = [base.href, `${base.href}.js`, `${base.href}.mjs`, `${base.href}.json`];
  for (const candidat of candidats) {
    if (existsSync(fileURLToPath(candidat))) return candidat;
  }
  return base.href;
}

export async function resolve(specifie, contexte, suivant) {
  if (specifie.startsWith("@/")) {
    const reste = specifie.slice(2);
    const separateur = reste.lastIndexOf("/");
    const dossier = separateur === -1 ? "" : `${reste.slice(0, separateur + 1)}`;
    const nom = separateur === -1 ? reste : reste.slice(separateur + 1);
    return { url: versFichier(dossier, nom), shortCircuit: true };
  }
  return suivant(specifie, contexte);
}
