const CLES_SENSIBLES = new Set([
  "password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "apikey",
]);

function extraireDetailsErreur(erreur) {
  if (erreur == null) {
    return {};
  }

  if (typeof erreur === "string") {
    return { message: erreur };
  }

  if (typeof erreur !== "object") {
    return { message: String(erreur) };
  }

  const brut = {
    message: erreur.message ?? erreur.error_description ?? erreur.error,
    code: erreur.code,
    details: erreur.details,
    hint: erreur.hint,
    status: erreur.status ?? erreur.statusCode ?? erreur.response?.status,
  };

  const details = {};
  for (const [cle, valeur] of Object.entries(brut)) {
    if (valeur !== undefined && valeur !== null && valeur !== "") {
      details[cle] = valeur;
    }
  }

  return details;
}

function filtrerInfosComplementaires(infosComplementaires) {
  if (
    !infosComplementaires ||
    typeof infosComplementaires !== "object" ||
    Array.isArray(infosComplementaires)
  ) {
    return {};
  }

  const infosFiltrees = {};
  for (const [cle, valeur] of Object.entries(infosComplementaires)) {
    if (!CLES_SENSIBLES.has(cle.toLowerCase())) {
      infosFiltrees[cle] = valeur;
    }
  }

  return infosFiltrees;
}

/**
 * Journalise une erreur applicative de façon structurée tout en filtrant les clés sensibles.
 * @param {string} contexte - Nom du module, composant ou route API.
 * @param {string} operation - Description de l'opération ayant échoué.
 * @param {unknown} erreur - Erreur capturée (Supabase, PostgREST, HTTP, Error ou chaîne).
 * @param {Record<string, unknown>} [infosComplementaires={}] - Métadonnées utiles au diagnostic.
 */
export function logErreur(
  contexte,
  operation,
  erreur,
  infosComplementaires = {}
) {
  const detailsErreur = extraireDetailsErreur(erreur);
  const infosFiltrees = filtrerInfosComplementaires(infosComplementaires);

  console.error(`[${contexte}] Échec : ${operation}`, {
    ...detailsErreur,
    ...infosFiltrees,
  });
}
