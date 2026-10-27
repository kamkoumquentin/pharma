"use client";

import { useState, useEffect, useRef } from "react";
import { 
  PlusCircleIcon, 
  ChevronDownIcon, 
  PhotoIcon, 
  ArrowLeftIcon,
  PencilIcon,
  ExclamationCircleIcon,
  XMarkIcon
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { assurerMedicament } from "@/app/lib/medicaments";
import { useToast } from "@/app/components/Toast";

// Retire du stockage la photo d'une offre qui n'a pas pu être enregistrée.
async function supprimerImageTeleversee(chemin) {
  if (!chemin || !chemin.startsWith("produits/")) return;
  const { error } = await supabase.storage.from("offres-images").remove([chemin]);
  if (error) console.error("Image orpheline non supprimée :", chemin, error);
}

export default function Ajouter({ pharmacieId, token, onAddSuccess, onModifierOffre }) {
  const [medsList, setMedsList] = useState([]);
  const [loadingMeds, setLoadingMeds] = useState(false);
  
  // États de formulaire
  const [selectedMed, setSelectedMed] = useState(""); // Contient l'ID ou "new"
  const [nouveauNomMed, setNouveauNomMed] = useState("");
  const [prix, setPrix] = useState("");
  const [image, setImage] = useState(null);
  const [imageName, setImageName] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [existingImages, setExistingImages] = useState([]);
  const [selectedExistingImage, setSelectedExistingImage] = useState("");
  const [loadingExistingImages, setLoadingExistingImages] = useState(false);
  const [imageToEnlarge, setImageToEnlarge] = useState(null);
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [disponibilite, setDisponibilite] = useState("disponible");
  const [loading, setLoading] = useState(false);
  const [offreDoublon, setOffreDoublon] = useState(null);
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

  useEffect(() => {
    if (!imageToEnlarge) return;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setImageToEnlarge(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [imageToEnlarge]);

  useEffect(() => {
    let isCurrentSelection = true;
    setExistingImages([]);
    setSelectedExistingImage("");

    if (!selectedMed || selectedMed === "new") {
      setLoadingExistingImages(false);
      return () => {
        isCurrentSelection = false;
      };
    }

    const chargerImagesExistantes = async () => {
      setLoadingExistingImages(true);
      try {
        const { data, error } = await supabase
          .from("offres")
          .select("image")
          .eq("id_medicament", selectedMed)
          .not("image", "is", null);

        if (error) throw error;

        if (isCurrentSelection) {
          const urls = [...new Set(
            (data || [])
              .map((offre) => offre.image)
              .filter((url) => typeof url === "string" && url.trim())
          )];
          setExistingImages(urls);
        }
      } catch (error) {
        console.error("Erreur lors du chargement des images existantes :", error);
        if (isCurrentSelection) {
          setExistingImages([]);
          showToast("Impossible de charger les images existantes. Vous pouvez téléverser une nouvelle image.", "error");
        }
      } finally {
        if (isCurrentSelection) {
          setLoadingExistingImages(false);
        }
      }
    };

    chargerImagesExistantes();

    return () => {
      isCurrentSelection = false;
    };
  }, [selectedMed, showToast]);

  const handleMedChange = (e) => {
    setSelectedMed(e.target.value);
    setOffreDoublon(null);
    setExistingImages([]);
    setSelectedExistingImage("");
    setImage(null);
    setImageName("");
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setOffreDoublon(null);
      setSelectedExistingImage("");
      setImage(file);
      setImageName(file.name);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const ouvrirApercuImage = (src, alt) => {
    setImagePreviewError(false);
    setImageToEnlarge({ src, alt });
  };

  const reinitialiserFormulaire = () => {
    setSelectedMed("");
    setNouveauNomMed("");
    setPrix("");
    setImage(null);
    setImageName("");
    setImagePreview("");
    setExistingImages([]);
    setSelectedExistingImage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setDisponibilite("disponible");
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

    if (!selectedExistingImage && !image) {
      showToast("Veuillez sélectionner une image existante ou téléverser une photo du médicament.", "error");
      return;
    }

    setLoading(true);
    let imageTeleversee = null;
    try {
      setOffreDoublon(null);
      let idMedicament = selectedMed;
      let nomMedicament = "";

      // Résoudre le médicament : réutiliser la ligne du catalogue quand le
      // nom normalisé existe déjà, sinon la créer.
      if (selectedMed === "new") {
        const med = await assurerMedicament(nouveauNomMed);
        idMedicament = med.id;
        nomMedicament = med.nom;
      } else {
        const med = medsList.find((m) => m.id === selectedMed);
        nomMedicament = med?.nom || "";
      }

      if (!idMedicament) {
        showToast("Erreur : Identifiant de médicament introuvable.", "error");
        return;
      }

      // Refuser le doublon avant tout téléversement : la pharmacie a déjà
      // une offre pour ce médicament.
      const { data: offreExistante, error: lookupErr } = await supabase
        .from("offres")
        .select("id, prix, image, disponibilite")
        .eq("id_pharmacie", pharmacieId)
        .eq("id_medicament", idMedicament)
        .limit(1)
        .maybeSingle();

      if (lookupErr) throw lookupErr;

      if (offreExistante) {
        setOffreDoublon({ ...offreExistante, idMedicament, nom: nomMedicament });
        return;
      }

      let imageUrl = selectedExistingImage;
      if (image) {
        const ext = image.name.split('.').pop();
        imageTeleversee = `produits/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("offres-images")
          .upload(imageTeleversee, image, { upsert: true });

        if (uploadErr) {
          imageTeleversee = null;
          console.error("Erreur lors du téléversement de l'image :", uploadErr);
          showToast("Impossible de téléverser l’image. L’offre n’a pas été enregistrée.", "error");
          return;
        }

        const { data: urlData } = supabase.storage.from("offres-images").getPublicUrl(imageTeleversee);
        imageUrl = urlData?.publicUrl || "";
        if (!imageUrl) {
          await supprimerImageTeleversee(imageTeleversee);
          imageTeleversee = null;
          showToast("Impossible de récupérer l’URL de l’image. L’offre n’a pas été enregistrée.", "error");
          return;
        }
      }

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

      if (insertOffreErr) {
        // La contrainte unique(id_pharmacie, id_medicament) a refusé la ligne :
        // on propose l'offre déjà en catalogue au lieu d'une erreur technique.
        if (insertOffreErr.code === "23505") {
          const { data: relue, error: relureErr } = await supabase
            .from("offres")
            .select("id, prix, image, disponibilite")
            .eq("id_pharmacie", pharmacieId)
            .eq("id_medicament", idMedicament)
            .limit(1)
            .maybeSingle();

          if (relureErr) throw relureErr;
          await supprimerImageTeleversee(imageTeleversee);
          imageTeleversee = null;
          setOffreDoublon({ ...(relue || {}), idMedicament, nom: nomMedicament });
          return;
        }
        throw insertOffreErr;
      }

      showToast("Médicament ajouté au stock avec succès !", "success");
      reinitialiserFormulaire();
      chargerMedicaments();

      if (onAddSuccess) {
        onAddSuccess();
      }
    } catch (error) {
      // L'offre n'a pas été enregistrée : la photo téléversée ne doit pas
      // rester orpheline dans le stockage.
      if (imageTeleversee) await supprimerImageTeleversee(imageTeleversee);
      console.error("Erreur d'ajout de l'offre :", error);
      showToast(error.message || "Erreur lors de l'ajout du médicament au stock.", "error");
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

        {offreDoublon && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
          >
            <ExclamationCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm font-semibold text-amber-800">
                Ce médicament est déjà dans votre catalogue
                {offreDoublon.nom ? ` : ${offreDoublon.nom}` : ""}.
              </p>
              <p className="text-xs text-amber-700">
                Il n’a pas été ajouté en double. Prix enregistré :{" "}
                {typeof offreDoublon.prix === "number" ? `${offreDoublon.prix.toLocaleString("fr-FR")} FCFA` : "non renseigné"}
                {" — "}
                {offreDoublon.disponibilite === "disponible" ? "en stock" : "rupture de stock"}.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!offreDoublon.id || !onModifierOffre}
                  onClick={() =>
                    onModifierOffre?.({
                      id: offreDoublon.id,
                      nom: offreDoublon.nom,
                      prix: offreDoublon.prix,
                      image: offreDoublon.image || "",
                      disponibilite: offreDoublon.disponibilite || "disponible",
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PencilIcon className="h-4 w-4" />
                  Modifier cette offre
                </button>
                <button
                  type="button"
                  onClick={() => setOffreDoublon(null)}
                  className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  Fermer
                </button>
              </div>
            </div>
            {offreDoublon.image && (
              <img
                src={offreDoublon.image}
                alt=""
                aria-hidden="true"
                className="h-12 w-12 shrink-0 rounded-lg border border-amber-200 bg-white object-cover"
              />
            )}
          </div>
        )}
        
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
                onChange={handleMedChange}
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

        {/* Sélection de l'image */}
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Photo de la boîte *
          </label>
          {loadingExistingImages && (
            <p className="text-xs text-gray-400">Recherche des images existantes...</p>
          )}
          {existingImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Réutiliser une image existante</p>
              <div className="flex flex-wrap gap-3">
                {existingImages.map((url) => (
                  <div key={url} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => ouvrirApercuImage(url, "Image existante du médicament")}
                      aria-label="Agrandir l’image existante du médicament"
                      className={`h-20 w-20 overflow-hidden rounded-lg border-2 bg-white transition cursor-zoom-in ${
                        selectedExistingImage === url
                          ? "border-emerald-600 ring-2 ring-emerald-500/20"
                          : "border-gray-200 hover:border-emerald-400"
                      }`}
                    >
                      <img src={url} alt="Image existante du médicament" className="h-full w-full object-cover" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedExistingImage(url);
                        setImage(null);
                        setImageName("");
                        setImagePreview("");
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      aria-pressed={selectedExistingImage === url}
                      aria-label={selectedExistingImage === url ? "Image sélectionnée" : "Sélectionner cette image"}
                      className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                        selectedExistingImage === url
                          ? "bg-emerald-50 text-emerald-700"
                          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      }`}
                    >
                      {selectedExistingImage === url ? "Sélectionnée" : "Sélectionner"}
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs font-medium text-gray-600">Ou téléverser une nouvelle image</p>
            </div>
          )}
          <input 
            type="file" 
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          {imagePreview ? (
            <div className="relative border border-gray-200 rounded-xl p-4 bg-gray-50 flex items-center space-x-4">
              <button
                type="button"
                onClick={() => ouvrirApercuImage(imagePreview, "Aperçu de la boîte du médicament")}
                aria-label="Agrandir l’aperçu de la nouvelle image"
                className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-white flex-shrink-0 flex items-center justify-center cursor-zoom-in"
              >
                <img src={imagePreview} alt="Aperçu boîte" className="w-full h-full object-cover" />
              </button>
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
      {imageToEnlarge && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-gray-950/80 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setImageToEnlarge(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Aperçu agrandi de l’image"
            className="relative flex max-h-[90vh] w-full max-w-5xl flex-col items-center rounded-2xl bg-white p-4 pt-14 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setImageToEnlarge(null)}
              aria-label="Fermer l’aperçu agrandi"
              className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              <XMarkIcon className="h-5 w-5" />
              Fermer
            </button>
            {imagePreviewError ? (
              <p role="alert" className="py-12 text-sm font-medium text-gray-600">
                Impossible de charger cette image. Elle est peut-être indisponible ou dans un format non pris en charge.
              </p>
            ) : (
              <img
                src={imageToEnlarge.src}
                alt={imageToEnlarge.alt}
                onError={() => setImagePreviewError(true)}
                className="max-h-[calc(90vh-6rem)] max-w-full object-contain"
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}