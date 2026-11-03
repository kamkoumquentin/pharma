"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BuildingStorefrontIcon,
  CalendarDaysIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

const JOURS = [
  { numero: 1, nom: "Lundi" },
  { numero: 2, nom: "Mardi" },
  { numero: 3, nom: "Mercredi" },
  { numero: 4, nom: "Jeudi" },
  { numero: 5, nom: "Vendredi" },
  { numero: 6, nom: "Samedi" },
  { numero: 7, nom: "Dimanche" },
];

const NOUVELLE_PLAGE = () => ({
  cle: `${Date.now()}-${Math.random()}`,
  ouverture: "",
  fermeture: "",
});

function heureCourte(value) {
  return value ? value.slice(0, 5) : "";
}

function dateHeureDouala(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function dateHeureVersIsoDouala(value) {
  return new Date(`${value}:00+01:00`).toISOString();
}

function nomErreur(error) {
  return error?.message || "Erreur inconnue";
}

function detailErreur(error) {
  const code = error?.code ? ` (code ${error.code})` : "";
  if (error?.code === "42501") {
    return `Permission refusée par Supabase${code} : ${nomErreur(error)}`;
  }
  return `${nomErreur(error)}${code}`;
}

function champTexteStatut(status) {
  const value =
    status?.texte ??
    status?.statut_actuel ??
    status?.statut ??
    status?.status ??
    status?.etat;
  return value === undefined || value === null
    ? "Statut indisponible"
    : String(value);
}

function couleurStatut(status) {
  const color = status?.couleur ?? status?.color;
  if (typeof color === "string" && /^(#[\da-f]{3,8}|[a-z]{3,20})$/i.test(color)) {
    return color;
  }
  const text = champTexteStatut(status).toLowerCase();
  if (text.includes("garde")) return "#2563eb";
  if (text.includes("ouvert")) return "#059669";
  if (text.includes("ferm")) return "#dc2626";
  return "#6b7280";
}

function champClasse(label) {
  return (
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-emerald-800">
      {label}
    </span>
  );
}

export default function InformationsPharmacie({ info, onUpdate }) {
  const showToast = useToast();
  const [telephone, setTelephone] = useState(info.telephone || "");
  const [telephoneErreur, setTelephoneErreur] = useState("");
  const [enregistrementTelephone, setEnregistrementTelephone] = useState(false);
  const [horaires, setHoraires] = useState(
    JOURS.map(({ numero }) => ({ jour: numero, plages: [] }))
  );
  const [fermetures, setFermetures] = useState([]);
  const [gardes, setGardes] = useState([]);
  const [statut, setStatut] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreursChargement, setErreursChargement] = useState({});
  const [enregistrementHoraires, setEnregistrementHoraires] = useState(false);
  const [jourSourceCopie, setJourSourceCopie] = useState("1");
  const [nouvelleFermeture, setNouvelleFermeture] = useState({
    debut: "",
    fin: "",
    motif: "",
  });
  const [nouvelleGarde, setNouvelleGarde] = useState({ debut: "", fin: "" });
  const [actionEnCours, setActionEnCours] = useState("");

  const lireDonnees = useCallback(
    () =>
      Promise.all([
        supabase
          .from("pharmacie_horaires")
          .select("id_pharmacie, jour_semaine, ouverture, fermeture")
          .eq("id_pharmacie", info.id)
          .order("jour_semaine"),
        supabase
          .from("pharmacie_fermetures")
          .select("*")
          .eq("id_pharmacie", info.id)
          .order("debut", { ascending: true }),
        supabase
          .from("pharmacie_gardes")
          .select("*")
          .eq("id_pharmacie", info.id)
          .order("debut", { ascending: true }),
        supabase
          .from("pharmacies_statut")
          .select("*")
          .eq("id_pharmacie", info.id)
          .maybeSingle(),
      ]),
    [info.id]
  );

  const appliquerDonnees = useCallback(
    ([heuresResultat, fermeturesResultat, gardesResultat, statutResultat]) => {
      const erreurs = {};
      if (heuresResultat.error) {
        erreurs.horaires = nomErreur(heuresResultat.error);
      } else {
        const parJour = JOURS.map(({ numero }) => ({
          jour: numero,
          plages: [],
        }));
        (heuresResultat.data || []).forEach((ligne) => {
          const jour = parJour[ligne.jour_semaine - 1];
          if (jour) {
            jour.plages.push({
              cle: `${ligne.jour_semaine}-${jour.plages.length}`,
              ouverture: heureCourte(ligne.ouverture),
              fermeture: heureCourte(ligne.fermeture),
            });
          }
        });
        setHoraires(parJour);
      }

      if (fermeturesResultat.error) {
        erreurs.fermetures = nomErreur(fermeturesResultat.error);
      } else {
        setFermetures(fermeturesResultat.data || []);
      }
      if (gardesResultat.error) {
        erreurs.gardes = nomErreur(gardesResultat.error);
      } else {
        setGardes(gardesResultat.data || []);
      }
      if (statutResultat.error) {
        erreurs.statut = nomErreur(statutResultat.error);
      } else {
        setStatut(statutResultat.data);
      }

      setErreursChargement(erreurs);
      setChargement(false);
    },
    []
  );

  const chargerDonnees = useCallback(async () => {
    try {
      appliquerDonnees(await lireDonnees());
    } catch (error) {
      console.error("Erreur de chargement des informations pharmacie :", error);
      const message = nomErreur(error);
      setErreursChargement({
        horaires: message,
        fermetures: message,
        gardes: message,
        statut: message,
      });
      setChargement(false);
    }
  }, [appliquerDonnees, lireDonnees]);

  useEffect(() => {
    let ignore = false;
    const chargerInitialement = async () => {
      try {
        const donnees = await lireDonnees();
        if (!ignore) appliquerDonnees(donnees);
      } catch (error) {
        if (!ignore) {
          console.error("Erreur de chargement des informations pharmacie :", error);
          setErreursChargement({
            horaires: nomErreur(error),
            fermetures: nomErreur(error),
            gardes: nomErreur(error),
            statut: nomErreur(error),
          });
          setChargement(false);
        }
      }
    };
    chargerInitialement();
    return () => {
      ignore = true;
    };
  }, [appliquerDonnees, lireDonnees]);

  const enregistrerTelephone = async (event) => {
    event.preventDefault();
    const telephoneNormalise = telephone.replace(/[\s()-]/g, "");
    if (!/^\+237[62]\d{8}$/.test(telephoneNormalise)) {
      setTelephoneErreur(
        "Saisissez un numéro camerounais au format +237 suivi de 9 chiffres, commençant par 6 ou 2."
      );
      return;
    }

    setTelephoneErreur("");
    setEnregistrementTelephone(true);
    const { data, error } = await supabase
      .from("pharmacies")
      .update({ telephone: telephoneNormalise })
      .eq("id", info.id)
      .select()
      .single();
    setEnregistrementTelephone(false);

    if (error) {
      console.error("Erreur d'enregistrement du téléphone :", error);
      showToast(
        `Impossible d'enregistrer le téléphone : ${detailErreur(error)}`,
        "error",
        9000
      );
      return;
    }
    setTelephone(data.telephone || telephoneNormalise);
    onUpdate?.(data);
    showToast("Téléphone enregistré.", "success");
  };

  const modifierPlage = (jour, cle, champ, valeur) => {
    setHoraires((precedents) =>
      precedents.map((ligne) =>
        ligne.jour === jour
          ? {
              ...ligne,
              plages: ligne.plages.map((plage) =>
                plage.cle === cle ? { ...plage, [champ]: valeur } : plage
              ),
            }
          : ligne
      )
    );
  };

  const copierHoraires = () => {
    const source = horaires.find(
      (ligne) => ligne.jour === Number(jourSourceCopie)
    );
    if (!source) return;
    setHoraires((precedents) =>
      precedents.map((ligne) =>
        ligne.jour === source.jour
          ? ligne
          : {
              ...ligne,
              plages: source.plages.map((plage) => ({
                ...plage,
                cle: `${Date.now()}-${Math.random()}`,
              })),
            }
      )
    );
  };

  const enregistrerHoraires = async (event) => {
    event.preventDefault();
    for (const jour of horaires) {
      for (const plage of jour.plages) {
        if (
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(plage.ouverture) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(plage.fermeture)
        ) {
          showToast(
            `Complétez les heures d'ouverture et de fermeture du ${JOURS[jour.jour - 1].nom}.`,
            "error"
          );
          return;
        }
      }
    }
    if (erreursChargement.horaires) {
      showToast("Rechargez les horaires avant de les remplacer.", "error");
      return;
    }

    setEnregistrementHoraires(true);
    const { data: anciensHoraires, error: lectureErreur } = await supabase
      .from("pharmacie_horaires")
      .select("id_pharmacie, jour_semaine, ouverture, fermeture")
      .eq("id_pharmacie", info.id);
    if (lectureErreur) {
      console.error("Erreur de lecture des horaires actuels :", lectureErreur);
      showToast(
        `Impossible de lire les horaires actuels : ${detailErreur(lectureErreur)}`,
        "error",
        9000
      );
      setEnregistrementHoraires(false);
      return;
    }

    const { error: suppressionErreur } = await supabase
      .from("pharmacie_horaires")
      .delete()
      .eq("id_pharmacie", info.id);
    if (suppressionErreur) {
      console.error("Erreur de suppression des anciens horaires :", suppressionErreur);
      showToast(
        `Impossible de supprimer les anciens horaires : ${detailErreur(suppressionErreur)}`,
        "error",
        9000
      );
      setEnregistrementHoraires(false);
      return;
    }

    const plagesAInserer = horaires.flatMap((jour) =>
      jour.plages.map((plage) => ({
        id_pharmacie: info.id,
        jour_semaine: jour.jour,
        ouverture: plage.ouverture,
        fermeture: plage.fermeture,
      }))
    );
    const { error: insertionErreur } = plagesAInserer.length
      ? await supabase.from("pharmacie_horaires").insert(plagesAInserer)
      : { error: null };

    if (insertionErreur) {
      console.error("Erreur d'insertion des nouveaux horaires :", insertionErreur);
      const { error: restaurationErreur } = anciensHoraires.length
        ? await supabase.from("pharmacie_horaires").insert(anciensHoraires)
        : { error: null };
      if (restaurationErreur) {
        console.error("Erreur de restauration des horaires précédents :", restaurationErreur);
        showToast(
          `Échec de l'enregistrement (${detailErreur(insertionErreur)}) et de la restauration (${detailErreur(restaurationErreur)}). Rechargez la page.`,
          "error",
          12000
        );
      } else {
        showToast(
          `Échec de l'enregistrement des horaires : ${detailErreur(insertionErreur)}. Les horaires précédents ont été restaurés.`,
          "error",
          12000
        );
      }
      setEnregistrementHoraires(false);
      return;
    }

    setErreursChargement((precedentes) => {
      const autresErreurs = { ...precedentes };
      delete autresErreurs.horaires;
      return autresErreurs;
    });
    setEnregistrementHoraires(false);
    showToast("Horaires hebdomadaires enregistrés.", "success");
  };

  const ajouterPeriode = async (type, event) => {
    event.preventDefault();
    const estFermeture = type === "fermetures";
    const periode = estFermeture ? nouvelleFermeture : nouvelleGarde;
    if (!periode.debut || !periode.fin || periode.fin <= periode.debut) {
      showToast("La date et l'heure de fin doivent être postérieures au début.", "error");
      return;
    }
    if (erreursChargement[type]) {
      showToast("Rechargez la liste avant d'ajouter une période.", "error");
      return;
    }

    const cleAction = `ajout-${type}`;
    setActionEnCours(cleAction);
    const table = estFermeture ? "pharmacie_fermetures" : "pharmacie_gardes";
    const nouvelleLigne = {
      id_pharmacie: info.id,
      debut: dateHeureVersIsoDouala(periode.debut),
      fin: dateHeureVersIsoDouala(periode.fin),
    };
    if (estFermeture && periode.motif.trim()) {
      nouvelleLigne.motif = periode.motif.trim();
    }
    const { error } = await supabase.from(table).insert(nouvelleLigne);
    if (error) {
      console.error(`Erreur d'ajout dans ${table} :`, error);
      showToast(
        `Impossible d'enregistrer cette période : ${detailErreur(error)}`,
        "error",
        9000
      );
      setActionEnCours("");
      return;
    }

    if (estFermeture) {
      setNouvelleFermeture({ debut: "", fin: "", motif: "" });
    } else {
      setNouvelleGarde({ debut: "", fin: "" });
    }
    setChargement(true);
    await chargerDonnees();
    setActionEnCours("");
    showToast(estFermeture ? "Fermeture ajoutée." : "Période de garde ajoutée.", "success");
  };

  const supprimerPeriode = async (type, ligne) => {
    const estFermeture = type === "fermetures";
    const table = estFermeture ? "pharmacie_fermetures" : "pharmacie_gardes";
    const cleAction = `suppression-${type}-${ligne.id}`;
    setActionEnCours(cleAction);
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", ligne.id)
      .eq("id_pharmacie", info.id);
    if (error) {
      console.error(`Erreur de suppression dans ${table} :`, error);
      showToast(
        `Impossible de supprimer cette période : ${detailErreur(error)}`,
        "error",
        9000
      );
      setActionEnCours("");
      return;
    }

    setChargement(true);
    await chargerDonnees();
    setActionEnCours("");
    showToast(estFermeture ? "Fermeture supprimée." : "Période de garde supprimée.", "success");
  };

  const champsDateHeure = (value, onChange, label, name) => (
    <label className="block min-w-0 flex-1">
      {champClasse(label)}
      <input
        aria-label={label}
        type="datetime-local"
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm text-gray-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
      />
    </label>
  );

  const afficherPeriode = (ligne) => {
    const debut = dateHeureDouala(ligne.debut);
    const fin = dateHeureDouala(ligne.fin);
    return `${debut.replace("T", " ")} – ${fin.replace("T", " ")} (heure de Douala)`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <BuildingStorefrontIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">Informations de la pharmacie</h2>
            <p className="text-xs text-gray-500">{info.nom}</p>
          </div>
        </div>
        {Object.keys(erreursChargement).length > 0 && (
          <button
            type="button"
            onClick={() => {
              setChargement(true);
              chargerDonnees();
            }}
            disabled={chargement}
            className="mt-4 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Recharger les informations
          </button>
        )}
        <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Statut actuel affiché aux patients
          </p>
          {erreursChargement.statut ? (
            <p role="alert" className="mt-2 text-sm text-rose-700">
              Impossible de lire le statut : {erreursChargement.statut}
            </p>
          ) : (
            <p
              className="mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold"
              style={{
                color: couleurStatut(statut),
                backgroundColor: `${couleurStatut(statut)}18`,
              }}
            >
              {champTexteStatut(statut)}
            </p>
          )}
        </div>

        <form onSubmit={enregistrerTelephone} className="mt-6">
          <label htmlFor="telephone-pharmacie">
            {champClasse("Téléphone de la pharmacie")}
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="telephone-pharmacie"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={telephone}
              onChange={(event) => {
                setTelephone(event.target.value);
                setTelephoneErreur("");
              }}
              aria-invalid={Boolean(telephoneErreur)}
              aria-describedby={telephoneErreur ? "telephone-erreur" : undefined}
              placeholder="+237 6XX XXX XXX"
              className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 px-4 text-sm text-gray-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            />
            <button
              type="submit"
              disabled={enregistrementTelephone}
              className="h-11 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              {enregistrementTelephone ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
          {telephoneErreur && (
            <p id="telephone-erreur" role="alert" className="mt-2 text-sm text-rose-700">
              {telephoneErreur}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            Format requis : +237 suivi de 9 chiffres, commençant par 6 ou 2.
          </p>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarDaysIcon className="h-6 w-6 text-emerald-700" />
            <div>
              <h2 className="font-bold text-gray-800">Horaires hebdomadaires</h2>
              <p className="text-xs text-gray-500">Heures locales du Cameroun (UTC+1).</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Jour à copier"
              value={jourSourceCopie}
              onChange={(event) => setJourSourceCopie(event.target.value)}
              className="h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-700"
            >
              {JOURS.map((jour) => (
                <option key={jour.numero} value={jour.numero}>
                  {jour.nom}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={copierHoraires}
              disabled={Boolean(erreursChargement.horaires) || chargement}
              className="h-10 rounded-lg border border-emerald-200 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
            >
              Copier sur les autres jours
            </button>
          </div>
        </div>

        {erreursChargement.horaires && (
          <p role="alert" className="mt-4 text-sm text-rose-700">
            Lecture des horaires impossible : {erreursChargement.horaires}
          </p>
        )}
        <form onSubmit={enregistrerHoraires} className="mt-5 space-y-4">
          {horaires.map((jour) => (
            <div
              key={jour.jour}
              className="grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-[7rem_1fr]"
            >
              <h3 className="pt-2 text-sm font-bold text-gray-700">
                {JOURS[jour.jour - 1].nom}
              </h3>
              <div className="space-y-2">
                {jour.plages.length === 0 && (
                  <p className="py-2 text-sm text-gray-400">Fermé</p>
                )}
                {jour.plages.map((plage) => {
                  const plageDeNuit =
                    plage.ouverture &&
                    plage.fermeture &&
                    plage.fermeture <= plage.ouverture;
                  return (
                    <div key={plage.cle} className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`ouverture-${plage.cle}`}>
                        Ouverture {JOURS[jour.jour - 1].nom}
                      </label>
                      <input
                        id={`ouverture-${plage.cle}`}
                        type="time"
                        value={plage.ouverture}
                        onChange={(event) =>
                          modifierPlage(jour.jour, plage.cle, "ouverture", event.target.value)
                        }
                        required
                        className="h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-700"
                      />
                      <span className="text-gray-400">à</span>
                      <label className="sr-only" htmlFor={`fermeture-${plage.cle}`}>
                        Fermeture {JOURS[jour.jour - 1].nom}
                      </label>
                      <input
                        id={`fermeture-${plage.cle}`}
                        type="time"
                        value={plage.fermeture}
                        onChange={(event) =>
                          modifierPlage(jour.jour, plage.cle, "fermeture", event.target.value)
                        }
                        required
                        className="h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-700"
                      />
                      {plageDeNuit && (
                        <span className="text-xs font-semibold text-amber-700">
                          Passe minuit (fermeture le lendemain)
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Supprimer la plage du ${JOURS[jour.jour - 1].nom}`}
                        onClick={() =>
                          setHoraires((precedents) =>
                            precedents.map((ligne) =>
                              ligne.jour === jour.jour
                                ? {
                                    ...ligne,
                                    plages: ligne.plages.filter(
                                      (element) => element.cle !== plage.cle
                                    ),
                                  }
                                : ligne
                            )
                          )
                        }
                        className="rounded-lg p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() =>
                    setHoraires((precedents) =>
                      precedents.map((ligne) =>
                        ligne.jour === jour.jour
                          ? { ...ligne, plages: [...ligne.plages, NOUVELLE_PLAGE()] }
                          : ligne
                      )
                    )
                  }
                  className="inline-flex items-center gap-1 py-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                >
                  <PlusIcon className="h-4 w-4" />
                  Ajouter une plage
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-end border-t border-gray-100 pt-4">
            <button
              type="submit"
              disabled={chargement || enregistrementHoraires || Boolean(erreursChargement.horaires)}
              className="h-11 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              {enregistrementHoraires ? "Enregistrement..." : "Enregistrer les horaires"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-sm">
        <h2 className="font-bold text-gray-800">Fermetures exceptionnelles</h2>
        <p className="mt-1 text-xs text-gray-500">Saisies et affichées à l&apos;heure de Douala (UTC+1).</p>
        {erreursChargement.fermetures ? (
          <p role="alert" className="mt-4 text-sm text-rose-700">
            Lecture des fermetures impossible : {erreursChargement.fermetures}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {fermetures.map((ligne) => (
              <li key={ligne.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-sm text-gray-700">
                  {afficherPeriode(ligne)}
                  {ligne.motif ? ` — ${ligne.motif}` : ""}
                </span>
                <button
                  type="button"
                  disabled={actionEnCours === `suppression-fermetures-${ligne.id}`}
                  onClick={() => supprimerPeriode("fermetures", ligne)}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  aria-label="Supprimer cette fermeture"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
            {fermetures.length === 0 && (
              <li className="py-3 text-sm text-gray-400">Aucune fermeture exceptionnelle.</li>
            )}
          </ul>
        )}
        <form
          onSubmit={(event) => ajouterPeriode("fermetures", event)}
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4"
        >
          {champsDateHeure(nouvelleFermeture.debut, (debut) =>
            setNouvelleFermeture((precedent) => ({ ...precedent, debut })), "Début", "fermeture-debut")}
          {champsDateHeure(nouvelleFermeture.fin, (fin) =>
            setNouvelleFermeture((precedent) => ({ ...precedent, fin })), "Fin", "fermeture-fin")}
          <label className="block min-w-0 flex-1">
            {champClasse("Motif (facultatif)")}
            <input
              value={nouvelleFermeture.motif}
              onChange={(event) =>
                setNouvelleFermeture((precedent) => ({
                  ...precedent,
                  motif: event.target.value,
                }))
              }
              className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm text-gray-700"
            />
          </label>
          <button
            type="submit"
            disabled={Boolean(erreursChargement.fermetures) || actionEnCours === "ajout-fermetures"}
            className="h-11 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Ajouter
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-sm">
        <h2 className="font-bold text-gray-800">Périodes de garde</h2>
        <p className="mt-1 text-xs text-gray-500">Saisies et affichées à l&apos;heure de Douala (UTC+1).</p>
        {erreursChargement.gardes ? (
          <p role="alert" className="mt-4 text-sm text-rose-700">
            Lecture des gardes impossible : {erreursChargement.gardes}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {gardes.map((ligne) => (
              <li key={ligne.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-sm text-gray-700">{afficherPeriode(ligne)}</span>
                <button
                  type="button"
                  disabled={actionEnCours === `suppression-gardes-${ligne.id}`}
                  onClick={() => supprimerPeriode("gardes", ligne)}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  aria-label="Supprimer cette période de garde"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
            {gardes.length === 0 && (
              <li className="py-3 text-sm text-gray-400">Aucune période de garde enregistrée.</li>
            )}
          </ul>
        )}
        <form
          onSubmit={(event) => ajouterPeriode("gardes", event)}
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4"
        >
          {champsDateHeure(nouvelleGarde.debut, (debut) =>
            setNouvelleGarde((precedent) => ({ ...precedent, debut })), "Début", "garde-debut")}
          {champsDateHeure(nouvelleGarde.fin, (fin) =>
            setNouvelleGarde((precedent) => ({ ...precedent, fin })), "Fin", "garde-fin")}
          <button
            type="submit"
            disabled={Boolean(erreursChargement.gardes) || actionEnCours === "ajout-gardes"}
            className="h-11 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Ajouter
          </button>
        </form>
      </section>
    </div>
  );
}
