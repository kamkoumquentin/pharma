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
  adopterConversation,
  recharger,
  chargementConversation,
  erreurConversation,
}) {
  const [messages, setMessages] = useState([]);
  const [chargementPrecedents, setChargementPrecedents] = useState(false);
  const [peutChargerPrecedents, setPeutChargerPrecedents] = useState(false);
  const [contenu, setContenu] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const filRef = useRef(null);
  const requestIdRef = useRef(0);
  const skipNextLoadRef = useRef(null);
  const conserverPositionDefilementRef = useRef(false);
  const conversationId = conversation && conversation.id ? conversation.id : null;

  const chargerMessages = useCallback(async () => {
    setErreur(false);
    if (!conversationId) {
      requestIdRef.current += 1;
      setMessages([]);
      setPeutChargerPrecedents(false);
      setChargement(false);
      setChargementPrecedents(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setMessages([]);
    setPeutChargerPrecedents(false);
    setChargementPrecedents(false);
    setChargement(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, auteur_role, contenu, cree_le, lu_le")
        .eq("conversation_id", conversationId)
        .order("cree_le", { ascending: false })
        .limit(50);

      if (error) throw error;
      if (requestId !== requestIdRef.current) return;
      const charges = [...(data || [])].reverse();
      setPeutChargerPrecedents(charges.length === 50);
      setMessages((precedents) => {
        const reunis = new Map(precedents
          .filter((message) => message.conversation_id === conversationId)
          .map((message) => [message.id, message]));
        for (const message of charges) {
          reunis.set(message.id, { ...message, ...reunis.get(message.id) });
        }
        return [...reunis.values()].sort((a, b) => new Date(a.cree_le) - new Date(b.cree_le));
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Erreur lors du chargement des messages :", error);
      setErreur(true);
    } finally {
      if (requestId === requestIdRef.current) setChargement(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (skipNextLoadRef.current === conversationId) {
      skipNextLoadRef.current = null;
      return;
    }
    Promise.resolve().then(chargerMessages);
  }, [chargerMessages, conversationId]);

  useEffect(() => {
    if (!conversationId) return undefined;

    let actif = true;
    let dejaConnecte = false;
    const channel = supabase
      .channel(`messages-pharmacie-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const message = payload.new;
          if (!message?.id) return;
          setMessages((precedents) => {
            if (precedents.some((item) => item.id === message.id)) return precedents;
            return [...precedents, message].sort((a, b) => new Date(a.cree_le) - new Date(b.cree_le));
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const message = payload.new;
          if (!message?.id) return;
          setMessages((precedents) => precedents.map((item) => (
            item.id === message.id ? { ...item, lu_le: message.lu_le } : item
          )));
        }
      )
      .subscribe((status, error) => {
        if (!actif) return;
        if (status === "SUBSCRIBED") {
          if (dejaConnecte) Promise.resolve().then(chargerMessages);
          dejaConnecte = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.error("Erreur du canal Realtime des messages :", error || status);
        }
      });

    return () => {
      actif = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId, chargerMessages]);

  const chargerMessagesPrecedents = useCallback(async () => {
    if (!conversationId || !messages.length || chargementPrecedents) return;
    const requestId = requestIdRef.current;
    const curseur = messages[0].cree_le;
    const hauteurAvant = filRef.current?.scrollHeight || 0;
    const positionAvant = filRef.current?.scrollTop || 0;
    setChargementPrecedents(true);

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, auteur_role, contenu, cree_le, lu_le")
        .eq("conversation_id", conversationId)
        .lt("cree_le", curseur)
        .order("cree_le", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (requestId !== requestIdRef.current) return;

      const charges = [...(data || [])].reverse();
      setPeutChargerPrecedents(charges.length === 50);
      if (charges.length > 0) conserverPositionDefilementRef.current = true;
      setMessages((precedents) => {
        const reunis = new Map(precedents.map((message) => [message.id, message]));
        for (const message of charges) reunis.set(message.id, { ...message, ...reunis.get(message.id) });
        return [...reunis.values()].sort((a, b) => new Date(a.cree_le) - new Date(b.cree_le));
      });
      requestAnimationFrame(() => {
        if (!filRef.current) return;
        filRef.current.scrollTop = positionAvant + filRef.current.scrollHeight - hauteurAvant;
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Erreur lors du chargement des messages précédents :", error);
      setErreur(true);
    } finally {
      if (requestId === requestIdRef.current) setChargementPrecedents(false);
    }
  }, [conversationId, messages, chargementPrecedents]);

  useEffect(() => {
    if (!filRef.current) return;
    if (conserverPositionDefilementRef.current) {
      conserverPositionDefilementRef.current = false;
      return;
    }
    filRef.current.scrollTop = filRef.current.scrollHeight;
  }, [messages.length]);

  const messagesAffiches = messages;

  const envoyerMessage = async () => {
    const texte = contenu.trim();
    if (!texte || envoi || chargementConversation || texte.length > 2000) return;

    setEnvoi(true);
    try {
      let idConversation = conversationId;
      let nouvelleConversation = null;
      if (!idConversation) {
        const { data, error } = await supabase.rpc("ouvrir_conversation", {
          p_pharmacie_id: pharmacieId,
        });
        if (error) throw error;
        nouvelleConversation = Array.isArray(data) ? data[0] : data;
        idConversation = nouvelleConversation?.id;
        if (!idConversation) throw new Error("La création de la conversation n'a retourné aucun identifiant.");
      }

      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id: idConversation, contenu: texte })
        .select("id, conversation_id, auteur_role, contenu, cree_le, lu_le")
        .single();

      if (error) throw error;
      setMessages((precedents) => {
        if (precedents.some((message) => message.id === data.id)) return precedents;
        return [...precedents, data].sort((a, b) => new Date(a.cree_le) - new Date(b.cree_le));
      });
      if (nouvelleConversation) {
        skipNextLoadRef.current = idConversation;
        adopterConversation(nouvelleConversation);
      }
      setContenu("");
      setErreur(false);
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
        ) : (
          <>
            {peutChargerPrecedents && (
              <div className="flex justify-center">
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
            {messagesAffiches.map((message) => {
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
          </>
        )}
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
