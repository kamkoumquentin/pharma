"use client";

import { useState } from "react";
import { ShieldCheckIcon, KeyIcon, ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

export default function OtpModal({ isOpen, email, onSuccess, onClose }) {
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const showToast = useToast();

  if (!isOpen) return null;

  const handleVerify = async (e) => {
    e.preventDefault();
    const cleanCode = otpCode.trim();

    if (!cleanCode || cleanCode.length < 6) {
      showToast("Veuillez saisir un code de confirmation valide (au moins 6 chiffres).", "error");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: cleanCode,
        type: "signup",
      });

      if (error) {
        showToast(error.message || "Code incorrect ou expiré.", "error");
        return;
      }

      showToast("Email confirmé avec succès !", "success");
      if (onSuccess) {
        onSuccess(data?.session, data?.user);
      }
    } catch (err) {
      console.error("Erreur lors de la vérification du code OTP:", err);
      showToast("Une erreur est survenue lors de la validation du code.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
      });

      if (error) {
        showToast(error.message || "Impossible de renvoyer le code pour le moment.", "error");
      } else {
        showToast("Nouveau code envoyé par email !", "success");
      }
    } catch (err) {
      console.error("Erreur renvoi OTP:", err);
      showToast("Erreur lors du renvoi du code.", "error");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-950/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-emerald-100 p-8 flex flex-col items-center relative transition-all duration-300">
        
        {/* Close Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition p-1.5 rounded-full hover:bg-gray-100 cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}

        {/* Header Icon */}
        <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 mb-5">
          <ShieldCheckIcon className="w-9 h-9 text-white" />
        </div>

        {/* Title & Description */}
        <h2 className="text-xl font-bold text-gray-900 text-center">
          Confirmation de votre compte
        </h2>
        <p className="text-gray-500 text-xs text-center mt-2 px-2 leading-relaxed">
          Un code de confirmation a été envoyé à l'adresse :
          <br />
          <span className="font-semibold text-emerald-800 text-sm">{email}</span>
        </p>

        {/* Form */}
        <form onSubmit={handleVerify} className="w-full mt-6 flex flex-col space-y-4">
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 tracking-wide uppercase px-1 text-center">
              Code de confirmation
            </label>
            <div className="relative">
              <KeyIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-600/70" />
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="Ex: 59002645"
                maxLength={12}
                autoFocus
                required
                className="w-full h-13 pl-11 pr-4 bg-emerald-50/30 border-2 border-emerald-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white outline-none transition text-center font-mono text-xl tracking-widest text-emerald-950 placeholder-gray-400 font-bold"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/25 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 cursor-pointer text-sm mt-2"
          >
            {loading ? "Vérification en cours..." : "Valider mon code"}
          </button>
        </form>

        {/* Resend Action */}
        <div className="mt-6 pt-4 border-t border-gray-100 w-full flex flex-col items-center space-y-2">
          <p className="text-xs text-gray-400">Vous n'avez pas reçu de code ?</p>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1.5 hover:underline transition cursor-pointer disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
            <span>{resending ? "Envoi en cours..." : "Renvoyer un nouveau code"}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
