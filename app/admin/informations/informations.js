"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import {
  ERREUR_TELEPHONE_PHARMACIE,
  normaliserEtValiderTelephonePharmacie,
} from "@/app/lib/telephonePharmacie";
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

function dateHeureVersIsoDouala(value) {
  return new Date(`${value}:00+01:00`).toISOString();
}

function etatPeriode(ligne, maintenant = Date.now()) {
  const debut = new Date(ligne.debut).getTime();
  const fin = new Date(ligne.fin).getTime();
  if (Number.isNaN(debut) || Number.isNaN(fin) || fin <= maintenant) return "terminee";
  if (debut > maintenant) return "a-venir";
  return "en-cours";
}

function trierPeriodes(lignes) {
  const ordre = { "en-cours": 0, "a-venir": 1, terminee: 2 };
  const maintenant = Date.now();
  return [...lignes].sort((a, b) => {
    const differenceEtat = ordre[etatPeriode(a, maintenant)] - ordre[etatPeriode(b, maintenant)];
    if (differenceEtat !== 0) return differenceEtat;
    const differenceDebut = new Date(a.debut).getTime() - new Date(b.debut).getTime();
    return etatPeriode(a, maintenant) === "terminee" ? -differenceDebut : differenceDebut;
  });
}

function validerDatesPeriode(periode) {
  if (!periode.debut || !periode.fin) return "";
  if (periode.fin <= periode.debut) {
    return "La date et l'heure de fin doivent être postérieures au début.";
  }
  const fin = new Date(dateHeureVersIsoDouala(periode.fin)).getTime();
  if (Number.isNaN(fin)) return "La date et l'heure de fin sont invalides.";
  if (fin <= Date.now()) return "Cette période ne peut pas être entièrement dans le passé.";
  return "";
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

function champClasse(label) {
  return (
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-emerald-800">
      {label}
    </span>
  );
}

export default function InformationsPharmacie({
  info,
  section,
  embedded = false,
  onUpdate,
  onFormStateChange,
  onStatusChange,
}) {
  const showToast = useToast();
  const [telephone, setTelephone] = useState(info.telephone || "");
  const [telephoneErreur, setTelephoneErreur] = useState("");
  const [enregistrementTelephone, setEnregistrementTelephone] = useState(false);
  const [horaires, setHoraires] = useState(
    JOURS.map(({ numero }) => ({ jour: numero, plages: [], ouvert: false }))
  );
  const [fermetures, setFermetures] = useState([]);
  const [gardes, setGardes] = useState([]);
  const [statut, setStatut] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreursChargement, setErreursChargement] = useState({});
  const [enregistrementHoraires, setEnregistrementHoraires] = useState(false);
  const [nouvelleFermeture, setNouvelleFermeture] = useState({
    debut: "",
    fin: "",
    motif: "",
  });
  const [nouvelleGarde, setNouvelleGarde] = useState({ debut: "", fin: "" });
  const [erreursPeriodes, setErreursPeriodes] = useState({ fermetures: "", gardes: "" });
  const [voirToutesFermeturesTerminees, setVoirToutesFermeturesTerminees] = useState(false);
  const [voirToutesGardesTerminees, setVoirToutesGardesTerminees] = useState(false);
  const [actionEnCours, setActionEnCours] = useState("");
  const [horairesEnregistres, setHorairesEnregistres] = useState(
    JOURS.map(({ numero }) => ({ jour: numero, ouvert: false, plages: [] }))
  );
  const [telephoneEnregistre, setTelephoneEnregistre] = useState(info.telephone || "");

  const horairesModifies = useMemo(
    () => JSON.stringify(horaires.map(({ jour, ouvert, plages }) => ({
      jour,
      ouvert,
      plages: plages.map(({ ouverture, fermeture }) => ({ ouverture, fermeture })),
    }))) !== JSON.stringify(horairesEnregistres),
    [horaires, horairesEnregistres]
  );
  const telephoneModifie = telephone !== telephoneEnregistre;
  const periodeModifiee = Boolean(
    nouvelleFermeture.debut || nouvelleFermeture.fin || nouvelleFermeture.motif ||
    nouvelleGarde.debut || nouvelleGarde.fin
  );

  const annulerHoraires = useCallback(() => {
    setHoraires(horairesEnregistres.map((jour) => ({
      jour: jour.jour,
      ouvert: jour.ouvert,
      plages: jour.plages.map((plage) => ({ ...plage, cle: NOUVELLE_PLAGE().cle })),
    })));
  }, [horairesEnregistres]);

  const annulerTelephone = useCallback(() => {
    setTelephone(telephoneEnregistre);
    setTelephoneErreur("");
  }, [telephoneEnregistre]);

  const annulerPeriodes = useCallback(() => {
    setNouvelleFermeture({ debut: "", fin: "", motif: "" });
    setNouvelleGarde({ debut: "", fin: "" });
  }, []);

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
          ouvert: false,
        }));
        (heuresResultat.data || []).forEach((ligne) => {
          const jour = parJour[ligne.jour_semaine - 1];
          if (jour) {
            jour.ouvert = true;
            jour.plages.push({
              cle: `${ligne.jour_semaine}-${jour.plages.length}`,
              ouverture: heureCourte(ligne.ouverture),
              fermeture: heureCourte(ligne.fermeture),
            });
          }
        });
        setHorairesEnregistres(parJour.map(({ jour, ouvert, plages }) => ({
          jour,
          ouvert,
          plages: plages.map(({ ouverture, fermeture }) => ({ ouverture, fermeture })),
        })));
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
        onStatusChange?.(statutResultat.data);
      }

      setErreursChargement(erreurs);
      setChargement(false);
    },
    [onStatusChange]
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

  const sauvegarderTelephone = useCallback(async () => {
    const resultatTelephone = normaliserEtValiderTelephonePharmacie(telephone);
    if (!resultatTelephone.valide) {
      setTelephone(telephoneEnregistre);
      setTelephoneErreur(ERREUR_TELEPHONE_PHARMACIE);
      return {
        success: false,
        error: ERREUR_TELEPHONE_PHARMACIE,
      };
    }

    setTelephoneErreur("");
    setEnregistrementTelephone(true);
    const { data, error } = await supabase
      .from("pharmacies")
      .update({ telephone: resultatTelephone.telephone })
      .eq("id", info.id)
      .select("id, nom, ville, emplacement, photo, telephone, latitude, longitude")
      .single();
    setEnregistrementTelephone(false);

    if (error) {
      console.error("Erreur d'enregistrement du téléphone :", error);
      return { success: false, error: detailErreur(error) };
    }
    setTelephone(data.telephone || resultatTelephone.telephone);
    setTelephoneEnregistre(data.telephone || resultatTelephone.telephone);
    onUpdate?.(data);
    return { success: true };
  }, [info.id, onUpdate, telephone, telephoneEnregistre]);

  const enregistrerTelephone = async (event) => {
    event.preventDefault();
    const result = await sauvegarderTelephone();
    if (!embedded) {
      showToast(
        result.success ? "Téléphone enregistré." : `Impossible d'enregistrer le téléphone : ${result.error}`,
        result.success ? "success" : "error",
        result.success ? 4000 : 9000
      );
    }
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
    const source = horaires.find((ligne) => ligne.jour === 1);
    if (!source) return;
    setHoraires((precedents) =>
      precedents.map((ligne) =>
        ligne.jour === source.jour
          ? ligne
          : {
              ...ligne,
              ouvert: source.ouvert,
              plages: source.plages.map((plage) => ({
                ...plage,
                cle: `${Date.now()}-${Math.random()}`,
              })),
            }
      )
    );
  };

  const sauvegarderHoraires = useCallback(async () => {
    for (const jour of horaires) {
      for (const plage of jour.plages) {
        if (
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(plage.ouverture) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(plage.fermeture)
        ) {
          return {
            success: false,
            error: `Complétez les heures d'ouverture et de fermeture du ${JOURS[jour.jour - 1].nom}.`,
          };
        }
      }
    }
    if (erreursChargement.horaires) {
      return { success: false, error: "Rechargez les horaires avant de les remplacer." };
    }

    setEnregistrementHoraires(true);
    const { data: anciensHoraires, error: lectureErreur } = await supabase
      .from("pharmacie_horaires")
      .select("id_pharmacie, jour_semaine, ouverture, fermeture")
      .eq("id_pharmacie", info.id);
    if (lectureErreur) {
      console.error("Erreur de lecture des horaires actuels :", lectureErreur);
      setEnregistrementHoraires(false);
      return { success: false, error: `Impossible de lire les horaires actuels : ${detailErreur(lectureErreur)}` };
    }

    const { error: suppressionErreur } = await supabase
      .from("pharmacie_horaires")
      .delete()
      .eq("id_pharmacie", info.id);
    if (suppressionErreur) {
      console.error("Erreur de suppression des anciens horaires :", suppressionErreur);
      setEnregistrementHoraires(false);
      return { success: false, error: `Impossible de supprimer les anciens horaires : ${detailErreur(suppressionErreur)}` };
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
        setEnregistrementHoraires(false);
        return {
          success: false,
          error: `Échec de l'enregistrement (${detailErreur(insertionErreur)}) et de la restauration (${detailErreur(restaurationErreur)}). Rechargez la page.`,
        };
      } else {
        setEnregistrementHoraires(false);
        return {
          success: false,
          error: `Échec de l'enregistrement des horaires : ${detailErreur(insertionErreur)}. Les horaires précédents ont été restaurés.`,
        };
      }
    }

    setHorairesEnregistres(horaires.map(({ jour, ouvert, plages }) => ({
      jour,
      ouvert,
      plages: plages.map(({ ouverture, fermeture }) => ({ ouverture, fermeture })),
    })));
    setErreursChargement((precedentes) => {
      const autresErreurs = { ...precedentes };
      delete autresErreurs.horaires;
      return autresErreurs;
    });
    setEnregistrementHoraires(false);
    setChargement(true);
    await chargerDonnees();
    return { success: true };
  }, [chargerDonnees, erreursChargement.horaires, horaires, info.id]);

  const enregistrerHoraires = async (event) => {
    event?.preventDefault();
    const result = await sauvegarderHoraires();
    if (!embedded) {
      showToast(
        result.success ? "Horaires hebdomadaires enregistrés." : result.error,
        result.success ? "success" : "error",
        result.success ? 4000 : 9000
      );
    }
  };

  const ajouterPeriode = useCallback(async (type, event = null) => {
    event?.preventDefault();
    const estFermeture = type === "fermetures";
    const periode = estFermeture ? nouvelleFermeture : nouvelleGarde;
    const erreurDates = !periode.debut || !periode.fin
      ? "Renseignez le début et la fin."
      : validerDatesPeriode(periode);
    if (erreurDates) {
      setErreursPeriodes((precedentes) => ({ ...precedentes, [type]: erreurDates }));
      return { success: false, error: erreurDates };
    }
    if (erreursChargement[type]) {
      return { success: false, error: "Rechargez la liste avant d'ajouter une période." };
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
      setActionEnCours("");
      return { success: false, error: `Impossible d'enregistrer cette période : ${detailErreur(error)}` };
    }

    if (estFermeture) {
      setNouvelleFermeture({ debut: "", fin: "", motif: "" });
    } else {
      setNouvelleGarde({ debut: "", fin: "" });
    }
    setErreursPeriodes((precedentes) => ({ ...precedentes, [type]: "" }));
    setChargement(true);
    await chargerDonnees();
    setActionEnCours("");
    return { success: true, message: estFermeture ? "Fermeture ajoutée." : "Période de garde ajoutée." };
  }, [chargerDonnees, erreursChargement, info.id, nouvelleFermeture, nouvelleGarde]);

  const supprimerPeriode = async (type, ligne) => {
    const estFermeture = type === "fermetures";
    const etat = etatPeriode(ligne);
    if (
      etat !== "terminee" &&
      !window.confirm(
        estFermeture
          ? "Supprimer cette fermeture exceptionnelle ? Le statut affiché aux patients peut changer."
          : "Supprimer cette période de garde ? Le statut affiché aux patients peut changer."
      )
    ) {
      return;
    }
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

  const modifierDatePeriode = (type, champ, valeur) => {
    const periode = type === "fermetures" ? nouvelleFermeture : nouvelleGarde;
    const prochainePeriode = { ...periode, [champ]: valeur };
    if (type === "fermetures") {
      setNouvelleFermeture(prochainePeriode);
    } else {
      setNouvelleGarde(prochainePeriode);
    }
    setErreursPeriodes((precedentes) => ({
      ...precedentes,
      [type]: validerDatesPeriode(prochainePeriode),
    }));
  };

  const champsDateHeure = (value, onChange, label, name, erreur = "") => (
    <label className="block min-w-0 flex-1">
      {champClasse(label)}
      <input
        aria-label={label}
        type="datetime-local"
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(erreur)}
        aria-describedby={erreur ? `${name}-erreur` : undefined}
        required
        className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm text-gray-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
      />
      {erreur && <span id={`${name}-erreur`} role="alert" className="mt-1 block text-xs text-rose-700">{erreur}</span>}
    </label>
  );

  const afficherPeriode = (ligne) => {
    const formater = (value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      const jourEtDate = new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Africa/Douala",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(date);
      const heure = new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Africa/Douala",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(date).replace(":", "h");
      return `${jourEtDate} à ${heure}`;
    };
    const debut = formater(ligne.debut);
    const fin = formater(ligne.fin);
    return debut && fin ? `Du ${debut} au ${fin}` : "Dates indisponibles";
  };

  const afficherListePeriodes = (type, lignes, erreurChargement, messageVide, avecMotif = false) => {
    if (erreurChargement) {
      return (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          Lecture des {type} impossible : {erreurChargement}
        </p>
      );
    }

    const ordre = trierPeriodes(lignes);
    const terminees = ordre.filter((ligne) => etatPeriode(ligne) === "terminee");
    const nonTerminees = ordre.filter((ligne) => etatPeriode(ligne) !== "terminee");
    const voirTerminees = type === "fermetures" ? voirToutesFermeturesTerminees : voirToutesGardesTerminees;
    const basculeTerminees = type === "fermetures"
      ? setVoirToutesFermeturesTerminees
      : setVoirToutesGardesTerminees;
    const lignesVisibles = [
      ...nonTerminees,
      ...(terminees.length > 3 && !voirTerminees ? terminees.slice(0, 3) : terminees),
    ];
    const stylesEtat = {
      "en-cours": { label: "En cours", classes: "bg-amber-100 text-amber-900" },
      "a-venir": { label: "À venir", classes: "bg-sky-100 text-sky-800" },
      terminee: { label: "Terminée", classes: "bg-gray-100 text-gray-500" },
    };

    return (
      <>
        <ul className="mt-4 divide-y divide-gray-100">
          {lignesVisibles.map((ligne) => {
            const etat = etatPeriode(ligne);
            const presentation = stylesEtat[etat];
            const cleSuppression = `suppression-${type}-${ligne.id}`;
            return (
              <li
                key={ligne.id}
                className={`flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  etat === "terminee" ? "text-gray-500" : "text-gray-700"
                }`}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm">{afficherPeriode(ligne)}</span>
                  {avecMotif && ligne.motif && (
                    <span className="text-sm text-gray-500">— {ligne.motif}</span>
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${presentation.classes}`}>
                    {presentation.label}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={actionEnCours === cleSuppression}
                  onClick={() => supprimerPeriode(type, ligne)}
                  className="self-start rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 sm:self-auto"
                  aria-label={type === "fermetures"
                    ? "Supprimer cette fermeture exceptionnelle"
                    : "Supprimer cette période de garde"}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            );
          })}
          {lignes.length === 0 && (
            <li className="py-3 text-sm text-gray-400">{messageVide}</li>
          )}
        </ul>
        {terminees.length > 3 && (
          <button
            type="button"
            onClick={() => basculeTerminees((visible) => !visible)}
            className="mt-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900"
          >
            {voirTerminees
              ? "Masquer les périodes terminées"
              : `Voir les périodes terminées (${terminees.length})`}
          </button>
        )}
      </>
    );
  };

  const soumettrePeriode = async (type, event) => {
    const result = await ajouterPeriode(type, event);
    if (embedded) {
      showToast(
        result.success ? result.message : result.error,
        result.success ? "success" : "error",
        result.success ? 4000 : 9000
      );
    }
  };

  useEffect(() => {
    onFormStateChange?.("telephone", {
      dirty: telephoneModifie,
      cancel: annulerTelephone,
      save: sauvegarderTelephone,
      loading: enregistrementTelephone,
    });
  }, [annulerTelephone, enregistrementTelephone, onFormStateChange, telephoneModifie, sauvegarderTelephone]);

  useEffect(() => {
    onFormStateChange?.("horaires", {
      dirty: horairesModifies,
      cancel: annulerHoraires,
      save: sauvegarderHoraires,
      loading: enregistrementHoraires || chargement,
    });
  }, [annulerHoraires, chargement, enregistrementHoraires, horairesModifies, onFormStateChange, sauvegarderHoraires]);

  useEffect(() => {
    onFormStateChange?.("fermetures", {
      dirty: periodeModifiee,
      cancel: annulerPeriodes,
      loading: Boolean(actionEnCours),
    });
  }, [actionEnCours, annulerPeriodes, onFormStateChange, periodeModifiee]);

  if (!["general", "horaires", "fermetures"].includes(section)) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {section === "general" && (
      <section className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-sm">
        <form onSubmit={enregistrerTelephone}>
          <label htmlFor="telephone-pharmacie">
            {champClasse("Téléphone de la pharmacie *")}
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
              className="h-11 w-full max-w-[260px] rounded-xl border border-gray-200 px-4 text-sm text-gray-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            />
          </div>
          {telephoneErreur && (
            <p id="telephone-erreur" role="alert" className="mt-2 text-sm text-rose-700">
              {telephoneErreur}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            Ce numéro est visible par les patients (appel et WhatsApp). Utilisez le numéro de la pharmacie. Un numéro mobile, commençant par 6, permet aussi de recevoir des messages WhatsApp.
          </p>
        </form>
      </section>
      )}

      {section === "horaires" && (
      <section className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarDaysIcon className="h-6 w-6 text-emerald-700" />
            <div>
              <h2 className="font-bold text-gray-800">Horaires hebdomadaires</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={copierHoraires}
            disabled={Boolean(erreursChargement.horaires) || chargement}
            className="h-10 rounded-lg border border-emerald-200 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
          >
            Copier le lundi sur tous les jours
          </button>
        </div>

        {erreursChargement.horaires && (
          <p role="alert" className="mt-4 text-sm text-rose-700">
            Lecture des horaires impossible : {erreursChargement.horaires}
          </p>
        )}
        <form onSubmit={enregistrerHoraires} className="mt-3 space-y-2">
          {horaires.map((jour) => (
            <div
              key={jour.jour}
              className="grid items-center gap-2 border-t border-gray-100 pt-2 sm:grid-cols-[10rem_1fr]"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-gray-700">
                  {JOURS[jour.jour - 1].nom}
                </h3>
                <button
                  type="button"
                  role="switch"
                  aria-checked={jour.ouvert}
                  aria-label={`${JOURS[jour.jour - 1].nom} ouvert`}
                  onClick={() => setHoraires((precedents) => precedents.map((ligne) =>
                    ligne.jour === jour.jour
                      ? { ...ligne, ouvert: !ligne.ouvert, plages: !ligne.ouvert && ligne.plages.length === 0 ? [NOUVELLE_PLAGE()] : !ligne.ouvert ? ligne.plages : [] }
                      : ligne
                  ))}
                  className={`relative h-6 w-11 rounded-full transition ${jour.ouvert ? "bg-emerald-600" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${jour.ouvert ? "left-6" : "left-1"}`} />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!jour.ouvert && (
                  <p className="py-2 text-sm text-gray-400">Fermé</p>
                )}
                {jour.ouvert && jour.plages.map((plage) => {
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
                            precedents.map((ligne) => {
                              if (ligne.jour !== jour.jour) return ligne;
                              const plages = ligne.plages.filter(
                                (element) => element.cle !== plage.cle
                              );
                              return { ...ligne, plages, ouvert: plages.length > 0 };
                            })
                          )
                        }
                        className="rounded-lg p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
                {jour.ouvert && <button
                  type="button"
                  aria-label="Ajouter une plage"
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
                </button>}
              </div>
            </div>
          ))}
        </form>
      </section>
      )}

      {section === "fermetures" && <>
      <section className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-sm">
        <h2 className="font-bold text-gray-800">Fermetures exceptionnelles</h2>
        {afficherListePeriodes(
          "fermetures",
          fermetures,
          erreursChargement.fermetures,
          "Aucune fermeture exceptionnelle.",
          true
        )}
        <form
          onSubmit={(event) => soumettrePeriode("fermetures", event)}
          className="mt-4 flex flex-col items-stretch gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-end"
        >
          {champsDateHeure(
            nouvelleFermeture.debut,
            (debut) => modifierDatePeriode("fermetures", "debut", debut),
            "Début",
            "fermeture-debut"
          )}
          {champsDateHeure(
            nouvelleFermeture.fin,
            (fin) => modifierDatePeriode("fermetures", "fin", fin),
            "Fin",
            "fermeture-fin",
            erreursPeriodes.fermetures
          )}
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
        <p className="mt-2 text-xs text-gray-500">Ajouter enregistre immédiatement.</p>
      </section>

      <section className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-sm">
        <h2 className="font-bold text-gray-800">Périodes de garde</h2>
        {afficherListePeriodes(
          "gardes",
          gardes,
          erreursChargement.gardes,
          "Aucune période de garde enregistrée."
        )}
        <form
          onSubmit={(event) => soumettrePeriode("gardes", event)}
          className="mt-4 flex flex-col items-stretch gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-end"
        >
          {champsDateHeure(
            nouvelleGarde.debut,
            (debut) => modifierDatePeriode("gardes", "debut", debut),
            "Début",
            "garde-debut"
          )}
          {champsDateHeure(
            nouvelleGarde.fin,
            (fin) => modifierDatePeriode("gardes", "fin", fin),
            "Fin",
            "garde-fin",
            erreursPeriodes.gardes
          )}
          <button
            type="submit"
            disabled={Boolean(erreursChargement.gardes) || actionEnCours === "ajout-gardes"}
            className="h-11 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Ajouter
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-500">Ajouter enregistre immédiatement.</p>
      </section>
      </>}
    </div>
  );
}
