export const DISPONIBILITE_EN_STOCK = "disponible";
export const DISPONIBILITE_RUPTURE = "indisponible";

export function validerDisponibilite(valeur) {
  if (valeur !== DISPONIBILITE_EN_STOCK && valeur !== DISPONIBILITE_RUPTURE) {
    throw new Error(
      `Disponibilité invalide : "${valeur}". Valeurs autorisées : "${DISPONIBILITE_EN_STOCK}" ou "${DISPONIBILITE_RUPTURE}".`
    );
  }
  return valeur;
}

export function basculerDisponibilite(disponibiliteActuelle) {
  return disponibiliteActuelle === DISPONIBILITE_EN_STOCK
    ? DISPONIBILITE_RUPTURE
    : DISPONIBILITE_EN_STOCK;
}

export async function mettreAJourDisponibiliteOffre(
  client,
  { idOffre, pharmacieId, disponibilite }
) {
  const nouvelleDispo = validerDisponibilite(disponibilite);
  if (!idOffre || !pharmacieId) {
    throw new Error("Identifiant d'offre ou de pharmacie manquant.");
  }

  const { data, error } = await client
    .from("offres")
    .update({ disponibilite: nouvelleDispo })
    .eq("id", idOffre)
    .eq("id_pharmacie", pharmacieId)
    .select("id");

  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error("La mise à jour n'a touché aucune offre.");
  }

  return data[0];
}

export async function mettreAJourDisponibiliteLot(
  client,
  { idsOffres, pharmacieId, disponibilite }
) {
  const nouvelleDispo = validerDisponibilite(disponibilite);
  const idsUniques = [...new Set((idsOffres || []).filter(Boolean))];

  if (!pharmacieId || idsUniques.length === 0) {
    throw new Error("Aucune offre sélectionnée pour cette pharmacie.");
  }

  const { data, error } = await client
    .from("offres")
    .update({ disponibilite: nouvelleDispo })
    .in("id", idsUniques)
    .eq("id_pharmacie", pharmacieId)
    .select("id");

  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Aucune offre n'a été mise à jour.");
  }

  return data.map((ligne) => ligne.id);
}
