"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  NoSymbolIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";

export function evaluerVisibilitePharmacie(pharmacie, maintenantMs) {
  const visible = pharmacie?.visible !== false;
  const statutBrut = String(pharmacie?.statut || "").trim();
  const statut = statutBrut.toLowerCase();
  const estActif = statut === "actif";

  const expireDate = pharmacie?.abonnement_expire_le
    ? new Date(pharmacie.abonnement_expire_le)
    : null;
  const expireValide = Boolean(expireDate && !Number.isNaN(expireDate.getTime()));
  const dateFormatee = expireValide ? expireDate.toLocaleDateString("fr-FR") : null;
  const estExpire = expireValide ? expireDate.getTime() < maintenantMs : false;
  const joursRestants =
    expireValide && !estExpire
      ? Math.max(0, Math.ceil((expireDate.getTime() - maintenantMs) / 86400000))
      : null;
  const expirationProche = joursRestants !== null && joursRestants <= 7;

  if (!visible || !estActif || estExpire) {
    const raisons = [];
    if (estExpire) {
      raisons.push(`Abonnement expiré le ${dateFormatee}`);
    }
    if (!estActif) {
      if (statut === "en_attente") {
        raisons.push("Compte en attente de validation");
      } else {
        raisons.push(`Compte ${statutBrut || "inactif"}`);
      }
    }
    if (!visible) {
      raisons.push("Pharmacie masquée par l'administration");
    }

    return {
      etat: "hors_ligne",
      titre: "Hors ligne",
      raison: raisons.join(" • "),
      dateFormatee,
      joursRestants,
    };
  }

  if (expirationProche) {
    return {
      etat: "expiration_proche",
      titre:
        joursRestants === 0
          ? "Expire aujourd'hui"
          : `Expire dans ${joursRestants} j`,
      raison: `Abonnement actif jusqu'au ${dateFormatee} (${joursRestants} jour${joursRestants > 1 ? "s" : ""} restant${joursRestants > 1 ? "s" : ""})`,
      dateFormatee,
      joursRestants,
    };
  }

  return {
    etat: "en_ligne",
    titre: "En ligne",
    raison: dateFormatee ? `Abonnement jusqu'au ${dateFormatee}` : null,
    dateFormatee,
    joursRestants,
  };
}

export default function StatutVisibiliteBadge({ pharmacie, variant = "compact" }) {
  const [maintenantMs] = useState(() => Date.now());
  const evaluation = evaluerVisibilitePharmacie(pharmacie, maintenantMs);

  if (variant === "compact") {
    if (evaluation.etat === "hors_ligne") {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span
            title={evaluation.raison}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800"
          >
            <NoSymbolIcon className="h-3.5 w-3.5 text-rose-600" />
            <span>{evaluation.titre}</span>
            {evaluation.raison && (
              <span className="hidden lg:inline font-normal text-rose-700">
                — {evaluation.raison}
              </span>
            )}
          </span>
          <Link
            href="/admin/messages"
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-700"
          >
            <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
            Support
          </Link>
        </div>
      );
    }

    if (evaluation.etat === "expiration_proche") {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span
            title={evaluation.raison}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
          >
            <ExclamationTriangleIcon className="h-3.5 w-3.5 text-amber-600" />
            <span>En ligne • {evaluation.titre}</span>
          </span>
          <Link
            href="/admin/messages"
            className="text-[11px] font-semibold text-amber-700 underline hover:text-amber-900"
          >
            Contacter le support
          </Link>
        </div>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
        <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-600" />
        <span>{evaluation.titre}</span>
        {evaluation.raison && (
          <span className="hidden sm:inline font-normal text-emerald-700">
            • {evaluation.raison}
          </span>
        )}
      </span>
    );
  }

  // Variante détaillée (pour Ma pharmacie)
  if (evaluation.etat === "hors_ligne") {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-900"
      >
        <div className="flex items-start gap-3">
          <NoSymbolIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-bold">
              Pharmacie hors ligne — Non visible par les patients
            </p>
            <p className="mt-0.5 text-xs text-rose-800">{evaluation.raison}</p>
          </div>
        </div>
        <Link
          href="/admin/messages"
          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-rose-700"
        >
          <ChatBubbleLeftRightIcon className="h-4 w-4" />
          Contacter le support
        </Link>
      </div>
    );
  }

  if (evaluation.etat === "expiration_proche") {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900"
      >
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-bold">
              En ligne — Échéance d&apos;abonnement proche ({evaluation.titre})
            </p>
            <p className="mt-0.5 text-xs text-amber-800">{evaluation.raison}</p>
          </div>
        </div>
        <Link
          href="/admin/messages"
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
        >
          <ChatBubbleLeftRightIcon className="h-4 w-4" />
          Renouveler / Support
        </Link>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-3.5 text-emerald-900"
    >
      <div className="flex items-center gap-3">
        <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-bold">
            En ligne — Votre pharmacie est visible sur Mediskip
          </p>
          {evaluation.raison && (
            <p className="mt-0.5 text-xs text-emerald-700">{evaluation.raison}</p>
          )}
        </div>
      </div>
    </div>
  );
}
