"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/app/lib/supabaseClient";
import { ArrowPathIcon, ExclamationTriangleIcon, MapPinIcon } from "@heroicons/react/24/outline";

export default function Consultations({ pharmacieId, token, ville }) {
  const [statistiques, setStatistiques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStatistiques();
  }, [pharmacieId]);

  const fetchStatistiques = async () => {
    if (!pharmacieId) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: sbError } = await supabase.rpc("get_consultations_ville");

      if (sbError) throw sbError;
      setStatistiques(data || []);
    } catch (err) {
      console.error("Erreur lors de la récupération des statistiques par ville:", err);
      setError(err.message || "Impossible de charger les statistiques de consultations.");
    } finally {
      setLoading(false);
    }
  };

  const nomVille = (ville || "").trim();
  const totalGeneral = statistiques.reduce((acc, curr) => acc + (Number(curr.total_consultations) || 0), 0);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        <p className="text-xs text-gray-400 font-medium">Chargement des statistiques...</p>
      </div>
    );
  }

  // Cas où la ville n'est pas encore renseignée par la pharmacie
  if (!nomVille) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-8 text-center max-w-2xl mx-auto">
        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-600">
          <MapPinIcon className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-gray-800 mb-2">Ville non renseignée</h3>
        <p className="text-sm text-gray-500 mb-4 leading-relaxed">
          Pour afficher les statistiques des consultations effectuées dans votre zone géographique,
          veuillez renseigner la <strong>ville</strong> de votre pharmacie dans l’onglet <em>« Modifier les infos »</em>.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 text-red-700 rounded-2xl border border-red-200 flex flex-col items-center gap-3 text-center">
        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
          <ExclamationTriangleIcon className="w-6 h-6" />
        </div>
        <div>
          <h4 className="font-bold text-sm">Erreur de chargement</h4>
          <p className="text-xs text-red-600/90 mt-1">{error}</p>
        </div>
        <button
          onClick={fetchStatistiques}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow transition active:scale-95 cursor-pointer"
        >
          <ArrowPathIcon className="w-3.5 h-3.5" />
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* En-tête avec titre et total général */}
      <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4 bg-gray-50/50">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            Statistiques des consultations — {nomVille}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Nombre de fois où une offre de médicament a été sélectionnée auprès des pharmacies de votre ville
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-xs">
            {totalGeneral} consultation{totalGeneral !== 1 ? "s" : ""} au total
          </span>
          <button
            onClick={fetchStatistiques}
            title="Actualiser les statistiques"
            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {statistiques.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <p className="font-medium text-gray-700 mb-1">Aucune consultation enregistrée</p>
          <p className="text-xs text-gray-400">
            Aucun médicament n’a encore été consulté pour les pharmacies de {nomVille} sur MediSkip.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50/80 text-xs uppercase text-gray-500 font-semibold border-b border-gray-100">
              <tr>
                <th scope="col" className="px-6 py-4">Médicament</th>
                <th scope="col" className="px-6 py-4 text-right">Nombre de consultations dans votre ville</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {statistiques.map((item) => (
                <tr key={item.id_medicament || item.nom_medicament} className="hover:bg-emerald-50/30 transition-colors">
                  <td className="px-6 py-4 font-semibold text-gray-900">
                    {item.nom_medicament || "Médicament non spécifié"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center justify-center font-bold px-3 py-1 rounded-full text-xs bg-emerald-100/70 text-emerald-800">
                      {item.total_consultations}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
