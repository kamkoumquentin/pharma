"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

export function useMessagerie(pharmacieId, sectionOuverte) {
  const [conversation, setConversation] = useState(null);
  const [messageRecu, setMessageRecu] = useState(null);
  const [erreur, setErreur] = useState(false);
  const [chargement, setChargement] = useState(true);
  const conversationRef = useRef(null);
  const sectionOuverteRef = useRef(sectionOuverte);
  const showToast = useToast();

  useEffect(() => {
    sectionOuverteRef.current = sectionOuverte;
  }, [sectionOuverte]);

  const chargerConversation = useCallback(async () => {
    if (!pharmacieId) {
      conversationRef.current = null;
      setConversation(null);
      setChargement(false);
      return;
    }

    setChargement(true);
    setErreur(false);
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, pharmacie_id, non_lus_pharmacie")
        .eq("pharmacie_id", pharmacieId)
        .maybeSingle();

      if (error) throw error;
      conversationRef.current = data;
      setConversation(data);
    } catch (error) {
      console.error("Erreur lors du chargement de la conversation :", error);
      setErreur(true);
    } finally {
      setChargement(false);
    }
  }, [pharmacieId]);

  useEffect(() => {
    Promise.resolve().then(chargerConversation);
  }, [chargerConversation]);

  useEffect(() => {
    if (!pharmacieId) return undefined;

    const channel = supabase
      .channel(`messagerie-pharmacie-${pharmacieId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `pharmacie_id=eq.${pharmacieId}`,
        },
        (payload) => {
          const nouvelleConversation = payload.new;
          if (!nouvelleConversation?.id) return;
          conversationRef.current = nouvelleConversation;
          setConversation(nouvelleConversation);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const message = payload.new;
          if (!message?.conversation_id || message.conversation_id !== conversationRef.current?.id) return;
          setMessageRecu(message);
          if (message.auteur_role === "admin" && !sectionOuverteRef.current) {
            showToast("Nouveau message de l'administration", "info");
          }
        }
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Erreur du canal Realtime de messagerie :", error || status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pharmacieId, showToast]);

  return {
    conversation,
    nonLus: conversation?.non_lus_pharmacie || 0,
    messageRecu,
    chargement,
    erreur,
    recharger: chargerConversation,
  };
}
