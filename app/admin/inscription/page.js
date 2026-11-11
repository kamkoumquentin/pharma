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
  const fileInputRef = useRef(null);
  const operationEnCours = useRef(false);
  const compteCreeRef = useRef(null);

  const [tab, settab] = useState({
    nom: "",
    email: "",
    telephone: "",
    password: "",
    ville: "",
    emplacement: "",
    longitude: "",
    latitude: "",
    photo: null,
  });

  const [photoName, setPhotoName] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [telephoneErreur, setTelephoneErreur] = useState("");
  const [logoErreur, setLogoErreur] = useState("");

  // États pour la validation par code OTP
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  // Envoi du logo manqué : le compte est déjà créé, l'utilisateur choisit de
  // réessayer l'envoi ou de continuer sans logo.
  const [echecLogo, setEchecLogo] = useState(null);
  const [compteCree, setCompteCree] = useState(null);
  const [erreurCreationProfil, setErreurCreationProfil] = useState("");
  const [profilCree, setProfilCree] = useState(null);
  const [logoEnAttente, setLogoEnAttente] = useState(null);

  const handleOtpSuccess = (session) => {
    setShowOtpModal(false);
    if (session?.access_token) {
      localStorage.setItem("token_pharmacie", session.access_token);
      localStorage.setItem("role_pharmacie", "pharmacie");
    }
    showToast("Pharmacie activée et connectée avec succès !", "success");
    nav.push("/admin");
  };

  const finaliserInscription = (compte) => {
    setEchecLogo(null);
    if (compte.session) {
      localStorage.setItem("token_pharmacie", compte.session.access_token);
      localStorage.setItem("role_pharmacie", "pharmacie");
      showToast("Pharmacie créée et connectée avec succès !", "success");
      nav.push("/admin");
    } else {
      setPendingEmail(compte.email);
      setShowOtpModal(true);
    }
  };

  const insererProfil = async (compte) => {
    try {
      const { data, error } = await supabase
        .from("pharmacies")
        .insert({
          ...compte.pharmacie,
          owner_id: compte.id,
          photo: null,
        })
        .select("id")
        .single();

      let profil = data;
      if (error?.code === "23505") {
        const { data: profilExistant } = await supabase
          .from("pharmacies")
          .select("id")
          .eq("owner_id", compte.id)
          .maybeSingle();
        profil = profilExistant;
      }

      if (!profil || (error && error.code !== "23505")) {
        setErreurCreationProfil(
          error?.message || "La ligne de pharmacie n'a pas été retournée par la base de données."
        );
        return null;
      }

      setErreurCreationProfil("");
      setProfilCree(profil);
      return profil;
    } catch (error) {
      setErreurCreationProfil(error?.message || "Erreur inconnue lors de la création de la pharmacie.");
      return null;
    }
  };

  const envoyerLogoEtMettreAJourProfil = async (compte, profil, fichier) => {
    try {
      const ext = fichier.name.split(".").pop().toLowerCase();
      const filename = `logos/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("pharmacie-photos")
        .upload(filename, fichier);

      if (uploadError) {
        return { error: uploadError.message || "Le stockage a refusé l'envoi." };
      }

      const { data: urlData } = supabase.storage
        .from("pharmacie-photos")
        .getPublicUrl(filename);
      const url = urlData?.publicUrl || null;
      if (!url) return { error: "URL publique du logo indisponible." };

      const { data, error } = await supabase
        .from("pharmacies")
        .update({ photo: url })
        .eq("id", profil.id)
        .eq("owner_id", compte.id)
        .select("id")
        .single();

      if (error || !data) {
        if (error) setLogoEnAttente({ url, profil });
        return { error: error?.message || "La photo n'a pas été liée à la pharmacie." };
      }

      setProfilCree(data);
      setLogoEnAttente(null);
      return { data };
    } catch (error) {
      return { error: error?.message || "Erreur inconnue pendant l'envoi du logo." };
    }
  };

  const creerProfilEtTerminer = async (compte) => {
    const profil = await insererProfil(compte);
    if (!profil) return;

    if (compte.fichierLogo) {
      const resultatLogo = await envoyerLogoEtMettreAJourProfil(compte, profil, compte.fichierLogo);
      if (resultatLogo.error) {
        setEchecLogo({ message: resultatLogo.error });
        return;
      }
    }

    finaliserInscription(compte);
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

  const reessayerCreationProfil = async () => {
    const compte = compteCreeRef.current;
    if (!compte || operationEnCours.current) return;
    await executerAction(() => creerProfilEtTerminer(compte));
  };

  const reessayerEnvoiLogo = async () => {
    const compte = compteCreeRef.current;
    if (!compte || !profilCree || !compte.fichierLogo || operationEnCours.current) return;
    await executerAction(async () => {
      try {
        if (logoEnAttente) {
          const { data, error } = await supabase
            .from("pharmacies")
            .update({ photo: logoEnAttente.url })
            .eq("id", logoEnAttente.profil.id)
            .eq("owner_id", compte.id)
            .select("id")
            .single();

          if (error || !data) {
            setEchecLogo({ message: error?.message || "La photo n'a pas été liée à la pharmacie." });
            return;
          }
          setProfilCree(data);
          setLogoEnAttente(null);
        } else {
          const resultatLogo = await envoyerLogoEtMettreAJourProfil(compte, profilCree, compte.fichierLogo);
          if (resultatLogo.error) {
            setEchecLogo({ message: resultatLogo.error });
            return;
          }
        }
        finaliserInscription(compte);
      } catch (error) {
        setEchecLogo({ message: error?.message || "Erreur inconnue pendant l'envoi du logo." });
      }
    });
  };

  const continuerSansLogo = async () => {
    const compte = compteCreeRef.current;
    if (!compte || !profilCree || operationEnCours.current) return;
    await executerAction(() => finaliserInscription(compte));
  };

  const inscription = async (e) => {
    e.preventDefault();
    if (operationEnCours.current) return;

    const compteExistant = compteCreeRef.current;
    if (compteExistant) {
      if (!profilCree) await reessayerCreationProfil();
      return;
    }

    setErreurCreationProfil("");
    setEchecLogo(null);
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

    let fichierLogo = tab.photo;
    if (fichierLogo) {
      const typesAutorises = ["image/jpeg", "image/png", "image/webp"];
      if (!typesAutorises.includes(fichierLogo.type)) {
        setLogoErreur("Formats acceptés : JPEG, PNG ou WebP. L'inscription peut continuer sans logo.");
        fichierLogo = null;
      } else if (fichierLogo.size > 5 * 1024 * 1024) {
        setLogoErreur("Le logo ne doit pas dépasser 5 Mo. L'inscription peut continuer sans logo.");
        fichierLogo = null;
      }
    }

    const comptePourCreation = async () => {
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

      const compte = {
        id: authData.user.id,
        session: authData.session,
        email: emailClean,
        fichierLogo,
        pharmacie: {
          nom: tab.nom.trim(),
          ville: tab.ville.trim(),
          longitude: parseFloat(tab.longitude),
          latitude: parseFloat(tab.latitude),
          telephone: resultatTelephone.telephone,
          emplacement: tab.emplacement ? tab.emplacement.trim() : null,
          statut: "actif",
          etat: "normal",
        },
      };
      compteCreeRef.current = compte;
      setCompteCree(compte);
      await creerProfilEtTerminer(compte);
    };

    try {
      await executerAction(comptePourCreation);
    } catch (error) {
      showToast(error?.message || "Une erreur est survenue pendant l'inscription.", "error");
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const typesAutorises = ["image/jpeg", "image/png", "image/webp"];
    if (!typesAutorises.includes(file.type)) {
      settab((prev) => ({ ...prev, photo: null }));
      setPhotoName("");
      setPhotoPreview("");
      setLogoErreur("Formats acceptés : JPEG, PNG ou WebP. L'inscription peut continuer sans logo.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      settab((prev) => ({ ...prev, photo: null }));
      setPhotoName("");
      setPhotoPreview("");
      setLogoErreur("Le logo ne doit pas dépasser 5 Mo. L'inscription peut continuer sans logo.");
      e.target.value = "";
      return;
    }

    setLogoErreur("");
    settab((prev) => ({ ...prev, photo: file }));
    setPhotoName(file.name);
    setPhotoPreview(URL.createObjectURL(file));
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
          {echecLogo && (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              <p className="font-semibold">
                Compte créé. Le logo n&apos;a pas pu être envoyé : vous pourrez l&apos;ajouter dans Ma pharmacie.
              </p>
              <p className="mt-1 text-amber-800">
                Détail : {echecLogo.message}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={reessayerEnvoiLogo}
                  disabled={loading}
                  className="h-9 px-3 rounded-lg bg-amber-600 text-white font-semibold text-xs hover:bg-amber-700 transition disabled:opacity-50 cursor-pointer"
                >
                  Réessayer l’envoi du logo
                </button>
                <button
                  type="button"
                  onClick={continuerSansLogo}
                  disabled={loading}
                  className="h-9 px-3 rounded-lg border border-amber-300 bg-white text-amber-800 font-semibold text-xs hover:bg-amber-100 transition disabled:opacity-50 cursor-pointer"
                >
                  Continuer sans logo
                </button>
              </div>
            </div>
          )}
          {erreurCreationProfil && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
            >
              <p className="font-semibold">Le compte a été créé, mais la pharmacie n&apos;a pas pu être enregistrée.</p>
              <p className="mt-1">{erreurCreationProfil}</p>
              <button
                type="button"
                onClick={reessayerCreationProfil}
                disabled={loading}
                className="mt-3 h-9 rounded-lg bg-rose-700 px-3 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:opacity-50"
              >
                Réessayer
              </button>
            </div>
          )}
          
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

          {/* Logo / Image Picker */}
          <div className="flex flex-col space-y-1">
            <label className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
              Photo ou Logo de la pharmacie
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
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
            {logoErreur && (
              <p role="alert" className="text-sm text-rose-700">
                {logoErreur}
              </p>
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
              disabled={loading || Boolean(echecLogo) || Boolean(compteCree)}
              className="flex-1 h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg active:scale-[0.98] transition disabled:opacity-50 cursor-pointer text-sm"
            >
              {loading
                ? "Création..."
                : echecLogo
                  ? "Choisissez une option ci-dessus"
                  : compteCree
                    ? "Compte déjà créé"
                    : "Créer la pharmacie"}
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