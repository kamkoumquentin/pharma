"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import ChatMessageThread from "@/app/components/ChatMessageThread";
import { logErreur } from "@/app/lib/logger";

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
  messages,
  nomsMedicaments,
  chargementMessages,
  erreurMessages,
  chargementPrecedents,
  peutChargerPrecedents,
  chargerMessages,
  chargerMessagesPrecedents,
  envoyerMessage: envoyerMessageEnMemoire,
  modifierMessage: modifierMessageEnMemoire,
  supprimerMessage: supprimerMessageEnMemoire,
  actualiser,
  discussionOuverteId,
  onOuvrirDiscussion,
}) {
  const [filtreNonLus, setFiltreNonLus] = useState(false);
  const [contenu, setContenu] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [messageEnEditionId, setMessageEnEditionId] = useState(null);
  const [contenuEdition, setContenuEdition] = useState("");
  const [messageEnActionId, setMessageEnActionId] = useState(null);
  const [erreurActionMessage, setErreurActionMessage] = useState("");
  const [erreurActionMessageId, setErreurActionMessageId] = useState(null);
  const [tempsCourant, setTempsCourant] = useState(0);
  const discussionOuverte = discussions.find((discussion) => discussion.id === discussionOuverteId);
  const estModifiable = (message) => {
    const creeLe = new Date(message.cree_le).getTime();
    return message.auteur_role === "pharmacie"
      && !message.supprime_le
      && !message.envoiStatut
      && Number.isFinite(creeLe)
      && tempsCourant >= creeLe
      && tempsCourant < creeLe + 15 * 60 * 1000;
  };
  const discussionsFiltrees = useMemo(
    () => filtreNonLus
      ? discussions.filter((discussion) => discussion.non_lus_pharmacie > 0)
      : discussions,
    [discussions, filtreNonLus]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setTempsCourant(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    if (!tempsCourant) return undefined;
    const changements = messages
      .filter((message) => message.auteur_role === "pharmacie" && !message.supprime_le)
      .flatMap((message) => {
        const creeLe = new Date(message.cree_le).getTime();
        return [creeLe, creeLe + 15 * 60 * 1000];
      })
      .filter((changement) => Number.isFinite(changement) && changement > Date.now());
    if (changements.length === 0) return undefined;

    const timer = window.setTimeout(
      () => setTempsCourant(Date.now()),
      Math.max(0, Math.min(...changements) - Date.now() + 1)
    );
    return () => window.clearTimeout(timer);
  }, [messages, tempsCourant]);

  const choisirDiscussion = useCallback((discussionId) => {
    setContenu("");
    setErreurEnvoi("");
    setMessageEnEditionId(null);
    setContenuEdition("");
    setErreurActionMessage("");
    setErreurActionMessageId(null);
    onOuvrirDiscussion(discussionId);
  }, [onOuvrirDiscussion]);

  const envoyerMessage = async () => {
    const texte = contenu.trim();
    if (!discussionOuverteId || !texte || envoi) return;

    setEnvoi(true);
    setErreurEnvoi("");

    try {
      await envoyerMessageEnMemoire(discussionOuverteId, texte);
      setContenu("");
    } catch (error) {
      logErreur("DemandesAdmin", "envoi d'une réponse client", error, {
        discussionId: discussionOuverteId,
      });
      setErreurEnvoi(
        error?.message?.toLowerCase().includes("limite")
          ? "Vous envoyez trop de messages, patientez un instant."
          : "Impossible d'envoyer le message. Réessayez."
      );
    } finally {
      setEnvoi(false);
    }
  };

  const reessayerMessage = async (message) => {
    if (envoi) return;
    setEnvoi(true);
    setErreurEnvoi("");
    try {
      await envoyerMessageEnMemoire(discussionOuverteId, message.contenu, message.id);
    } catch (error) {
      logErreur("DemandesAdmin", "nouvelle tentative d'envoi d'une réponse", error, {
        discussionId: discussionOuverteId,
        messageId: message.id,
      });
      setErreurEnvoi("Impossible d'envoyer le message. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  const demarrerModification = (message) => {
    setMessageEnEditionId(message.id);
    setContenuEdition(message.contenu);
    setErreurActionMessage("");
    setErreurActionMessageId(null);
  };

  const annulerModification = () => {
    setMessageEnEditionId(null);
    setContenuEdition("");
    setErreurActionMessage("");
    setErreurActionMessageId(null);
  };

  const enregistrerModification = async (message) => {
    const texte = contenuEdition.trim();
    if (!texte || messageEnActionId) return;

    setMessageEnActionId(message.id);
    setErreurActionMessage("");
    try {
      await modifierMessageEnMemoire(discussionOuverteId, message.id, texte);
      annulerModification();
    } catch (error) {
      logErreur("DemandesAdmin", "modification d'un message", error, {
        discussionId: discussionOuverteId,
        messageId: message.id,
      });
      setErreurActionMessage("Impossible de modifier ce message. Réessayez.");
      setErreurActionMessageId(message.id);
    } finally {
      setMessageEnActionId(null);
    }
  };

  const supprimerMessage = async (message) => {
    if (
      messageEnActionId
      || !window.confirm("Supprimer ce message ? Il restera visible comme supprimé dans la discussion.")
    ) return;

    setMessageEnActionId(message.id);
    setErreurActionMessage("");
    try {
      await supprimerMessageEnMemoire(discussionOuverteId, message.id);
      if (messageEnEditionId === message.id) annulerModification();
    } catch (error) {
      logErreur("DemandesAdmin", "suppression d'un message", error, {
        discussionId: discussionOuverteId,
        messageId: message.id,
      });
      setErreurActionMessage("Impossible de supprimer ce message. Réessayez.");
      setErreurActionMessageId(message.id);
    } finally {
      setMessageEnActionId(null);
    }
  };

  const chargerAnciensMessages = async () => {
    await chargerMessagesPrecedents();
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
    <section className="flex h-full min-h-0 flex-col gap-3">
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
                      {formaterDate(discussion.dernier_message_at)}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-gray-500">
                    {discussion.dernier_extrait
                      ? `${discussion.dernier_auteur_role === "pharmacie" ? "Vous" : "Client"} : ${discussion.dernier_extrait}`
                      : "Aucun message"}
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
                {discussion.alerte_modification_pharmacie && (
                  <span
                    role="img"
                    aria-label="Un message a été modifié ou supprimé depuis votre dernière lecture"
                    title="Un message a été modifié ou supprimé depuis votre dernière lecture"
                    className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
                  >
                    <PencilSquareIcon className="h-3.5 w-3.5" />
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
                    onClick={() => chargerMessages(discussionOuverteId)}
                    aria-label="Réessayer de charger les messages"
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    Réessayer
                  </button>
                </div>
              ) : (
                <ChatMessageThread
                  key={discussionOuverteId}
                  messages={messages}
                  peutChargerPrecedents={peutChargerPrecedents}
                  chargementPrecedents={chargementPrecedents}
                  chargerMessagesPrecedents={chargerAnciensMessages}
                  label="Fil des messages de la demande"
                  renderMessage={(message) => {
                    const estPharmacie = message.auteur_role === "pharmacie";
                    const estSupprime = Boolean(message.supprime_le);
                    const enEdition = messageEnEditionId === message.id;
                    const peutGerer = estModifiable(message);
                    const messageSignale = discussionOuverte.alerte_modification_pharmacie
                      && Boolean(message.modifie_le || message.supprime_le);
                    return (
                      <article
                        key={message.id}
                        className={`group flex shrink-0 focus-within:z-10 ${estPharmacie ? "justify-end" : "justify-start"}`}
                      >
                        <div className={`relative max-w-[85%] rounded-2xl px-4 py-3 ${
                          estSupprime
                            ? "rounded-br-md bg-gray-100 text-gray-500"
                            : estPharmacie
                              ? "rounded-br-md bg-emerald-600 text-white"
                              : "rounded-bl-md bg-teal-50 text-gray-800"
                        } ${messageSignale ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}>
                          {message.id_medicament !== null && !estSupprime && (
                            <span className={`mb-2 block rounded-lg px-2.5 py-1 text-xs font-semibold ${
                              estPharmacie ? "bg-white/15 text-emerald-50" : "bg-teal-100 text-teal-800"
                            }`}>
                              Demande pour : {nomsMedicaments[message.id_medicament] || "Médicament"}
                            </span>
                          )}
                          {estSupprime ? (
                            <p className="whitespace-pre-wrap break-words text-sm italic text-gray-500">
                              Message supprimé
                            </p>
                          ) : enEdition ? (
                            <div className="min-w-[min(70vw,20rem)] space-y-2">
                              <textarea
                                aria-label="Modifier le message"
                                value={contenuEdition}
                                onChange={(event) => {
                                  setContenuEdition(event.target.value.slice(0, 500));
                                  setErreurActionMessage("");
                                  setErreurActionMessageId(null);
                                }}
                                maxLength={500}
                                rows={3}
                                className="block w-full resize-y rounded-lg border border-white/40 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-emerald-200"
                              />
                              {erreurActionMessage && (
                                <p role="alert" className="text-xs text-rose-100">
                                  {erreurActionMessage}
                                </p>
                              )}
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={annulerModification}
                                  disabled={messageEnActionId === message.id}
                                  aria-label="Annuler la modification"
                                  className="rounded-md p-1.5 text-emerald-50 transition hover:bg-white/15 disabled:opacity-50"
                                >
                                  <XMarkIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => enregistrerModification(message)}
                                  disabled={messageEnActionId === message.id || !contenuEdition.trim()}
                                  aria-label="Enregistrer la modification"
                                  className="rounded-md p-1.5 text-emerald-50 transition hover:bg-white/15 disabled:opacity-50"
                                >
                                  <CheckIcon className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-sm">{message.contenu}</p>
                          )}
                          <div className={`mt-1.5 flex justify-end gap-1.5 text-[11px] ${
                            estPharmacie && !estSupprime ? "text-emerald-100" : "text-gray-500"
                          }`}>
                            <time dateTime={message.cree_le}>{formaterDate(message.cree_le)}</time>
                            {message.modifie_le && !estSupprime && (
                              <span className="italic">modifié</span>
                            )}
                          </div>
                          {message.envoiStatut === "envoi" && (
                            <span className="mt-1 block text-right text-[11px] opacity-80">
                              Envoi…
                            </span>
                          )}
                          {message.envoiStatut === "echec" && (
                            <button
                              type="button"
                              onClick={() => reessayerMessage(message)}
                              disabled={envoi}
                              className="mt-1 block w-full text-right text-[11px] font-semibold underline disabled:opacity-50"
                            >
                              Échec — réessayer
                            </button>
                          )}
                          {peutGerer && !enEdition && (
                            <div className="absolute -top-2 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                              <button
                                type="button"
                                onClick={() => demarrerModification(message)}
                                aria-label="Modifier le message"
                                title="Modifier"
                                className="rounded-full border border-emerald-100 bg-white p-1.5 text-gray-500 shadow-sm transition hover:text-emerald-700 focus:opacity-100"
                              >
                                <PencilSquareIcon className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => supprimerMessage(message)}
                                disabled={messageEnActionId === message.id}
                                aria-label="Supprimer le message"
                                title="Supprimer"
                                className="rounded-full border border-rose-100 bg-white p-1.5 text-gray-500 shadow-sm transition hover:text-rose-600 focus:opacity-100 disabled:opacity-50"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                          {erreurActionMessage && !enEdition && erreurActionMessageId === message.id && (
                            <p role="alert" className="mt-1 text-right text-[11px] text-rose-100">
                              {erreurActionMessage}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  }}
                  contenuVide={null}
                />
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
                      className="block max-h-[30dvh] w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
