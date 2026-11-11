"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowPathIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { supabase } from "@/app/lib/supabaseClient";

const formaterDate = (date) => new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Douala",
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(date));

export default function Messages({
  pharmacieId,
  conversation,
  messageRecu,
  recharger,
  chargementConversation,
  erreurConversation,
}) {
  const [messages, setMessages] = useState([]);
  const [contenu, setContenu] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const filRef = useRef(null);
  const derniersMarquesRef = useRef(new Set());
  const conversationId = conversation && conversation.id ? conversation.id : null;

  const chargerMessages = useCallback(async () => {
    setErreur(false);
    if (!conversationId) return;

    setChargement(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, auteur_role, contenu, cree_le")
        .eq("conversation_id", conversationId)
        .order("cree_le", { ascending: true });

      if (error) throw error;
      setMessages((precedents) => {
        const reunis = new Map(precedents.map((message) => [message.id, message]));
        for (const message of data || []) reunis.set(message.id, message);
        return [...reunis.values()].sort((a, b) => new Date(a.cree_le) - new Date(b.cree_le));
      });
    } catch (error) {
      console.error("Erreur lors du chargement des messages :", error);
      setErreur(true);
    } finally {
      setChargement(false);
    }
  }, [conversationId]);

  useEffect(() => {
    Promise.resolve().then(chargerMessages);
  }, [chargerMessages]);

  const reunis = new Map(messages.map((message) => [message.id, message]));
  if (messageRecu?.conversation_id === conversationId) reunis.set(messageRecu.id, messageRecu);
  const messagesAffiches = [...reunis.values()].sort(
    (a, b) => new Date(a.cree_le) - new Date(b.cree_le)
  );

  const marquerLues = useCallback(async (conversationId) => {
    if (!conversationId || derniersMarquesRef.current.has(conversationId)) return;
    derniersMarquesRef.current.add(conversationId);
    try {
      const { error } = await supabase.rpc("marquer_lues", {
        p_conversation_id: conversationId,
      });
      if (error) throw error;
    } catch (error) {
      derniersMarquesRef.current.delete(conversationId);
      console.error("Erreur lors du marquage des messages comme lus :", error);
    }
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    marquerLues(conversationId);
  }, [conversationId, marquerLues]);

  useEffect(() => {
    if (!messageRecu || messageRecu.auteur_role !== "admin" || messageRecu.conversation_id !== conversationId) return;
    derniersMarquesRef.current.delete(conversationId);
    marquerLues(conversationId);
  }, [messageRecu, conversationId, marquerLues]);

  useEffect(() => {
    if (filRef.current) filRef.current.scrollTop = filRef.current.scrollHeight;
  }, [messagesAffiches]);

  const envoyerMessage = async () => {
    const texte = contenu.trim();
    if (!texte || envoi || texte.length > 2000) return;

    setEnvoi(true);
    try {
      let idConversation = conversationId;
      if (!idConversation) {
        const { data, error } = await supabase.rpc("ouvrir_conversation", {
          p_pharmacie_id: pharmacieId,
        });
        if (error) throw error;
        const nouvelleConversation = Array.isArray(data) ? data[0] : data;
        idConversation = nouvelleConversation?.id;
        if (!idConversation) throw new Error("La création de la conversation n'a retourné aucun identifiant.");
        await recharger();
      }

      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id: idConversation, contenu: texte })
        .select("id, conversation_id, auteur_role, contenu, cree_le")
        .single();

      if (error) throw error;
      setMessages((precedents) => {
        if (precedents.some((message) => message.id === data.id)) return precedents;
        return [...precedents, data];
      });
      setContenu("");
      setErreurEnvoi(false);
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
      envoyerMessage();
    }
  };

  return (
    <section className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div
        ref={filRef}
        aria-live="polite"
        className="flex-1 space-y-4 overflow-y-auto p-5"
      >
        {erreurConversation ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
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
        ) : chargementConversation || (chargement && messagesAffiches.length === 0) ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Chargement des messages...
          </div>
        ) : erreur ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-red-600">Impossible de charger les messages.</p>
            <button
              type="button"
              onClick={chargerMessages}
              aria-label="Réessayer de charger les messages"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Réessayer
            </button>
          </div>
        ) : messagesAffiches.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-500">
            Aucun message pour le moment. Écrivez à l&apos;administration ci-dessous.
          </div>
        ) : messagesAffiches.map((message) => {
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
                <p className="whitespace-pre-wrap break-words text-sm">{message.contenu}</p>
                <time dateTime={message.cree_le} className={`mt-1.5 block text-right text-[11px] ${
                  estPharmacie ? "text-emerald-100" : "text-gray-500"
                }`}>
                  {formaterDate(message.cree_le)}
                </time>
              </div>
            </article>
          );
        })}
      </div>

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
                setContenu(event.target.value.slice(0, 2000));
                setErreurEnvoi(false);
              }}
              onKeyDown={gererTouche}
              maxLength={2000}
              rows={3}
              placeholder="Écrivez votre message..."
              className="block w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{contenu.length}/2000</p>
          </div>
          <button
            type="button"
            onClick={envoyerMessage}
            disabled={envoi || !contenu.trim()}
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
