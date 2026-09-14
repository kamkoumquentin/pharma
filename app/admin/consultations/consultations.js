"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/app/lib/supabaseClient";

export default function Consultations({ pharmacieId, token }) {
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchConsultations();
  }, [pharmacieId]);

  const fetchConsultations = async () => {
    if (!pharmacieId) return;
    
    setLoading(true);
    setError(null);
    try {
      const { data, error: sbError } = await supabase
        .from("consultations")
        .select(`
          *,
          medicaments ( id, nom ),
          utilisateur ( id, nom, prenom, telephone )
        `)
        .eq("id_pharmacie", pharmacieId)
        .order("created_at", { ascending: false });

      if (sbError) throw sbError;
      setConsultations(data || []);
    } catch (err) {
      console.error("Erreur lors de la récupération des consultations:", err);
      setError("Impossible de charger les consultations.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h2 className="text-lg font-bold text-gray-800">Historique des Consultations</h2>
        <span className="bg-emerald-100 text-emerald-800 text-xs font-medium px-2.5 py-1 rounded-full">
          {consultations.length} consultation{consultations.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      {consultations.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <p>Aucune consultation trouvée pour votre pharmacie.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50/80 text-xs uppercase text-gray-500 font-semibold border-b border-gray-100">
              <tr>
                <th scope="col" className="px-6 py-4">Date</th>
                <th scope="col" className="px-6 py-4">Patient</th>
                <th scope="col" className="px-6 py-4">Médicament Recherché</th>
                <th scope="col" className="px-6 py-4">Téléphone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {consultations.map((c) => (
                <tr key={c.id} className="hover:bg-emerald-50/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                    {new Date(c.created_at).toLocaleDateString('fr-FR', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    })}
                  </td>
                  <td className="px-6 py-4">
                    {c.utilisateur ? `${c.utilisateur.nom || ''} ${c.utilisateur.prenom || ''}`.trim() || 'Anonyme' : 'Anonyme'}
                  </td>
                  <td className="px-6 py-4 text-emerald-700 font-medium">
                    {c.medicaments?.nom || 'Non spécifié'}
                  </td>
                  <td className="px-6 py-4">
                    {c.utilisateur?.telephone || '-'}
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
