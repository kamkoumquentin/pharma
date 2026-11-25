"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { 
  BuildingStorefrontIcon, 
  EnvelopeIcon, 
  LockClosedIcon, 
  PhotoIcon, 
  MapIcon,
  EyeIcon,
  EyeSlashIcon
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { logErreur } from "@/app/lib/logger";
import {
  ERREUR_TELEPHONE_PHARMACIE,
  normaliserEtValiderTelephonePharmacie,
} from "@/app/lib/telephonePharmacie";
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
  const operationEnCours = useRef(false);

  const [tab, settab] = useState({
    nom: "",
    email: "",
    telephone: "",
    password: "",
    ville: "",
    emplacement: "",
    longitude: "",
    latitude: "",
  });

  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [telephoneErreur, setTelephoneErreur] = useState("");

  // États pour la validation par code OTP
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  const handleOtpSuccess = async (session, userFromOtp) => {
    setShowOtpModal(false);
    if (session?.access_token) {
      localStorage.setItem("token_pharmacie", session.access_token);
      localStorage.setItem("role_pharmacie", "pharmacie");
    }

    // Récupérer l'utilisateur courant authentifié
    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData?.user || userFromOtp;
      if (currentUser?.id) {
        // Vérifier si la pharmacie existe déjà
        const { data: existingPharmacy } = await supabase
          .from("pharmacies")
          .select("id")
          .eq("owner_id", currentUser.id)
          .maybeSingle();

        if (!existingPharmacy) {
          const meta = currentUser.user_metadata || {};
          const pharmacieData = {
            nom: meta.nom || tab.nom.trim(),
            telephone: meta.telephone || tab.telephone.trim(),
            ville: meta.ville || tab.ville.trim(),
            emplacement: meta.emplacement || (tab.emplacement ? tab.emplacement.trim() : null),
            latitude: meta.latitude !== undefined && meta.latitude !== null ? parseFloat(meta.latitude) : parseFloat(tab.latitude),
            longitude: meta.longitude !== undefined && meta.longitude !== null ? parseFloat(meta.longitude) : parseFloat(tab.longitude),
            owner_id: currentUser.id,
            statut: "actif",
            etat: "normal",
            photo: null,
          };

          const { error: insertError } = await supabase
            .from("pharmacies")
            .insert(pharmacieData);

          if (insertError && insertError.code !== "23505") {
            logErreur("Inscription", "création pharmacie après confirmation OTP", insertError, {
              ownerId: currentUser.id,
            });
            showToast("Votre compte est activé, mais le profil n'a pas pu être créé automatiquement.", "error");
            nav.push("/admin");
            return;
          }
        }
      }
    } catch (err) {
      logErreur("Inscription", "initialisation pharmacie post-OTP", err);
    }

    showToast("Pharmacie activée et connectée avec succès !", "success");
    nav.push("/admin");
  };

  const executerAction = async (action) => {
    if (operationEnCours.current) return;
    operationEnCours.current = true;
    setLoading(true);
    try {
      await action();
    } finally {
      operationEnCours.current = false;
      setLoading(false);
    }
  };

  const inscription = async (e) => {
    e.preventDefault();
    if (operationEnCours.current) return;

    const resultatTelephone = normaliserEtValiderTelephonePharmacie(tab.telephone);
    if (!resultatTelephone.valide) {
      setTelephoneErreur(ERREUR_TELEPHONE_PHARMACIE);
      return;
    }
    setTelephoneErreur("");

    const champsValides = Boolean(
      tab.nom.trim() &&
      tab.email.trim() &&
      tab.ville.trim() &&
      tab.password.length >= 6 &&
      tab.longitude !== "" &&
      tab.latitude !== ""
    );
    if (!champsValides) {
      showToast("Veuillez remplir tous les champs obligatoires, y compris les coordonnées GPS.", "error");
      return;
    }

    const comptePourCreation = async () => {
      const emailClean = tab.email.trim().toLowerCase();
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailClean,
        password: tab.password,
        options: {
          data: {
            role: "pharmacie",
            nom: tab.nom.trim(),
            telephone: resultatTelephone.telephone,
            ville: tab.ville.trim(),
            emplacement: tab.emplacement ? tab.emplacement.trim() : null,
            latitude: parseFloat(tab.latitude),
            longitude: parseFloat(tab.longitude),
          },
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "https://auth.mediskip.space"}/admin`,
        },
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

      // Si une session directe a été fournie (ex. confirmation email désactivée)
      if (authData.session) {
        localStorage.setItem("token_pharmacie", authData.session.access_token);
        localStorage.setItem("role_pharmacie", "pharmacie");

        // Insérer directement le profil
        try {
          await supabase.from("pharmacies").insert({
            nom: tab.nom.trim(),
            telephone: resultatTelephone.telephone,
            ville: tab.ville.trim(),
            emplacement: tab.emplacement ? tab.emplacement.trim() : null,
            latitude: parseFloat(tab.latitude),
            longitude: parseFloat(tab.longitude),
            owner_id: authData.user.id,
            statut: "actif",
            etat: "normal",
            photo: null,
          });
        } catch (err) {
          console.warn("Erreur insertion directe profil :", err);
        }

        showToast("Pharmacie créée et connectée avec succès !", "success");
        nav.push("/admin");
      } else {
        // En attente de confirmation e-mail : ouvrir la modale OTP
        setPendingEmail(emailClean);
        setShowOtpModal(true);
      }
    };

    try {
      await executerAction(comptePourCreation);
    } catch (error) {
      showToast(error?.message || "Une erreur est survenue pendant l'inscription.", "error");
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

          {/* Phone Input */}
          <div className="flex flex-col space-y-1">
            <label htmlFor="telephone-pharmacie" className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
              Téléphone de la pharmacie *
            </label>
            <input
              id="telephone-pharmacie"
              value={tab.telephone}
              onChange={(e) => {
                settab({ ...tab, telephone: e.target.value });
                setTelephoneErreur("");
              }}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-required="true"
              aria-invalid={Boolean(telephoneErreur)}
              aria-describedby={telephoneErreur ? "telephone-erreur" : "telephone-aide"}
              className="w-full h-11 px-4 bg-emerald-50/20 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition text-sm text-gray-700"
              placeholder="+237 6XX XXX XXX"
            />
            {telephoneErreur && (
              <p id="telephone-erreur" role="alert" className="text-sm text-rose-700">
                {telephoneErreur}
              </p>
            )}
            <p id="telephone-aide" className="text-xs text-gray-500">
              Ce numéro est visible par les patients (appel et WhatsApp). Utilisez le numéro de la pharmacie. Un numéro mobile, commençant par 6, permet aussi de recevoir des messages WhatsApp.
            </p>
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
                type={showPassword ? "text" : "password"}
                minLength={6}
                autoComplete="new-password"
                className="w-full h-11 pl-11 pr-11 bg-emerald-50/20 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition text-sm text-gray-700"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={showPassword}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-700 focus:outline-none focus:text-emerald-700 transition cursor-pointer p-0.5"
              >
                {showPassword ? (
                  <EyeSlashIcon className="w-4 h-4" />
                ) : (
                  <EyeIcon className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Ville Input */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
              Ville *
            </label>
            <div className="relative">
              <MapIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600/70" />
              <input
                value={tab.ville}
                onChange={(e) => settab({ ...tab, ville: e.target.value })}
                required
                type="text"
                className="w-full h-11 pl-11 pr-4 bg-emerald-50/20 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition text-sm text-gray-700"
                placeholder="Ex: Bafoussam, Douala, Yaoundé..."
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

          {/* Logo / Image info */}
          <div className="flex flex-col space-y-1 bg-gray-50 border border-gray-200 rounded-xl p-3.5">
            <div className="flex items-center space-x-2">
              <PhotoIcon className="w-5 h-5 text-emerald-600" />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Logo de la pharmacie</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Vous pourrez ajouter le logo de votre pharmacie en toute simplicité depuis l&apos;onglet Réglages / Ma pharmacie une fois votre compte activé.
            </p>
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