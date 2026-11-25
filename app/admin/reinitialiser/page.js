"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { logErreur } from "@/app/lib/logger";
import { useToast } from "@/app/components/Toast";

export default function Reinitialiser() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sessionValide, setSessionValide] = useState(false);
  const [erreurLien, setErreurLien] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const navigate = useRouter();
  const showToast = useToast();

  useEffect(() => {
    let mounted = true;

    const verifierSession = async () => {
      if (typeof window === "undefined") return;

      // 1. Vérifier si une erreur est présente dans l'URL (query string ou hash)
      const searchParams = new URLSearchParams(window.location.search);
      const queryError = searchParams.get("error_description") || searchParams.get("error");
      if (queryError) {
        if (mounted) {
          const lower = queryError.toLowerCase();
          setErreurLien(
            lower.includes("expired")
              ? "Ce lien de réinitialisation a expiré. Veuillez refaire une demande depuis la page de connexion."
              : decodeURIComponent(queryError)
          );
          setChecking(false);
        }
        return;
      }

      const hash = window.location.hash;
      if (hash.includes("error_description=") || hash.includes("error=")) {
        const match = hash.match(/error_description=([^&]*)/);
        const desc = match
          ? decodeURIComponent(match[1].replace(/\+/g, " "))
          : "Lien de réinitialisation expiré ou invalide.";
        if (mounted) {
          setErreurLien(
            desc.toLowerCase().includes("expired")
              ? "Ce lien de réinitialisation a expiré. Veuillez refaire une demande depuis la page de connexion."
              : desc
          );
          setChecking(false);
        }
        return;
      }

      // 2. Traitement d'un éventuel code d'échange PKCE (?code=...)
      const code = searchParams.get("code");
      if (code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!mounted) return;
          if (error) {
            const msg = error.message.toLowerCase();
            setErreurLien(
              msg.includes("expired")
                ? "Ce lien de réinitialisation a expiré. Veuillez refaire une demande depuis la page de connexion."
                : error.message || "Lien de réinitialisation invalide."
            );
            setChecking(false);
            return;
          }
          if (data?.session) {
            setSessionValide(true);
            setChecking(false);
            return;
          }
        } catch (err) {
          if (mounted) {
            setErreurLien("Impossible de valider le lien de réinitialisation.");
            setChecking(false);
          }
          return;
        }
      }

      // 3. Vérifier si une session de récupération existe déjà
      const { data: sessionData } = await supabase.auth.getSession();
      if (!mounted) return;
      if (sessionData?.session) {
        setSessionValide(true);
        setChecking(false);
        return;
      }

      // 4. Temporisation pour laisser à Supabase le temps de parser le fragment de hash
      const timer = setTimeout(async () => {
        if (!mounted) return;
        const { data: retrySession } = await supabase.auth.getSession();
        if (retrySession?.session) {
          setSessionValide(true);
        } else {
          setErreurLien(
            "Aucune session de réinitialisation valide détectée. Ce lien est peut-être expiré ou déjà utilisé."
          );
        }
        setChecking(false);
      }, 1000);

      return () => clearTimeout(timer);
    };

    // Écoute de l'événement Supabase PASSWORD_RECOVERY
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setSessionValide(true);
        setChecking(false);
      }
    });

    verifierSession();

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    const cleanPassword = password.trim();
    const cleanConfirm = confirmPassword.trim();

    if (cleanPassword.length < 6) {
      showToast("Le mot de passe doit contenir au moins 6 caractères.", "error");
      return;
    }

    if (cleanPassword !== cleanConfirm) {
      showToast("Les deux mots de passe ne correspondent pas.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: cleanPassword,
      });

      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("password should be at least")) {
          showToast("Le mot de passe doit contenir au moins 6 caractères.", "error");
        } else if (msg.includes("same password") || msg.includes("different")) {
          showToast("Le nouveau mot de passe doit être différent du mot de passe actuel.", "error");
        } else {
          showToast(error.message || "Erreur lors de la mise à jour du mot de passe.", "error");
        }
        return;
      }

      showToast("Mot de passe mis à jour avec succès ! Veuillez vous connecter.", "success");
      // Déconnexion propre pour sécuriser la session et forcer une connexion avec les nouveaux identifiants
      await supabase.auth.signOut();
      localStorage.removeItem("token_pharmacie");
      localStorage.removeItem("role_pharmacie");
      navigate.push("/admin/connexion");
    } catch (err) {
      logErreur("ReinitialisationMotDePasse", "mise à jour du mot de passe", err);
      showToast("Une erreur est survenue lors de la réinitialisation.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/50 flex justify-center items-center p-4">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-emerald-100/50 p-8 flex flex-col justify-between items-center transition-all duration-300 hover:shadow-2xl">

        {/* Logo / Header */}
        <div className="flex flex-col items-center space-y-3 mb-6 w-full text-center">
          <Image
            src="/medipharmac-logo.png"
            alt="Logo Medipharmac"
            width={1297}
            height={1213}
            priority
            className="h-24 w-24 object-contain"
          />
          <div>
            <h1 className="font-roboto font-bold text-2xl bg-gradient-to-r from-emerald-800 to-teal-900 bg-clip-text text-transparent uppercase tracking-wider">
              Medipharmac
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Réinitialisation de votre mot de passe
            </p>
          </div>
        </div>

        {/* État 1 : Vérification en cours */}
        {checking && (
          <div className="flex flex-col items-center py-10 space-y-4">
            <ArrowPathIcon className="w-10 h-10 text-emerald-600 animate-spin" />
            <p className="text-sm font-semibold text-emerald-900 animate-pulse text-center">
              Vérification du lien de réinitialisation...
            </p>
          </div>
        )}

        {/* État 2 : Lien invalide ou expiré */}
        {!checking && !sessionValide && (
          <div className="w-full flex flex-col items-center text-center space-y-5 py-4">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center">
              <ExclamationTriangleIcon className="w-9 h-9" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Lien expiré ou invalide
              </h2>
              <p className="text-gray-600 text-xs mt-2 leading-relaxed">
                {erreurLien || "Ce lien de réinitialisation n'est plus valable. Veuillez refaire une demande."}
              </p>
            </div>
            <Link
              href="/admin/connexion"
              className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center text-sm"
            >
              Retourner à la page de connexion
            </Link>
          </div>
        )}

        {/* État 3 : Formulaire de saisie du nouveau mot de passe */}
        {!checking && sessionValide && (
          <form onSubmit={handleUpdatePassword} className="w-full flex flex-col space-y-5">
            {/* Nouveau mot de passe */}
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="nouveau-mot-de-passe" className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-600/70" />
                <input
                  id="nouveau-mot-de-passe"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  className="w-full h-12 pl-11 pr-11 bg-emerald-50/30 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition font-sans text-gray-700 placeholder-gray-400 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-700 focus:outline-none transition cursor-pointer p-0.5"
                >
                  {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirmation mot de passe */}
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="confirmer-mot-de-passe" className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <KeyIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-600/70" />
                <input
                  id="confirmer-mot-de-passe"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  className="w-full h-12 pl-11 pr-11 bg-emerald-50/30 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition font-sans text-gray-700 placeholder-gray-400 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-700 focus:outline-none transition cursor-pointer p-0.5"
                >
                  {showConfirmPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Actions */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none mt-4 cursor-pointer flex items-center justify-center gap-2"
            >
              {submitting && <ArrowPathIcon className="w-5 h-5 animate-spin" />}
              <span>{submitting ? "Enregistrement..." : "Enregistrer le nouveau mot de passe"}</span>
            </button>
          </form>
        )}

        {/* Divider / Redirect */}
        <div className="w-full mt-6 pt-5 border-t border-emerald-100/50 flex flex-col items-center">
          <Link
            className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold hover:underline transition-all duration-150"
            href="/admin/connexion"
          >
            ← Retour à la connexion
          </Link>
        </div>

      </div>
    </div>
  );
}
