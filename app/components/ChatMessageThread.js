"use client";

import { useLayoutEffect, useRef, useState } from "react";

const distanceDuBas = (element) => Math.abs(element.scrollTop);

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

  const gererDefilement = () => {
    const estAuBas = distanceDuBas(filRef.current) <= 120;
    estAuBasRef.current = estAuBas;
    if (estAuBas) setNouveauMessageDisponible(false);
  };

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
          ? [...messages].reverse().map(renderMessage)
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
