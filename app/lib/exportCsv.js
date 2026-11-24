function echapperCelluleCsv(valeur) {
  if (valeur === null || valeur === undefined) return "";
  const texte = String(valeur);
  if (/[;"\r\n]/.test(texte)) {
    return `"${texte.replace(/"/g, '""')}"`;
  }
  return texte;
}

export function formaterDateFichier(date = new Date()) {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

export function telechargerCsv(nomFichier, entetes, lignes) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const toutesLignes = [entetes, ...(lignes || [])]
    .map((ligne) => (ligne || []).map(echapperCelluleCsv).join(";"))
    .join("\r\n");

  // BOM UTF-8 + directive Excel Windows pour séparer proprement les colonnes
  const contenu = `\uFEFFsep=;\r\n${toutesLignes}`;
  const blob = new Blob([contenu], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  lien.style.display = "none";
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);

  URL.revokeObjectURL(url);
}
