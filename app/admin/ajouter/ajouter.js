"use client";

import { useState, useEffect, useRef } from "react";
import { 
  PlusCircleIcon, 
  ChevronDownIcon, 
  PhotoIcon, 
  ArrowLeftIcon 
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

export default function Ajouter({ pharmacieId, token, onAddSuccess }) {
  const [medsList, setMedsList] = useState([]);
  const [loadingMeds, setLoadingMeds] = useState(false);
  
  // États de formulaire
  const [selectedMed, setSelectedMed] = useState(""); // Contient l'ID ou "new"
  const [nouveauNomMed, setNouveauNomMed] = useState("");
  const [prix, setPrix] = useState("");
  const [image, setImage] = useState(null);
  const [imageName, setImageName] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [disponibilite, setDisponibilite] = useState("disponible");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const showToast = useToast();

  // Charger la liste des médicaments enregistrés en base
  const chargerMedicaments = async () => {
    setLoadingMeds(true);
    try {
      const { data, error } = await supabase.from("medicaments").select("*").order("nom", { ascending: true });
      if (error) throw error;
      setMedsList(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des médicaments :", error);
      showToast("Impossible de charger le catalogue de médicaments.", "error");
    } finally {
      setLoadingMeds(false);
    }
  };

  useEffect(() => {
    chargerMedicaments();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setImageName(file.name);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const ajouterOffre = async (e) => {
    e.preventDefault();

    if (!selectedMed) {
      showToast("Veuillez sélectionner un médicament", "error");
      return;
    }

    if (selectedMed === "new" && !nouveauNomMed.trim()) {
      showToast("Veuillez saisir le nom du nouveau médicament", "error");
      return;
    }

    if (!prix || parseFloat(prix) <= 0) {
      showToast("Veuillez saisir un prix valide supérieur à 0", "error");
      return;
    }

    if (!image) {
      showToast("Veuillez charger une photo du médicament", "error");
      return;
    }

    setLoading(true);
    try {
      let idMedicament = selectedMed;

      // Si c'est un nouveau médicament, on doit d'abord l'enregistrer dans 'medicaments'
      if (selectedMed === "new") {
        const nomClean = nouveauNomMed.trim();
        const { data: existant } = await supabase
          .from("medicaments")
          .select("*")
          .ilike("nom", nomClean)
          .maybeSingle();

        if (existant) {
          idMedicament = existant.id;
        } else {
          const { data: nouveauMed, error: insertMedErr } = await supabase
            .from("medicaments")
            .insert({ nom: nomClean })
            .select()
            .single();

          if (insertMedErr) throw insertMedErr;
          idMedicament = nouveauMed.id;
        }
      }

      if (!idMedicament) {
        showToast("Erreur : Identifiant de médicament introuvable.", "error");
        setLoading(false);
        return;
      }

      // Upload de l'image du produit vers Supabase Storage
      let imageUrl = "";
      const ext = image.name.split('.').pop();
      const filename = `produits/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("offres-images")
        .upload(filename, image, { upsert: true });

      if (uploadErr) {
        console.warn("Erreur storage upload (falling back):", uploadErr);
      }
      const { data: urlData } = supabase.storage.from("offres-images").getPublicUrl(filename);
      imageUrl = urlData?.publicUrl || "";

      // Insérer l'offre dans 'offres'
      const { error: insertOffreErr } = await supabase
        .from("offres")
        .insert({
          id_pharmacie: pharmacieId,
          id_medicament: idMedicament,
          prix: parseInt(prix, 10),
          image: imageUrl,
          disponibilite: disponibilite || "disponible",
        });

      if (insertOffreErr) throw insertOffreErr;

      showToast("Médicament ajouté au stock avec succès !", "success");
      
      // Réinitialiser le formulaire
      setSelectedMed("");
      setNouveauNomMed("");
      setPrix("");
      setImage(null);
      setImageName("");
      setImagePreview("");
      setDisponibilite("disponible");
      
      chargerMedicaments();

      if (onAddSuccess) {
        onAddSuccess();
      }
    } catch (error) {
      console.error("Erreur d'ajout de l'offre :", error);
      showToast(error.response?.data?.error || "Erreur lors de l'ajout du médicament au stock.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200/60 shadow-sm p-8">
      
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
          <PlusCircleIcon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="font-bold text-gray-800 text-lg">Ajouter au stock</h2>
          <p className="text-xs text-gray-400">Renseignez les détails pour ajouter un produit à votre inventaire</p>
        </div>
      </div>

      <form onSubmit={ajouterOffre} className="space-y-5">
        
        {/* Sélection Médicament */}
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Sélectionner le médicament *
          </label>
          {loadingMeds ? (
            <div className="h-11 flex items-center px-3 bg-gray-50 border border-gray-200 rounded-xl">
              <span className="text-xs text-gray-400 animate-pulse">Chargement du catalogue...</span>
            </div>
          ) : (
            <div className="relative">
              <select 
                value={selectedMed} 
                onChange={(e) => setSelectedMed(e.target.value)}
                required
                className="w-full h-11 pl-4 pr-10 appearance-none bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition cursor-pointer font-medium"
              >
                <option value="">-- Choisissez un médicament --</option>
                {medsList.map((med) => (
                  <option key={med.id} value={med.id}>{med.nom}</option>
                ))}
                <option value="new" className="text-emerald-600 font-semibold">+ Enregistrer un nouveau médicament...</option>
              </select>
              <ChevronDownIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Si c'est un nouveau médicament */}
        {selectedMed === "new" && (
          <div className="flex flex-col space-y-1 animate-slide-in">
            <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
              Nom du nouveau médicament *
            </label>
            <input 
              type="text" 
              value={nouveauNomMed}
              onChange={(e) => setNouveauNomMed(e.target.value)}
              required
              placeholder="Ex: Efferalgan 500mg, comprimés"
              className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition"
            />
          </div>
        )}

        {/* Prix */}
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Prix unitaire (FCFA) *
          </label>
          <input 
            type="number" 
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            required
            min="1"
            placeholder="Ex: 2500"
            className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition"
          />
        </div>

        {/* Disponibilité */}
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Statut initial
          </label>
          <div className="relative">
            <select 
              value={disponibilite} 
              onChange={(e) => setDisponibilite(e.target.value)}
              className="w-full h-11 pl-4 pr-10 appearance-none bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition cursor-pointer font-medium"
            >
              <option value="disponible">En Stock</option>
              <option value="indisponible">Rupture de stock</option>
            </select>
            <ChevronDownIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Téléchargement d'Image */}
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Photo de la boîte *
          </label>
          <input 
            type="file" 
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          {imagePreview ? (
            <div className="relative border border-gray-200 rounded-xl p-4 bg-gray-50 flex items-center space-x-4">
              <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-white flex-shrink-0 flex items-center justify-center">
                <img src={imagePreview} alt="Aperçu boîte" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">{imageName}</p>
                <p className="text-[10px] text-emerald-600 font-medium">Prêt à être téléversé</p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 border border-gray-200 hover:bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold cursor-pointer transition"
              >
                Remplacer
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-24 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center space-y-1 text-gray-500 hover:border-emerald-500 hover:bg-emerald-50/10 transition cursor-pointer"
            >
              <PhotoIcon className="w-8 h-8 text-emerald-600" />
              <span className="text-xs font-medium truncate max-w-sm">
                Cliquez pour charger une photo du produit
              </span>
              <span className="text-[10px] text-gray-400">Formats supportés: PNG, JPG, WEBP (Max: 1Mo)</span>
            </button>
          )}
        </div>

        {/* Boutons Actions */}
        <div className="w-full border-t border-gray-100 pt-6 mt-6 flex justify-end gap-3">
          {onAddSuccess && (
            <button 
              type="button" 
              onClick={onAddSuccess}
              className="px-6 py-2.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-600 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Retour au stock
            </button>
          )}
          <button 
            type="submit" 
            disabled={loading}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/15 active:scale-[0.98] transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {loading ? "Ajout en cours..." : "Ajouter le médicament"}
          </button>
        </div>

      </form>
    </div>
  );
}