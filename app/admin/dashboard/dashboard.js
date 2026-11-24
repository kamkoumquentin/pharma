"use client";

import { useState, useEffect, useCallback } from "react";
import {
  EyeIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  PlusCircleIcon,
  Squares2X2Icon,
  SparklesIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  chargerStatistiquesPharmacie,
  formaterDureeMinutes,
  remettreOffreEnStock,
} from "@/app/lib/statistiques";
import { telechargerCsv, formaterDateFichier } from "@/app/lib/exportCsv";

const PERIODES = [
  { valeur: 7, label: "7j" },
  { valeur: 30, label: "30j" },
  { valeur: 90, label: "90j" },
];

function tronquerTexte(texte, max = 22) {
  if (!texte) return "";
  return texte.length > max ? `${texte.slice(0, max - 1)}…` : texte;
}

function formaterPrixFcfa(prix) {
  if (prix === null || prix === undefined || Number.isNaN(Number(prix))) {
    return "Prix non défini";
  }
  return `${Number(prix).toLocaleString("fr-FR")} FCFA`;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-52 rounded-lg bg-gray-200" />
          <div className="h-4 w-72 rounded-lg bg-gray-100" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-36 rounded-xl bg-gray-200" />
          <div className="h-9 w-9 rounded-xl bg-gray-200" />
        </div>
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
            <div className="h-8 w-20 rounded bg-gray-200" />
            <div className="h-3 w-36 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm h-80" />
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm h-80" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm h-64" />
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm h-64" />
      </div>
    </div>
  );
}

export default function Dashboard({ pharmacie, onNavigate }) {
  const [nbJours, setNbJours] = useState(30);
  const [donnees, setDonnees] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [restockingIds, setRestockingIds] = useState([]);

  const pharmacieId = pharmacie?.id;

  const charger = useCallback(
    async (silencieux = false) => {
      if (!pharmacieId) return;

      if (silencieux) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await chargerStatistiquesPharmacie(pharmacieId, nbJours);
        setDonnees(res);
      } catch (err) {
        console.error("Erreur lors du chargement du tableau de bord :", err);
        setError(
          err?.message || "Impossible de charger les statistiques du tableau de bord."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [pharmacieId, nbJours]
  );

  const handleRemettreEnStock = async (offreId) => {
    if (!offreId || restockingIds.includes(offreId)) return;
    setActionError(null);
    setRestockingIds((prev) => [...prev, offreId]);

    try {
      await remettreOffreEnStock(offreId);
      await charger(true);
    } catch (err) {
      console.error("Erreur lors de la remise en stock :", err);
      setActionError(
        err?.message || "Impossible de remettre ce produit en stock."
      );
    } finally {
      setRestockingIds((prev) => prev.filter((id) => id !== offreId));
    }
  };

  useEffect(() => {
    if (!pharmacieId) return undefined;
    let actif = true;

    chargerStatistiquesPharmacie(pharmacieId, nbJours)
      .then((res) => {
        if (!actif) return;
        setDonnees(res);
        setError(null);
      })
      .catch((err) => {
        if (!actif) return;
        console.error("Erreur lors du chargement du tableau de bord :", err);
        setError(
          err?.message || "Impossible de charger les statistiques du tableau de bord."
        );
      })
      .finally(() => {
        if (actif) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      actif = false;
    };
  }, [pharmacieId, nbJours]);

  const changerPeriode = (valeur) => {
    if (valeur === nbJours) return;
    setError(null);
    setRefreshing(true);
    setNbJours(valeur);
  };

  if (loading && !donnees) {
    return <DashboardSkeleton />;
  }

  if (error && !donnees) {
    return (
      <div className="p-6 bg-red-50 text-red-700 rounded-2xl border border-red-200 flex flex-col items-center gap-3 text-center max-w-xl mx-auto mt-8">
        <div className="w-11 h-11 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
          <ExclamationTriangleIcon className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-sm">Erreur de chargement</h3>
          <p className="text-xs text-red-600/90 mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => charger(false)}
          className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow transition active:scale-95 cursor-pointer"
        >
          <ArrowPathIcon className="w-3.5 h-3.5" />
          Réessayer
        </button>
      </div>
    );
  }

  const kpis = donnees?.kpis || {
    totalVuesPharmacie: 0,
    totalVuesVille: 0,
    tauxDisponibilite: 0,
    nbEnStock: 0,
    nbEnRupture: 0,
    totalOffres: 0,
    messagerie: {
      demandesRecues: 0,
      demandesRepondues: 0,
      tauxReponse: null,
      tempsMedianMinutes: null,
    },
  };

  const serieQuotidienne = donnees?.serieQuotidienne || [];
  const topProduitsData = (donnees?.topProduitsPharmacie || []).map((item) => ({
    ...item,
    nomCourt: tronquerTexte(item.nom, 22),
  }));
  const opportunitesVille = donnees?.opportunitesVille || [];
  const rupturesActuelles = donnees?.rupturesActuelles || [];

  const partVuesVille =
    kpis.totalVuesVille > 0
      ? Math.round((kpis.totalVuesPharmacie / kpis.totalVuesVille) * 100)
      : null;

  const exporterBilanCsv = () => {
    const lignesExport = [
      ["Indicateurs clés", "Vues de vos produits", kpis.totalVuesPharmacie, `Période ${nbJours}j`],
      [
        "Indicateurs clés",
        "Recherches en ville",
        kpis.totalVuesVille,
        partVuesVille !== null ? `${partVuesVille}% captées` : "",
      ],
      [
        "Indicateurs clés",
        "Disponibilité du stock",
        `${kpis.tauxDisponibilite}%`,
        `${kpis.nbEnStock}/${kpis.totalOffres} en stock`,
      ],
      [
        "Indicateurs clés",
        "Temps médian de réponse",
        formaterDureeMinutes(kpis.messagerie?.tempsMedianMinutes),
        kpis.messagerie?.tauxReponse !== null
          ? `Taux de réponse : ${kpis.messagerie.tauxReponse}%`
          : "Aucune demande reçue",
      ],
      [
        "Indicateurs clés",
        "Produits en rupture",
        kpis.nbEnRupture,
        kpis.patientsEnAttente > 0 ? `${kpis.patientsEnAttente} patient(s) en attente` : "",
      ],
    ];

    for (const p of topProduitsData) {
      lignesExport.push([
        "Top produits",
        p.nom,
        p.vues,
        p.enStock ? "En stock" : "En rupture",
      ]);
    }

    for (const item of opportunitesVille) {
      lignesExport.push([
        "Demande locale non couverte",
        item.nom,
        item.vuesVille,
        item.statutChezVous === "en_rupture" ? "En rupture" : "Absent du catalogue",
      ]);
    }

    for (const item of rupturesActuelles) {
      lignesExport.push([
        "Ruptures actives",
        item.nom,
        item.joursRupture !== null ? `${item.joursRupture} j` : "En rupture",
        `${formaterPrixFcfa(item.prix)}${
          item.nbPatientsEnAttente > 0 ? ` • ${item.nbPatientsEnAttente} patient(s) en attente` : ""
        }`,
      ]);
    }

    telechargerCsv(
      `bilan-pharmacie-${nbJours}j-${formaterDateFichier()}.csv`,
      ["Section", "Élément", "Valeur", "Détail"],
      lignesExport
    );
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Barre d'en-tête avec sélecteur de période */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Vue d&apos;ensemble de votre activité
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Performances de votre officine sur les {nbJours} derniers jours
            {pharmacie?.ville ? ` • ${pharmacie.ville}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Sélecteur de période"
            className="inline-flex rounded-xl bg-white p-1 border border-gray-200 shadow-xs"
          >
            {PERIODES.map((p) => {
              const actif = nbJours === p.valeur;
              return (
                <button
                  key={p.valeur}
                  type="button"
                  onClick={() => changerPeriode(p.valeur)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    actif
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => charger(true)}
            disabled={refreshing}
            title="Actualiser les données"
            className="p-2 bg-white border border-gray-200 rounded-xl text-gray-500 hover:text-emerald-600 hover:border-emerald-200 transition shadow-xs cursor-pointer disabled:opacity-50"
          >
            <ArrowPathIcon
              className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-600" : ""}`}
            />
          </button>

          <button
            type="button"
            onClick={exporterBilanCsv}
            title="Exporter le bilan au format CSV (Excel)"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:text-emerald-700 hover:border-emerald-200 transition shadow-xs cursor-pointer"
          >
            <ArrowDownTrayIcon className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Exporter CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-center justify-between gap-3">
          <span>Actualisation partielle : {error}</span>
          <button
            type="button"
            onClick={() => charger(true)}
            className="font-semibold underline hover:text-amber-950 cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 flex items-center justify-between gap-3"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="font-semibold underline hover:text-rose-950 cursor-pointer"
          >
            Fermer
          </button>
        </div>
      )}

      {/* 4 cartes KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1 : Vues */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Vues de vos produits
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <EyeIcon className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">
            {kpis.totalVuesPharmacie.toLocaleString("fr-FR")}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {kpis.totalVuesVille.toLocaleString("fr-FR")} recherches en ville
            {partVuesVille !== null ? ` (${partVuesVille}% captées)` : ""}
          </p>
        </div>

        {/* KPI 2 : Disponibilité */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Disponibilité du stock
            </span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <CheckCircleIcon className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">
            {kpis.tauxDisponibilite}%
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {kpis.nbEnStock} disponible{kpis.nbEnStock > 1 ? "s" : ""} sur{" "}
            {kpis.totalOffres} référence{kpis.totalOffres > 1 ? "s" : ""}
          </p>
        </div>

        {/* KPI 3 : Réactivité clients */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Réactivité clients
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <ChatBubbleLeftRightIcon className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">
            {formaterDureeMinutes(kpis.messagerie?.tempsMedianMinutes)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {kpis.messagerie?.tauxReponse !== null
              ? `Taux de réponse : ${kpis.messagerie.tauxReponse}% (${kpis.messagerie.demandesRepondues}/${kpis.messagerie.demandesRecues})`
              : "Aucune demande reçue sur la période"}
          </p>
        </div>

        {/* KPI 4 : Ruptures */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Produits en rupture
            </span>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                kpis.nbEnRupture > 0
                  ? "bg-amber-50 text-amber-600"
                  : "bg-emerald-50 text-emerald-600"
              }`}
            >
              <ExclamationTriangleIcon className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">
            {kpis.nbEnRupture}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {kpis.nbEnRupture > 0
              ? "Références actuellement indisponibles"
              : "Tout votre catalogue est disponible"}
          </p>
        </div>
      </div>

      {/* 2 graphiques Recharts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AreaChart : évolution quotidienne */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-800">
              Évolution quotidienne des consultations
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Nombre de sélections de vos produits par jour
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={serieQuotidienne}
                margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="vuesAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e5e7eb" }}
                  minTickGap={20}
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
                  formatter={(val) => [`${val} vue${val > 1 ? "s" : ""}`, "Consultations"]}
                  labelFormatter={(label) => `Date : ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="vues"
                  stroke="#059669"
                  strokeWidth={2}
                  fill="url(#vuesAreaGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* BarChart horizontal : top produits */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-800">
              Top produits les plus consultés
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Vos médicaments les plus vus sur les {nbJours} derniers jours
            </p>
          </div>

          {topProduitsData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-center text-xs text-gray-400">
              Aucune consultation enregistrée pour votre pharmacie sur cette période.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topProduitsData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
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
                    dataKey="nomCourt"
                    width={130}
                    tick={{ fontSize: 11, fill: "#374151" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid #e5e7eb",
                      fontSize: "12px",
                    }}
                    formatter={(val) => [`${val} vue${val > 1 ? "s" : ""}`, "Vues"]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.nom || ""
                    }
                  />
                  <Bar
                    dataKey="vues"
                    fill="#10b981"
                    radius={[0, 6, 6, 0]}
                    barSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* 2 listes actionnables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Liste 1 : Demande locale non couverte */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <SparklesIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">
                  Demande locale non couverte
                </h3>
                <p className="text-[11px] text-gray-500">
                  Médicaments recherchés en ville absents ou en rupture chez vous
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.("a")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition cursor-pointer shrink-0"
            >
              <PlusCircleIcon className="w-4 h-4" />
              Ajouter
            </button>
          </div>

          <div className="divide-y divide-gray-100 flex-1">
            {opportunitesVille.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                Aucune opportunité manquante détectée dans votre ville pour le moment.
              </div>
            ) : (
              opportunitesVille.map((item) => {
                const enCours = item.offreId && restockingIds.includes(item.offreId);
                return (
                  <div
                    key={item.idMedicament || item.nom}
                    className="px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-emerald-50/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {item.nom}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {item.statutChezVous === "en_rupture"
                            ? "Actuellement en rupture dans votre stock"
                            : "Absent de votre catalogue"}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100/80 text-emerald-800">
                          {item.vuesVille} recherche{item.vuesVille > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    {item.statutChezVous === "en_rupture" ? (
                      <button
                        type="button"
                        disabled={Boolean(enCours)}
                        onClick={() => {
                          if (item.offreId) {
                            handleRemettreEnStock(item.offreId);
                          } else {
                            onNavigate?.("/admin/stock");
                          }
                        }}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${enCours ? "animate-spin" : ""}`} />
                        {enCours ? "En cours..." : "Réactiver"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate?.(
                            `/admin/ajouter?medicamentId=${encodeURIComponent(item.idMedicament || "")}&nom=${encodeURIComponent(item.nom || "")}`
                          )
                        }
                        className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/70 text-xs font-semibold transition cursor-pointer"
                      >
                        + Ajouter
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Liste 2 : Ruptures de stock à réactiver */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <ExclamationTriangleIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">
                  Ruptures de stock à réactiver
                </h3>
                <p className="text-[11px] text-gray-500">
                  Produits indisponibles depuis le plus longtemps
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.("l")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold transition cursor-pointer shrink-0"
            >
              <Squares2X2Icon className="w-4 h-4" />
              Gérer le stock
            </button>
          </div>

          <div className="divide-y divide-gray-100 flex-1">
            {rupturesActuelles.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                Aucun produit en rupture de stock actuellement.
              </div>
            ) : (
              rupturesActuelles.map((item) => {
                const enCours = restockingIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className="px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-amber-50/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {item.nom}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {formaterPrixFcfa(item.prix)}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                          {item.joursRupture !== null
                            ? item.joursRupture === 0
                              ? "Aujourd'hui"
                              : `${item.joursRupture} j`
                            : "En rupture"}
                        </span>
                        {item.nbPatientsEnAttente > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
                            {item.nbPatientsEnAttente} patient
                            {item.nbPatientsEnAttente > 1 ? "s" : ""} en attente
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => handleRemettreEnStock(item.id)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowPathIcon className={`w-3.5 h-3.5 ${enCours ? "animate-spin" : ""}`} />
                      {enCours ? "En cours..." : "Remettre en stock"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
