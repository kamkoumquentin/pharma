"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

const trierDiscussions = (discussions) => [...discussions].sort((a, b) => {
  const dateA = new Date(a.dernier_message_at || a.cree_le || 0).getTime();
  const dateB = new Date(b.dernier_message_at || b.cree_le || 0).getTime();
  return dateB - dateA;
});

export function useDemandes(pharmacieId, sectionOuverte, discussionOuverteId) {
  const [discussions, setDiscussions] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [erreurCanal, setErreurCanal] = useState(false);
  const [versionMessages, setVersionMessages] = useState(0);
  const [versionCanal, setVersionCanal] = useState(0);
  const showToast = useToast();
  const sectionOuverteRef = useRef(sectionOuverte);
  const discussionOuverteRef = useRef(discussionOuverteId);
  const titreInitialRef = useRef(null);
  const idsDiscussionsRef = useRef(new Set());

  useEffect(() => {
    sectionOuverteRef.current = sectionOuverte;
  }, [sectionOuverte]);

  useEffect(() => {
    discussionOuverteRef.current = discussionOuverteId;
  }, [discussionOuverteId]);

  const charger = useCallback(async () => {
    if (!pharmacieId) {
      idsDiscussionsRef.current = new Set();
      setDiscussions([]);
      setChargement(false);
      setErreur(false);
      return;
    }

    setChargement(true);
    setErreur(false);

    try {
      const { data, error: erreurDiscussions } = await supabase
        .from("discussions")
        .select("id, utilisateur_id, pharmacie_id, dernier_message_at, non_lus_client, non_lus_pharmacie, cree_le")
        .eq("pharmacie_id", pharmacieId)
        .order("dernier_message_at", { ascending: false, nullsFirst: false });

      if (erreurDiscussions) throw erreurDiscussions;

      const lignes = data || [];
      idsDiscussionsRef.current = new Set(lignes.map((discussion) => discussion.id));
      let dernierMessageParDiscussion = new Map();

      if (lignes.length > 0) {
        const ids = lignes.map((discussion) => discussion.id);
        const { data: messages, error: erreurMessages } = await supabase
          .from("discussion_messages")
          .select("id, discussion_id, auteur_role, contenu, id_medicament, cree_le")
          .in("discussion_id", ids)
          .order("cree_le", { ascending: false });

        if (erreurMessages) throw erreurMessages;

        dernierMessageParDiscussion = new Map();
        for (const message of messages || []) {
          if (!dernierMessageParDiscussion.has(message.discussion_id)) {
            dernierMessageParDiscussion.set(message.discussion_id, message);
          }
        }
      }

      setDiscussions(trierDiscussions(lignes.map((discussion) => ({
        ...discussion,
        dernierMessage: dernierMessageParDiscussion.get(discussion.id) || null,
      }))));
    } catch (error) {
      console.error("Erreur lors du chargement des demandes clients :", error);
      setErreur(true);
    } finally {
      setChargement(false);
    }
  }, [pharmacieId]);

  const actualiser = useCallback(async () => {
    setErreurCanal(false);
    setVersionCanal((version) => version + 1);
    await charger();
  }, [charger]);

  const marquerLues = useCallback(async (discussionId) => {
    if (!discussionId) return;

    try {
      const { error } = await supabase.rpc("marquer_lues_discussion", {
        p_discussion_id: discussionId,
      });

      if (error) throw error;

      setDiscussions((precedentes) => precedentes.map((discussion) => (
        discussion.id === discussionId
          ? { ...discussion, non_lus_pharmacie: 0 }
          : discussion
      )));
    } catch (error) {
      console.error("Erreur lors du marquage des demandes comme lues :", error);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(charger);
  }, [charger]);

  useEffect(() => {
    if (sectionOuverte && discussionOuverteId) {
      Promise.resolve().then(() => marquerLues(discussionOuverteId));
    }
  }, [sectionOuverte, discussionOuverteId, marquerLues]);

  useEffect(() => {
    if (!pharmacieId) return undefined;

    let actif = true;
    const gererDiscussion = (payload) => {
      const discussion = payload.new;
      if (!discussion?.id) return;
      idsDiscussionsRef.current.add(discussion.id);

      setDiscussions((precedentes) => {
        const existe = precedentes.some((item) => item.id === discussion.id);
        const prochaineDiscussion = {
          ...precedentes.find((item) => item.id === discussion.id),
          ...discussion,
        };

        if (sectionOuverteRef.current && discussionOuverteRef.current === discussion.id) {
          prochaineDiscussion.non_lus_pharmacie = 0;
        }

        return trierDiscussions(existe
          ? precedentes.map((item) => (
            item.id === discussion.id ? prochaineDiscussion : item
          ))
          : [...precedentes, { ...prochaineDiscussion, dernierMessage: null }]);
      });
    };

    const channel = supabase
      .channel(`demandes-pharmacie-${pharmacieId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "discussions",
          filter: `pharmacie_id=eq.${pharmacieId}`,
        },
        gererDiscussion
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "discussions",
          filter: `pharmacie_id=eq.${pharmacieId}`,
        },
        gererDiscussion
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "discussion_messages" },
        (payload) => {
          const message = payload.new;
          if (!message?.discussion_id) return;

          setVersionMessages((version) => version + 1);
          if (!idsDiscussionsRef.current.has(message.discussion_id)) {
            Promise.resolve().then(charger);
          }

          setDiscussions((precedentes) => {
            return trierDiscussions(precedentes.map((discussion) => {
              if (discussion.id !== message.discussion_id) return discussion;

              const dernierMessage = discussion.dernierMessage;
              if (dernierMessage && new Date(dernierMessage.cree_le) > new Date(message.cree_le)) {
                return discussion;
              }

              return { ...discussion, dernierMessage: message };
            }));
          });

          if (message.auteur_role === "client") {
            if (!sectionOuverteRef.current) {
              showToast("Nouvelle demande client", "info");
            } else if (discussionOuverteRef.current === message.discussion_id) {
              marquerLues(message.discussion_id);
            }
          }
        }
      )
      .subscribe((status, error) => {
        if (!actif) return;
        if (status === "SUBSCRIBED") {
          setErreurCanal(false);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.error("Erreur du canal Realtime des demandes clients :", error || status);
          setErreurCanal(true);
        }
      });

    return () => {
      actif = false;
      supabase.removeChannel(channel);
    };
  }, [pharmacieId, versionCanal, charger, marquerLues, showToast]);

  const nonLus = useMemo(
    () => discussions.reduce((total, discussion) => total + (discussion.non_lus_pharmacie || 0), 0),
    [discussions]
  );

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    titreInitialRef.current = document.title.replace(/^\(\d+\)\s*/, "");
    return () => {
      if (titreInitialRef.current !== null) document.title = titreInitialRef.current;
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || titreInitialRef.current === null) return;
    document.title = nonLus > 0
      ? `(${nonLus}) ${titreInitialRef.current}`
      : titreInitialRef.current;
  }, [nonLus]);

  return {
    discussions,
    nonLus,
    chargement,
    erreur,
    erreurCanal,
    versionMessages,
    actualiser,
    marquerLues,
  };
}
