"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

const trierMessages = (messages) => [...messages].sort(
  (a, b) => new Date(a.cree_le) - new Date(b.cree_le)
);

const nouveauCacheMessages = () => ({
  messages: [],
  loaded: false,
  hasOlder: false,
  newestAt: null,
});

export function useMessagerie(pharmacieId, sectionOuverte) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [erreur, setErreur] = useState(false);
  const [erreurMessages, setErreurMessages] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [chargementMessages, setChargementMessages] = useState(false);
  const [chargementPrecedents, setChargementPrecedents] = useState(false);
  const [peutChargerPrecedents, setPeutChargerPrecedents] = useState(false);
  const conversationRef = useRef(null);
  const sectionOuverteRef = useRef(sectionOuverte);
  const marquagesEnCoursRef = useRef(new Set());
  const marquagesReussisRef = useRef(new Map());
  const cacheMessagesRef = useRef(new Map());
  const derniereConversationChargeeRef = useRef(null);
  const chargementConversationRef = useRef(null);
  const generationCacheRef = useRef(0);
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

    if (chargementConversationRef.current) return chargementConversationRef.current;
    setChargement(true);
    setErreur(false);
    const generation = generationCacheRef.current;
    const requete = (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, pharmacie_id, dernier_message_at, non_lus_pharmacie")
        .eq("pharmacie_id", pharmacieId)
        .maybeSingle();
      if (error) throw error;
      if (generation !== generationCacheRef.current) return;

      conversationRef.current = data;
      setConversation(data);
    })();
    chargementConversationRef.current = requete;

    try {
      await requete;
    } catch (error) {
      console.error("Erreur lors du chargement de la conversation :", error);
      setErreur(true);
    } finally {
      if (chargementConversationRef.current === requete) chargementConversationRef.current = null;
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
      for (let tentative = 1; tentative <= 2; tentative += 1) {
        try {
          const { error: erreurMarquage } = await supabase.rpc("marquer_lues", {
            p_conversation_id: conversationId,
          });
          if (erreurMarquage) throw erreurMarquage;

          marquagesReussisRef.current.set(conversationId, courante.dernier_message_at);
          const miseAJour = { ...conversationRef.current, non_lus_pharmacie: 0 };
          conversationRef.current = miseAJour;
          setConversation(miseAJour);
          return;
        } catch (error) {
          if (tentative === 1) {
            console.warn("Échec du premier marquage de la conversation comme lue, nouvelle tentative :", error);
          } else {
            console.error("Erreur lors du marquage de la conversation comme lue après une nouvelle tentative :", error);
          }
        }
      }
    } finally {
      marquagesEnCoursRef.current.delete(conversationId);
    }
  }, []);

  const fusionnerCache = useCallback((conversationId, nouvellesMessages, options = {}) => {
    const precedent = cacheMessagesRef.current.get(conversationId) || nouveauCacheMessages();
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
    const messagesCache = tries.slice(-50);
    const messagesPersistes = messagesCache.filter((message) => (
      message.envoiStatut !== "envoi" && message.envoiStatut !== "echec"
    ));
    const prochain = {
      messages: messagesCache,
      loaded: options.loaded ?? precedent.loaded,
      hasOlder: options.hasOlder ?? precedent.hasOlder,
      newestAt: messagesPersistes[messagesPersistes.length - 1]?.cree_le || precedent.newestAt,
    };
    cacheMessagesRef.current.set(conversationId, prochain);
    return prochain;
  }, []);

  const ajouterMessage = useCallback((conversationId, message) => {
    const cache = fusionnerCache(conversationId, [message], { loaded: true });
    if (conversationRef.current?.id === conversationId) {
      setMessages((precedents) => trierMessages([
        ...precedents.filter((item) => item.id !== message.id),
        message,
      ]));
      setPeutChargerPrecedents(cache.hasOlder);
    }
  }, [fusionnerCache]);

  const chargerMessages = useCallback(async (conversationId) => {
    if (!conversationId) return;
    const generation = generationCacheRef.current;
    const cache = cacheMessagesRef.current.get(conversationId) || nouveauCacheMessages();
    const refresh = cache.loaded;
    setErreurMessages(false);
    if (!refresh) setChargementMessages(true);

    try {
      let requete = supabase
        .from("messages")
        .select("id, conversation_id, auteur_role, contenu, cree_le, lu_le")
        .eq("conversation_id", conversationId);

      if (refresh && cache.newestAt) {
        requete = requete
          .gt("cree_le", cache.newestAt)
          .order("cree_le", { ascending: true })
          .limit(50);
      } else {
        requete = requete.order("cree_le", { ascending: false }).limit(50);
      }

      const { data, error } = await requete;
      if (error) throw error;
      if (generation !== generationCacheRef.current) return;

      const charges = refresh ? (data || []) : [...(data || [])].reverse();
      const next = fusionnerCache(conversationId, charges, {
        loaded: true,
        hasOlder: refresh ? cache.hasOlder : charges.length === 50,
      });
      if (conversationRef.current?.id === conversationId) {
        setMessages(next.messages);
        setPeutChargerPrecedents(next.hasOlder);
      }
    } catch (error) {
      if (generation !== generationCacheRef.current) return;
      console.error("Erreur lors du chargement des messages :", error);
      setErreurMessages(true);
    } finally {
      if (generation === generationCacheRef.current && conversationRef.current?.id === conversationId) {
        setChargementMessages(false);
      }
    }
  }, [fusionnerCache]);

  const chargerMessagesPrecedents = useCallback(async () => {
    const conversationId = conversationRef.current?.id;
    if (!conversationId || !messages.length || chargementPrecedents) return;
    const generation = generationCacheRef.current;
    const curseur = messages[0].cree_le;
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
      if (generation !== generationCacheRef.current) return;

      const charges = [...(data || [])].reverse();
      const next = fusionnerCache(conversationId, charges, {
        loaded: true,
        hasOlder: charges.length === 50,
      });
      setPeutChargerPrecedents(next.hasOlder);
      setMessages((precedents) => trierMessages([
        ...precedents,
        ...charges,
      ].filter((message, index, liste) => liste.findIndex((item) => item.id === message.id) === index)));
    } catch (error) {
      if (generation !== generationCacheRef.current) return;
      console.error("Erreur lors du chargement des messages précédents :", error);
      setErreurMessages(true);
    } finally {
      if (generation === generationCacheRef.current) setChargementPrecedents(false);
    }
  }, [messages, chargementPrecedents, fusionnerCache]);

  const envoyerMessage = useCallback(async (texte, idOptimiste = null) => {
    let conversationCourante = conversationRef.current;
    if (!conversationCourante?.id) {
      const { data, error } = await supabase.rpc("ouvrir_conversation", {
        p_pharmacie_id: pharmacieId,
      });
      if (error) throw error;
      conversationCourante = Array.isArray(data) ? data[0] : data;
      if (!conversationCourante?.id) {
        throw new Error("La création de la conversation n'a retourné aucun identifiant.");
      }
      derniereConversationChargeeRef.current = conversationCourante.id;
      cacheMessagesRef.current.set(conversationCourante.id, {
        ...nouveauCacheMessages(),
        loaded: true,
      });
      adopterConversation(conversationCourante);
    }

    const conversationId = conversationCourante.id;
    const idTemporaire = idOptimiste || `optimiste-${crypto.randomUUID()}`;
    const messageExistant = cacheMessagesRef.current
      .get(conversationId)?.messages.find((message) => message.id === idTemporaire);
    const messageOptimiste = messageExistant
      ? { ...messageExistant, envoiStatut: "envoi" }
      : {
        id: idTemporaire,
        conversation_id: conversationId,
        auteur_role: "pharmacie",
        contenu: texte,
        cree_le: new Date().toISOString(),
        lu_le: null,
        envoiStatut: "envoi",
      };
    ajouterMessage(conversationId, messageOptimiste);

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, contenu: messageOptimiste.contenu })
        .select("id, conversation_id, auteur_role, contenu, cree_le, lu_le")
        .single();
      if (error) throw error;

      const next = fusionnerCache(conversationId, [data], {
        loaded: true,
        exclureIds: [idTemporaire, data.id],
      });
      if (conversationRef.current?.id === conversationId) {
        setMessages((precedentes) => trierMessages([
          ...precedentes.filter((message) => message.id !== idTemporaire && message.id !== data.id),
          data,
        ]));
        setPeutChargerPrecedents(next.hasOlder);
      }
      return data;
    } catch (error) {
      const cache = cacheMessagesRef.current.get(conversationId);
      if (cache) {
        cacheMessagesRef.current.set(conversationId, {
          ...cache,
          messages: cache.messages.map((message) => (
            message.id === idTemporaire ? { ...message, envoiStatut: "echec" } : message
          )),
        });
      }
      setMessages((precedentes) => precedentes.map((message) => (
        message.id === idTemporaire ? { ...message, envoiStatut: "echec" } : message
      )));
      throw error;
    }
  }, [pharmacieId, adopterConversation, ajouterMessage, fusionnerCache]);

  const viderCache = useCallback(() => {
    generationCacheRef.current += 1;
    cacheMessagesRef.current.clear();
    conversationRef.current = null;
    derniereConversationChargeeRef.current = null;
    marquagesEnCoursRef.current.clear();
    marquagesReussisRef.current.clear();
    setConversation(null);
    setMessages([]);
    setPeutChargerPrecedents(false);
    setErreurMessages(false);
    setChargementMessages(false);
  }, []);

  useEffect(() => {
    Promise.resolve().then(chargerConversation);
  }, [chargerConversation]);

  useEffect(() => {
    if (sectionOuverte && conversation?.id && conversation.non_lus_pharmacie > 0) {
      Promise.resolve().then(() => marquerLues(conversation.id));
    }
  }, [sectionOuverte, conversation?.id, conversation?.non_lus_pharmacie, marquerLues]);

  useEffect(() => {
    if (!conversation?.id) {
      derniereConversationChargeeRef.current = null;
      return;
    }
    if (!sectionOuverte || derniereConversationChargeeRef.current === conversation.id) return;
    derniereConversationChargeeRef.current = conversation.id;
    Promise.resolve().then(() => chargerMessages(conversation.id));
  }, [sectionOuverte, conversation?.id, chargerMessages]);

  useEffect(() => {
    if (!pharmacieId) return undefined;

    let actif = true;
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
          if (!nouvelleConversation?.id || !conversationRef.current) return;
          const miseAJour = { ...conversationRef.current, ...nouvelleConversation };
          const dateDernierMessageMarquee = marquagesReussisRef.current.get(nouvelleConversation.id);
          if (dateDernierMessageMarquee && nouvelleConversation.dernier_message_at === dateDernierMessageMarquee) {
            miseAJour.non_lus_pharmacie = 0;
          } else if (nouvelleConversation.dernier_message_at !== dateDernierMessageMarquee) {
            marquagesReussisRef.current.delete(nouvelleConversation.id);
          }
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
          if (sectionOuverteRef.current) {
            ajouterMessage(message.conversation_id, message);
          }
          if (message.auteur_role === "admin" && !sectionOuverteRef.current) {
            showToast("Nouveau message de l'administration", "info");
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const message = payload.new;
          if (!message?.id) return;
          const cache = cacheMessagesRef.current.get(message.conversation_id);
          if (!cache) return;
          cacheMessagesRef.current.set(message.conversation_id, {
            ...cache,
            messages: cache.messages.map((item) => (
              item.id === message.id ? { ...item, lu_le: message.lu_le } : item
            )),
          });
          if (conversationRef.current?.id === message.conversation_id) {
            setMessages((precedentes) => precedentes.map((item) => (
              item.id === message.id ? { ...item, lu_le: message.lu_le } : item
            )));
          }
        }
      )
      .subscribe((status, error) => {
        if (!actif) return;
        if (status === "SUBSCRIBED") {
          if (dejaConnecte) Promise.resolve().then(chargerConversation);
          dejaConnecte = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.error("Erreur du canal Realtime de messagerie :", error || status);
        }
      });

    return () => {
      actif = false;
      supabase.removeChannel(channel);
    };
  }, [pharmacieId, chargerConversation, ajouterMessage, showToast]);

  return {
    conversation,
    messages,
    nonLus: conversation?.non_lus_pharmacie || 0,
    chargement,
    chargementMessages,
    chargementPrecedents,
    peutChargerPrecedents,
    erreur,
    erreurMessages,
    marquerLues,
    chargerMessages,
    chargerMessagesPrecedents,
    envoyerMessage,
    viderCache,
    recharger: chargerConversation,
  };
}
