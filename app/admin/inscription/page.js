"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { 
  BuildingStorefrontIcon, 
  EnvelopeIcon, 
  LockClosedIcon, 
  PhotoIcon, 
  MapIcon 
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";
import OtpModal from "@/app/components/OtpModal";

const MedicalMapPinIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
    <path d="M9.5 8h5v2h-5z" fill="white" />
    <path d="M11 6.5h2v5h-2z" fill="white" />
  </svg>
);

export default function Inscription() {
  const nav = useRouter();
  const showToast = useToast();
  const fileInputRef = useRef(null);

  const [tab, settab] = useState({
    nom: "",
    email: "",
    password: "",
    emplacement: "",
    longitude: "",
    latitude: "",
    photo: null,
  });

  const [photoName, setPhotoName] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // États pour la validation par code OTP
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  const handleOtpSuccess = (session) => {
    setShowOtpModal(false);
    if (session?.access_token) {
      localStorage.setItem("token_pharmacie", session.access_token);
      localStorage.setItem("role_pharmacie", "pharmacie");
    }
    showToast("Pharmacie activée et connectée avec succès !", "success");
    nav.push("/admin");
  };

  const inscription = async (e) => {
    e.preventDefault();

    if (
      tab.nom.trim().length > 0 &&
      tab.email.trim().length > 0 &&
      tab.password.length >= 6 &&
      tab.longitude !== "" &&
      tab.latitude !== ""
    ) {
      setLoading(true);

      try {
        // 1. Authentification Supabase
        const emailClean = tab.email.trim().toLowerCase();
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: emailClean,
          password: tab.password,
          options: { data: { role: "pharmacie" } },
        });

        if (authError) {
          const msg = authError.message ? authError.message.toLowerCase() : "";
          if (msg.includes("user already registered") || msg.includes("already registered") || msg.includes("email already in use")) {
            showToast("Cette adresse email est déjà associée à un compte. Veuillez vous connecter.", "error");
          } else if (msg.includes("password should be at least")) {
            showToast("Le mot de passe doit contenir au moins 6 caractères.", "error");
          } else if (msg.includes("invalid format") || msg.includes("unable to validate email")) {
            showToast("Format d'adresse email invalide.", "error");
          } else {
            showToast(authError.message || "Erreur lors de la création du compte.", "error");
          }
          return;
        }

        if (!authData?.user) {
          showToast("Création du compte impossible. Veuillez vérifier vos informations.", "error");
          return;
        }

        // 2. Upload de photo sur Supabase Storage si fournie
        let photoUrl = null;
        if (tab.photo) {
          try {
            const ext = tab.photo.name.split('.').pop();
            const filename = `logos/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
            const { error: uploadError } = await supabase.storage
              .from("pharmacie-photos")
              .upload(filename, tab.photo, { upsert: true });

            if (uploadError) {
              console.warn("Erreur storage upload (falling back):", uploadError);
            } else {
              const { data: urlData } = supabase.storage
                .from("pharmacie-photos")
                .getPublicUrl(filename);
              photoUrl = urlData?.publicUrl || null;
            }
          } catch (storageErr) {
            console.error("Erreur upload photo:", storageErr);
          }
        }

        // 3. Insertion du profil pharmacie dans la table public.pharmacies
        const { data: profilData, error: dbError } = await supabase
          .from("pharmacies")
          .insert({
            nom: tab.nom.trim(),
            longitude: parseFloat(tab.longitude),
            latitude: parseFloat(tab.latitude),
            photo: photoUrl,
            password: authData.user.id,
            emplacement: tab.emplacement ? tab.emplacement.trim() : null,
            statut: "actif",
            etat: "normal",
          })
          .select()
          .single();

        if (dbError) {
          console.error("Erreur insertion table pharmacies:", dbError);
          if (dbError.code === "23505") {
            const detail = (dbError.message || "").toLowerCase();
            if (detail.includes("nom")) {
              showToast(`Le nom de pharmacie "${tab.nom}" est déjà utilisé. Veuillez en choisir un autre.`, "error");
            } else {
              showToast("Cette pharmacie ou cette information est déjà enregistrée sur la plateforme.", "error");
            }
          } else if (dbError.code === "42501") {
            showToast("Accès refusé par la politique de sécurité de la base de données.", "error");
          } else {
            showToast(dbError.message || "Erreur lors de l'enregistrement du profil pharmacie.", "error");
          }
          return;
        }

        if (authData.session) {
          localStorage.setItem("token_pharmacie", authData.session.access_token);
          localStorage.setItem("role_pharmacie", "pharmacie");
          showToast("Pharmacie créée et connectée avec succès !", "success");
          nav.push("/admin");
        } else {
          // L'email avec le code OTP a été envoyé
          setPendingEmail(emailClean);
          setShowOtpModal(true);
        }
      } catch (error) {
        console.error("Erreur inscription:", error);
        showToast("Une erreur est survenue lors de la création de la pharmacie.", "error");
      } finally {
        setLoading(false);
      }
    } else {
      showToast(
        "Veuillez remplir tous les champs obligatoires (nom, email, mot de passe de min 6 caract., et position)",
        "error"
      );
    }
  };

  const getposition = () => {
    setGpsLoading(true);
    if (!navigator.geolocation) {
      showToast("La géolocalisation n'est pas supportée par votre navigateur.", "error");
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        settab((prev) => ({
          ...prev,
          longitude: position.coords.longitude.toFixed(6),
          latitude: position.coords.latitude.toFixed(6),
        }));
        showToast("Coordonnées GPS chargées avec succès !", "success");
        setGpsLoading(false);
      },
      (error) => {
        showToast("Erreur de géolocalisation: " + error.message, "error");
        setGpsLoading(false);
      }
    );
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      settab((prev) => ({ ...prev, photo: file }));
      setPhotoName(file.name);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/50 flex justify-center items-center py-10 px-4">
      <div className="w-full max-w-xl bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-emerald-100/50 p-8 flex flex-col justify-around items-center transition-all duration-300 hover:shadow-2xl">
        
        {/* Header */}
        <div className="flex flex-col items-center space-y-2 mb-6 w-full text-center">
          <div className="w-14 h-14 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-md shadow-emerald-200">
            <BuildingStorefrontIcon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="font-roboto font-bold text-xl text-emerald-950 uppercase tracking-wide">
              Création de Pharmacie
            </h1>
            <p className="text-gray-500 text-xs">
              Inscrivez votre établissement pour commencer à gérer votre stock en ligne
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={inscription} className="w-full flex flex-col space-y-4">
          
          {/* Nom Input */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
              Nom de la pharmacie *
            </label>
            <div className="relative">
              <BuildingStorefrontIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600/70" />
              <input
                onChange={(e) => settab({ ...tab, nom: e.target.value })}
                required
                type="text"
                className="w-full h-11 pl-11 pr-4 bg-emerald-50/20 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition text-sm text-gray-700"
                placeholder="Ex: Pharmacie du Centre"
              />
            </div>
          </div>

          {/* Email Input */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
              Adresse email *
            </label>
            <div className="relative">
              <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600/70" />
              <input
                onChange={(e) => settab({ ...tab, email: e.target.value })}
                required
                type="email"
                className="w-full h-11 pl-11 pr-4 bg-emerald-50/20 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition text-sm text-gray-700"
                placeholder="Ex: contact@pharmaciecentre.com"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
              Mot de passe * (min. 6 caractères)
            </label>
            <div className="relative">
              <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600/70" />
              <input
                onChange={(e) => settab({ ...tab, password: e.target.value })}
                required
                type="password"
                minLength={6}
                className="w-full h-11 pl-11 pr-4 bg-emerald-50/20 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition text-sm text-gray-700"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Emplacement Input */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
              Emplacement physique
            </label>
            <div className="relative">
              <MedicalMapPinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600/70" />
              <input
                onChange={(e) => settab({ ...tab, emplacement: e.target.value })}
                type="text"
                className="w-full h-11 pl-11 pr-4 bg-emerald-50/20 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition text-sm text-gray-700"
                placeholder="Ex: Face hôpital de district, à côté du marché"
              />
            </div>
          </div>

          {/* Logo / Image Picker */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
              Photo ou Logo de la pharmacie
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
                  <p className="text-xs font-semibold text-gray-700 truncate">{photoName}</p>
                  <p className="text-[10px] text-emerald-600 font-medium">Sélectionné</p>
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
                className="w-full h-12 border border-dashed border-gray-300 rounded-xl flex items-center justify-center space-x-2 text-gray-500 hover:border-emerald-500 hover:bg-emerald-50/20 transition cursor-pointer text-sm"
              >
                <PhotoIcon className="w-5 h-5 text-emerald-600" />
                <span>Choisir un logo ou une photo</span>
              </button>
            )}
          </div>

          {/* GPS Coordinates Section */}
          <div className="flex flex-col space-y-1 bg-emerald-50/30 border border-emerald-100 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MapIcon className="w-5 h-5 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Coordonnées GPS *</span>
              </div>
              <button
                type="button"
                onClick={getposition}
                disabled={gpsLoading}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg active:scale-95 shadow transition disabled:opacity-50 cursor-pointer"
              >
                {gpsLoading ? "Chargement..." : "Géolocaliser"}
              </button>
            </div>
            <div className="mt-2 text-[11px] text-gray-500 font-mono text-center bg-white/70 p-2 rounded-lg border border-emerald-100/50">
              {tab.longitude && tab.latitude ? (
                <span className="text-emerald-700 font-semibold">
                  Longitude: {tab.longitude} | Latitude: {tab.latitude}
                </span>
              ) : (
                <span className="text-gray-400">Cliquez sur Géolocaliser pour charger votre position</span>
              )}
            </div>
          </div>

          {/* Buttons Footer */}
          <div className="w-full border-t border-emerald-100/50 pt-4 flex justify-between space-x-4">
            <button
              type="button"
              className="flex-1 h-11 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 font-semibold transition active:scale-[0.98] cursor-pointer text-sm"
              onClick={() => nav.push("/admin/connexion")}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg active:scale-[0.98] transition disabled:opacity-50 cursor-pointer text-sm"
            >
              {loading ? "Création..." : "Créer la pharmacie"}
            </button>
          </div>
        </form>

        <div className="w-full mt-4 flex justify-center text-xs">
          <Link
            className="text-emerald-600 hover:text-emerald-700 font-semibold hover:underline transition"
            href="/admin/connexion"
          >
            Se connecter à la place
          </Link>
        </div>

      </div>

      {/* Modal de validation du code OTP */}
      <OtpModal
        isOpen={showOtpModal}
        email={pendingEmail}
        onSuccess={handleOtpSuccess}
        onClose={() => setShowOtpModal(false)}
      />

    </div>
  );
}