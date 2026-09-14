"use client";

import { useState, useRef } from "react";
import { 
  ArrowUpTrayIcon, 
  DocumentTextIcon, 
  SparklesIcon, 
  CheckIcon, 
  XMarkIcon, 
  TrashIcon, 
  PhotoIcon, 
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  InformationCircleIcon
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

export default function ImportationStock({ pharmacieId, onImportSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState("");

  // Liste des produits extraits et prêts à être importés
  const [produits, setProduits] = useState([]);
  
  const fileInputRef = useRef(null);
  const tableFileInputRefs = useRef({});
  const showToast = useToast();

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validerEtDefinirFichier(droppedFile);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validerEtDefinirFichier(e.target.files[0]);
    }
  };

  const validerEtDefinirFichier = (selectedFile) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg", "application/pdf"];
    if (!validTypes.includes(selectedFile.type)) {
      showToast("Format non supporté. Seules les images (JPG, PNG, WEBP) et les PDF sont acceptés.", "error");
      return;
    }
    setFile(selectedFile);
    analyserDocument(selectedFile);
  };

  // Envoi du document à la Route API Next.js pour extraction IA
  const analyserDocument = async (selectedFile) => {
    setScanning(true);
    const formData = new FormData();
    formData.append("document", selectedFile);

    try {
      const response = await fetch("/api/import-ai", {
        method: "POST",
        body: formData,
      });

      const resData = await response.json();

      if (resData && resData.succes && Array.isArray(resData.produits)) {
        // Enrichir chaque produit avec les données de Supabase
        const produitsFormates = [];
        for (let idx = 0; idx < resData.produits.length; idx++) {
          const p = resData.produits[idx];
          const nomClean = p.nom ? p.nom.trim() : "";
          if (!nomClean) continue;

          let idMedicament = "new";
          let photoExistante = null;
          let prixExistant = p.prix || "";

          // Vérifier si le médicament existe déjà en base
          const { data: medExistant } = await supabase
            .from("medicaments")
            .select("*")
            .ilike("nom", nomClean)
            .maybeSingle();

          if (medExistant) {
            idMedicament = medExistant.id;

            // Chercher une image d'offre existante pour ce médicament
            const { data: offreAvecImage } = await supabase
              .from("offres")
              .select("image")
              .eq("id_medicament", medExistant.id)
              .not("image", "is", null)
              .limit(1)
              .maybeSingle();

            if (offreAvecImage && offreAvecImage.image) {
              photoExistante = offreAvecImage.image;
            }
          }

          produitsFormates.push({
            localId: `local_${idx}_${Date.now()}`,
            nom: nomClean,
            prix: prixExistant,
            disponibilite: "disponible",
            idMedicament,
            photoExistante,
            selected: true,
            newImageFile: null,
            newImagePreview: ""
          });
        }
        
        setProduits(produitsFormates);
        showToast(`${produitsFormates.length} produits détectés par l'IA !`, "success");
      } else {
        showToast(resData.error || "Aucun produit détecté.", "error");
        setFile(null);
      }
    } catch (error) {
      console.error(error);
      showToast("Erreur lors de l'analyse du document.", "error");
      setFile(null);
    } finally {
      setScanning(false);
    }
  };

  // Actions de modification locale de la grille
  const toggleSelectProduit = (localId) => {
    setProduits(produits.map(p => p.localId === localId ? { ...p, selected: !p.selected } : p));
  };

  const updateChampProduit = (localId, champ, valeur) => {
    setProduits(produits.map(p => p.localId === localId ? { ...p, [champ]: valeur } : p));
  };

  const handleTableFileChange = (localId, e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith("image/")) {
        showToast("Veuillez sélectionner un fichier image valide.", "error");
        return;
      }
      setProduits(produits.map(p => {
        if (p.localId === localId) {
          return {
            ...p,
            newImageFile: selectedFile,
            newImagePreview: URL.createObjectURL(selectedFile)
          };
        }
        return p;
      }));
    }
  };

  const supprimerLigne = (localId) => {
    setProduits(produits.filter(p => p.localId !== localId));
  };

  const annulerTout = () => {
    setFile(null);
    setProduits([]);
  };

  // Importation finale de toutes les lignes sélectionnées
  const lancerImportation = async () => {
    const selection = produits.filter(p => p.selected);
    if (selection.length === 0) {
      showToast("Veuillez sélectionner au moins un médicament à importer.", "error");
      return;
    }

    // Validation préalable
    for (const item of selection) {
      if (!item.nom.trim()) {
        showToast("Tous les produits sélectionnés doivent avoir un nom valide.", "error");
        return;
      }
      if (!item.prix || parseFloat(item.prix) <= 0) {
        showToast(`Veuillez indiquer un prix valide pour ${item.nom}.`, "error");
        return;
      }
      if (!item.photoExistante && !item.newImageFile) {
        showToast(`Une photo est obligatoire pour importer ${item.nom}.`, "error");
        return;
      }
    }

    setImporting(true);
    setImportProgress(0);
    let successCount = 0;

    for (let i = 0; i < selection.length; i++) {
      const item = selection[i];
      setImportMessage(`Importation de ${item.nom} (${i + 1}/${selection.length})...`);
      
      try {
        let finalIdMedicament = item.idMedicament;

        // 1. Obtenir ou créer l'ID de médicament dans 'medicaments'
        if (!finalIdMedicament || finalIdMedicament === "new") {
          const nomClean = item.nom.trim();
          const { data: existant } = await supabase
            .from("medicaments")
            .select("*")
            .ilike("nom", nomClean)
            .maybeSingle();

          if (existant) {
            finalIdMedicament = existant.id;
          } else {
            const { data: nouveauMed, error: insErr } = await supabase
              .from("medicaments")
              .insert({ nom: nomClean })
              .select()
              .single();

            if (insErr) throw insErr;
            finalIdMedicament = nouveauMed.id;
          }
        }

        // 2. Traitement de la photo
        let imageUrl = item.photoExistante || "";
        if (item.newImageFile) {
          const ext = item.newImageFile.name.split('.').pop();
          const filename = `produits/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("offres-images")
            .upload(filename, item.newImageFile, { upsert: true });

          if (!upErr) {
            const { data: urlData } = supabase.storage
              .from("offres-images")
              .getPublicUrl(filename);
            imageUrl = urlData?.publicUrl || imageUrl;
          }
        }

        // 3. Upsert dans 'offres'
        if (pharmacieId) {
          const { data: offreExistante } = await supabase
            .from("offres")
            .select("*")
            .eq("id_pharmacie", pharmacieId)
            .eq("id_medicament", finalIdMedicament)
            .maybeSingle();

          if (offreExistante) {
            await supabase
              .from("offres")
              .update({
                prix: parseInt(item.prix, 10),
                image: imageUrl,
                disponibilite: item.disponibilite || "disponible"
              })
              .eq("id", offreExistante.id);
          } else {
            await supabase
              .from("offres")
              .insert({
                id_pharmacie: pharmacieId,
                id_medicament: finalIdMedicament,
                prix: parseInt(item.prix, 10),
                image: imageUrl,
                disponibilite: item.disponibilite || "disponible"
              });
          }
        }

        successCount++;
      } catch (error) {
        console.error(`Échec importation de ${item.nom} :`, error);
        showToast(`Erreur d'importation pour ${item.nom}`, "error");
      }

      setImportProgress(Math.round(((i + 1) / selection.length) * 100));
    }

    setImporting(false);
    showToast(`${successCount} médicament(s) importé(s) avec succès !`, "success");
    
    if (onImportSuccess) {
      onImportSuccess();
    }
  };

  return (
    <div className="w-full space-y-6">
      
      {/* Écran 1 : Zone de téléchargement / Analyse */}
      {produits.length === 0 && !scanning && (
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`w-full max-w-2xl mx-auto min-h-[350px] border-3 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center transition-all duration-300 relative overflow-hidden bg-white ${
            dragActive 
              ? "border-emerald-500 bg-emerald-50/20 scale-[1.01] shadow-lg shadow-emerald-500/5" 
              : "border-gray-300 hover:border-emerald-500 hover:bg-gray-50/30"
          }`}
        >
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mb-6 shadow-md shadow-emerald-100">
            <ArrowUpTrayIcon className="w-9 h-9" />
          </div>

          <h3 className="font-extrabold text-gray-800 text-xl tracking-tight">Scanner une liste de médicaments</h3>
          <p className="text-sm text-gray-400 max-w-md mt-2 mb-6">
            Déposez la photo de votre liste manuscrite ou votre fichier PDF de stock. L'IA Gemini se charge de l'analyse.
          </p>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            accept="image/*,application/pdf"
            className="hidden" 
          />

          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition cursor-pointer flex items-center gap-2"
          >
            <SparklesIcon className="w-4 h-4 text-emerald-200" />
            Sélectionner un fichier
          </button>

          <span className="text-[11px] text-gray-400 mt-4">
            Formats supportés : JPG, PNG, WEBP, PDF (Max: 10Mo)
          </span>
        </div>
      )}

      {/* Écran 2 : Scan en cours (Animation) */}
      {scanning && (
        <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200/80 rounded-3xl p-12 flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden min-h-[350px]">
          {/* Mock document pour animation de scan */}
          <div className="relative w-44 h-56 bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col space-y-3 shadow-inner mb-6">
            <div className="h-4 bg-gray-200 rounded-md w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded-md w-1/2"></div>
            <div className="h-3 bg-gray-100 rounded-md w-5/6"></div>
            <div className="h-3 bg-gray-100 rounded-md w-2/3"></div>
            <div className="h-3 bg-gray-100 rounded-md w-3/4"></div>
            <div className="h-3 bg-gray-100 rounded-md w-1/2"></div>
            
            {/* Ligne laser animée */}
            <div className="absolute left-0 right-0 h-1 bg-emerald-500 shadow-md shadow-emerald-500/80 animate-scan"></div>
          </div>

          <h3 className="font-extrabold text-gray-800 text-lg flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-emerald-500 animate-pulse" />
            Analyse intelligente de la liste par Gemini...
          </h3>
          <p className="text-xs text-gray-400 mt-2 max-w-xs">
            L'IA déchiffre l'écriture et structure les produits en cours de traitement. Veuillez patienter quelques instants.
          </p>
        </div>
      )}

      {/* Écran 3 : Grille de vérification & Édition */}
      {produits.length > 0 && !scanning && !importing && (
        <div className="bg-white rounded-3xl border border-gray-200/60 shadow-lg p-6 space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <h2 className="font-extrabold text-gray-800 text-lg flex items-center gap-2">
                <CheckCircleIcon className="w-6 h-6 text-emerald-500" />
                Vérification des produits détectés
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Vérifiez, complétez ou modifiez les détails avant d'ajouter les produits à votre inventaire.
              </p>
            </div>
            
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={annulerTout}
                className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <XMarkIcon className="w-4 h-4" />
                Annuler
              </button>
              <button
                type="button"
                onClick={lancerImportation}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/15 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckIcon className="w-4 h-4" />
                Valider et importer le stock ({produits.filter(p => p.selected).length})
              </button>
            </div>
          </div>

          {/* Tableau responsive de vérification */}
          <div className="overflow-x-auto border border-gray-100 rounded-2xl shadow-inner bg-gray-50/20">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-4 px-4 text-center w-12">Importer</th>
                  <th className="py-4 px-4 w-72">Nom du Médicament *</th>
                  <th className="py-4 px-4 w-40">Prix (FCFA) *</th>
                  <th className="py-4 px-4 w-44">Disponibilité</th>
                  <th className="py-4 px-4">Photo du Produit *</th>
                  <th className="py-4 px-4 text-center w-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-600 bg-white">
                {produits.map((item) => (
                  <tr 
                    key={item.localId} 
                    className={`hover:bg-gray-50/30 transition duration-150 ${
                      !item.selected ? "opacity-60 bg-gray-50/40" : ""
                    }`}
                  >
                    
                    {/* Checkbox sélection */}
                    <td className="py-3 px-4 text-center">
                      <input 
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleSelectProduit(item.localId)}
                        className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                      />
                    </td>

                    {/* Nom produit */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col space-y-1">
                        <input 
                          type="text"
                          value={item.nom}
                          disabled={!item.selected}
                          onChange={(e) => updateChampProduit(item.localId, "nom", e.target.value)}
                          className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm text-gray-800 font-bold focus:border-emerald-500 outline-none focus:ring-2 focus:ring-emerald-500/10 disabled:bg-gray-100 disabled:text-gray-400"
                          placeholder="Nom du médicament"
                        />
                        {item.existeDeja ? (
                          <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 pl-1">
                            <CheckIcon className="w-3 h-3 text-emerald-500" />
                            Répertorié en base de données
                            {item.offertParPharmacie && <span className="text-amber-600">(Déjà dans votre stock - sera mis à jour)</span>}
                          </span>
                        ) : (
                          <span className="text-[10px] text-blue-600 font-semibold pl-1">
                            + Nouveau médicament à créer
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Prix */}
                    <td className="py-3 px-4">
                      <input 
                        type="number"
                        value={item.prix}
                        disabled={!item.selected}
                        min="1"
                        onChange={(e) => updateChampProduit(item.localId, "prix", e.target.value)}
                        className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm font-semibold font-mono text-gray-700 focus:border-emerald-500 outline-none focus:ring-2 focus:ring-emerald-500/10 disabled:bg-gray-100 disabled:text-gray-400"
                        placeholder="Prix en FCFA"
                      />
                    </td>

                    {/* Disponibilité */}
                    <td className="py-3 px-4">
                      <select
                        value={item.disponibilite}
                        disabled={!item.selected}
                        onChange={(e) => updateChampProduit(item.localId, "disponibilite", e.target.value)}
                        className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 focus:border-emerald-500 outline-none focus:ring-2 focus:ring-emerald-500/10 cursor-pointer disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="disponible">En Stock</option>
                        <option value="indisponible">Rupture</option>
                      </select>
                    </td>

                    {/* Image / Photo */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50 flex-shrink-0 overflow-hidden flex items-center justify-center shadow-inner">
                          {item.newImagePreview ? (
                            <img src={item.newImagePreview} alt="Aperçu" className="w-full h-full object-cover" />
                          ) : item.photoExistante ? (
                            <img src={item.photoExistante} alt="Existant" className="w-full h-full object-cover" />
                          ) : (
                            <PhotoIcon className="w-6 h-6 text-gray-300" />
                          )}
                        </div>
                        
                        <div className="flex flex-col space-y-1">
                          <input 
                            type="file"
                            accept="image/*"
                            id={`file-${item.localId}`}
                            disabled={!item.selected}
                            ref={el => tableFileInputRefs.current[item.localId] = el}
                            onChange={(e) => handleTableFileChange(item.localId, e)}
                            className="hidden"
                          />
                          <button
                            type="button"
                            disabled={!item.selected}
                            onClick={() => tableFileInputRefs.current[item.localId]?.click()}
                            className="px-2.5 py-1.5 border border-gray-200 hover:bg-gray-100 rounded-lg text-[11px] font-semibold text-gray-600 transition cursor-pointer disabled:opacity-50"
                          >
                            {item.newImageFile ? "Changer" : item.photoExistante ? "Remplacer" : "Ajouter une photo"}
                          </button>
                          
                          {item.photoExistante && !item.newImageFile && (
                            <span className="text-[9px] text-gray-400 font-semibold pl-0.5">
                              Image existante conservée
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Supprimer */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => supprimerLigne(item.localId)}
                        className="p-2 border border-gray-200 hover:border-rose-200 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50/10 transition cursor-pointer"
                        title="Retirer cette ligne"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-emerald-50/30 border border-emerald-100 rounded-2xl p-4 flex items-start space-x-3">
            <InformationCircleIcon className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 leading-normal">
              <strong>Info :</strong> Si un médicament possède l'indicateur <span className="text-emerald-600 font-bold">Répertorié en base de données</span>, cela signifie que sa photo a déjà été trouvée en base et lui a été attribuée. Vous pouvez la conserver sans avoir à en téléverser une nouvelle.
            </p>
          </div>
        </div>
      )}

      {/* Écran 4 : Importation en cours */}
      {importing && (
        <div className="w-full max-w-xl mx-auto bg-white border border-gray-200/80 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-lg min-h-[300px]">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 animate-spin">
            <ArrowPathIcon className="w-8 h-8" />
          </div>

          <h3 className="font-extrabold text-gray-800 text-lg">Importation du stock en cours...</h3>
          <p className="text-xs text-emerald-600 font-semibold mt-1 animate-pulse">
            {importMessage}
          </p>

          {/* Barre de progression */}
          <div className="w-full bg-gray-100 rounded-full h-2.5 mt-6 mb-2 overflow-hidden border border-gray-200/50">
            <div 
              className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${importProgress}%` }}
            ></div>
          </div>
          <span className="text-xs text-gray-400 font-bold font-mono">{importProgress}% complété</span>
        </div>
      )}

    </div>
  );
}
