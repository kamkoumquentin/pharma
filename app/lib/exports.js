import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { telechargerCsv, formaterDateFichier } from "@/app/lib/exportCsv";

export { telechargerCsv, formaterDateFichier };

function nettoyerNomFeuille(nom, index) {
  const nettoye = String(nom || `Feuille ${index + 1}`)
    .replace(/[\\/?*[\]:]/g, " ")
    .trim()
    .slice(0, 31);
  return nettoye || `Feuille ${index + 1}`;
}

export function telechargerExcel(nomFichier, feuilles) {
  if (typeof window === "undefined") return;

  const wb = XLSX.utils.book_new();
  const nomsUtilises = new Set();

  (feuilles || []).forEach((feuille, index) => {
    const entetes = feuille.entetes || [];
    const lignes = feuille.lignes || [];
    const donnees = [entetes, ...lignes];
    const ws = XLSX.utils.aoa_to_sheet(donnees);

    // Ajustement automatique de la largeur des colonnes
    const nbColonnes = entetes.length;
    ws["!cols"] = Array.from({ length: nbColonnes }, (_, colIdx) => {
      let maxLen = String(entetes[colIdx] ?? "").length;
      for (const ligne of lignes) {
        const len = String(ligne?.[colIdx] ?? "").length;
        if (len > maxLen) maxLen = len;
      }
      return { wch: Math.min(50, Math.max(12, maxLen + 3)) };
    });

    let nomFeuille = nettoyerNomFeuille(feuille.nom, index);
    if (nomsUtilises.has(nomFeuille)) {
      nomFeuille = `${nomFeuille.slice(0, 27)} (${index + 1})`;
    }
    nomsUtilises.add(nomFeuille);

    XLSX.utils.book_append_sheet(wb, ws, nomFeuille);
  });

  XLSX.writeFile(wb, nomFichier);
}

export function telechargerPdf({
  nomFichier,
  pharmacieNom,
  titre,
  sousTitre,
  sections,
}) {
  if (typeof window === "undefined") return;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Bandeau supérieur émeraude
  doc.setFillColor(5, 150, 105);
  doc.rect(0, 0, 210, 4, "F");

  let cursorY = 16;

  if (pharmacieNom) {
    doc.setFontSize(10);
    doc.setTextColor(5, 150, 105);
    doc.setFont("helvetica", "bold");
    doc.text(String(pharmacieNom).toUpperCase(), 14, cursorY);
    cursorY += 6;
  }

  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.text(String(titre || "Rapport"), 14, cursorY);
  cursorY += 6;

  doc.setFontSize(9.5);
  doc.setTextColor(107, 114, 128);
  doc.setFont("helvetica", "normal");
  const dateGen = `Généré le ${new Date().toLocaleDateString("fr-FR")}`;
  const ligneMeta = sousTitre ? `${sousTitre}  •  ${dateGen}` : dateGen;
  doc.text(ligneMeta, 14, cursorY);
  cursorY += 8;

  for (const section of sections || []) {
    if (cursorY > 255) {
      doc.addPage();
      cursorY = 16;
    }

    if (section.titre) {
      doc.setFontSize(11.5);
      doc.setTextColor(6, 78, 59);
      doc.setFont("helvetica", "bold");
      doc.text(String(section.titre), 14, cursorY);
      cursorY += 4;
    }

    const lignes =
      section.lignes && section.lignes.length > 0
        ? section.lignes
        : [["Aucune donnée disponible", ...Array(Math.max(0, (section.entetes?.length || 1) - 1)).fill("")]];

    autoTable(doc, {
      startY: cursorY,
      head: [section.entetes || []],
      body: lignes,
      theme: "striped",
      headStyles: {
        fillColor: [5, 150, 105],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
        textColor: [31, 41, 55],
      },
      margin: { left: 14, right: 14 },
    });

    cursorY = (doc.lastAutoTable?.finalY || cursorY) + 10;
  }

  // Pied de page avec numérotation Page X / Y
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.setFont("helvetica", "normal");
    doc.text(`Medipharmac — ${pharmacieNom || "Espace Pharmacie"}`, 14, 288);
    doc.text(`Page ${i} / ${totalPages}`, 196, 288, { align: "right" });
  }

  doc.save(nomFichier);
}
