"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EnvelopeIcon, LockClosedIcon, EyeIcon, EyeSlashIcon, KeyIcon, XMarkIcon, ArrowPathIcon } from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { logErreur } from "@/app/lib/logger";
import { useToast } from "@/app/components/Toast";
import OtpModal from "@/app/components/OtpModal";

export default function Connexion() {
  const [tab, settab] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useRouter();
  const showToast = useToast();

  const handleOuvrirResetModal = () => {
    setResetEmail(tab.email.trim().toLowerCase());
    setShowResetModal(true);
  };

  const handleSendResetLink = async (e) => {
    e.preventDefault();
    const emailToUse = resetEmail.trim().toLowerCase();
    if (!emailToUse || emailToUse.length < 5 || !emailToUse.includes("@")) {
      showToast("Veuillez saisir une adresse email valide.", "error");
      return;
    }

    setResetLoading(true);
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://auth.mediskip.space";
      const { error } = await supabase.auth.resetPasswordForEmail(emailToUse, {
        redirectTo: `${siteUrl}/admin/reinitialiser`,
      });

      if (error) {
        logErreur("Connexion", "envoi du lien de réinitialisation", error, {
          email: emailToUse,
        });
        showToast("Erreur lors de l'envoi de l'e-mail de réinitialisation.", "error");
      } else {
        setShowResetModal(false);
        showToast(`Lien de réinitialisation envoyé à ${emailToUse} ! Vérifiez vos e-mails.`, "success");
      }
    } catch (err) {
      logErreur("Connexion", "envoi du lien de réinitialisation", err, {
        email: emailToUse,
      });
      showToast("Une erreur est survenue lors de l'envoi de l'e-mail.", "error");
    } finally {
      setResetLoading(false);
    }
  };

  const handleOtpSuccess = async (session, userFromOtp) => {
    setShowOtpModal(false);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData?.user || userFromOtp || session?.user;

      if (!currentUser?.id) {
        await supabase.auth.signOut();
        localStorage.removeItem("token_pharmacie");
        localStorage.removeItem("role_pharmacie");
        showToast("Adresse e-mail ou mot de passe incorrect.", "error");
        return;
      }

      const { data: profile, error: profError } = await supabase
        .from("pharmacies")
        .select("id")
        .eq("owner_id", currentUser.id)
        .maybeSingle();

      if (profError || !profile) {
        await supabase.auth.signOut();
        localStorage.removeItem("token_pharmacie");
        localStorage.removeItem("role_pharmacie");
        showToast("Adresse e-mail ou mot de passe incorrect.", "error");
        return;
      }

      if (session?.access_token) {
        localStorage.setItem("token_pharmacie", session.access_token);
        localStorage.setItem("role_pharmacie", "pharmacie");
      }
      showToast("Email confirmé ! Redirection en cours...", "success");
      navigate.push("/admin");
    } catch (err) {
      logErreur("Connexion", "vérification profil post-OTP", err);
      await supabase.auth.signOut();
      localStorage.removeItem("token_pharmacie");
      localStorage.removeItem("role_pharmacie");
      showToast("Adresse e-mail ou mot de passe incorrect.", "error");
    }
  };

  const enregistrement = (e) => {
    const { id, value } = e.target;
    settab((prev) => ({ ...prev, [id]: id === "email" ? value.trim().toLowerCase() : value }));
  };

  const envoi = async (e) => {
    e.preventDefault();
    const emailClean = tab.email.trim().toLowerCase();
    const passwordClean = tab.password;

    if (emailClean.length > 5 && passwordClean.length >= 6) {
      setLoading(true);
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: emailClean,
          password: passwordClean,
        });

        if (authError) {
          const errMsg = authError.message || "";
          if (errMsg.toLowerCase().includes("email not confirmed")) {
            setPendingEmail(emailClean);
            setShowOtpModal(true);
            showToast("Votre email n'est pas encore confirmé. Entrez le code reçu ci-dessous.", "info");
          } else {
            showToast("Adresse e-mail ou mot de passe incorrect.", "error");
          }
          return;
        }

        if (authData?.user) {
          const { data: profile, error: profError } = await supabase
            .from("pharmacies")
            .select("id")
            .eq("owner_id", authData.user.id)
            .maybeSingle();

          if (profError || !profile) {
            await supabase.auth.signOut();
            localStorage.removeItem("token_pharmacie");
            localStorage.removeItem("role_pharmacie");
            showToast("Adresse e-mail ou mot de passe incorrect.", "error");
            return;
          }

          localStorage.setItem("token_pharmacie", authData.session?.access_token || "active");
          localStorage.setItem("role_pharmacie", "pharmacie");
          showToast("Connexion réussie !", "success");
          navigate.push("/admin");
        } else {
          showToast("Adresse e-mail ou mot de passe incorrect.", "error");
        }
      } catch (error) {
        logErreur("Connexion", "authentification pharmacie", error, {
          email: emailClean,
        });
        showToast("Une erreur est survenue lors de la connexion.", "error");
      } finally {
        setLoading(false);
      }
    } else {
      showToast("Tous les champs doivent contenir au moins 6 caractères", "error");
    }
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/50 flex justify-center items-center p-4">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-emerald-100/50 p-8 flex flex-col justify-between items-center transition-all duration-300 hover:shadow-2xl">
        
        {/* Logo / Header */}
        <div className="flex flex-col items-center space-y-3 mb-8 w-full text-center">
          <Image
            src="/medipharmac-logo.png"
            alt="Logo Medipharmac"
            width={1297}
            height={1213}
            priority
            className="h-28 w-28 object-contain"
          />
          <div>
            <h1 className="font-roboto font-bold text-2xl bg-gradient-to-r from-emerald-800 to-teal-900 bg-clip-text text-transparent uppercase tracking-wider">
              Medipharmac
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Connectez-vous à votre espace pharmacie
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={envoi} className="w-full flex flex-col space-y-5">
          {/* Email Input */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
              Email de la pharmacie
            </label>
            <div className="relative">
              <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-600/70" />
              <input
                onChange={enregistrement}
                id="email"
                type="email"
                required
                className="w-full h-12 pl-11 pr-4 bg-emerald-50/30 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition font-sans text-gray-700 placeholder-gray-400"
                placeholder="email@pharmacie.com"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
              Mot de passe
            </label>
            <div className="relative">
              <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-600/70" />
              <input
                onChange={enregistrement}
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="w-full h-12 pl-11 pr-11 bg-emerald-50/30 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition font-sans text-gray-700 placeholder-gray-400"
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
                  <EyeSlashIcon className="w-5 h-5" />
                ) : (
                  <EyeIcon className="w-5 h-5" />
                )}
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleOuvrirResetModal}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline transition cursor-pointer"
              >
                Mot de passe oublié ?
              </button>
            </div>
          </div>

          {/* Actions */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none mt-4 cursor-pointer"
          >
            {loading ? "Connexion en cours..." : "Entrer dans sa pharmacie"}
          </button>
        </form>

        {/* Divider / Redirect */}
        <div className="w-full mt-8 pt-6 border-t border-emerald-100/50 flex flex-col items-center space-y-3">
          <p className="text-xs text-gray-400">Nouvelle pharmacie sur la plateforme ?</p>
          <Link
            className="text-sm text-emerald-600 hover:text-emerald-700 font-semibold hover:underline transition-all duration-150"
            href="/admin/inscription"
          >
            Inscrire sa pharmacie
          </Link>
        </div>

      </div>

      {/* Modal de confirmation par code OTP */}
      <OtpModal
        isOpen={showOtpModal}
        email={pendingEmail}
        onSuccess={handleOtpSuccess}
        onClose={() => setShowOtpModal(false)}
      />

      {/* Modal de demande de réinitialisation du mot de passe */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-950/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-emerald-100 p-8 flex flex-col items-center relative transition-all duration-300">
            <button
              type="button"
              onClick={() => setShowResetModal(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition p-1.5 rounded-full hover:bg-gray-100 cursor-pointer"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 mb-5">
              <KeyIcon className="w-9 h-9 text-white" />
            </div>

            <h2 className="text-xl font-bold text-gray-900 text-center">
              Mot de passe oublié ?
            </h2>
            <p className="text-gray-500 text-xs text-center mt-2 px-2 leading-relaxed">
              Saisissez l&apos;adresse email de votre pharmacie. Nous vous enverrons un lien sécurisé pour définir un nouveau mot de passe.
            </p>

            <form onSubmit={handleSendResetLink} className="w-full flex flex-col space-y-4 mt-6">
              <div className="flex flex-col space-y-1.5">
                <label htmlFor="reset-email" className="text-xs font-semibold text-emerald-800 tracking-wide uppercase px-1">
                  Email de la pharmacie
                </label>
                <div className="relative">
                  <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-600/70" />
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="email@pharmacie.com"
                    className="w-full h-12 pl-11 pr-4 bg-emerald-50/30 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition font-sans text-gray-700 placeholder-gray-400 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 h-11 border border-gray-200 hover:bg-gray-50 text-gray-600 font-semibold rounded-xl text-sm transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex-1 h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 active:scale-[0.98] transition text-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {resetLoading && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                  <span>{resetLoading ? "Envoi..." : "Envoyer le lien"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}