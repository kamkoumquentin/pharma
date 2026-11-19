"use client";

import { useState, useEffect, useRef } from "react";
import { 
  TrashIcon, 
  PencilIcon, 
  MagnifyingGlassIcon, 
  XMarkIcon,
  PhotoIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  TagIcon
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";
import {
  DISPONIBILITE_EN_STOCK,
  DISPONIBILITE_RUPTURE,
  basculerDisponibilite,
  mettreAJourDisponibiliteOffre,
  mettreAJourDisponibiliteLot,
} from "@/app/lib/disponibiliteOffres.mjs";

const DUREE_APPUI_LONG_MS = 450;
const SEUIL_MOUVEMENT_PX = 10;

export default function Centrale({ pharmacieId, token, offreAModifier, onOffreAModifierConsommee }) {
  const [lignes, setLignes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(offreAModifier?.nom || "");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'disponible', 'indisponible'
  const showToast = useToast();

  const [isPriceModalOpen, setIsPriceModalOpen] = useState(Boolean(offreAModifier));
  const [priceOffer, setPriceOffer] = useState(offreAModifier || null);
  const [nouveauPrix, setNouveauPrix] = useState(
    offreAModifier?.prix != null ? String(offreAModifier.prix) : ""
  );
  const [savingPrice, setSavingPrice] = useState(false);
  const [uploadingImageIds, setUploadingImageIds] = useState([]);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameOffer, setRenameOffer] = useState(null);
  const [nouveauNomMed, setNouveauNomMed] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [medsList, setMedsList] = useState([]);
  const [loadingMeds, setLoadingMeds] = useState(false);
  const [imageToEnlarge, setImageToEnlarge] = useState(null);
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [pendingToggleIds, setPendingToggleIds] = useState([]);
  const [batchSaving, setBatchSaving] = useState(false);
  const [isBatchRestockConfirmOpen, setIsBatchRestockConfirmOpen] = useState(false);
  const fileInputRef = useRef(null);
  const imageUploadTargetRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressOriginRef = useRef(null);
  const suppressNextClickRef = useRef(false);

  const selectionMode = selectedIds.length > 0;

  const annulerAppuiLong = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  };

  useEffect(() => () => annulerAppuiLong(), []);

  useEffect(() => {
    if (!imageToEnlarge && !isBatchRestockConfirmOpen && selectedIds.length === 0) return;

    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      if (imageToEnlarge) {
        setImageToEnlarge(null);
      } else if (isBatchRestockConfirmOpen && !batchSaving) {
        setIsBatchRestockConfirmOpen(false);
      } else if (selectedIds.length > 0 && !batchSaving) {
        setSelectedIds([]);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [imageToEnlarge, isBatchRestockConfirmOpen, selectedIds.length, batchSaving]);

  const ouvrirApercuImage = (src, alt) => {
    setImagePreviewError(false);
    setImageToEnlarge({ src, alt });
  };

  const chargerProduits = async () => {
    if (!pharmacieId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("offres")
        .select("*, medicaments ( id, nom )")
        .eq("id_pharmacie", pharmacieId);

      if (error) throw error;

      if (data) {
        const produitsFormates = data.map((item) => ({
          id: item.id,
          nom: item.medicaments?.nom || "Inconnu",
          image: item.image || "",
          prix: item.prix,
          disponibilite: item.disponibilite || "disponible"
        }));
        setLignes(produitsFormates);
        const idsValides = new Set(produitsFormates.map((p) => p.id));
        setSelectedIds((prev) => prev.filter((id) => idsValides.has(id)));
      }
    } catch (error) {
      console.error("Erreur lors du chargement des médicaments", error);
      showToast("Impossible de charger le stock.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    chargerProduits();
  }, [pharmacieId]);

  const supprimerProduit = async (idOffre, nomMed) => {
    const confirmation = window.confirm(`Voulez-vous vraiment retirer ${nomMed} de votre stock ?`);
    if (!confirmation) return;

    try {
      const { error } = await supabase.from("offres").delete().eq("id", idOffre);
      if (error) throw error;
      showToast(`${nomMed} a été retiré du stock !`, "success");
      chargerProduits();
    } catch (error) {
      console.error("Erreur lors de la suppression", error);
      showToast("Erreur lors du retrait du médicament.", "error");
    }
  };

  const consommerOffreAModifier = () => {
    if (offreAModifier && onOffreAModifierConsommee) {
      onOffreAModifierConsommee();
    }
  };

  const ouvrirEditionPrix = (offre) => {
    setPriceOffer(offre);
    setNouveauPrix(offre.prix != null ? String(offre.prix) : "");
    setIsPriceModalOpen(true);
  };

  const fermerEditionPrix = () => {
    setIsPriceModalOpen(false);
    setPriceOffer(null);
    setNouveauPrix("");
    consommerOffreAModifier();
  };

  const handlePriceSubmit = async (e) => {
    e.preventDefault();
    if (!priceOffer) return;

    const prixValide = parseInt(nouveauPrix, 10);
    if (!nouveauPrix || Number.isNaN(prixValide) || prixValide <= 0) {
      showToast("Veuillez saisir un prix valide supérieur à 0.", "error");
      return;
    }

    if (prixValide === priceOffer.prix) {
      fermerEditionPrix();
      return;
    }

    setSavingPrice(true);
    try {
      const { data, error } = await supabase
        .from("offres")
        .update({ prix: prixValide })
        .eq("id", priceOffer.id)
        .eq("id_pharmacie", pharmacieId)
        .select("id");

      if (error) throw error;
      if (!Array.isArray(data) || data.length !== 1) {
        throw new Error("La mise à jour du prix n'a touché aucune offre.");
      }

      setLignes((prev) =>
        prev.map((ligne) =>
          ligne.id === priceOffer.id ? { ...ligne, prix: prixValide } : ligne
        )
      );
      showToast("Prix du médicament mis à jour avec succès !", "success");
      fermerEditionPrix();
    } catch (error) {
      console.error("Erreur mise à jour prix :", error);
      showToast(error?.message || "Erreur lors de la mise à jour du prix.", "error");
    } finally {
      setSavingPrice(false);
    }
  };

  const declencherUploadImage = (produit) => {
    if (uploadingImageIds.includes(produit.id) || batchSaving) return;
    imageUploadTargetRef.current = produit;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const gererSelectionImageLigne = async (event) => {
    const file = event.target.files?.[0];
    const produit = imageUploadTargetRef.current;
    imageUploadTargetRef.current = null;
    if (!file || !produit) return;

    const ancienneImage = produit.image || "";
    const apercuLocal = URL.createObjectURL(file);

    setUploadingImageIds((prev) => [...prev, produit.id]);
    setLignes((prev) =>
      prev.map((ligne) =>
        ligne.id === produit.id ? { ...ligne, image: apercuLocal } : ligne
      )
    );

    try {
      const ext = file.name.split(".").pop();
      const filename = `produits/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("offres-images")
        .upload(filename, file);

      if (upErr) {
        throw new Error(upErr.message || "le stockage a refusé l'envoi");
      }

      const { data: urlData } = supabase.storage
        .from("offres-images")
        .getPublicUrl(filename);
      const imageUrl = urlData?.publicUrl || null;
      if (!imageUrl) {
        throw new Error("URL publique de l'image indisponible");
      }

      const { data, error: updateErr } = await supabase
        .from("offres")
        .update({ image: imageUrl })
        .eq("id", produit.id)
        .eq("id_pharmacie", pharmacieId)
        .select("id");

      if (updateErr) throw updateErr;
      if (!Array.isArray(data) || data.length !== 1) {
        throw new Error("La mise à jour de l'image n'a touché aucune offre.");
      }

      setLignes((prev) =>
        prev.map((ligne) =>
          ligne.id === produit.id ? { ...ligne, image: imageUrl } : ligne
        )
      );
      showToast("Image mise à jour avec succès !", "success");
    } catch (error) {
      console.error("Erreur mise à jour image offre :", error);
      setLignes((prev) =>
        prev.map((ligne) =>
          ligne.id === produit.id ? { ...ligne, image: ancienneImage } : ligne
        )
      );
      showToast(
        error?.message
          ? `L'image n'a pas pu être enregistrée (${error.message}).`
          : "Erreur lors de la mise à jour de l'image.",
        "error"
      );
    } finally {
      URL.revokeObjectURL(apercuLocal);
      setUploadingImageIds((prev) => prev.filter((id) => id !== produit.id));
    }
  };

  const chargerMedicaments = async () => {
    setLoadingMeds(true);
    try {
      const { data, error } = await supabase.rpc("lister_medicaments_avec_offres");
      if (error) throw error;
      setMedsList(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des médicaments :", error);
      showToast("Impossible de charger le catalogue de médicaments.", "error");
    } finally {
      setLoadingMeds(false);
    }
  };

  const normaliserRecherche = (texte) =>
    String(texte ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");

  const ouvrirEditionNom = (offre) => {
    setRenameOffer(offre);
    setNouveauNomMed(offre.nom || "");
    setIsRenameModalOpen(true);
    if (medsList.length === 0) {
      chargerMedicaments();
    }
  };

  const fermerEditionNom = () => {
    setIsRenameModalOpen(false);
    setRenameOffer(null);
    setNouveauNomMed("");
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    const nomNettoye = nouveauNomMed.trim();
    if (!nomNettoye) {
      showToast("Veuillez saisir le nom du médicament.", "error");
      return;
    }

    setRenaming(true);
    try {
      const { error } = await supabase.rpc("changer_medicament_offre", {
        p_id_offre: renameOffer.id,
        p_nouveau_nom: nomNettoye,
      });

      if (error) throw error;

      showToast("Nom du médicament mis à jour avec succès !", "success");
      fermerEditionNom();
      await Promise.all([chargerProduits(), chargerMedicaments()]);
    } catch (error) {
      console.error("Erreur lors du changement de médicament :", error);
      showToast(error.message || "Erreur lors du changement de nom du médicament.", "error");
    } finally {
      setRenaming(false);
    }
  };

  const requeteNomNormalisee = normaliserRecherche(nouveauNomMed);
  const suggestionsMedicaments = medsList.filter((med) => {
    if (!requeteNomNormalisee) return true;
    return normaliserRecherche(med.nom).includes(requeteNomNormalisee);
  });

  // Filtrage local pour réactivité et fluidité
  const produitsFiltres = lignes.filter((produit) => {
    const matchNom = produit.nom.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = 
      statusFilter === "all" || 
      (statusFilter === "disponible" && produit.disponibilite === "disponible") ||
      (statusFilter === "indisponible" && produit.disponibilite !== "disponible");
    return matchNom && matchStatus;
  });

  const selectedSet = new Set(selectedIds);
  const tousFiltresSelectionnes =
    produitsFiltres.length > 0 &&
    produitsFiltres.every((produit) => selectedSet.has(produit.id));

  const basculerSelectionLigne = (idOffre) => {
    setSelectedIds((prev) =>
      prev.includes(idOffre) ? prev.filter((id) => id !== idOffre) : [...prev, idOffre]
    );
  };

  const basculerToutSelectionner = () => {
    if (tousFiltresSelectionnes) {
      const filtresSet = new Set(produitsFiltres.map((p) => p.id));
      setSelectedIds((prev) => prev.filter((id) => !filtresSet.has(id)));
      return;
    }
    const fusion = new Set(selectedIds);
    for (const produit of produitsFiltres) {
      fusion.add(produit.id);
    }
    setSelectedIds([...fusion]);
  };

  const basculerStockLigne = async (produit) => {
    if (pendingToggleIds.includes(produit.id) || batchSaving) return;

    const ancienneDispo =
      produit.disponibilite === DISPONIBILITE_EN_STOCK
        ? DISPONIBILITE_EN_STOCK
        : DISPONIBILITE_RUPTURE;
    const nouvelleDispo = basculerDisponibilite(ancienneDispo);

    setLignes((prev) =>
      prev.map((ligne) =>
        ligne.id === produit.id ? { ...ligne, disponibilite: nouvelleDispo } : ligne
      )
    );
    setPendingToggleIds((prev) => [...prev, produit.id]);

    try {
      await mettreAJourDisponibiliteOffre(supabase, {
        idOffre: produit.id,
        pharmacieId,
        disponibilite: nouvelleDispo,
      });
    } catch (error) {
      console.error("Erreur lors du changement de disponibilité :", error);
      setLignes((prev) =>
        prev.map((ligne) =>
          ligne.id === produit.id ? { ...ligne, disponibilite: ancienneDispo } : ligne
        )
      );
      showToast(
        error?.message || "Impossible de mettre à jour la disponibilité.",
        "error"
      );
    } finally {
      setPendingToggleIds((prev) => prev.filter((id) => id !== produit.id));
    }
  };

  const appliquerDisponibiliteLot = async (nouvelleDispo) => {
    const idsCibles = [...new Set(selectedIds)];
    if (idsCibles.length === 0 || batchSaving) return;

    const ciblesSet = new Set(idsCibles);
    const anciennesDispos = new Map(
      lignes
        .filter((ligne) => ciblesSet.has(ligne.id))
        .map((ligne) => [ligne.id, ligne.disponibilite])
    );

    setBatchSaving(true);
    setLignes((prev) =>
      prev.map((ligne) =>
        ciblesSet.has(ligne.id) ? { ...ligne, disponibilite: nouvelleDispo } : ligne
      )
    );

    try {
      const updatedIds = await mettreAJourDisponibiliteLot(supabase, {
        idsOffres: idsCibles,
        pharmacieId,
        disponibilite: nouvelleDispo,
      });
      const updatedSet = new Set(updatedIds);

      if (updatedSet.size < idsCibles.length) {
        setLignes((prev) =>
          prev.map((ligne) =>
            ciblesSet.has(ligne.id) && !updatedSet.has(ligne.id)
              ? { ...ligne, disponibilite: anciennesDispos.get(ligne.id) ?? ligne.disponibilite }
              : ligne
          )
        );
        showToast("Certaines offres n'ont pas pu être mises à jour.", "error");
      } else {
        showToast(
          nouvelleDispo === DISPONIBILITE_RUPTURE
            ? `${updatedSet.size} médicament${updatedSet.size > 1 ? "s" : ""} marqué${updatedSet.size > 1 ? "s" : ""} en rupture.`
            : `${updatedSet.size} médicament${updatedSet.size > 1 ? "s" : ""} remis en stock.`,
          "success"
        );
      }

      setSelectedIds([]);
      setIsBatchRestockConfirmOpen(false);
    } catch (error) {
      console.error("Erreur lors de la mise à jour en lot :", error);
      setLignes((prev) =>
        prev.map((ligne) =>
          ciblesSet.has(ligne.id)
            ? { ...ligne, disponibilite: anciennesDispos.get(ligne.id) ?? ligne.disponibilite }
            : ligne
        )
      );
      showToast(
        error?.message || "Impossible de mettre à jour les offres sélectionnées.",
        "error"
      );
    } finally {
      setBatchSaving(false);
    }
  };

  const gererPointerDownLigne = (event, idOffre) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (selectionMode || batchSaving) return;
    if (event.target.closest("button, input, select, a, [role='switch']")) return;

    annulerAppuiLong();
    longPressOriginRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = setTimeout(() => {
      suppressNextClickRef.current = true;
      setSelectedIds((prev) => (prev.includes(idOffre) ? prev : [...prev, idOffre]));
      longPressTimerRef.current = null;
      longPressOriginRef.current = null;
    }, DUREE_APPUI_LONG_MS);
  };

  const gererPointerMoveLigne = (event) => {
    if (!longPressTimerRef.current || !longPressOriginRef.current) return;
    const distance = Math.hypot(
      event.clientX - longPressOriginRef.current.x,
      event.clientY - longPressOriginRef.current.y
    );
    if (distance > SEUIL_MOUVEMENT_PX) {
      annulerAppuiLong();
    }
  };

  const gererClicLigne = (event, idOffre) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (!selectionMode || batchSaving) return;
    if (event.target.closest("button, input, select, a, [role='switch']")) return;
    basculerSelectionLigne(idOffre);
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      
      {/* Barre d'outils et recherche */}
      <div className="bg-white rounded-2xl border border-gray-200/60 p-5 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
        <div className="relative w-full md:w-80">
          <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un médicament..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition text-sm text-gray-700 placeholder-gray-400"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none h-11 pl-4 pr-10 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition text-sm text-gray-700 font-semibold cursor-pointer"
            >
              <option value="all">Tous les statuts</option>
              <option value="disponible">En Stock</option>
              <option value="indisponible">Rupture</option>
            </select>
            <ChevronDownIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          <button
            onClick={chargerProduits}
            disabled={loading}
            className="h-11 w-11 flex items-center justify-center border border-gray-200 hover:bg-gray-50 rounded-xl transition cursor-pointer text-gray-600 disabled:opacity-50"
            title="Rafraîchir"
          >
            <ArrowPathIcon className={`w-4.5 h-4.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Barre d'action en mode sélection multiple */}
      {selectionMode && (
        <div
          role="region"
          aria-label="Actions de sélection multiple"
          className="sticky top-0 z-20 bg-emerald-950 text-white rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-emerald-500 text-white text-xs font-bold">
              {selectedIds.length}
            </span>
            <span className="text-sm font-semibold">
              {selectedIds.length === 1
                ? "1 médicament sélectionné"
                : `${selectedIds.length} médicaments sélectionnés`}
            </span>
            <button
              type="button"
              onClick={basculerToutSelectionner}
              disabled={batchSaving}
              className="text-xs font-semibold text-emerald-200 hover:text-white underline underline-offset-2 cursor-pointer disabled:opacity-50"
            >
              {tousFiltresSelectionnes ? "Tout désélectionner" : "Tout sélectionner"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => appliquerDisponibiliteLot(DISPONIBILITE_RUPTURE)}
              disabled={batchSaving}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              Marquer en rupture
            </button>
            <button
              type="button"
              onClick={() => setIsBatchRestockConfirmOpen(true)}
              disabled={batchSaving}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              Remettre en stock
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              disabled={batchSaving}
              aria-label="Annuler la sélection"
              title="Annuler la sélection"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer disabled:opacity-50"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Tableau ou vue vide */}
      <div className="bg-white rounded-2xl border border-gray-200/60 overflow-hidden flex-1 flex flex-col shadow-sm">
        {loading && lignes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-400 text-sm">Chargement des données...</p>
          </div>
        ) : produitsFiltres.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 bg-gray-50 border border-gray-200/60 rounded-2xl flex items-center justify-center text-gray-400 mb-4">
              <PhotoIcon className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-gray-700 text-base">Aucun médicament trouvé</h3>
            <p className="text-gray-400 text-xs mt-1 max-w-xs">
              {searchQuery || statusFilter !== "all" 
                ? "Essayez d'ajuster vos filtres de recherche ou de disponibilité." 
                : "Votre stock est vide pour le moment. Cliquez sur 'Ajouter un médicament' dans le menu latéral."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200/60 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                  {selectionMode && (
                    <th className="py-4 pl-6 pr-2 w-10">
                      <input
                        type="checkbox"
                        checked={tousFiltresSelectionnes}
                        onChange={basculerToutSelectionner}
                        aria-label="Tout sélectionner"
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="py-4 px-6">Aperçu</th>
                  <th className="py-4 px-6">Nom Médicament</th>
                  <th className="py-4 px-6">Prix Unitaire</th>
                  <th className="py-4 px-6">En stock</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-600 font-sans">
                {produitsFiltres.map((produit) => {
                  const estEnStock = produit.disponibilite === DISPONIBILITE_EN_STOCK;
                  const estEnCours = pendingToggleIds.includes(produit.id);
                  const estSelectionne = selectedSet.has(produit.id);

                  return (
                  <tr
                    key={produit.id}
                    onPointerDown={(event) => gererPointerDownLigne(event, produit.id)}
                    onPointerMove={gererPointerMoveLigne}
                    onPointerUp={annulerAppuiLong}
                    onPointerCancel={annulerAppuiLong}
                    onPointerLeave={annulerAppuiLong}
                    onClick={(event) => gererClicLigne(event, produit.id)}
                    className={`transition duration-150 select-none ${
                      estSelectionne
                        ? "bg-emerald-50/70 hover:bg-emerald-50"
                        : "hover:bg-gray-50/50"
                    } ${selectionMode ? "cursor-pointer" : ""}`}
                  >
                    {selectionMode && (
                      <td className="py-3.5 pl-6 pr-2">
                        <input
                          type="checkbox"
                          checked={estSelectionne}
                          onChange={() => basculerSelectionLigne(produit.id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Sélectionner ${produit.nom}`}
                          className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-2">
                        <div className="w-11 h-11 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden shadow-inner flex items-center justify-center shrink-0">
                          {produit.image ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                ouvrirApercuImage(produit.image, produit.nom);
                              }}
                              aria-label={`Agrandir l’image de ${produit.nom}`}
                              className="h-full w-full cursor-zoom-in"
                            >
                              <img
                                src={produit.image}
                                alt={produit.nom}
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400">No Image</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            declencherUploadImage(produit);
                          }}
                          disabled={uploadingImageIds.includes(produit.id) || batchSaving}
                          title={produit.image ? "Changer l'image" : "Ajouter une image"}
                          aria-label={`Changer l’image de ${produit.nom}`}
                          className="p-1.5 border border-gray-200 text-gray-500 hover:text-emerald-600 hover:border-emerald-200 rounded-lg hover:bg-emerald-50/40 transition cursor-pointer disabled:opacity-50"
                        >
                          <PhotoIcon className={`w-4 h-4 ${uploadingImageIds.includes(produit.id) ? "animate-pulse text-emerald-600" : ""}`} />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-6 font-bold text-gray-800">
                      {produit.nom}
                    </td>
                    <td className="py-3.5 px-6 font-mono font-semibold text-gray-700">
                      {produit.prix.toLocaleString("fr-FR")} FCFA
                    </td>
                    <td className="py-3.5 px-6">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={estEnStock}
                          aria-label={`En stock : ${produit.nom}`}
                          disabled={estEnCours || batchSaving}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            basculerStockLigne(produit);
                          }}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 cursor-pointer disabled:opacity-60 ${
                            estEnStock ? "bg-emerald-600" : "bg-rose-200"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
                              estEnStock ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                        <span
                          className={`text-xs font-bold ${
                            estEnStock ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {estEnStock ? "En stock" : "Rupture"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        <button
                          type="button"
                          onClick={() => ouvrirEditionNom(produit)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 text-gray-600 hover:text-emerald-700 hover:border-emerald-200 rounded-lg hover:bg-emerald-50/40 transition cursor-pointer text-xs font-semibold"
                          title="Modifier le nom"
                        >
                          <TagIcon className="w-3.5 h-3.5" />
                          <span>Modifier le nom</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => ouvrirEditionPrix(produit)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 text-gray-600 hover:text-emerald-700 hover:border-emerald-200 rounded-lg hover:bg-emerald-50/40 transition cursor-pointer text-xs font-semibold"
                          title="Modifier le prix"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                          <span>Modifier le prix</span>
                        </button>
                        <button
                          onClick={() => supprimerProduit(produit.id, produit.nom)}
                          className="p-2 border border-gray-200 text-gray-600 hover:text-rose-600 hover:border-rose-200 rounded-lg hover:bg-rose-50/10 transition cursor-pointer"
                          title="Retirer du stock"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {imageToEnlarge && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/80 p-4"
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

      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={gererSelectionImageLigne}
        className="hidden"
      />

      {/* MODAL DE MODIFICATION DU NOM (RÉAFFECTATION D'OFFRE) */}
      {isRenameModalOpen && renameOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-emerald-950/40 backdrop-blur-sm"
            onClick={fermerEditionNom}
          ></div>

          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 p-6 z-10 animate-slide-in">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <h3 className="font-bold text-gray-800 text-lg">Modifier le nom du médicament</h3>
              <button
                type="button"
                onClick={fermerEditionNom}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Nom actuel
                </label>
                <input
                  type="text"
                  value={renameOffer.nom}
                  disabled
                  className="w-full h-11 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 outline-none cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">
                  Nouveau nom du médicament *
                </label>
                <input
                  type="text"
                  list="catalogue-medicaments-suggestions"
                  value={nouveauNomMed}
                  onChange={(e) => setNouveauNomMed(e.target.value)}
                  required
                  placeholder="Ex: Efferalgan 500mg, comprimés"
                  className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition"
                />
                <datalist id="catalogue-medicaments-suggestions">
                  {medsList.map((med) => (
                    <option key={med.id} value={med.nom} />
                  ))}
                </datalist>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Suggestions du catalogue
                </p>
                {loadingMeds ? (
                  <p className="text-xs text-gray-400 animate-pulse py-2">
                    Chargement du catalogue...
                  </p>
                ) : suggestionsMedicaments.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">
                    Aucune correspondance existante : un nouveau médicament sera créé.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-gray-50/50">
                    {suggestionsMedicaments.slice(0, 50).map((med) => (
                      <button
                        key={med.id}
                        type="button"
                        onClick={() => setNouveauNomMed(med.nom)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition cursor-pointer"
                      >
                        {med.nom}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4 mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={fermerEditionNom}
                  className="px-5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={renaming}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/10 active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
                >
                  {renaming ? "Enregistrement..." : "Valider le nom"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE MODIFICATION DU PRIX */}
      {isPriceModalOpen && priceOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-emerald-950/40 backdrop-blur-sm"
            onClick={fermerEditionPrix}
          ></div>

          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 p-6 z-10 animate-slide-in">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <h3 className="font-bold text-gray-800 text-lg">Modifier le prix du médicament</h3>
              <button
                type="button"
                onClick={fermerEditionPrix}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePriceSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Médicament
                </label>
                <input
                  type="text"
                  value={priceOffer.nom}
                  disabled
                  className="w-full h-11 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 outline-none cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Prix actuel
                </label>
                <input
                  type="text"
                  value={`${Number(priceOffer.prix ?? 0).toLocaleString("fr-FR")} FCFA`}
                  disabled
                  className="w-full h-11 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 outline-none cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">
                  Nouveau prix (FCFA) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={nouveauPrix}
                  onChange={(e) => setNouveauPrix(e.target.value)}
                  required
                  autoFocus
                  placeholder="Ex: 1500"
                  className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition"
                />
              </div>

              <div className="border-t border-gray-100 pt-4 mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={fermerEditionPrix}
                  className="px-5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingPrice}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/10 active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
                >
                  {savingPrice ? "Enregistrement..." : "Valider le prix"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isBatchRestockConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !batchSaving) {
              setIsBatchRestockConfirmOpen(false);
            }
          }}
        >
          <div className="absolute inset-0 bg-emerald-950/40 backdrop-blur-sm" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titre-confirm-remettre-stock"
            className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 p-6 z-10 animate-slide-in"
          >
            <h3
              id="titre-confirm-remettre-stock"
              className="font-bold text-gray-800 text-lg mb-2"
            >
              Remettre en stock ({selectedIds.length})
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Les patients qui suivent ces médicaments seront prévenus
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsBatchRestockConfirmOpen(false)}
                disabled={batchSaving}
                className="px-5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => appliquerDisponibiliteLot(DISPONIBILITE_EN_STOCK)}
                disabled={batchSaving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/10 active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
              >
                {batchSaving ? "Mise à jour..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}