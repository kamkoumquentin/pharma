import { supabase } from "@/app/lib/supabaseClient";
import { DISPONIBILITE_EN_STOCK } from "@/app/lib/disponibiliteOffres.mjs";

export function estEnStock(disponibilite) {
  return (disponibilite || DISPONIBILITE_EN_STOCK) === DISPONIBILITE_EN_STOCK;
}

export function calculerMediane(valeurs) {
  const propres = (valeurs || [])
    .filter((v) => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);

  if (propres.length === 0) return null;

  const milieu = Math.floor(propres.length / 2);
  if (propres.length % 2 === 1) {
    return propres[milieu];
  }
  return (propres[milieu - 1] + propres[milieu]) / 2;
}

export function formaterDureeMinutes(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return "—";
  }
  if (minutes < 1) {
    return "< 1 min";
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  if (minutes < 1440) {
    const heures = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${heures}h ${String(mins).padStart(2, "0")}min` : `${heures}h`;
  }
  const jours = Math.floor(minutes / 1440);
  const heures = Math.floor((minutes % 1440) / 60);
  return heures > 0 ? `${jours}j ${heures}h` : `${jours}j`;
}

export function calculerStatsMessagerie(discussions, messages, dateDebutIso) {
  const debutMs = dateDebutIso ? new Date(dateDebutIso).getTime() : 0;
  const messagesParDiscussion = new Map();

  for (const msg of messages || []) {
    if (!msg || msg.supprime_le || !msg.discussion_id) continue;
    const liste = messagesParDiscussion.get(msg.discussion_id) || [];
    liste.push(msg);
    messagesParDiscussion.set(msg.discussion_id, liste);
  }

  for (const liste of messagesParDiscussion.values()) {
    liste.sort((a, b) => new Date(a.cree_le).getTime() - new Date(b.cree_le).getTime());
  }

  let demandesRecues = 0;
  let demandesRepondues = 0;
  const tempsReponseMinutes = [];

  for (const disc of discussions || []) {
    const msgs = messagesParDiscussion.get(disc.id) || [];
    const premierClient = msgs.find((m) => m.auteur_role === "client");
    if (!premierClient) continue;

    const premierClientMs = new Date(premierClient.cree_le).getTime();
    if (!Number.isFinite(premierClientMs) || premierClientMs < debutMs) continue;

    demandesRecues += 1;

    const premiereReponse = msgs.find(
      (m) =>
        m.auteur_role === "pharmacie" &&
        new Date(m.cree_le).getTime() >= premierClientMs
    );

    if (premiereReponse) {
      demandesRepondues += 1;
      const diffMinutes =
        (new Date(premiereReponse.cree_le).getTime() - premierClientMs) / 60000;
      if (Number.isFinite(diffMinutes) && diffMinutes >= 0) {
        tempsReponseMinutes.push(diffMinutes);
      }
    }
  }

  const tauxReponse =
    demandesRecues > 0 ? Math.round((demandesRepondues / demandesRecues) * 100) : null;
  const tempsMedianMinutes = calculerMediane(tempsReponseMinutes);

  return {
    demandesRecues,
    demandesRepondues,
    tauxReponse,
    tempsMedianMinutes,
  };
}

function cleDateLocale(dateObj) {
  const annee = dateObj.getFullYear();
  const mois = String(dateObj.getMonth() + 1).padStart(2, "0");
  const jour = String(dateObj.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

export function construireSerieQuotidienne(consultations, nbJours = 30) {
  const jours = Math.max(1, Number(nbJours) || 30);
  const compteurs = new Map();

  for (const c of consultations || []) {
    if (!c?.created_at) continue;
    const d = new Date(c.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const cle = cleDateLocale(d);
    compteurs.set(cle, (compteurs.get(cle) || 0) + 1);
  }

  const serie = [];
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);

  for (let i = jours - 1; i >= 0; i--) {
    const d = new Date(aujourdhui);
    d.setDate(aujourdhui.getDate() - i);
    const cle = cleDateLocale(d);
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    serie.push({
      date: cle,
      label,
      vues: compteurs.get(cle) || 0,
    });
  }

  return serie;
}

function trouverDebutRupture(historiqueOffre) {
  if (!historiqueOffre || historiqueOffre.length === 0) return null;
  let depuisLe = null;
  for (const entree of historiqueOffre) {
    if (!estEnStock(entree.disponibilite)) {
      depuisLe = entree.enregistre_le;
    } else {
      break;
    }
  }
  return depuisLe;
}

export async function chargerStatistiquesPharmacie(pharmacieId, nbJours = 30) {
  if (!pharmacieId) {
    throw new Error("Identifiant de pharmacie manquant.");
  }

  const jours = Math.max(1, Number(nbJours) || 30);
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  debut.setDate(debut.getDate() - (jours - 1));
  const dateDebutIso = debut.toISOString();

  const [
    resOffres,
    resConsultations,
    resVille,
    resHistorique,
    resDiscussions,
    resAbonnements,
  ] = await Promise.all([
    supabase
      .from("offres")
      .select("id, id_medicament, prix, disponibilite, medicaments(id, nom)")
      .eq("id_pharmacie", pharmacieId),
    supabase
      .from("consultations")
      .select("id, id_medicament, created_at")
      .eq("id_pharmacie", pharmacieId)
      .gte("created_at", dateDebutIso),
    supabase.rpc("get_consultations_ville"),
    supabase
      .from("offres_historique")
      .select("id, id_offre, id_medicament, disponibilite, prix, operation, enregistre_le")
      .eq("id_pharmacie", pharmacieId)
      .order("enregistre_le", { ascending: false })
      .limit(500),
    supabase
      .from("discussions")
      .select("id, cree_le, non_lus_pharmacie, dernier_message_at")
      .eq("pharmacie_id", pharmacieId),
    supabase
      .from("abonnements_medicament")
      .select("id, id_medicament, id_pharmacie")
      .eq("actif", true)
      .or(`id_pharmacie.eq.${pharmacieId},id_pharmacie.is.null`),
  ]);

  if (resOffres.error) throw resOffres.error;
  if (resConsultations.error) throw resConsultations.error;
  if (resVille.error) throw resVille.error;
  if (resHistorique.error) throw resHistorique.error;
  if (resDiscussions.error) throw resDiscussions.error;
  if (resAbonnements.error) throw resAbonnements.error;

  const offres = resOffres.data || [];
  const consultations = resConsultations.data || [];
  const statsVille = resVille.data || [];
  const historique = resHistorique.data || [];
  const discussions = resDiscussions.data || [];
  const abonnements = resAbonnements.data || [];

  let messages = [];
  if (discussions.length > 0) {
    const discussionIds = discussions.map((d) => d.id);
    const resMessages = await supabase
      .from("discussion_messages")
      .select("id, discussion_id, auteur_role, id_medicament, cree_le, supprime_le")
      .in("discussion_id", discussionIds);

    if (resMessages.error) throw resMessages.error;
    messages = resMessages.data || [];
  }

  // Index des offres par id_medicament
  const offresParMedicament = new Map();
  let nbEnStock = 0;
  let nbEnRupture = 0;

  for (const offre of offres) {
    const enStock = estEnStock(offre.disponibilite);
    if (enStock) {
      nbEnStock += 1;
    } else {
      nbEnRupture += 1;
    }

    const existante = offresParMedicament.get(offre.id_medicament);
    if (!existante || (!existante.enStock && enStock)) {
      offresParMedicament.set(offre.id_medicament, {
        ...offre,
        nom: offre.medicaments?.nom || "Médicament inconnu",
        enStock,
      });
    }
  }

  const totalOffres = offres.length;
  const tauxDisponibilite =
    totalOffres > 0 ? Math.round((nbEnStock / totalOffres) * 100) : 0;

  const totalVuesPharmacie = consultations.length;
  const totalVuesVille = statsVille.reduce(
    (acc, item) => acc + (Number(item.total_consultations) || 0),
    0
  );

  const messagerie = calculerStatsMessagerie(discussions, messages, dateDebutIso);
  const serieQuotidienne = construireSerieQuotidienne(consultations, jours);

  // Top 7 médicaments les plus consultés dans cette pharmacie
  const vuesParMedicament = new Map();
  for (const c of consultations) {
    if (!c.id_medicament) continue;
    vuesParMedicament.set(
      c.id_medicament,
      (vuesParMedicament.get(c.id_medicament) || 0) + 1
    );
  }

  const topProduitsPharmacie = Array.from(vuesParMedicament.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([idMedicament, vues]) => {
      const infoOffre = offresParMedicament.get(idMedicament);
      return {
        idMedicament,
        nom: infoOffre?.nom || "Médicament inconnu",
        vues,
        enStock: infoOffre ? infoOffre.enStock : false,
      };
    });

  // Top 6 opportunités ville (non en stock dans cette pharmacie)
  const opportunitesVille = statsVille
    .filter((item) => {
      const infoOffre = offresParMedicament.get(item.id_medicament);
      return !infoOffre || !infoOffre.enStock;
    })
    .sort(
      (a, b) =>
        (Number(b.total_consultations) || 0) - (Number(a.total_consultations) || 0)
    )
    .slice(0, 6)
    .map((item) => {
      const infoOffre = offresParMedicament.get(item.id_medicament);
      return {
        idMedicament: item.id_medicament,
        offreId: infoOffre?.id || null,
        nom: item.nom_medicament || "Médicament inconnu",
        vuesVille: Number(item.total_consultations) || 0,
        statutChezVous: infoOffre ? "en_rupture" : "absent",
      };
    });

  // Abonnements actifs par médicament
  const abonnementsParMedicament = new Map();
  for (const ab of abonnements) {
    if (!ab?.id_medicament) continue;
    abonnementsParMedicament.set(
      ab.id_medicament,
      (abonnementsParMedicament.get(ab.id_medicament) || 0) + 1
    );
  }

  // Ruptures actuelles avec durée calculée depuis offres_historique
  const historiqueParOffre = new Map();
  for (const h of historique) {
    if (!h.id_offre) continue;
    const liste = historiqueParOffre.get(h.id_offre) || [];
    liste.push(h);
    historiqueParOffre.set(h.id_offre, liste);
  }

  const maintenantMs = Date.now();
  const offresEnRupture = offres.filter((o) => !estEnStock(o.disponibilite));
  const medicamentsEnRuptureIds = new Set(
    offresEnRupture.map((o) => o.id_medicament).filter(Boolean)
  );
  let patientsEnAttente = 0;
  for (const idMed of medicamentsEnRuptureIds) {
    patientsEnAttente += abonnementsParMedicament.get(idMed) || 0;
  }

  const rupturesActuelles = offresEnRupture
    .map((o) => {
      const hist = historiqueParOffre.get(o.id) || [];
      const depuisLe = trouverDebutRupture(hist);
      const joursRupture = depuisLe
        ? Math.max(
            0,
            Math.floor((maintenantMs - new Date(depuisLe).getTime()) / 86400000)
          )
        : null;
      return {
        id: o.id,
        idMedicament: o.id_medicament,
        nom: o.medicaments?.nom || "Médicament inconnu",
        prix: o.prix,
        depuisLe,
        joursRupture,
        nbPatientsEnAttente: abonnementsParMedicament.get(o.id_medicament) || 0,
      };
    })
    .sort(
      (a, b) =>
        b.nbPatientsEnAttente - a.nbPatientsEnAttente ||
        (b.joursRupture ?? -1) - (a.joursRupture ?? -1)
    )
    .slice(0, 6);

  return {
    kpis: {
      totalVuesPharmacie,
      totalVuesVille,
      tauxDisponibilite,
      nbEnStock,
      nbEnRupture,
      totalOffres,
      patientsEnAttente,
      messagerie,
    },
    serieQuotidienne,
    topProduitsPharmacie,
    opportunitesVille,
    rupturesActuelles,
  };
}

export async function remettreOffreEnStock(offreId) {
  if (!offreId) {
    throw new Error("Identifiant d'offre manquant.");
  }

  const { error } = await supabase
    .from("offres")
    .update({ disponibilite: DISPONIBILITE_EN_STOCK })
    .eq("id", offreId);

  if (error) throw error;
}
