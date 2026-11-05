export const ERREUR_TELEPHONE_PHARMACIE =
  "Saisissez un numéro camerounais au format +237 suivi de 9 chiffres, commençant par 6 ou 2.";

export function normaliserEtValiderTelephonePharmacie(value) {
  const telephone = String(value || "").replace(/[\s()-]/g, "");
  return {
    telephone,
    valide: /^\+237[62]\d{8}$/.test(telephone),
  };
}
