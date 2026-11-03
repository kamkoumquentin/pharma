"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { 
  PencilIcon, 
  ArrowPathIcon,
  MapIcon 
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

export default function Modification({
  info,
  token,
  onUpdate,
  section,
  embedded = false,
  onTabStateChange,
}) {
  const [nom, setNom] = useState(info?.nom || "");
  const [ville, setVille] = useState(info?.ville || "");
  const [emplacement, setEmplacement] = useState(info?.emplacement || "");
  const [coordonnees, setCoordonnees] = useState({
    lat: info?.latitude ?? null,
    lng: info?.longitude ?? null,
  });
  const [photo, setPhoto] = useState(null);
  const [photoName, setPhotoName] = useState("");
  const [photoPreview, setPhotoPreview] = useState(info?.photo || "");
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  
  const fileInputRef = useRef(null);
  const showToast = useToast();

  const valeursInitiales = useMemo(() => ({
    nom: info?.nom || "",
    ville: info?.ville || "",
    emplacement: info?.emplacement || "",
    latitude: info?.latitude ?? null,
    longitude: info?.longitude ?? null,
    photo: info?.photo || "",
  }), [info]);

  const estModifie = Boolean(
    nom !== valeursInitiales.nom ||
    ville !== valeursInitiales.ville ||
    emplacement !== valeursInitiales.emplacement ||
    coordonnees.lat !== valeursInitiales.latitude ||
    coordonnees.lng !== valeursInitiales.longitude ||
    photo
  );

  const annuler = useCallback(() => {
    setNom(info?.nom || "");
    setVille(info?.ville || "");
    setEmplacement(info?.emplacement || "");
    setCoordonnees({ lat: info?.latitude ?? null, lng: info?.longitude ?? null });
    setPhoto(null);
    setPhotoName("");
    setPhotoPreview(info?.photo || "");
  }, [info]);

  const sauvegarder = useCallback(async () => {
    if (!info?.id) {
      return { success: false, error: "Identifiant de pharmacie introuvable." };
    }
    if (section === "general" && !nom.trim()) {
      return { success: false, error: "Le nom de la pharmacie est obligatoire." };
    }

    setLoading(true);
    try {
      const modifications = section === "general"
        ? { nom: nom.trim() }
        : {
            ville: ville.trim() || null,
            emplacement: emplacement.trim(),
          };
      if (section === "adresse" && coordonnees.lat !== null) {
        modifications.latitude = parseFloat(coordonnees.lat);
      }
      if (section === "adresse" && coordonnees.lng !== null) {
        modifications.longitude = parseFloat(coordonnees.lng);
      }

      let erreurLogo = null;
      if (section === "general" && photo) {
        try {
          const ext = photo.name.split(".").pop();
          const filename = `logos/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("pharmacie-photos")
            .upload(filename, photo);

          if (upErr) {
            erreurLogo = upErr.message || "le stockage a refusé l’envoi";
          } else {
            const { data: urlData } = supabase.storage
              .from("pharmacie-photos")
              .getPublicUrl(filename);
            if (urlData?.publicUrl) modifications.photo = urlData.publicUrl;
            else erreurLogo = "URL publique du logo indisponible";
          }
        } catch (storageErr) {
          console.error("Erreur upload photo pharmacie:", storageErr);
          erreurLogo = storageErr?.message || "erreur inattendue pendant l’envoi";
        }
      }

      const { data: updatedData, error: updateErr } = await supabase
        .from("pharmacies")
        .update(modifications)
        .eq("id", info.id)
        .select()
        .single();

      if (updateErr) {
        console.error("Échec de la mise à jour du profil pharmacie :", updateErr);
        return {
          success: false,
          error: erreurLogo
            ? `Le logo n’a pas pu être envoyé (${erreurLogo}) et aucune modification n’a été enregistrée.`
            : updateErr.message || "Échec de l’enregistrement des modifications.",
        };
      }

      onUpdate?.(updatedData);
      if (section === "general" && !erreurLogo) {
        setNom(updatedData.nom || "");
        setPhoto(null);
        setPhotoName("");
        setPhotoPreview(updatedData.photo || "");
      } else if (section === "general") {
        setNom(updatedData.nom || "");
      } else {
        setVille(updatedData.ville || "");
        setEmplacement(updatedData.emplacement || "");
        setCoordonnees({
          lat: updatedData.latitude ?? null,
          lng: updatedData.longitude ?? null,
        });
      }
      return {
        success: true,
        warning: erreurLogo ? `Le logo n’a pas pu être envoyé (${erreurLogo}).` : "",
      };
    } catch (error) {
      console.error("Erreur lors de la sauvegarde :", error);
      return { success: false, error: error?.message || "Erreur lors de la sauvegarde." };
    } finally {
      setLoading(false);
    }
  }, [coordonnees.lat, coordonnees.lng, emplacement, info, nom, onUpdate, photo, section, ville]);

  useEffect(() => {
    onTabStateChange?.(section, { dirty: estModifie, cancel: annuler, save: sauvegarder, loading });
  }, [annuler, estModifie, loading, onTabStateChange, sauvegarder, section]);

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
    const result = await sauvegarder();
    if (!embedded) {
      showToast(
        result.success
          ? result.warning || "Modifications enregistrées avec succès !"
          : result.error,
        result.success && !result.warning ? "success" : "error"
      );
    }
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
    <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
      
      {!embedded && <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
          <PencilIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-gray-800 text-lg">Paramètres Pharmacie</h2>
          <p className="text-xs text-gray-400">Modifiez les informations publiques de votre pharmacie</p>
        </div>
      </div>}

      <form onSubmit={valider} className="space-y-4">
        
        {section === "general" && <>
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
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Logo de la pharmacie
          </label>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
              {photoPreview
                ? <img src={photoPreview} alt="Aperçu du logo" className="h-full w-full object-cover" />
                : <div className="flex h-full items-center justify-center text-xs text-gray-400">Logo</div>}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              Choisir un nouveau logo
            </button>
            {photoName && <span className="truncate text-xs text-gray-500">{photoName}</span>}
          </div>
        </div>
        </>}

        {section === "adresse" && <>
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Ville
          </label>
          <div className="relative">
            <MapIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600/70" />
            <input 
              value={ville}
              onChange={(e) => setVille(e.target.value)}
              className="w-full h-11 pl-11 pr-4 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition" 
              type="text" 
              placeholder="Ex: Bafoussam, Douala, Yaoundé..." 
            />
          </div>
        </div>

        {/* Emplacement */}
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Quartier
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
        </>}

        {/* Action Buttons */}
        {!embedded && <div className="w-full border-t border-gray-100 pt-6 mt-6 flex justify-end gap-3">
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
        </div>}

      </form>
    </div>
  );
}