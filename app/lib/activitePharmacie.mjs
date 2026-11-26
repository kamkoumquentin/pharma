export const CATEGORIE_CATALOGUE = "Catalogue & Prix";
export const CATEGORIE_DEMANDE = "Demande patient";

export const FILTRES_ACTIVITE = [
  { valeur: "toutes", label: "Toutes" },
  { valeur: CATEGORIE_CATALOGUE, label: CATEGORIE_CATALOGUE },
  { valeur: CATEGORIE_DEMANDE, label: CATEGORIE_DEMANDE },
];

const FORMATEUR_DATE_HEURE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const FORMATEUR_DATE_COURTE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function cleJourLocal(date) {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function libelleJourMois(date) {
  const jour = String(date.getDate()).padStart(2, "0");
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  return `${jour}/${mois}`;
}

export function normaliserCategorie(categorieBrute) {
  const texte = String(categorieBrute || "").trim().toLowerCase();
  if (
    texte.includes("demande") ||
    texte.includes("patient") ||
    texte.includes("consultation")
  ) {
    return CATEGORIE_DEMANDE;
  }
  return CATEGORIE_CATALOGUE;
}

export function formaterDateHeureActivite(dateIso) {
  if (!dateIso) return "—";
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "—";
  return FORMATEUR_DATE_HEURE.format(date).replace(",", " à");
}

export function formaterAncienneteRelative(dateIso, referenceDate = new Date()) {
  if (!dateIso) return "Aucune activité";
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "Aucune activité";

  const diffMs = Math.max(0, referenceDate.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "À l'instant";
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;

  const diffHeures = Math.floor(diffMinutes / 60);
  if (diffHeures < 24) return `Il y a ${diffHeures} h`;

  const diffJours = Math.floor(diffHeures / 24);
  if (diffJours === 1) return "Hier";
  if (diffJours < 30) return `Il y a ${diffJours} j`;

  const diffMois = Math.floor(diffJours / 30);
  return `Il y a ${diffMois} mois`;
}

/**
 * Extrait uniquement les champs anonymisés autorisés pour l'affichage côté pharmacie.
 * Aucun identifiant utilisateur (nom, prénom, e-mail, ID client) n'est conservé.
 */
export function normaliserLigneActivite(ligne, index = 0) {
  const dateBrute =
    ligne?.created_at ||
    ligne?.date_action ||
    ligne?.date ||
    ligne?.horodatage ||
    null;

  const dateObj = dateBrute ? new Date(dateBrute) : null;
  const dateIso =
    dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj.toISOString() : null;

  return {
    id: ligne?.id ?? `${dateIso || "sans-date"}-${index}`,
    dateIso,
    dateFormatee: formaterDateHeureActivite(dateIso),
    categorie: normaliserCategorie(ligne?.categorie ?? ligne?.type),
    resume: String(ligne?.resume || "Opération enregistrée").trim(),
    detail: String(ligne?.detail || "—").trim(),
  };
}

export function calculerIndicateursActivite(
  lignesBrutes = [],
  referenceDate = new Date()
) {
  const lignes = (Array.isArray(lignesBrutes) ? lignesBrutes : [])
    .map((ligne, index) => normaliserLigneActivite(ligne, index))
    .sort((a, b) => {
      const ta = a.dateIso ? new Date(a.dateIso).getTime() : 0;
      const tb = b.dateIso ? new Date(b.dateIso).getTime() : 0;
      return tb - ta;
    });

  const totalActions = lignes.length;

  let countCatalogue = 0;
  let countDemande = 0;
  const comptesParJour = new Map();

  for (const ligne of lignes) {
    if (ligne.categorie === CATEGORIE_DEMANDE) {
      countDemande += 1;
    } else {
      countCatalogue += 1;
    }

    if (ligne.dateIso) {
      const date = new Date(ligne.dateIso);
      const cle = cleJourLocal(date);
      const existant = comptesParJour.get(cle);
      if (existant) {
        existant.count += 1;
      } else {
        comptesParJour.set(cle, {
          cle,
          dateFormatee: FORMATEUR_DATE_COURTE.format(date),
          count: 1,
        });
      }
    }
  }

  const premiereAvecDate = lignes.find((l) => Boolean(l.dateIso));
  const derniereActivite = premiereAvecDate
    ? {
        dateIso: premiereAvecDate.dateIso,
        dateFormatee: premiereAvecDate.dateFormatee,
        ancienneteRelative: formaterAncienneteRelative(
          premiereAvecDate.dateIso,
          referenceDate
        ),
      }
    : null;

  let jourPlusActif = null;
  for (const entree of comptesParJour.values()) {
    if (!jourPlusActif || entree.count > jourPlusActif.count) {
      jourPlusActif = entree;
    }
  }

  const pctCatalogue =
    totalActions > 0 ? Math.round((countCatalogue / totalActions) * 100) : 0;
  const pctDemande =
    totalActions > 0 ? Math.round((countDemande / totalActions) * 100) : 0;

  const serie14Jours = [];
  const debut = new Date(referenceDate);
  debut.setHours(0, 0, 0, 0);
  debut.setDate(debut.getDate() - 13);

  for (let i = 0; i < 14; i += 1) {
    const jour = new Date(debut);
    jour.setDate(debut.getDate() + i);
    const cle = cleJourLocal(jour);
    const infoJour = comptesParJour.get(cle);
    serie14Jours.push({
      cle,
      label: libelleJourMois(jour),
      dateComplete: FORMATEUR_DATE_COURTE.format(jour),
      total: infoJour ? infoJour.count : 0,
    });
  }

  const donneesCategories = [
    {
      categorie: CATEGORIE_CATALOGUE,
      count: countCatalogue,
      pourcentage: pctCatalogue,
      couleur: "#059669",
    },
    {
      categorie: CATEGORIE_DEMANDE,
      count: countDemande,
      pourcentage: pctDemande,
      couleur: "#0284c7",
    },
  ];

  return {
    lignes,
    totalActions,
    derniereActivite,
    jourPlusActif,
    repartition: {
      catalogue: { count: countCatalogue, pourcentage: pctCatalogue },
      demande: { count: countDemande, pourcentage: pctDemande },
    },
    serie14Jours,
    donneesCategories,
  };
}
