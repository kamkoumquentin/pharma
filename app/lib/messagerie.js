"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

export function useMessagerie(pharmacieId, sectionOuverte) {
  const [conversation, setConversation] = useState(null);
  const [erreur, setErreur] = useState(false);
  const [chargement, setChargement] = useState(true);
  const conversationRef = useRef(null);
  const sectionOuverteRef = useRef(sectionOuverte);
  const marquagesEnCoursRef = useRef(new Set());
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

  const adopterConversation = useCallback((nouvelleConversation) => {
    conversationRef.current = nouvelleConversation;
    setConversation(nouvelleConversation);
  }, []);

  const marquerLues = useCallback(async (conversationId) => {
    const courante = conversationRef.current;
    if (
      !conversationId
      || courante?.id !== conversationId
      || !courante.non_lus_pharmacie
      || marquagesEnCoursRef.current.has(conversationId)
    ) return;

    marquagesEnCoursRef.current.add(conversationId);
    try {
      const { error } = await supabase.rpc("marquer_lues", {
        p_conversation_id: conversationId,
      });
      if (error) throw error;

      const miseAJour = { ...conversationRef.current, non_lus_pharmacie: 0 };
      conversationRef.current = miseAJour;
      setConversation(miseAJour);
    } catch (error) {
      console.error("Erreur lors du marquage des messages comme lus :", error);
    } finally {
      marquagesEnCoursRef.current.delete(conversationId);
    }
  }, []);

  useEffect(() => {
    if (sectionOuverte && conversation?.id && conversation.non_lus_pharmacie > 0) {
      Promise.resolve().then(() => marquerLues(conversation.id));
    }
  }, [sectionOuverte, conversation?.id, conversation?.non_lus_pharmacie, marquerLues]);

  useEffect(() => {
    Promise.resolve().then(chargerConversation);
  }, [chargerConversation]);

  useEffect(() => {
    if (!pharmacieId) return undefined;

    let dejaConnecte = false;
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
          if (!conversationRef.current) return;
          const miseAJour = { ...conversationRef.current, ...nouvelleConversation };
          conversationRef.current = miseAJour;
          setConversation(miseAJour);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const message = payload.new;
          if (!message?.conversation_id || message.conversation_id !== conversationRef.current?.id) return;
          if (message.auteur_role === "admin" && !sectionOuverteRef.current) {
            showToast("Nouveau message de l'administration", "info");
          }
        }
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          if (dejaConnecte) Promise.resolve().then(chargerConversation);
          dejaConnecte = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.error("Erreur du canal Realtime de messagerie :", error || status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pharmacieId, chargerConversation, showToast]);

  return {
    conversation,
    nonLus: conversation?.non_lus_pharmacie || 0,
    chargement,
    erreur,
    adopterConversation,
    marquerLues,
    recharger: chargerConversation,
  };
}
