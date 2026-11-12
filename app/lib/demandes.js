"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

const trierDiscussions = (discussions) => [...discussions].sort((a, b) => {
  const dateA = new Date(a.dernier_message_at || 0).getTime();
  const dateB = new Date(b.dernier_message_at || 0).getTime();
  return dateB - dateA;
});

export function useDemandes(pharmacieId, sectionOuverte, discussionOuverteId) {
  const [discussions, setDiscussions] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [erreurCanal, setErreurCanal] = useState(false);
  const [messagesEnTempsReel, setMessagesEnTempsReel] = useState([]);
  const showToast = useToast();
  const sectionOuverteRef = useRef(sectionOuverte);
  const discussionOuverteRef = useRef(discussionOuverteId);
  const titreInitialRef = useRef(null);
  const discussionsRef = useRef([]);
  const revisionsRealtimeRef = useRef(0);
  const lignesRealtimeRef = useRef(new Map());
  const marquagesEnCoursRef = useRef(new Set());

  useEffect(() => {
    sectionOuverteRef.current = sectionOuverte;
  }, [sectionOuverte]);

  useEffect(() => {
    discussionOuverteRef.current = discussionOuverteId;
  }, [discussionOuverteId]);

  const charger = useCallback(async () => {
    if (!pharmacieId) {
      discussionsRef.current = [];
      setDiscussions([]);
      setChargement(false);
      setErreur(false);
      return;
    }

    const revisionAuDepart = revisionsRealtimeRef.current;
    setChargement(true);
    setErreur(false);

    try {
      const { data, error: erreurDiscussions } = await supabase
        .from("discussions")
        .select("id, utilisateur_id, pharmacie_id, dernier_message_at, dernier_extrait, dernier_auteur_role, non_lus_client, non_lus_pharmacie, cree_le")
        .eq("pharmacie_id", pharmacieId)
        .order("dernier_message_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (erreurDiscussions) throw erreurDiscussions;

      const discussionsChargees = (data || []).map((discussion) => {
        const ligneRealtime = lignesRealtimeRef.current.get(discussion.id);
        return ligneRealtime?.revision > revisionAuDepart
          ? { ...discussion, ...ligneRealtime.discussion }
          : discussion;
      });
      const idsChargees = new Set(discussionsChargees.map((discussion) => discussion.id));
      for (const [id, ligneRealtime] of lignesRealtimeRef.current) {
        if (ligneRealtime.revision > revisionAuDepart && !idsChargees.has(id)) {
          discussionsChargees.push(ligneRealtime.discussion);
        }
      }

      const prochainesDiscussions = trierDiscussions(discussionsChargees).slice(0, 50);
      discussionsRef.current = prochainesDiscussions;
      setDiscussions(prochainesDiscussions);
    } catch (error) {
      console.error("Erreur lors du chargement des demandes clients :", error);
      setErreur(true);
    } finally {
      setChargement(false);
    }
  }, [pharmacieId]);

  const actualiser = useCallback(async () => {
    setErreurCanal(false);
    await charger();
  }, [charger]);

  const marquerLues = useCallback(async (discussionId) => {
    const discussion = discussionsRef.current.find((item) => item.id === discussionId);
    if (!discussionId || !discussion?.non_lus_pharmacie || marquagesEnCoursRef.current.has(discussionId)) {
      return;
    }

    marquagesEnCoursRef.current.add(discussionId);

    try {
      const { error } = await supabase.rpc("marquer_lues_discussion", {
        p_discussion_id: discussionId,
      });

      if (error) throw error;

      const prochainesDiscussions = discussionsRef.current.map((item) => (
        item.id === discussionId ? { ...item, non_lus_pharmacie: 0 } : item
      ));
      discussionsRef.current = prochainesDiscussions;
      setDiscussions(prochainesDiscussions);
    } catch (error) {
      console.error("Erreur lors du marquage des demandes comme lues :", error);
    } finally {
      marquagesEnCoursRef.current.delete(discussionId);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(charger);
  }, [charger]);

  const nonLusDiscussionOuverte = discussions.find(
    (discussion) => discussion.id === discussionOuverteId
  )?.non_lus_pharmacie || 0;

  useEffect(() => {
    if (sectionOuverte && discussionOuverteId && nonLusDiscussionOuverte > 0) {
      Promise.resolve().then(() => marquerLues(discussionOuverteId));
    }
  }, [sectionOuverte, discussionOuverteId, nonLusDiscussionOuverte, marquerLues]);

  useEffect(() => {
    if (!pharmacieId) return undefined;

    let actif = true;
    let dejaConnecte = false;
    const gererDiscussion = (payload) => {
      const discussion = payload.new;
      if (!discussion?.id) return;
      revisionsRealtimeRef.current += 1;
      lignesRealtimeRef.current.set(discussion.id, {
        revision: revisionsRealtimeRef.current,
        discussion,
      });

      const precedente = discussionsRef.current.find((item) => item.id === discussion.id);
      const prochaineDiscussion = { ...precedente, ...discussion };
      const autresDiscussions = discussionsRef.current.filter((item) => item.id !== discussion.id);
      const prochainesDiscussions = [prochaineDiscussion, ...autresDiscussions].slice(0, 50);
      discussionsRef.current = prochainesDiscussions;
      setDiscussions(prochainesDiscussions);
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

          if (sectionOuverteRef.current && discussionOuverteRef.current === message.discussion_id) {
            setMessagesEnTempsReel((precedents) => {
              const messagesDiscussion = precedents.filter(
                (item) => item.discussion_id === message.discussion_id
              );
              const existant = messagesDiscussion.findIndex((item) => item.id === message.id);
              if (existant < 0) return [...messagesDiscussion, { ...message, evenement: "INSERT" }];
              return messagesDiscussion.map((item, index) => (
                index === existant ? { ...message, evenement: "INSERT" } : item
              ));
            });
          }

          if (message.auteur_role === "client") {
            if (!sectionOuverteRef.current) {
              showToast("Nouvelle demande client", "info");
            } else if (discussionOuverteRef.current === message.discussion_id) {
              marquerLues(message.discussion_id);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "discussion_messages" },
        (payload) => {
          const message = payload.new;
          if (
            !message?.id
            || !sectionOuverteRef.current
            || discussionOuverteRef.current !== message.discussion_id
          ) return;
          setMessagesEnTempsReel((precedents) => {
            const messagesDiscussion = precedents.filter(
              (item) => item.discussion_id === message.discussion_id
            );
            const existant = messagesDiscussion.findIndex((item) => item.id === message.id);
            if (existant < 0) return [...messagesDiscussion, { ...message, evenement: "UPDATE" }];
            return messagesDiscussion.map((item, index) => (
              index === existant
                ? { ...item, lu_le: message.lu_le }
                : item
            ));
          });
        }
      )
      .subscribe((status, error) => {
        if (!actif) return;
        if (status === "SUBSCRIBED") {
          setErreurCanal(false);
          if (dejaConnecte) Promise.resolve().then(charger);
          dejaConnecte = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.error("Erreur du canal Realtime des demandes clients :", error || status);
          setErreurCanal(true);
        }
      });

    return () => {
      actif = false;
      supabase.removeChannel(channel);
    };
  }, [pharmacieId, charger, marquerLues, showToast]);

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
    messagesEnTempsReel,
    actualiser,
    marquerLues,
  };
}
