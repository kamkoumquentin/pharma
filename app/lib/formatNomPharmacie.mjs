const PETITS_MOTS = new Set(["du", "de", "des", "la", "le", "les", "et", "au", "aux", "d'", "l'"]);

function formaterMot(mot, premierMot) {
  const minuscule = mot.toLocaleLowerCase("fr-FR");
  if (!premierMot && PETITS_MOTS.has(minuscule)) return minuscule;

  const apostrophe = minuscule.match(/^([dl]['’])(.+)$/);
  if (apostrophe) {
    const suite = [...apostrophe[2]];
    const prefixe = [...apostrophe[1]];
    if (premierMot) prefixe[0] = prefixe[0].toLocaleUpperCase("fr-FR");
    return `${prefixe.join("")}${suite[0].toLocaleUpperCase("fr-FR")}${suite.slice(1).join("")}`;
  }

  const caracteres = [...minuscule];
  if (!caracteres.length) return "";
  return `${caracteres[0].toLocaleUpperCase("fr-FR")}${caracteres.slice(1).join("")}`;
}

export function formaterNomPharmacie(value) {
  if (value == null) return "";
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((mot, index) => formaterMot(mot, index === 0))
    .join(" ");
}
