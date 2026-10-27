import { supabase } from "@/app/lib/supabaseClient";

// Taille des lots envoyés à PostgREST : la clause in() et la limite par
// défaut de 1000 lignes deviennent imprévisibles au-delà.
export const TAILLE_LOT = 50;

const LIGNES_PAR_PAGE = 1000;
const GARDE_FOLIE = 2000;

// Ramène un nom à une forme comparable : minuscules, accents conservés,
// espaces multiples réduits à un seul et bords retirés.
export function normaliserNom(nom) {
  return String(nom ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

// Le premier mot sert de point d'entrée restreint pour la recherche en base.
export function premierMot(nom) {
  return normaliserNom(nom).split(" ")[0] ?? "";
}

function echapperMotif(mot) {
  return mot.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

function decouper(liste, taille) {
  const lots = [];
  for (let debut = 0; debut < liste.length; debut += taille) {
    lots.push(liste.slice(debut, debut + taille));
  }
  return lots;
}

// Parcourt une requête page par page : PostgREST ne renvoie que 1000 lignes
// par défaut, la page suivante est donc demandée jusqu'à ce qu'une réponse
// arrive incomplète.
async function collecterParPages(construireRequete) {
  const toutes = [];
  let page = 0;

  while (page < GARDE_FOLIE) {
    const { data, error } = await construireRequete().range(
      page * LIGNES_PAR_PAGE,
      (page + 1) * LIGNES_PAR_PAGE - 1
    );

    if (error) throw error;

    const lignes = data || [];
    toutes.push(...lignes);

    if (lignes.length < LIGNES_PAR_PAGE) break;
    page += 1;
  }

  return toutes;
}

// Ramène les lignes « medicaments » dont le nom figure exactement dans la
// liste, par lots de TAILLE_LOT noms.
export async function chargerMedicamentsParNoms(noms) {
  const lots = decouper([...new Set(noms.filter(Boolean))], TAILLE_LOT);
  const tous = [];

  for (const lot of lots) {
    const lignes = await collecterParPages(
      () => supabase.from("medicaments").select("id, nom").in("nom", lot)
    );
    tous.push(...lignes);
  }

  return tous;
}

// Retourne la ligne de « medicaments » dont le nom normalisé correspond,
// ou null si aucune. La comparaison se fait en JavaScript : la base peut
// stocker des noms dont les espaces ne sont pas normalisés.
export async function trouverMedicamentParNom(nom) {
  const nomNormalise = normaliserNom(nom);
  if (!nomNormalise) return null;

  const mot = echapperMotif(premierMot(nomNormalise));
  if (!mot) return null;

  const candidats = await collecterParPages(
    () => supabase.from("medicaments").select("id, nom").like("nom", `%${mot}%`)
  );

  return candidats.find((med) => normaliserNom(med.nom) === nomNormalise) ?? null;
}

// Récupère la ligne « medicaments » correspondant au nom, et la crée si
// elle manque.
export async function assurerMedicament(nom) {
  const existant = await trouverMedicamentParNom(nom);
  if (existant) return existant;

  const nomClean = String(nom ?? "").trim();
  const { data, error } = await supabase
    .from("medicaments")
    .insert({ nom: nomClean })
    .select("id, nom")
    .single();

  if (error) {
    // L'index unique sur le nom normalisé a refusé la ligne : le médicament
    // existe déjà sous une autre graphie. Relecture par le nom complet,
    // sans dépendre d'une limite de requête ni comparer en SQL.
    if (error.code === "23505") {
      const lignes = await chargerMedicamentsParNoms([nomClean]);
      const parNom = lignes.find((med) => normaliserNom(med.nom) === normaliserNom(nomClean));
      if (parNom) return parNom;

      const motif = echapperMotif(normaliserNom(nom)).replace(/ /g, "%");
      const candidates = await collecterParPages(
        () => supabase.from("medicaments").select("id, nom").like("nom", `%${motif}%`)
      );

      const rejoue = candidates.find((med) => normaliserNom(med.nom) === normaliserNom(nom));
      if (rejoue) return rejoue;
    }
    throw error;
  }

  return data;
}

// Ramène les lignes « offres » d'une pharmacie pour une liste de médicaments,
// par lots d'identifiants et toutes pages confondues.
export async function chargerOffresPharmacie(idPharmacie, idsMedicaments) {
  return chargerOffresParMedicaments(idsMedicaments, (requete) =>
    requete.eq("id_pharmacie", idPharmacie)
  );
}

// Ramène les lignes « offres » de toutes les pharmacies pour une liste de
// médicaments : sert uniquement à reprendre une photo déjà publiée.
export async function chargerOffresGlobales(idsMedicaments) {
  return chargerOffresParMedicaments(idsMedicaments);
}

async function chargerOffresParMedicaments(idsMedicaments, filtrePharmacie) {
  const lots = decouper([...new Set(idsMedicaments.filter(Boolean))], TAILLE_LOT);
  const toutes = [];

  for (const lot of lots) {
    const lignes = await collecterParPages(() => {
      const requete = supabase
        .from("offres")
        .select("id, id_medicament, prix, image")
        .in("id_medicament", lot);
      return filtrePharmacie ? filtrePharmacie(requete) : requete.not("image", "is", null);
    });
    toutes.push(...lignes);
  }

  return toutes;
}
