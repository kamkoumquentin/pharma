"use client";

import { useState } from "react";
import { ArrowPathIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import ChatMessageThread from "@/app/components/ChatMessageThread";

const formaterDate = (date) => new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Douala",
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(date));

export default function Messages({
  conversation,
  messages,
  envoyerMessage,
  chargerMessages,
  chargerMessagesPrecedents,
  recharger,
  chargementConversation,
  chargementMessages,
  chargementPrecedents,
  peutChargerPrecedents,
  erreurConversation,
  erreurMessages,
}) {
  const [contenu, setContenu] = useState("");
  const [erreurEnvoi, setErreurEnvoi] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const conversationId = conversation?.id;

  const envoyer = async (texte = contenu.trim(), idOptimiste = null) => {
    if (!texte || envoi || chargementConversation || texte.length > 500) return;
    setEnvoi(true);
    setErreurEnvoi(false);
    try {
      await envoyerMessage(texte, idOptimiste);
      if (!idOptimiste) setContenu("");
    } catch (error) {
      console.error("Erreur lors de l'envoi du message :", error);
      setErreurEnvoi(true);
    } finally {
      setEnvoi(false);
    }
  };

  const gererTouche = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      envoyer();
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {erreurConversation ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-red-600">Impossible de charger la conversation.</p>
          <button
            type="button"
            onClick={recharger}
            aria-label="Réessayer de charger la conversation"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Réessayer
          </button>
        </div>
      ) : chargementConversation || (chargementMessages && messages.length === 0) ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          Chargement des messages...
        </div>
      ) : erreurMessages ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-red-600">Impossible de charger les messages.</p>
          <button
            type="button"
            onClick={() => chargerMessages(conversationId)}
            aria-label="Réessayer de charger les messages"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Réessayer
          </button>
        </div>
      ) : (
        <ChatMessageThread
          key={conversationId || "conversation-sans-id"}
          messages={messages}
          peutChargerPrecedents={peutChargerPrecedents}
          chargementPrecedents={chargementPrecedents}
          chargerMessagesPrecedents={chargerMessagesPrecedents}
          label="Fil des messages avec l'administration"
          contenuVide={messages.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-500">
              Aucun message pour le moment. Écrivez à l&apos;administration ci-dessous.
            </div>
          ) : null}
          renderMessage={(message) => {
            const estPharmacie = message.auteur_role === "pharmacie";
            return (
              <article
                key={message.id}
                className={`flex shrink-0 ${estPharmacie ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  estPharmacie
                    ? "rounded-br-md bg-emerald-600 text-white"
                    : "rounded-bl-md bg-teal-50 text-gray-800"
                }`}>
                  <p className="whitespace-pre-wrap break-words text-sm">{message.contenu}</p>
                  <time dateTime={message.cree_le} className={`mt-1.5 block text-right text-[11px] ${
                    estPharmacie ? "text-emerald-100" : "text-gray-500"
                  }`}>
                    {formaterDate(message.cree_le)}
                  </time>
                  {message.envoiStatut === "envoi" && (
                    <span className="mt-1 block text-right text-[11px] opacity-80">Envoi…</span>
                  )}
                  {message.envoiStatut === "echec" && (
                    <button
                      type="button"
                      onClick={() => envoyer(message.contenu, message.id)}
                      disabled={envoi}
                      className="mt-1 block w-full text-right text-[11px] font-semibold underline disabled:opacity-50"
                    >
                      Échec — réessayer
                    </button>
                  )}
                </div>
              </article>
            );
          }}
        />
      )}

      <div className="border-t border-gray-100 p-4">
        {erreurEnvoi && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            Impossible d&apos;envoyer le message. Réessayez.
          </p>
        )}
        <label htmlFor="message-pharmacie" className="sr-only">Votre message à l&apos;administration</label>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <textarea
              id="message-pharmacie"
              value={contenu}
              onChange={(event) => {
                setContenu(event.target.value.slice(0, 500));
                setErreurEnvoi(false);
              }}
              onKeyDown={gererTouche}
              maxLength={500}
              rows={3}
              placeholder="Écrivez votre message..."
              className="block max-h-[30dvh] w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{contenu.length}/500</p>
          </div>
          <button
            type="button"
            onClick={() => envoyer()}
            disabled={envoi || chargementConversation || !contenu.trim()}
            aria-label="Envoyer le message"
            className="mb-5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
