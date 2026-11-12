"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowPathIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { supabase } from "@/app/lib/supabaseClient";

const reponsesRapides = [
  "Disponible, vous pouvez venir le retirer",
  "Désolé, en rupture de stock",
  "Disponible demain",
  "Pouvez-vous préciser la quantité ?",
];

const formaterDate = (date, avecDate = false) => {
  if (!date) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Douala",
    ...(avecDate ? { dateStyle: "short" } : {}),
    timeStyle: "short",
  }).format(new Date(date));
};

export default function Demandes({
  discussions,
  nonLus,
  chargement,
  erreur,
  erreurCanal,
  versionMessages,
  actualiser,
  discussionOuverteId,
  onOuvrirDiscussion,
}) {
  const [messages, setMessages] = useState([]);
  const [nomsMedicaments, setNomsMedicaments] = useState({});
  const [chargementMessages, setChargementMessages] = useState(false);
  const [erreurMessages, setErreurMessages] = useState(false);
  const [filtreNonLus, setFiltreNonLus] = useState(false);
  const [contenu, setContenu] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const filRef = useRef(null);
  const requestIdRef = useRef(0);

  const discussionOuverte = discussions.find((discussion) => discussion.id === discussionOuverteId);
  const discussionsFiltrees = useMemo(
    () => filtreNonLus
      ? discussions.filter((discussion) => discussion.non_lus_pharmacie > 0)
      : discussions,
    [discussions, filtreNonLus]
  );

  const choisirDiscussion = useCallback((discussionId) => {
    setContenu("");
    setErreurEnvoi("");
    onOuvrirDiscussion(discussionId);
  }, [onOuvrirDiscussion]);

  const chargerMessages = useCallback(async () => {
    if (!discussionOuverteId) {
      setMessages([]);
      setNomsMedicaments({});
      return;
    }

    const requestId = ++requestIdRef.current;
    setChargementMessages(true);
    setErreurMessages(false);

    try {
      const { data, error: erreurChargement } = await supabase
        .from("discussion_messages")
        .select("id, discussion_id, auteur_role, contenu, id_medicament, cree_le, lu_le")
        .eq("discussion_id", discussionOuverteId)
        .order("cree_le", { ascending: true });

      if (erreurChargement) throw erreurChargement;
      if (requestId !== requestIdRef.current) return;

      const messagesCharges = data || [];
      setMessages(messagesCharges);

      const idsMedicaments = [...new Set(
        messagesCharges
          .map((message) => message.id_medicament)
          .filter((id) => id !== null)
      )];

      if (idsMedicaments.length === 0) {
        setNomsMedicaments({});
      } else {
        const { data: medicaments, error: erreurMedicaments } = await supabase
          .from("medicaments")
          .select("id, nom")
          .in("id", idsMedicaments);

        if (erreurMedicaments) throw erreurMedicaments;
        if (requestId !== requestIdRef.current) return;
        setNomsMedicaments(Object.fromEntries(
          (medicaments || []).map((medicament) => [medicament.id, medicament.nom])
        ));
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Erreur lors du chargement des messages de la demande :", error);
      setErreurMessages(true);
    } finally {
      if (requestId === requestIdRef.current) setChargementMessages(false);
    }
  }, [discussionOuverteId]);

  useEffect(() => {
    Promise.resolve().then(chargerMessages);
  }, [chargerMessages, versionMessages]);

  useEffect(() => {
    if (filRef.current) {
      filRef.current.scrollTop = filRef.current.scrollHeight;
    }
  }, [messages]);

  const envoyerMessage = async () => {
    const texte = contenu.trim();
    if (!discussionOuverteId || !texte || envoi) return;

    setEnvoi(true);
    setErreurEnvoi("");

    try {
      const { error: erreurInsertion } = await supabase
        .from("discussion_messages")
        .insert({ discussion_id: discussionOuverteId, contenu: texte });

      if (erreurInsertion) throw erreurInsertion;

      setContenu("");
      await chargerMessages();
    } catch (error) {
      console.error("Erreur lors de l'envoi d'une réponse client :", error);
      setErreurEnvoi(
        error?.message?.toLowerCase().includes("limite")
          ? "Vous envoyez trop de messages, patientez un instant."
          : "Impossible d'envoyer le message. Réessayez."
      );
    } finally {
      setEnvoi(false);
    }
  };

  const gererTouche = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      envoyerMessage();
    }
  };

  if (chargement) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-500" />
        <p className="text-sm font-medium text-gray-500">Chargement des demandes clients...</p>
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-800">
        <h2 className="text-sm font-bold">Impossible de charger les demandes clients.</h2>
        <button
          type="button"
          onClick={actualiser}
          aria-label="Réessayer de charger les demandes clients"
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Réessayer
        </button>
      </div>
    );
  }

  if (discussions.length === 0) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <h2 className="text-base font-bold text-gray-800">Aucune demande pour le moment.</h2>
        <p className="mt-2 max-w-md text-sm text-gray-500">
          Les messages des clients apparaîtront ici en temps réel.
        </p>
        {erreurCanal && (
          <div role="alert" className="mt-5 flex flex-col items-center gap-3 text-sm text-rose-700">
            <p>La connexion temps réel a échoué. Actualisez pour réessayer.</p>
            <button type="button" onClick={actualiser} className="rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white">
              Actualiser
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="flex h-full min-h-[480px] flex-col gap-3">
      {erreurCanal && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p>La connexion temps réel a échoué. Actualisez pour réessayer.</p>
          <button
            type="button"
            onClick={actualiser}
            aria-label="Actualiser les demandes clients"
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Actualiser
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={`min-h-0 flex-col border-gray-100 lg:flex lg:border-r ${discussionOuverteId ? "hidden" : "flex"}`}>
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4">
            <div>
              <h2 className="font-bold text-gray-800">Demandes clients</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {discussions.length} conversation{discussions.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiltreNonLus((actif) => !actif)}
              aria-pressed={filtreNonLus}
              aria-label={filtreNonLus ? "Afficher toutes les demandes" : "Filtrer les demandes non lues"}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                filtreNonLus
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Non lus{nonLus > 0 ? ` (${nonLus})` : ""}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {discussionsFiltrees.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">
                {filtreNonLus ? "Aucune demande non lue." : "Aucune demande pour le moment."}
              </p>
            ) : discussionsFiltrees.map((discussion) => (
              <button
                key={discussion.id}
                type="button"
                onClick={() => choisirDiscussion(discussion.id)}
                aria-label={`Ouvrir la demande du client numéro ${discussion.utilisateur_id}`}
                className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-4 text-left transition hover:bg-emerald-50/60 ${
                  discussion.id === discussionOuverteId ? "bg-emerald-50" : ""
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-sm font-bold text-teal-700">
                  {String(discussion.utilisateur_id).slice(-2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gray-800">
                      Client n° {discussion.utilisateur_id}
                    </span>
                    <span className="shrink-0 text-[11px] text-gray-400">
                      {formaterDate(discussion.dernier_message_at || discussion.dernierMessage?.cree_le)}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-gray-500">
                    {discussion.dernierMessage?.contenu || "Aucun message"}
                  </span>
                </span>
                {discussion.non_lus_pharmacie > 0 && (
                  <span
                    aria-label={`${discussion.non_lus_pharmacie} message${discussion.non_lus_pharmacie === 1 ? "" : "s"} non lu${discussion.non_lus_pharmacie === 1 ? "" : "s"}`}
                    className="mt-1 inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white"
                  >
                    {discussion.non_lus_pharmacie}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        <div className={`min-h-0 min-w-0 flex-col ${discussionOuverteId ? "flex" : "hidden lg:flex"}`}>
          {!discussionOuverte ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-500">
              Sélectionnez une demande pour afficher les messages.
            </div>
          ) : (
            <>
              <header className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
                <button
                  type="button"
                  onClick={() => choisirDiscussion(null)}
                  aria-label="Retour à la liste des demandes"
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </button>
                <div>
                  <h2 className="font-bold text-gray-800">
                    Client n° {discussionOuverte.utilisateur_id}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {discussionOuverte.dernier_message_at
                      ? `Dernier message ${formaterDate(discussionOuverte.dernier_message_at, true)}`
                      : "Demande client"}
                  </p>
                </div>
              </header>

              {chargementMessages ? (
                <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
                  Chargement des messages...
                </div>
              ) : erreurMessages ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-rose-700">Impossible de charger les messages.</p>
                  <button
                    type="button"
                    onClick={chargerMessages}
                    aria-label="Réessayer de charger les messages"
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    Réessayer
                  </button>
                </div>
              ) : (
                <div
                  ref={filRef}
                  aria-live="polite"
                  aria-label="Fil des messages de la demande"
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6"
                >
                  {messages.map((message) => {
                    const estPharmacie = message.auteur_role === "pharmacie";
                    return (
                      <article
                        key={message.id}
                        className={`flex ${estPharmacie ? "justify-end" : "justify-start"}`}
                      >
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          estPharmacie
                            ? "rounded-br-md bg-emerald-600 text-white"
                            : "rounded-bl-md bg-teal-50 text-gray-800"
                        }`}>
                          {message.id_medicament !== null && (
                            <span className={`mb-2 block rounded-lg px-2.5 py-1 text-xs font-semibold ${
                              estPharmacie ? "bg-white/15 text-emerald-50" : "bg-teal-100 text-teal-800"
                            }`}>
                              Demande pour : {nomsMedicaments[message.id_medicament] || "Médicament"}
                            </span>
                          )}
                          <p className="whitespace-pre-wrap break-words text-sm">{message.contenu}</p>
                          <time
                            dateTime={message.cree_le}
                            className={`mt-1.5 block text-right text-[11px] ${
                              estPharmacie ? "text-emerald-100" : "text-gray-500"
                            }`}
                          >
                            {formaterDate(message.cree_le)}
                          </time>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="shrink-0 space-y-3 border-t border-gray-100 p-4 sm:p-5">
                <div className="flex flex-wrap gap-2" aria-label="Réponses rapides">
                  {reponsesRapides.map((reponse) => (
                    <button
                      key={reponse}
                      type="button"
                      onClick={() => {
                        setContenu(reponse);
                        setErreurEnvoi("");
                      }}
                      className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-left text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
                    >
                      {reponse}
                    </button>
                  ))}
                </div>

                {erreurEnvoi && (
                  <p role="alert" className="text-sm text-rose-600">{erreurEnvoi}</p>
                )}
                <label htmlFor="reponse-demande-client" className="sr-only">
                  Votre réponse au client
                </label>
                <div className="flex items-end gap-3">
                  <div className="min-w-0 flex-1">
                    <textarea
                      id="reponse-demande-client"
                      value={contenu}
                      onChange={(event) => {
                        setContenu(event.target.value.slice(0, 500));
                        setErreurEnvoi("");
                      }}
                      onKeyDown={gererTouche}
                      maxLength={500}
                      rows={3}
                      placeholder="Écrivez votre réponse..."
                      className="block w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <p className="mt-1 text-right text-xs text-gray-400">{contenu.length}/500</p>
                  </div>
                  <button
                    type="button"
                    onClick={envoyerMessage}
                    disabled={envoi || !contenu.trim()}
                    aria-label="Envoyer la réponse"
                    className="mb-5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PaperAirplaneIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
