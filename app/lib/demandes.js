"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

const trierDiscussions = (discussions) => [...discussions].sort((a, b) => {
  const dateA = new Date(a.dernier_message_at || 0).getTime();
  const dateB = new Date(b.dernier_message_at || 0).getTime();
  return dateB - dateA;
});

const trierMessages = (messages) => [...messages].sort(
  (a, b) => new Date(a.cree_le) - new Date(b.cree_le)
);

const nouveauCacheMessages = () => ({
  messages: [],
  loaded: false,
  hasOlder: false,
  oldestAt: null,
  newestAt: null,
});

export function useDemandes(pharmacieId, sectionOuverte, discussionOuverteId) {
  const [discussions, setDiscussions] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [erreurCanal, setErreurCanal] = useState(false);
  const [messages, setMessages] = useState([]);
  const [nomsMedicaments, setNomsMedicaments] = useState({});
  const [chargementMessages, setChargementMessages] = useState(false);
  const [erreurMessages, setErreurMessages] = useState(false);
  const [chargementPrecedents, setChargementPrecedents] = useState(false);
  const [peutChargerPrecedents, setPeutChargerPrecedents] = useState(false);
  const showToast = useToast();
  const sectionOuverteRef = useRef(sectionOuverte);
  const discussionOuverteRef = useRef(discussionOuverteId);
  const titreInitialRef = useRef(null);
  const discussionsRef = useRef([]);
  const revisionsRealtimeRef = useRef(0);
  const lignesRealtimeRef = useRef(new Map());
  const chargerDiscussionsRef = useRef(null);
  const cacheMessagesRef = useRef(new Map());
  const cacheNomsMedicamentsRef = useRef(new Map());
  const medicamentsEnCoursRef = useRef(new Set());
  const generationCacheRef = useRef(0);
  const marquagesEnCoursRef = useRef(new Set());
  const marquagesReussisRef = useRef(new Map());
  const derniereDiscussionChargeeRef = useRef(null);

  useEffect(() => {
    sectionOuverteRef.current = sectionOuverte;
  }, [sectionOuverte]);

  useEffect(() => {
    discussionOuverteRef.current = discussionOuverteId;
  }, [discussionOuverteId]);

  const chargerDiscussions = useCallback(async () => {
    if (!pharmacieId) {
      discussionsRef.current = [];
      setDiscussions([]);
      setChargement(false);
      setErreur(false);
      return;
    }

    if (chargerDiscussionsRef.current) return chargerDiscussionsRef.current;

    setChargement(true);
    setErreur(false);
    const generation = generationCacheRef.current;
    const revisionAuDepart = revisionsRealtimeRef.current;
    const requete = (async () => {
      const { data, error } = await supabase
        .from("discussions")
        .select("id, utilisateur_id, pharmacie_id, dernier_message_at, dernier_extrait, dernier_auteur_role, non_lus_client, non_lus_pharmacie, cree_le")
        .eq("pharmacie_id", pharmacieId)
        .order("dernier_message_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (error) throw error;
      if (generation !== generationCacheRef.current) return;

      const chargees = (data || []).map((discussion) => {
        const evenementRecent = lignesRealtimeRef.current.get(discussion.id);
        const fusionnee = evenementRecent?.revision > revisionAuDepart
          ? { ...discussion, ...evenementRecent.discussion }
          : discussion;
        if (
          marquagesReussisRef.current.has(discussion.id)
          && marquagesReussisRef.current.get(discussion.id) === fusionnee.dernier_message_at
        ) {
          fusionnee.non_lus_pharmacie = 0;
        } else {
          marquagesReussisRef.current.delete(discussion.id);
        }
        return fusionnee;
      });
      const idsChargees = new Set(chargees.map((discussion) => discussion.id));
      for (const [id, evenementRecent] of lignesRealtimeRef.current) {
        if (evenementRecent.revision > revisionAuDepart && !idsChargees.has(id)) {
          chargees.push(evenementRecent.discussion);
        }
      }

      const prochaines = trierDiscussions(chargees).slice(0, 50);
      discussionsRef.current = prochaines;
      setDiscussions(prochaines);
    })();
    chargerDiscussionsRef.current = requete;

    try {
      await requete;
    } catch (error) {
      console.error("Erreur lors du chargement des demandes clients :", error);
      setErreur(true);
    } finally {
      if (chargerDiscussionsRef.current === requete) chargerDiscussionsRef.current = null;
      setChargement(false);
    }
  }, [pharmacieId]);

  const actualiser = useCallback(async () => {
    setErreurCanal(false);
    await chargerDiscussions();
  }, [chargerDiscussions]);

  const marquerLues = useCallback(async (discussionId) => {
    const discussion = discussionsRef.current.find((item) => item.id === discussionId);
    if (!discussionId || !discussion?.non_lus_pharmacie || marquagesEnCoursRef.current.has(discussionId)) {
      return;
    }

    marquagesEnCoursRef.current.add(discussionId);
    try {
      for (let tentative = 1; tentative <= 2; tentative += 1) {
        try {
          const { error } = await supabase.rpc("marquer_lues_discussion", {
            p_discussion_id: discussionId,
          });
          if (error) throw error;
          marquagesReussisRef.current.set(discussionId, discussion.dernier_message_at);
          const prochaines = discussionsRef.current.map((item) => (
            item.id === discussionId ? { ...item, non_lus_pharmacie: 0 } : item
          ));
          discussionsRef.current = prochaines;
          setDiscussions(prochaines);
          return;
        } catch (error) {
          if (tentative === 1) {
            console.warn("Échec du premier marquage de la discussion comme lue, nouvelle tentative :", error);
          } else {
            console.error("Erreur lors du marquage des demandes comme lues après une nouvelle tentative :", error);
          }
        }
      }
    } finally {
      marquagesEnCoursRef.current.delete(discussionId);
    }
  }, []);

  const chargerNomsMedicaments = useCallback(async (messagesAAnalyser) => {
    const generation = generationCacheRef.current;
    const ids = [...new Set(
      messagesAAnalyser
        .map((message) => message.id_medicament)
        .filter((id) => id !== null && id !== undefined)
    )];
    const nouveauxIds = ids.filter((id) => (
      !cacheNomsMedicamentsRef.current.has(id)
      && !medicamentsEnCoursRef.current.has(id)
    ));

    if (nouveauxIds.length > 0) {
      nouveauxIds.forEach((id) => medicamentsEnCoursRef.current.add(id));
      try {
        const { data, error } = await supabase
          .from("medicaments")
          .select("id, nom")
          .in("id", nouveauxIds);
        if (error) throw error;
        if (generation !== generationCacheRef.current) return;

        const nomsParId = new Map((data || []).map((medicament) => [medicament.id, medicament.nom]));
        for (const id of nouveauxIds) {
          cacheNomsMedicamentsRef.current.set(id, nomsParId.get(id) || null);
        }
      } finally {
        nouveauxIds.forEach((id) => medicamentsEnCoursRef.current.delete(id));
      }
    }

    if (generation === generationCacheRef.current) {
      setNomsMedicaments(Object.fromEntries(cacheNomsMedicamentsRef.current));
    }
  }, []);

  const fusionnerDansCache = useCallback((discussionId, nouvellesMessages, options = {}) => {
    const precedent = cacheMessagesRef.current.get(discussionId) || nouveauCacheMessages();
    const exclus = new Set(options.exclureIds || []);
    const reunis = new Map(
      precedent.messages
        .filter((message) => !exclus.has(message.id))
        .map((message) => [message.id, message])
    );
    for (const message of nouvellesMessages) {
      reunis.set(message.id, { ...reunis.get(message.id), ...message });
    }
    const tries = trierMessages([...reunis.values()]);
    const dansCache = tries.slice(-50);
    const messagesPersistes = dansCache.filter((message) => message.envoiStatut !== "envoi" && message.envoiStatut !== "echec");
    const prochain = {
      messages: dansCache,
      loaded: options.loaded ?? precedent.loaded,
      hasOlder: options.hasOlder ?? precedent.hasOlder,
      oldestAt: dansCache[0]?.cree_le || precedent.oldestAt,
      newestAt: messagesPersistes[messagesPersistes.length - 1]?.cree_le || precedent.newestAt,
    };
    cacheMessagesRef.current.set(discussionId, prochain);
    return prochain;
  }, []);

  const afficherMessagesCache = useCallback((discussionId) => {
    const cache = cacheMessagesRef.current.get(discussionId);
    setMessages(cache?.messages || []);
    setPeutChargerPrecedents(cache?.hasOlder || false);
    setErreurMessages(false);
  }, []);

  const preparerOuverture = useCallback((discussionId) => {
    discussionOuverteRef.current = discussionId;
    if (!discussionId) {
      setMessages([]);
      setPeutChargerPrecedents(false);
      setErreurMessages(false);
      setChargementMessages(false);
      return;
    }
    afficherMessagesCache(discussionId);
    setChargementMessages(!cacheMessagesRef.current.get(discussionId)?.loaded);
  }, [afficherMessagesCache]);

  const chargerMessages = useCallback(async (discussionId) => {
    if (!discussionId) return;

    const generation = generationCacheRef.current;
    const cache = cacheMessagesRef.current.get(discussionId) || nouveauCacheMessages();
    const estRafraichissement = cache.loaded;
    setErreurMessages(false);
    if (!estRafraichissement) setChargementMessages(true);

    try {
      let requete = supabase
        .from("discussion_messages")
        .select("id, discussion_id, auteur_role, contenu, id_medicament, cree_le, lu_le");

      if (estRafraichissement && cache.newestAt) {
        requete = requete
          .eq("discussion_id", discussionId)
          .gt("cree_le", cache.newestAt)
          .order("cree_le", { ascending: true })
          .limit(50);
      } else {
        requete = requete
          .eq("discussion_id", discussionId)
          .order("cree_le", { ascending: false })
          .limit(50);
      }

      const { data, error } = await requete;
      if (error) throw error;
      if (generation !== generationCacheRef.current) return;

      const messagesCharges = estRafraichissement ? (data || []) : [...(data || [])].reverse();
      const prochaine = fusionnerDansCache(discussionId, messagesCharges, {
        loaded: true,
        hasOlder: estRafraichissement ? cache.hasOlder : messagesCharges.length === 50,
      });
      if (discussionOuverteRef.current === discussionId) {
        setMessages(prochaine.messages);
        setPeutChargerPrecedents(prochaine.hasOlder);
      }
      await chargerNomsMedicaments(messagesCharges);
    } catch (error) {
      if (generation !== generationCacheRef.current) return;
      console.error("Erreur lors du chargement des messages de la demande :", error);
      setErreurMessages(true);
    } finally {
      if (generation === generationCacheRef.current && discussionOuverteRef.current === discussionId) {
        setChargementMessages(false);
      }
    }
  }, [chargerNomsMedicaments, fusionnerDansCache]);

  const chargerMessagesPrecedents = useCallback(async () => {
    if (!discussionOuverteId || !messages.length || chargementPrecedents) return;

    const discussionId = discussionOuverteId;
    const generation = generationCacheRef.current;
    const curseur = messages[0].cree_le;
    setChargementPrecedents(true);

    try {
      const { data, error } = await supabase
        .from("discussion_messages")
        .select("id, discussion_id, auteur_role, contenu, id_medicament, cree_le, lu_le")
        .eq("discussion_id", discussionId)
        .lt("cree_le", curseur)
        .order("cree_le", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (generation !== generationCacheRef.current) return;

      const messagesCharges = [...(data || [])].reverse();
      const cache = fusionnerDansCache(discussionId, messagesCharges, {
        loaded: true,
        hasOlder: messagesCharges.length === 50,
      });
      setPeutChargerPrecedents(cache.hasOlder);
      setMessages((precedents) => trierMessages([...precedents, ...messagesCharges]
        .filter((message, index, liste) => liste.findIndex((item) => item.id === message.id) === index)));
      await chargerNomsMedicaments(messagesCharges);
    } catch (error) {
      if (generation !== generationCacheRef.current) return;
      console.error("Erreur lors du chargement des messages précédents :", error);
      setErreurMessages(true);
    } finally {
      if (generation === generationCacheRef.current) setChargementPrecedents(false);
    }
  }, [
    discussionOuverteId,
    messages,
    chargementPrecedents,
    chargerNomsMedicaments,
    fusionnerDansCache,
  ]);

  const ajouterMessageCache = useCallback((discussionId, message) => {
    const prochain = fusionnerDansCache(discussionId, [message], { loaded: true });
    if (discussionOuverteRef.current === discussionId) {
      setMessages((precedents) => trierMessages([
        ...precedents.filter((item) => item.id !== message.id),
        message,
      ]));
      setPeutChargerPrecedents(prochain.hasOlder);
    }
  }, [fusionnerDansCache]);

  const remplacerMessageCache = useCallback((discussionId, idTemporaire, message) => {
    const cache = cacheMessagesRef.current.get(discussionId) || nouveauCacheMessages();
    const precedents = cache.messages.filter((item) => (
      item.id !== idTemporaire && item.id !== message.id
    ));
    const prochain = fusionnerDansCache(discussionId, [...precedents, message], {
      loaded: true,
      exclureIds: [idTemporaire, message.id],
    });
    if (discussionOuverteRef.current === discussionId) {
      setMessages((messagesActifs) => trierMessages([
        ...messagesActifs.filter((item) => item.id !== idTemporaire && item.id !== message.id),
        message,
      ]));
      setPeutChargerPrecedents(prochain.hasOlder);
    }
  }, [fusionnerDansCache]);

  const envoyerMessage = useCallback(async (discussionId, contenu, idOptimiste = null) => {
    const idTemporaire = idOptimiste || `optimiste-${crypto.randomUUID()}`;
    const messageExistant = cacheMessagesRef.current
      .get(discussionId)?.messages.find((message) => message.id === idTemporaire);
    const messageOptimiste = messageExistant
      ? { ...messageExistant, envoiStatut: "envoi" }
      : {
        id: idTemporaire,
        discussion_id: discussionId,
        auteur_role: "pharmacie",
        contenu,
        id_medicament: null,
        cree_le: new Date().toISOString(),
        lu_le: null,
        envoiStatut: "envoi",
      };
    ajouterMessageCache(discussionId, messageOptimiste);

    try {
      const { data, error } = await supabase
        .from("discussion_messages")
        .insert({ discussion_id: discussionId, contenu: messageOptimiste.contenu })
        .select("id, discussion_id, auteur_role, contenu, id_medicament, cree_le, lu_le")
        .single();
      if (error) throw error;

      remplacerMessageCache(discussionId, idTemporaire, data);
      return data;
    } catch (error) {
      const cache = cacheMessagesRef.current.get(discussionId);
      if (cache) {
        const messagesMaj = cache.messages.map((message) => (
          message.id === idTemporaire ? { ...message, envoiStatut: "echec" } : message
        ));
        cacheMessagesRef.current.set(discussionId, { ...cache, messages: messagesMaj });
      }
      if (discussionOuverteRef.current === discussionId) {
        setMessages((precedents) => precedents.map((message) => (
          message.id === idTemporaire ? { ...message, envoiStatut: "echec" } : message
        )));
      }
      throw error;
    }
  }, [ajouterMessageCache, remplacerMessageCache]);

  const viderCache = useCallback(() => {
    generationCacheRef.current += 1;
    cacheMessagesRef.current.clear();
    cacheNomsMedicamentsRef.current.clear();
    medicamentsEnCoursRef.current.clear();
    marquagesReussisRef.current.clear();
    lignesRealtimeRef.current.clear();
    revisionsRealtimeRef.current = 0;
    chargerDiscussionsRef.current = null;
    discussionsRef.current = [];
    discussionOuverteRef.current = null;
    derniereDiscussionChargeeRef.current = null;
    setDiscussions([]);
    setMessages([]);
    setNomsMedicaments({});
    setPeutChargerPrecedents(false);
    setErreurMessages(false);
    setChargementMessages(false);
  }, []);

  useEffect(() => {
    Promise.resolve().then(chargerDiscussions);
  }, [chargerDiscussions]);

  const nonLusDiscussionOuverte = discussions.find(
    (discussion) => discussion.id === discussionOuverteId
  )?.non_lus_pharmacie || 0;

  useEffect(() => {
    if (sectionOuverte && discussionOuverteId && nonLusDiscussionOuverte > 0) {
      Promise.resolve().then(() => marquerLues(discussionOuverteId));
    }
  }, [sectionOuverte, discussionOuverteId, nonLusDiscussionOuverte, marquerLues]);

  useEffect(() => {
    if (!discussionOuverteId) {
      derniereDiscussionChargeeRef.current = null;
      return;
    }
    if (!sectionOuverte) return;
    if (derniereDiscussionChargeeRef.current === discussionOuverteId) return;
    derniereDiscussionChargeeRef.current = discussionOuverteId;
    Promise.resolve().then(() => chargerMessages(discussionOuverteId));
  }, [sectionOuverte, discussionOuverteId, chargerMessages]);

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
      const prochaine = { ...precedente, ...discussion };
      const aMarqueLues = marquagesReussisRef.current.has(discussion.id);
      const dateDernierMessageMarquee = marquagesReussisRef.current.get(discussion.id);
      if (aMarqueLues && discussion.dernier_message_at === dateDernierMessageMarquee) {
        prochaine.non_lus_pharmacie = 0;
      } else if (aMarqueLues) {
        marquagesReussisRef.current.delete(discussion.id);
      }
      const lignes = trierDiscussions([
        prochaine,
        ...discussionsRef.current.filter((item) => item.id !== discussion.id),
      ]).slice(0, 50);
      discussionsRef.current = lignes;
      setDiscussions(lignes);
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

          if (
            sectionOuverteRef.current
            && discussionOuverteRef.current === message.discussion_id
          ) {
            ajouterMessageCache(message.discussion_id, message);
            Promise.resolve().then(() => chargerNomsMedicaments([message])).catch((error) => {
              console.error("Erreur lors du chargement des noms de médicaments :", error);
            });
          }

          if (message.auteur_role === "client" && !sectionOuverteRef.current) {
            showToast("Nouvelle demande client", "info");
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "discussion_messages" },
        (payload) => {
          const message = payload.new;
          if (!message?.id) return;
          const cache = cacheMessagesRef.current.get(message.discussion_id);
          if (!cache) return;

          const maj = cache.messages.map((item) => (
            item.id === message.id ? { ...item, lu_le: message.lu_le } : item
          ));
          cacheMessagesRef.current.set(message.discussion_id, { ...cache, messages: maj });
          if (discussionOuverteRef.current === message.discussion_id) {
            setMessages((precedents) => precedents.map((item) => (
              item.id === message.id ? { ...item, lu_le: message.lu_le } : item
            )));
          }
        }
      )
      .subscribe((status, error) => {
        if (!actif) return;
        if (status === "SUBSCRIBED") {
          setErreurCanal(false);
          if (dejaConnecte) Promise.resolve().then(chargerDiscussions);
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
  }, [pharmacieId, chargerDiscussions, ajouterMessageCache, chargerNomsMedicaments, showToast]);

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
    messages,
    nomsMedicaments,
    chargementMessages,
    erreurMessages,
    chargementPrecedents,
    peutChargerPrecedents,
    actualiser,
    marquerLues,
    preparerOuverture,
    chargerMessages,
    chargerMessagesPrecedents,
    envoyerMessage,
    viderCache,
  };
}
