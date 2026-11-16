"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const formateurJour = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Douala",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const formateurPartiesJour = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Douala",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const distanceDuBas = (element) => Math.abs(element.scrollTop);

const obtenirJourDouala = (valeur) => {
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return null;

  const parties = Object.fromEntries(
    formateurPartiesJour.formatToParts(date)
      .filter((partie) => partie.type !== "literal")
      .map((partie) => [partie.type, partie.value])
  );
  const annee = Number(parties.year);
  const mois = Number(parties.month);
  const jour = Number(parties.day);

  return {
    cle: `${parties.year}-${parties.month}-${parties.day}`,
    numero: Date.UTC(annee, mois - 1, jour) / 86400000,
    date,
  };
};

const formaterSeparateurJour = (jour, aujourdHui) => {
  if (aujourdHui && jour.numero === aujourdHui.numero) return "Aujourd'hui";
  if (aujourdHui && jour.numero === aujourdHui.numero - 1) return "Hier";
  return formateurJour.format(jour.date);
};

export default function ChatMessageThread({
  messages,
  peutChargerPrecedents,
  chargementPrecedents,
  chargerMessagesPrecedents,
  renderMessage,
  contenuVide,
  label,
}) {
  const filRef = useRef(null);
  const messagesPrecedentsRef = useRef(null);
  const estAuBasRef = useRef(true);
  const [nouveauMessageDisponible, setNouveauMessageDisponible] = useState(false);
  const [aujourdHui, setAujourdHui] = useState(null);

  useLayoutEffect(() => {
    const fil = filRef.current;
    if (!fil) return;

    const precedents = messagesPrecedentsRef.current;
    if (!precedents) {
      fil.scrollTop = 0;
      messagesPrecedentsRef.current = messages;
      estAuBasRef.current = true;
      return;
    }

    const idsPrecedents = new Set(precedents.map((message) => message.id));
    const messagesAjoutes = messages.filter((message) => !idsPrecedents.has(message.id));
    const dernierPrecedent = precedents[precedents.length - 1];
    const dateDernierPrecedent = dernierPrecedent
      ? new Date(dernierPrecedent.cree_le).getTime()
      : null;
    const messagesRecentsAjoutes = messagesAjoutes.filter((message) => (
      dateDernierPrecedent === null
      || new Date(message.cree_le).getTime() >= dateDernierPrecedent
    ));
    const ancienMessageRelance = messages.some((message) => {
      const precedent = precedents.find((item) => item.id === message.id);
      return precedent?.envoiStatut === "echec" && message.envoiStatut === "envoi";
    });

    messagesPrecedentsRef.current = messages;

    if (!messagesRecentsAjoutes.length && !ancienMessageRelance) return;

    const envoiPharmacie = ancienMessageRelance
      || messagesRecentsAjoutes.some((message) => message.auteur_role === "pharmacie");
    if (envoiPharmacie || estAuBasRef.current) {
      fil.scrollTop = 0;
      estAuBasRef.current = true;
      setNouveauMessageDisponible(false);
    } else {
      setNouveauMessageDisponible(true);
    }
  }, [messages]);

  useEffect(() => {
    const actualiserJour = () => {
      const prochainJour = obtenirJourDouala(Date.now());
      if (!prochainJour) return;
      setAujourdHui((jourActuel) => (
        jourActuel?.cle === prochainJour.cle ? jourActuel : prochainJour
      ));
    };
    const timerInitial = window.setTimeout(actualiserJour, 0);
    const intervalle = window.setInterval(actualiserJour, 60_000);

    return () => {
      window.clearTimeout(timerInitial);
      window.clearInterval(intervalle);
    };
  }, [messages]);

  const gererDefilement = () => {
    const estAuBas = distanceDuBas(filRef.current) <= 120;
    estAuBasRef.current = estAuBas;
    if (estAuBas) setNouveauMessageDisponible(false);
  };

  const messagesDansOrdreInverse = [...messages].reverse().map((message) => ({
    message,
    jour: obtenirJourDouala(message.cree_le),
  }));
  const elementsMessages = messagesDansOrdreInverse.flatMap((element, index) => {
    const prochainJour = messagesDansOrdreInverse[index + 1]?.jour;
    const finDuJour = element.jour
      && (index === messagesDansOrdreInverse.length - 1 || element.jour.cle !== prochainJour?.cle);
    const elements = [renderMessage(element.message)];

    if (finDuJour) {
      elements.push(
        <div
          key={`separateur-${element.jour.cle}`}
          aria-label={formaterSeparateurJour(element.jour, aujourdHui)}
          className="flex shrink-0 items-center gap-3 py-1"
        >
          <span aria-hidden="true" className="h-px flex-1 bg-gray-200" />
          <span className="rounded-full bg-gray-50 px-3 py-1 text-[11px] font-medium text-gray-500">
            {formaterSeparateurJour(element.jour, aujourdHui)}
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-gray-200" />
        </div>
      );
    }

    return elements;
  });

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={filRef}
        onScroll={gererDefilement}
        aria-live="polite"
        aria-label={label}
        className="flex h-full min-h-0 flex-col-reverse gap-4 overflow-y-auto overscroll-contain p-4 sm:p-6"
      >
        {messages.length > 0
          ? elementsMessages
          : contenuVide}
        {peutChargerPrecedents && (
          <div className="flex shrink-0 justify-center">
            <button
              type="button"
              onClick={chargerMessagesPrecedents}
              disabled={chargementPrecedents}
              className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {chargementPrecedents ? "Chargement..." : "Voir les messages précédents"}
            </button>
          </div>
        )}
      </div>
      {nouveauMessageDisponible && (
        <button
          type="button"
          onClick={() => {
            if (filRef.current) filRef.current.scrollTop = 0;
            estAuBasRef.current = true;
            setNouveauMessageDisponible(false);
          }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-md"
        >
          ↓ Nouveau message
        </button>
      )}
    </div>
  );
}
