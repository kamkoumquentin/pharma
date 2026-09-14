"use client";

import { useState, useEffect, useRef } from "react";
import { 
  TrashIcon, 
  PencilIcon, 
  MagnifyingGlassIcon, 
  XMarkIcon,
  PhotoIcon,
  ChevronDownIcon,
  ArrowPathIcon
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

export default function Centrale({ pharmacieId, token }) {
  const [lignes, setLignes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'disponible', 'indisponible'
  const showToast = useToast();

  // États pour la modal d'édition
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentOffer, setCurrentOffer] = useState(null);
  const [editPrix, setEditPrix] = useState("");
  const [editDispo, setEditDispo] = useState("disponible");
  const [editImage, setEditImage] = useState(null);
  const [editImageName, setEditImageName] = useState("");
  const [editImagePreview, setEditImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

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

  // Ouverture de la modal de modification
  const ouvrirEdition = (offre) => {
    setCurrentOffer(offre);
    setEditPrix(offre.prix);
    setEditDispo(offre.disponibilite);
    setEditImage(null);
    setEditImageName("");
    setEditImagePreview(offre.image || "");
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();

    if (!editPrix || parseFloat(editPrix) <= 0) {
      showToast("Veuillez saisir un prix valide supérieur à 0", "error");
      return;
    }

    setSaving(true);
    try {
      let imageUrl = editImagePreview;
      if (editImage) {
        try {
          const ext = editImage.name.split('.').pop();
          const filename = `produits/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("offres-images")
            .upload(filename, editImage, { upsert: true });

          if (!upErr) {
            const { data: urlData } = supabase.storage
              .from("offres-images")
              .getPublicUrl(filename);
            imageUrl = urlData?.publicUrl || imageUrl;
          }
        } catch (storageErr) {
          console.error("Erreur upload image offre:", storageErr);
        }
      }

      const { error: updateErr } = await supabase
        .from("offres")
        .update({
          prix: parseInt(editPrix, 10),
          disponibilite: editDispo,
          image: imageUrl,
        })
        .eq("id", currentOffer.id);

      if (updateErr) throw updateErr;

      showToast("Médicament mis à jour avec succès !", "success");
      setIsEditModalOpen(false);
      chargerProduits();
    } catch (error) {
      console.error("Erreur mise à jour offre :", error);
      showToast("Erreur lors de la mise à jour.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Filtrage local pour réactivité et fluidité
  const produitsFiltres = lignes.filter((produit) => {
    const matchNom = produit.nom.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = 
      statusFilter === "all" || 
      (statusFilter === "disponible" && produit.disponibilite === "disponible") ||
      (statusFilter === "indisponible" && produit.disponibilite !== "disponible");
    return matchNom && matchStatus;
  });

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
                  <th className="py-4 px-6">Aperçu</th>
                  <th className="py-4 px-6">Nom Médicament</th>
                  <th className="py-4 px-6">Prix Unitaire</th>
                  <th className="py-4 px-6">Disponibilité</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-600 font-sans">
                {produitsFiltres.map((produit) => (
                  <tr key={produit.id} className="hover:bg-gray-50/50 transition duration-150">
                    <td className="py-3.5 px-6">
                      <div className="w-11 h-11 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
                        {produit.image ? (
                          <img 
                            src={produit.image} 
                            alt={produit.nom} 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <span className="text-[10px] text-gray-400">No Image</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-6 font-bold text-gray-800">
                      {produit.nom}
                    </td>
                    <td className="py-3.5 px-6 font-mono font-semibold text-gray-700">
                      {produit.prix.toLocaleString("fr-FR")} FCFA
                    </td>
                    <td className="py-3.5 px-6">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                        produit.disponibilite === "disponible" 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                          : "bg-rose-50 text-rose-700 border border-rose-100"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                          produit.disponibilite === "disponible" ? "bg-emerald-500" : "bg-rose-500"
                        }`}></span>
                        {produit.disponibilite === "disponible" ? "En stock" : "Rupture"}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        <button
                          onClick={() => ouvrirEdition(produit)}
                          className="p-2 border border-gray-200 text-gray-600 hover:text-emerald-600 hover:border-emerald-200 rounded-lg hover:bg-emerald-50/10 transition cursor-pointer"
                          title="Modifier"
                        >
                          <PencilIcon className="w-4 h-4" />
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE MODIFICATION */}
      {isEditModalOpen && currentOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-emerald-950/40 backdrop-blur-sm"
            onClick={() => setIsEditModalOpen(false)}
          ></div>

          {/* Modal Container */}
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 p-6 z-10 animate-slide-in">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <h3 className="font-bold text-gray-800 text-lg">Modifier le médicament</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* Nom (Désactivé) */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom du médicament</label>
                <input 
                  type="text" 
                  value={currentOffer.nom} 
                  disabled
                  className="w-full h-11 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 outline-none cursor-not-allowed"
                />
              </div>

              {/* Prix */}
              <div>
                <label className="block text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">Prix de vente (FCFA) *</label>
                <input 
                  type="number" 
                  value={editPrix} 
                  onChange={(e) => setEditPrix(e.target.value)}
                  required
                  placeholder="Ex: 1500"
                  className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition"
                />
              </div>

              {/* Disponibilité */}
              <div>
                <label className="block text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">Disponibilité</label>
                <div className="relative">
                  <select 
                    value={editDispo} 
                    onChange={(e) => setEditDispo(e.target.value)}
                    className="w-full h-11 pl-3 pr-10 appearance-none border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition cursor-pointer"
                  >
                    <option value="disponible">En Stock</option>
                    <option value="indisponible">Rupture de stock</option>
                  </select>
                  <ChevronDownIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Photo du produit */}
              <div>
                <label className="block text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">Modifier l'image</label>
                <input 
                  type="file" 
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setEditImage(file);
                      setEditImageName(file.name);
                      setEditImagePreview(URL.createObjectURL(file));
                    }
                  }}
                  className="hidden"
                />
                {editImagePreview ? (
                  <div className="relative border border-gray-200 rounded-xl p-3 bg-gray-50 flex items-center space-x-4">
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-white flex-shrink-0 flex items-center justify-center">
                      <img src={editImagePreview} alt="Aperçu médicament" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">
                        {editImageName || "Image actuelle"}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {editImage ? "Nouvelle image sélectionnée" : "Image existante"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 border border-gray-200 hover:bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold cursor-pointer transition"
                    >
                      Changer
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-11 border border-dashed border-gray-300 rounded-xl flex items-center justify-center space-x-2 text-xs text-gray-500 hover:border-emerald-500 hover:bg-emerald-50/10 transition cursor-pointer"
                  >
                    <PhotoIcon className="w-5 h-5 text-emerald-600" />
                    <span className="truncate max-w-[200px]">Remplacer l'image existante</span>
                  </button>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 pt-4 mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/10 active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
                >
                  {saving ? "Enregistrement..." : "Sauvegarder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}