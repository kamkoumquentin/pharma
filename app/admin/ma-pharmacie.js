"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BuildingStorefrontIcon } from "@heroicons/react/24/solid";
import Modification from "./modifier/modifier";
import InformationsPharmacie from "./informations/informations";
import { useToast } from "@/app/components/Toast";

const ONGLETS = [
  { id: "general", libelle: "Général" },
  { id: "adresse", libelle: "Adresse et position" },
  { id: "horaires", libelle: "Horaires" },
  { id: "fermetures", libelle: "Fermetures et gardes" },
];

function statutPharmacie(status) {
  const value = String(
    status?.texte ??
    status?.statut_actuel ??
    status?.statut ??
    status?.status ??
    status?.etat ??
    ""
  ).toLowerCase();
  if (value.includes("garde")) return { label: "De garde", background: "#FDE9B8", color: "#6B4200" };
  if (value.includes("ouvert")) return { label: "Ouverte", background: "#D7F2E3", color: "#0B5D3A" };
  if (value.includes("ferm")) return { label: "Fermée", background: "#FBE0DE", color: "#8A1F17" };
  return { label: "Horaires inconnus", background: "#F3F4F6", color: "#4B5563" };
}

function heureProchainChangement(status) {
  if (!status?.change_a) return "";
  const date = new Date(status.change_a);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (key) => parts.find((value) => value.type === key)?.value || "";
  const heure = `${part("hour")}h${part("minute")}`;
  const maintenant = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const aujourdHui = maintenant
    .filter((value) => ["year", "month", "day"].includes(value.type))
    .map((value) => value.value)
    .join("-");
  const demainDate = new Date();
  demainDate.setDate(demainDate.getDate() + 1);
  const demainParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(demainDate);
  const demain = demainParts
    .filter((value) => ["year", "month", "day"].includes(value.type))
    .map((value) => value.value)
    .join("-");
  const jour = `${part("year")}-${part("month")}-${part("day")}`;
  const estFermeture = statutPharmacie(status).label === "Fermée";
  if (jour === aujourdHui) return estFermeture ? `Ouvre aujourd'hui à ${heure}` : `Jusqu'à ${heure}`;
  if (jour === demain) return estFermeture ? `Ouvre demain à ${heure}` : `Jusqu'à demain ${heure}`;
  const dateCourte = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Douala",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
  return estFermeture ? `Ouvre ${dateCourte} à ${heure}` : `Jusqu'au ${dateCourte} à ${heure}`;
}

export default function MaPharmacie({ info, onUpdate, onUnsavedState }) {
  const showToast = useToast();
  const [onglet, setOnglet] = useState("general");
  const [statut, setStatut] = useState(null);
  const [actionsState, setActionsState] = useState({});
  const [enregistrement, setEnregistrement] = useState(false);
  const actions = useRef({});
  const showActions = useCallback((key, action) => {
    const precedent = actions.current[key];
    actions.current[key] = action;
    if (!precedent || precedent.dirty !== action.dirty || precedent.loading !== action.loading) {
      setActionsState((state) => ({
        ...state,
        [key]: { dirty: action.dirty, loading: action.loading },
      }));
    }
  }, []);

  const clesActives = useCallback(() => {
    const keys = onglet === "general"
      ? ["profil-general", "telephone"]
      : onglet === "adresse"
        ? ["profil-adresse"]
        : onglet === "horaires"
          ? ["horaires"]
          : ["fermetures"];
    return keys;
  }, [onglet]);
  const actionsActives = clesActives().map((key) => ({ key, ...actionsState[key] }));
  const modifie = actionsActives.some((action) => action.dirty);

  const annulerActif = useCallback(() => {
    clesActives().forEach((key) => actions.current[key]?.cancel?.());
  }, [clesActives]);

  useEffect(() => {
    onUnsavedState?.(modifie, annulerActif);
  }, [annulerActif, modifie, onUnsavedState]);

  useEffect(() => () => onUnsavedState?.(false, null), [onUnsavedState]);

  const changerOnglet = (id) => {
    if (id === onglet) return;
    if (modifie && !window.confirm("Des modifications ne sont pas enregistrées. Les abandonner ?")) return;
    if (modifie) annulerActif();
    setOnglet(id);
  };

  const enregistrer = async () => {
    if (onglet === "fermetures") return;
    const aSauvegarder = clesActives()
      .filter((key) => actionsState[key]?.dirty && actions.current[key]?.save)
      .map((key) => ({ key, save: actions.current[key]?.save }));
    if (!aSauvegarder.length) return;
    setEnregistrement(true);
    const resultats = [];
    try {
      for (const action of aSauvegarder) {
        resultats.push({ key: action.key, result: await action.save() });
      }
    } finally {
      setEnregistrement(false);
    }

    const echecs = resultats.filter(({ result }) => !result?.success);
    const reussites = resultats.filter(({ result }) => result?.success);
    if (echecs.length) {
      const details = resultats.map(({ key, result }) => {
        const label = key === "profil-general" ? "Nom et logo"
          : key === "telephone" ? "Téléphone"
            : key === "profil-adresse" ? "Adresse et position"
              : key === "horaires" ? "Horaires"
                : "Période";
        return result?.success
          ? `${label} enregistré.${result.warning ? ` ${result.warning}` : ""}`
          : `${label} non enregistré : ${result?.error || "erreur inconnue"}`;
      });
      showToast(details.join(" "), "error", 9000);
      return;
    }

    const avertissement = resultats.map(({ result }) => result?.warning).filter(Boolean);
    if (reussites.length) {
      const labels = reussites.map(({ key }) => key === "profil-general" ? "Nom et logo"
        : key === "telephone" ? "Téléphone"
          : key === "profil-adresse" ? "Adresse et position"
            : key === "horaires" ? "Horaires"
              : "Périodes");
      showToast(
        `${labels.join(" et ")} enregistré${labels.length > 1 ? "s" : ""}.${avertissement.length ? ` ${avertissement.join(" ")}` : ""}`,
        avertissement.length ? "error" : "success"
      );
    }
  };

  const heureProchaine = heureProchainChangement(statut);
  const presentationStatut = statutPharmacie(statut);
  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <BuildingStorefrontIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Ma pharmacie</h1>
            <p className="mt-0.5 text-xs text-gray-500">
              Toutes les heures sont saisies et affichées à l&apos;heure de Douala (UTC+1)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-3 py-1.5 text-sm font-bold"
            style={{ color: presentationStatut.color, backgroundColor: presentationStatut.background }}
          >
            {presentationStatut.label}
          </span>
          {heureProchaine && <span className="text-sm text-gray-600">{heureProchaine}</span>}
        </div>
      </header>

      <div className="border-b border-gray-200">
        <nav aria-label="Sections de Ma pharmacie" className="flex min-w-0 gap-1 overflow-x-auto">
          {ONGLETS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => changerOnglet(item.id)}
              aria-current={onglet === item.id ? "page" : undefined}
              className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition ${
                onglet === item.id
                  ? "border-emerald-600 text-emerald-800"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {item.libelle}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-w-0">
        {(onglet === "general" || onglet === "adresse") && (
          <Modification
            info={info}
            section={onglet}
            embedded
            onUpdate={onUpdate}
            onTabStateChange={(section, action) => showActions(`profil-${section}`, action)}
          />
        )}
        <InformationsPharmacie
          info={info}
          section={onglet}
          embedded
          onUpdate={onUpdate}
          onFormStateChange={showActions}
          onStatusChange={setStatut}
        />
      </div>

      <footer className="flex justify-end gap-3 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={annulerActif}
          disabled={!modifie || enregistrement}
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={enregistrer}
          disabled={onglet === "fermetures" || !modifie || enregistrement || actionsActives.some((action) => action.loading)}
          title={onglet === "fermetures" ? "Les périodes sont enregistrées immédiatement avec Ajouter." : undefined}
          className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
        >
          {enregistrement ? "Enregistrement..." : "Enregistrer"}
        </button>
      </footer>
    </div>
  );
}
