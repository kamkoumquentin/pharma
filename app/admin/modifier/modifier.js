"use client";

import { useState, useEffect, useRef } from "react";
import { 
  PencilIcon, 
  PhotoIcon, 
  ArrowPathIcon 
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

const MedicalMapPinIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
    <path d="M9.5 8h5v2h-5z" fill="white" />
    <path d="M11 6.5h2v5h-2z" fill="white" />
  </svg>
);

export default function Modification({ info, token, onUpdate }) {
  const [nom, setNom] = useState("");
  const [emplacement, setEmplacement] = useState("");
  const [coordonnees, setCoordonnees] = useState({ lat: null, lng: null });
  const [photo, setPhoto] = useState(null);
  const [photoName, setPhotoName] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  
  const fileInputRef = useRef(null);
  const showToast = useToast();

  // Initialiser les champs avec les données actuelles
  useEffect(() => {
    if (info) {
      setNom(info.nom || "");
      setEmplacement(info.emplacement || "");
      setCoordonnees({ lat: info.latitude || null, lng: info.longitude || null });
      setPhotoPreview(info.photo || "");
    }
  }, [info]);

  const changerPosition = () => {
    setGpsLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoordonnees({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          showToast("Position GPS mise à jour avec succès !", "success");
          setGpsLoading(false);
        },
        (error) => {
          showToast("Erreur lors de la récupération de la position : " + error.message, "error");
          setGpsLoading(false);
        }
      );
    } else {
      showToast("La géolocalisation n'est pas supportée par votre navigateur.", "error");
      setGpsLoading(false);
    }
  };

  const valider = async (e) => {
    e.preventDefault();
    if (!info || !info.id) {
      showToast("Erreur : Identifiant de pharmacie introuvable.", "error");
      return;
    }
    
    setLoading(true);
    try {
      const modifications = {
        nom: nom.trim(),
        emplacement: emplacement.trim(),
      };

      if (coordonnees.lat !== null) modifications.latitude = parseFloat(coordonnees.lat);
      if (coordonnees.lng !== null) modifications.longitude = parseFloat(coordonnees.lng);

      if (photo) {
        try {
          const ext = photo.name.split('.').pop();
          const filename = `logos/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("pharmacie-photos")
            .upload(filename, photo, { upsert: true });

          if (!upErr) {
            const { data: urlData } = supabase.storage
              .from("pharmacie-photos")
              .getPublicUrl(filename);
            modifications.photo = urlData?.publicUrl || photoPreview;
          }
        } catch (storageErr) {
          console.error("Erreur upload photo pharmacie:", storageErr);
        }
      }

      const { data: updatedData, error: updateErr } = await supabase
        .from("pharmacies")
        .update(modifications)
        .eq("id", info.id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      showToast("Modifications enregistrées avec succès !", "success");
      if (onUpdate && updatedData) {
        onUpdate(updatedData);
      }
    } catch (error) {
      console.error("Erreur lors de la sauvegarde :", error);
      showToast("Erreur lors de la sauvegarde des modifications.", "error");
    } finally {
      setLoading(false);
    }
  };

  const annuler = () => {
    if (info) {
      setNom(info.nom || "");
      setEmplacement(info.emplacement || "");
      setCoordonnees({ lat: info.latitude || null, lng: info.longitude || null });
      setPhotoPreview(info.photo || "");
    }
    setPhoto(null);
    setPhotoName("");
    showToast("Modifications annulées.", "info");
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhoto(file);
      setPhotoName(file.name);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200/60 shadow-sm p-8">
      
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
          <PencilIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-gray-800 text-lg">Paramètres Pharmacie</h2>
          <p className="text-xs text-gray-400">Modifiez les informations publiques de votre pharmacie</p>
        </div>
      </div>

      <form onSubmit={valider} className="space-y-5">
        
        {/* Nom */}
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Nom de la pharmacie *
          </label>
          <input 
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition" 
            type="text" 
            placeholder="Nouveau nom" 
          />
        </div>

        {/* Emplacement */}
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Emplacement physique
          </label>
          <div className="relative">
            <MedicalMapPinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600/70" />
            <input 
              value={emplacement}
              onChange={(e) => setEmplacement(e.target.value)}
              className="w-full h-11 pl-11 pr-4 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition" 
              type="text" 
              placeholder="Ex: Face hôpital de district" 
            />
          </div>
        </div>

        {/* Logo / Image upload */}
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Modifier le logo / la photo
          </label>
          <input 
            type="file" 
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          {photoPreview ? (
            <div className="relative border border-gray-200 rounded-xl p-3 bg-gray-50 flex items-center space-x-4">
              <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-white flex-shrink-0 flex items-center justify-center">
                <img src={photoPreview} alt="Aperçu logo" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {photoName || "Logo actuel"}
                </p>
                <p className="text-[10px] text-gray-400">
                  {photo ? "Nouvelle image sélectionnée" : "Image existante"}
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
              <span className="truncate max-w-[200px]">
                Choisir un nouveau logo...
              </span>
            </button>
          )}
        </div>

        {/* GPS Coordinates */}
        <div className="flex items-center justify-between bg-emerald-50/30 border border-emerald-100 rounded-xl p-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Position GPS enregistrée</span>
            <span className="text-xs text-gray-700 font-mono mt-1 font-semibold">
              {coordonnees.lat && coordonnees.lng 
                ? `Lat: ${Number(coordonnees.lat).toFixed(6)}, Lng: ${Number(coordonnees.lng).toFixed(6)}`
                : "Non spécifiée"
              }
            </span>
          </div>
          <button 
            type="button"
            onClick={changerPosition}
            disabled={gpsLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${gpsLoading ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>

        {/* Action Buttons */}
        <div className="w-full border-t border-gray-100 pt-6 mt-6 flex justify-end gap-3">
          <button 
            type="button"
            onClick={annuler}
            className="px-6 py-2.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-600 transition cursor-pointer shadow-sm"
          >
            Annuler
          </button>
          <button 
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/15 active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Enregistrement..." : "Valider les modifications"}
          </button>
        </div>

      </form>
    </div>
  );
}