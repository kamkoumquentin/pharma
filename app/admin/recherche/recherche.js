"use client";

import { useState, useEffect } from "react";
import { MagnifyingGlassIcon, MapPinIcon } from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";
import dynamic from "next/dynamic";

// On importe la carte de manière dynamique pour éviter l'erreur "window is not defined" avec Next.js
const MapComponent = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center text-gray-500 rounded-xl">Chargement de la carte...</div>
});

export default function RechercheGlobale({ pharmacieId, token }) {
  const [query, setQuery] = useState("");
  const [resultats, setResultats] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPharmacieId, setSelectedPharmacieId] = useState(null);
  const showToast = useToast();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const queryClean = query.trim().replace(/[%_]/g, '\\$&');
      const { data, error: sbError } = await supabase
        .from("offres")
        .select(`
          id,
          prix,
          image,
          disponibilite,
          medicaments!inner(id, nom),
          pharmacies!inner(id, nom, latitude, longitude, photo, emplacement, statut)
        `)
        .ilike("medicaments.nom", `%${queryClean}%`)
        .eq("pharmacies.statut", "actif");

      if (sbError) throw sbError;

      if (data && data.length > 0) {
        const pharmaciesTrouvees = data.map((offre) => ({
          id: offre.pharmacies?.id,
          nom: offre.pharmacies?.nom,
          emplacement: offre.pharmacies?.emplacement,
          latitude: offre.pharmacies?.latitude,
          longitude: offre.pharmacies?.longitude,
          prix: offre.prix,
          disponibilite: offre.disponibilite,
          image: offre.image,
          medicament: offre.medicaments?.nom || query
        }));
        setResultats(pharmaciesTrouvees);
      } else {
        setResultats([]);
        showToast("Aucun médicament trouvé pour cette recherche.", "info");
      }
    } catch (error) {
      console.error("Erreur de recherche:", error);
      showToast("Erreur lors de la recherche.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* En-tête / Barre de recherche */}
      <div className="p-6 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Recherche Globale de Médicaments</h2>
        <form onSubmit={handleSearch} className="flex gap-4 max-w-2xl">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: Paracétamol, Doliprane..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {isLoading ? "Recherche..." : "Rechercher"}
          </button>
        </form>
      </div>

      {/* Zone de contenu principale (Liste + Carte) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Liste des résultats (gauche) */}
        <div className="w-1/3 min-w-[300px] border-r border-gray-100 overflow-y-auto p-4 bg-gray-50/30">
          <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">
            {resultats.length} Résultat(s)
          </h3>
          
          <div className="space-y-3">
            {resultats.length === 0 && !isLoading && (
              <div className="text-center py-10 text-gray-400 text-sm">
                Aucun résultat à afficher.
              </div>
            )}
            
            {resultats.map((pharmacie, index) => {
              const isMyPharmacie = pharmacie.id === pharmacieId;
              
              return (
                <div 
                  key={index} 
                  onClick={() => setSelectedPharmacieId(pharmacie.id)}
                  className={`p-4 flex flex-col bg-white rounded-xl transition-all shadow-sm border cursor-pointer hover:shadow-md ${
                    isMyPharmacie 
                      ? "border-emerald-400 bg-emerald-50/50" 
                      : (selectedPharmacieId === pharmacie.id ? "border-emerald-500 ring-1 ring-emerald-500" : "border-gray-200")
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <h4 className="font-bold text-gray-800 text-sm">
                      {pharmacie.nom}
                    </h4>
                    {isMyPharmacie && (
                      <span className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0 ml-2">
                        Vous
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-start gap-1.5 mt-2 text-gray-500">
                    <MapPinIcon className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
                    <span className="text-xs">{pharmacie.emplacement || "Aucun emplacement spécifié"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Carte (droite) */}
        <div className="flex-1 relative bg-gray-200 p-2">
          <MapComponent pharmacies={resultats} userPharmacieId={pharmacieId} selectedPharmacieId={selectedPharmacieId} />
        </div>
      </div>
    </div>
  );
}
