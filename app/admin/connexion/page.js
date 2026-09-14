"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EnvelopeIcon, LockClosedIcon, BuildingStorefrontIcon } from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";
import OtpModal from "@/app/components/OtpModal";

export default function Connexion() {
  const [tab, settab] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const navigate = useRouter();
  const showToast = useToast();

  const handleOtpSuccess = (session) => {
    setShowOtpModal(false);
    if (session?.access_token) {
      localStorage.setItem("token_pharmacie", session.access_token);
      localStorage.setItem("role_pharmacie", "pharmacie");
    }
    showToast("Email confirmé ! Redirection en cours...", "success");
    navigate.push("/admin");
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
          } else if (errMsg.toLowerCase().includes("invalid login credentials") || errMsg.toLowerCase().includes("invalid_credentials")) {
            showToast("Email ou mot de passe incorrect.", "error");
          } else {
            showToast(errMsg || "Identifiants incorrects.", "error");
          }
          return;
        }

        if (authData?.user) {
          const { data: profile, error: profError } = await supabase
            .from("pharmacies")
            .select("*")
            .eq("password", authData.user.id)
            .maybeSingle();

          if (profError || !profile) {
            showToast("Accès interdit : aucun profil pharmacie trouvé pour ce compte.", "error");
            await supabase.auth.signOut();
            return;
          }

          localStorage.setItem("token_pharmacie", authData.session?.access_token || "active");
          localStorage.setItem("role_pharmacie", "pharmacie");
          showToast("Connexion réussie !", "success");
          navigate.push("/admin");
        } else {
          showToast("Connexion échouée.", "error");
        }
      } catch (error) {
        console.error("Erreur de connexion", error);
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
          <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
            <BuildingStorefrontIcon className="w-9 h-9 text-white" />
          </div>
          <div>
            <h1 className="font-roboto font-bold text-2xl bg-gradient-to-r from-emerald-800 to-teal-900 bg-clip-text text-transparent uppercase tracking-wider">
              pharma Admin
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
                type="password"
                required
                className="w-full h-12 pl-11 pr-4 bg-emerald-50/30 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition font-sans text-gray-700 placeholder-gray-400"
                placeholder="••••••••"
              />
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

    </div>
  );
}