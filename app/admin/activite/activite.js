"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ClipboardDocumentListIcon,
  ClockIcon,
  FireIcon,
  ChartPieIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { supabase } from "@/app/lib/supabaseClient";
import { logErreur } from "@/app/lib/logger";
import {
  CATEGORIE_CATALOGUE,
  CATEGORIE_DEMANDE,
  FILTRES_ACTIVITE,
  calculerIndicateursActivite,
} from "@/app/lib/activitePharmacie.mjs";

function ActiviteSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded-lg bg-gray-200" />
          <div className="h-4 w-80 rounded-lg bg-gray-100" />
        </div>
        <div className="h-9 w-28 rounded-xl bg-gray-200" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 rounded bg-gray-200" />
              <div className="h-9 w-9 rounded-xl bg-gray-100" />
            </div>
            <div className="h-8 w-24 rounded bg-gray-200" />
            <div className="h-3 w-40 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm h-80" />
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm h-80" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm h-72" />
    </div>
  );
}

export default function ActivitePharmacie() {
  const [lignesBrutes, setLignesBrutes] = useState([]);
  const [filtreCategorie, setFiltreCategorie] = useState("toutes");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const chargerActivite = useCallback(async (silencieux = false) => {
    if (silencieux) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_mon_activite_pharmacie",
        { p_limit: 100 }
      );

      if (rpcError) throw rpcError;
      setLignesBrutes(Array.isArray(data) ? data : []);
    } catch (err) {
      logErreur("ActivitePharmacie", "chargement de mon activité", err);
      setError(
        err?.message || "Impossible de charger le journal d'activité."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    chargerActivite(false);
  }, [chargerActivite]);

  const indicateurs = useMemo(
    () => calculerIndicateursActivite(lignesBrutes),
    [lignesBrutes]
  );

  const lignesFiltrees = useMemo(() => {
    if (filtreCategorie === "toutes") {
      return indicateurs.lignes;
    }
    return indicateurs.lignes.filter(
      (ligne) => ligne.categorie === filtreCategorie
    );
  }, [indicateurs.lignes, filtreCategorie]);

  if (loading) {
    return <ActiviteSkeleton />;
  }

  if (error && indicateurs.totalActions === 0) {
    return (
      <div className="p-6 bg-rose-50 text-rose-800 rounded-2xl border border-rose-200 flex flex-col items-center gap-3 text-center">
        <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600">
          <ExclamationTriangleIcon className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-sm">Erreur de chargement</h3>
          <p className="text-xs text-rose-700 mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => chargerActivite(false)}
          className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
        >
          <ArrowPathIcon className="w-3.5 h-3.5" />
          Réessayer
        </button>
      </div>
    );
  }

  const {
    totalActions,
    derniereActivite,
    jourPlusActif,
    repartition,
    serie14Jours,
    donneesCategories,
  } = indicateurs;

  return (
    <div className="space-y-6 pb-8">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Mon activité
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Suivi analytique anonymisé de votre catalogue et des demandes patients (100 dernières actions)
          </p>
        </div>

        <button
          type="button"
          onClick={() => chargerActivite(true)}
          disabled={refreshing}
          title="Actualiser le journal d'activité"
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:text-emerald-600 hover:border-emerald-200 transition shadow-xs cursor-pointer disabled:opacity-50"
        >
          <ArrowPathIcon
            className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-600" : ""}`}
          />
          Actualiser
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-center justify-between gap-3">
          <span>Actualisation partielle : {error}</span>
          <button
            type="button"
            onClick={() => chargerActivite(true)}
            className="font-semibold underline hover:text-amber-950 cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* 4 cartes KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1 : Total d'actions */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Total d&apos;actions
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ClipboardDocumentListIcon className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">
            {totalActions.toLocaleString("fr-FR")}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Actions enregistrées sur la période récente
          </p>
        </div>

        {/* KPI 2 : Dernière activité */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Dernière activité
            </span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <ClockIcon className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">
            {derniereActivite ? derniereActivite.ancienneteRelative : "Aucune"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {derniereActivite
              ? `Le ${derniereActivite.dateFormatee}`
              : "Aucune action enregistrée"}
          </p>
        </div>

        {/* KPI 3 : Jour le plus actif */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Jour le plus actif
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <FireIcon className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">
            {jourPlusActif ? jourPlusActif.dateFormatee : "—"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {jourPlusActif
              ? `${jourPlusActif.count} action${jourPlusActif.count > 1 ? "s" : ""} enregistrée${jourPlusActif.count > 1 ? "s" : ""}`
              : "Aucune donnée disponible"}
          </p>
        </div>

        {/* KPI 4 : Répartition */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Répartition
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <ChartPieIcon className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-700">
                {CATEGORIE_CATALOGUE}
              </span>
              <span className="font-bold text-gray-900">
                {repartition.catalogue.count} ({repartition.catalogue.pourcentage}%)
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-sky-700">
                {CATEGORIE_DEMANDE}
              </span>
              <span className="font-bold text-gray-900">
                {repartition.demande.count} ({repartition.demande.pourcentage}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2 graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Histogramme 14 derniers jours */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-800">
              Évolution sur les 14 derniers jours
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Nombre d&apos;actions quotidiennes enregistrées
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={serie14Jours}
                margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e5e7eb" }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    fontSize: "12px",
                  }}
                  formatter={(val) => [
                    `${val} action${val > 1 ? "s" : ""}`,
                    "Activité",
                  ]}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.dateComplete
                      ? `Date : ${payload[0].payload.dateComplete}`
                      : ""
                  }
                />
                <Bar
                  dataKey="total"
                  fill="#059669"
                  radius={[6, 6, 0, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Barres de répartition par catégorie */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-800">
              Répartition par catégorie
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Comparaison entre mises à jour catalogue et demandes patients
            </p>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={donneesCategories}
                layout="vertical"
                margin={{ top: 8, right: 20, left: 12, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="#f3f4f6"
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e5e7eb" }}
                />
                <YAxis
                  type="category"
                  dataKey="categorie"
                  width={130}
                  tick={{ fontSize: 12, fill: "#374151", fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    fontSize: "12px",
                  }}
                  formatter={(val, _, item) => [
                    `${val} action${val > 1 ? "s" : ""} (${item?.payload?.pourcentage ?? 0}%)`,
                    "Volume",
                  ]}
                />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={24}>
                  {donneesCategories.map((entree) => (
                    <Cell key={entree.categorie} fill={entree.couleur} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-auto pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
            {donneesCategories.map((entree) => (
              <div
                key={entree.categorie}
                className="rounded-xl bg-gray-50 px-3.5 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: entree.couleur }}
                  />
                  <span className="text-xs font-semibold text-gray-700 truncate">
                    {entree.categorie}
                  </span>
                </div>
                <span className="text-xs font-bold text-gray-900 shrink-0">
                  {entree.pourcentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Journal détaillé filtrable */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <FunnelIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800">
                Journal détaillé
              </h3>
              <p className="text-[11px] text-gray-500">
                {lignesFiltrees.length} entrée{lignesFiltrees.length > 1 ? "s" : ""} affichée{lignesFiltrees.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filtrer par catégorie"
              className="inline-flex flex-wrap rounded-xl bg-white p-1 border border-gray-200 shadow-xs"
            >
              {FILTRES_ACTIVITE.map((filtre) => {
                const actif = filtreCategorie === filtre.valeur;
                return (
                  <button
                    key={filtre.valeur}
                    type="button"
                    onClick={() => setFiltreCategorie(filtre.valeur)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      actif
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {filtre.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => chargerActivite(true)}
              disabled={refreshing}
              title="Actualiser"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:text-emerald-600 hover:border-emerald-200 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <ArrowPathIcon
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-emerald-600" : ""}`}
              />
              Actualiser
            </button>
          </div>
        </div>

        {lignesFiltrees.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p className="font-medium text-gray-700 mb-1">
              Aucune activité enregistrée
            </p>
            <p className="text-xs text-gray-400">
              {filtreCategorie === "toutes"
                ? "Aucune action récente n'a encore été enregistrée pour votre pharmacie."
                : `Aucune action dans la catégorie « ${filtreCategorie} ».`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50/80 text-xs uppercase text-gray-500 font-semibold border-b border-gray-100">
                <tr>
                  <th scope="col" className="px-6 py-3.5 whitespace-nowrap">
                    Date
                  </th>
                  <th scope="col" className="px-6 py-3.5 whitespace-nowrap">
                    Catégorie
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Opération
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Détail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignesFiltrees.map((ligne) => {
                  const estDemande = ligne.categorie === CATEGORIE_DEMANDE;
                  return (
                    <tr
                      key={ligne.id}
                      className="hover:bg-emerald-50/30 transition-colors"
                    >
                      <td className="px-6 py-3.5 text-xs text-gray-500 whitespace-nowrap font-medium">
                        {ligne.dateFormatee}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            estDemande
                              ? "bg-sky-100 text-sky-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {ligne.categorie}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-gray-900">
                        {ligne.resume}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-gray-600">
                        {ligne.detail}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
