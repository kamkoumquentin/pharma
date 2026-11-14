"use client";

import { 
  BuildingStorefrontIcon, 
  PlusCircleIcon, 
  Squares2X2Icon, 
  ArrowLeftStartOnRectangleIcon, 
  DocumentTextIcon,
  UsersIcon,
  MagnifyingGlassIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/solid";
import {
  ChatBubbleLeftEllipsisIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Centrale from "./contenu";
import Ajouter from "./ajouter/ajouter";
import ImportationStock from "./import/import";
import Consultations from "./consultations/consultations";
import RechercheGlobale from "./recherche/recherche";
import MaPharmacie from "./ma-pharmacie";
import Messages from "./messages/messages";
import Demandes from "./demandes/demandes";
import { supabase } from "@/app/lib/supabaseClient";
import { useMessagerie } from "@/app/lib/messagerie";
import { useDemandes } from "@/app/lib/demandes";
import { formaterNomPharmacie } from "@/app/lib/formatNomPharmacie.mjs";
import { useToast } from "@/app/components/Toast";

const MedicalMapPinIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
    <path d="M9.5 8h5v2h-5z" fill="white" />
    <path d="M11 6.5h2v5h-2z" fill="white" />
  </svg>
);

const statutsSuspendus = new Set(["suspendu", "suspended", "bloque", "bloqué", "blocked"]);
const estStatutSuspendu = (statut) => statutsSuspendus.has(
  String(statut || "").trim().toLowerCase()
);

export default function Acceuil() {
  const [page, setpage] = useState("l");
  const [info, setinfo] = useState({ id: "", nom: "", ville: "", emplacement: "", photo: "" });
  const [token, setToken] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [offreAModifier, setOffreAModifier] = useState(null);
  const [discussionOuverteId, setDiscussionOuverteId] = useState(null);
  const [modificationsNonEnregistrees, setModificationsNonEnregistrees] = useState(false);
  const annulerModificationsRef = useRef(null);
  const canalStatutRef = useRef(null);
  const nav = useRouter();
  const showToast = useToast();
  const messagerie = useMessagerie(info.id, page === "m");
  const demandes = useDemandes(info.id, page === "d", discussionOuverteId);
  const viderCacheDemandes = demandes.viderCache;
  const viderCacheMessagerie = messagerie.viderCache;
  const preparerOuvertureDiscussion = demandes.preparerOuverture;
  const ouvrirDiscussion = useCallback((discussionId) => {
    preparerOuvertureDiscussion(discussionId);
    setDiscussionOuverteId(discussionId);
  }, [preparerOuvertureDiscussion]);

  useEffect(() => {
    if (!isLogoutConfirmOpen) return;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsLogoutConfirmOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isLogoutConfirmOpen]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          viderCacheDemandes();
          viderCacheMessagerie();
          localStorage.removeItem("token_pharmacie");
          nav.push("/admin/connexion");
          return;
        }

        const truncatedId = user.id ? user.id.slice(0, 6) : "inconnu";
        let profile = null;
        let profError = null;
        const maxAttempts = 5;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const res = await supabase
            .from("pharmacies")
            .select("id, nom, ville, emplacement, photo, telephone, latitude, longitude, statut")
            .eq("owner_id", user.id)
            .maybeSingle();

          profile = res.data;
          profError = res.error;

          console.log(`[DIAG] User: ${truncatedId}... | Tentative ${attempt}/${maxAttempts} | Profil trouvé : ${!!profile}`);

          if (profile) break;

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
        }

        if (profError || !profile) {
          showToast("Accès interdit : cette interface est réservée aux pharmaciens.", "error");
          await supabase.auth.signOut();
          viderCacheDemandes();
          viderCacheMessagerie();
          localStorage.removeItem("token_pharmacie");
          nav.push("/admin/connexion");
          return;
        }

        setinfo(profile);
        setToken("active");
        setLoadingProfile(false);
      } catch (error) {
        console.error("Erreur de vérification de la session :", error);
        viderCacheDemandes();
        viderCacheMessagerie();
        localStorage.removeItem("token_pharmacie");
        nav.push("/admin/connexion");
      }
    };

    fetchProfile();
  }, [nav, showToast, viderCacheDemandes, viderCacheMessagerie]);

  useEffect(() => {
    if (!info.id) return undefined;

    let actif = true;
    const channel = supabase
      .channel(`statut-pharmacie-${info.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pharmacies",
          filter: `id=eq.${info.id}`,
        },
        (payload) => {
          const pharmacie = payload.new;
          if (!pharmacie?.id || String(pharmacie.id) !== String(info.id)) return;
          if (!Object.prototype.hasOwnProperty.call(pharmacie, "statut")) return;

          setinfo((precedent) => (
            String(precedent.id) === String(pharmacie.id)
              ? { ...precedent, statut: pharmacie.statut }
              : precedent
          ));
        }
      )
      .subscribe((status, error) => {
        if (!actif) return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.error("Erreur du canal Realtime du statut pharmacie :", error || status);
        }
      });
    canalStatutRef.current = channel;

    return () => {
      actif = false;
      if (canalStatutRef.current === channel) {
        canalStatutRef.current = null;
        supabase.removeChannel(channel);
      }
    };
  }, [info.id]);

  const signalerModifications = useCallback((modifie, annuler) => {
    annulerModificationsRef.current = annuler;
    setModificationsNonEnregistrees(modifie);
  }, []);

  const naviger = (idPage) => {
    if (modificationsNonEnregistrees) {
      if (!window.confirm("Des modifications ne sont pas enregistrées. Les abandonner ?")) return;
      annulerModificationsRef.current?.();
      annulerModificationsRef.current = null;
      setModificationsNonEnregistrees(false);
    }
    setOffreAModifier(null);
    setpage(idPage);
  };

  useEffect(() => {
    if (!modificationsNonEnregistrees) return;
    const avertirAvantQuitter = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", avertirAvantQuitter);
    return () => window.removeEventListener("beforeunload", avertirAvantQuitter);
  }, [modificationsNonEnregistrees]);

  const deconnexion = async () => {
    const canalStatut = canalStatutRef.current;
    canalStatutRef.current = null;
    if (canalStatut) supabase.removeChannel(canalStatut);

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Erreur déconnexion serveur :", error);
    }
    localStorage.removeItem("token_pharmacie");
    localStorage.removeItem("role_pharmacie");
    viderCacheDemandes();
    viderCacheMessagerie();
    showToast("Déconnexion réussie !", "success");
    nav.push("/admin/connexion");
  };

  const ouvrirDeconnexion = () => {
    if (modificationsNonEnregistrees) {
      if (!window.confirm("Des modifications ne sont pas enregistrées. Les abandonner ?")) return;
      annulerModificationsRef.current?.();
      annulerModificationsRef.current = null;
      setModificationsNonEnregistrees(false);
    }
    setIsLogoutConfirmOpen(true);
  };

  const navItems = [
    { id: "l", label: "Voir le stock", icon: Squares2X2Icon },
    { id: "a", label: "Ajouter un médicament", icon: PlusCircleIcon },
    { id: "i", label: "Importation automatique", icon: DocumentTextIcon },
    { id: "c", label: "Consultations", icon: UsersIcon },
    { id: "d", label: "Demandes clients", icon: ChatBubbleLeftEllipsisIcon },
    { id: "m", label: "Administration", icon: ChatBubbleLeftRightIcon },
    { id: "r", label: "Rechercher un produit", icon: MagnifyingGlassIcon },
    { id: "pharmacie", label: "Ma pharmacie", icon: CalendarDaysIcon },
  ];

  if (loadingProfile) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-gray-50 flex-col gap-4">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-emerald-900 animate-pulse">
          Vérification de votre compte pharmacie...
        </p>
      </div>
    );
  }

  if (estStatutSuspendu(info.statut)) {
    return (
      <main className="fixed inset-0 z-[100] flex h-dvh items-center justify-center bg-gray-50 p-6">
        <section
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm"
        >
          <h1 className="text-xl font-bold text-rose-900">Pharmacie suspendue</h1>
          <p className="mt-3 text-sm leading-6 text-rose-800">
            Votre pharmacie est suspendue et n&apos;apparaît pas dans Mediskip. Contactez le support.
          </p>
          <button
            type="button"
            onClick={deconnexion}
            className="mt-6 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            Se déconnecter
          </button>
        </section>
      </main>
    );
  }

  // Selection de la section centrale
  let ComposantCentral;
  if (page === "l" || page === "p") {
    ComposantCentral = (
      <Centrale
        key={offreAModifier ? `stock-${offreAModifier.id}` : "stock"}
        pharmacieId={info.id}
        token={token}
        offreAModifier={offreAModifier}
        onOffreAModifierConsommee={() => setOffreAModifier(null)}
      />
    );
  } else if (page === "a") {
    ComposantCentral = (
      <Ajouter
        pharmacieId={info.id}
        token={token}
        onAddSuccess={() => naviger("l")}
        onModifierOffre={(offre) => {
          setOffreAModifier(offre);
          setpage("p");
        }}
      />
    );
  } else if (page === "i") {
    ComposantCentral = <ImportationStock pharmacieId={info.id} onImportSuccess={() => naviger("l")} />;
  } else if (page === "c") {
    ComposantCentral = <Consultations pharmacieId={info.id} token={token} ville={info.ville} />;
  } else if (page === "m") {
    ComposantCentral = (
      <Messages
        conversation={messagerie.conversation}
        messages={messagerie.messages}
        envoyerMessage={messagerie.envoyerMessage}
        chargerMessages={messagerie.chargerMessages}
        chargerMessagesPrecedents={messagerie.chargerMessagesPrecedents}
        recharger={messagerie.recharger}
        chargementConversation={messagerie.chargement}
        chargementMessages={messagerie.chargementMessages}
        chargementPrecedents={messagerie.chargementPrecedents}
        peutChargerPrecedents={messagerie.peutChargerPrecedents}
        erreurConversation={messagerie.erreur}
        erreurMessages={messagerie.erreurMessages}
      />
    );
  } else if (page === "d") {
    ComposantCentral = (
      <Demandes
        discussions={demandes.discussions}
        nonLus={demandes.nonLus}
        chargement={demandes.chargement}
        erreur={demandes.erreur}
        erreurCanal={demandes.erreurCanal}
        messages={demandes.messages}
        nomsMedicaments={demandes.nomsMedicaments}
        chargementMessages={demandes.chargementMessages}
        erreurMessages={demandes.erreurMessages}
        chargementPrecedents={demandes.chargementPrecedents}
        peutChargerPrecedents={demandes.peutChargerPrecedents}
        chargerMessages={demandes.chargerMessages}
        chargerMessagesPrecedents={demandes.chargerMessagesPrecedents}
        envoyerMessage={demandes.envoyerMessage}
        actualiser={demandes.actualiser}
        discussionOuverteId={discussionOuverteId}
        onOuvrirDiscussion={ouvrirDiscussion}
      />
    );
  } else if (page === "r") {
    ComposantCentral = <RechercheGlobale pharmacieId={info.id} token={token} />;
  } else if (page === "pharmacie") {
    ComposantCentral = (
      <MaPharmacie
        info={info}
        onUpdate={(newProfile) => setinfo(newProfile)}
        onUnsavedState={signalerModifications}
      />
    );
  }

  return (
    <div className="fixed inset-0 flex h-dvh w-full shrink-0 bg-gray-50/50 overflow-hidden font-sans">
      
      {/* Sidebar latérale */}
      <aside className="w-16 md:w-80 h-full bg-emerald-950 text-white flex flex-col border-r border-emerald-900/50 shrink-0">
        
        {/* Info Pharmacie */}
        <div className="p-2 md:p-6 border-b border-emerald-900/40 flex flex-col items-center">
          <div className="relative w-10 h-10 md:w-20 md:h-20 mb-0 md:mb-4 bg-emerald-800/80 rounded-xl md:rounded-2xl flex items-center justify-center border border-emerald-700/50 shadow-inner overflow-hidden group">
            {info.photo ? (
              <img 
                src={info.photo} 
                alt="Logo Pharmacie" 
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
              />
            ) : (
              <BuildingStorefrontIcon className="w-6 h-6 md:w-10 md:h-10 text-emerald-200" />
            )}
          </div>
          <h2 className="hidden md:block font-bold text-center text-lg leading-tight truncate w-full text-emerald-50">
            {formaterNomPharmacie(info.nom) || "Chargement..."}
          </h2>
          <p className="hidden md:flex text-xs text-emerald-300/80 items-center justify-center gap-1 mt-1.5 truncate w-full">
            <MedicalMapPinIcon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="truncate">
              {info.ville
                ? (info.emplacement
                  ? `${formaterNomPharmacie(info.ville)} • ${formaterNomPharmacie(info.emplacement)}`
                  : formaterNomPharmacie(info.ville))
                : (formaterNomPharmacie(info.emplacement) || "Non spécifié")}
            </span>
          </p>
        </div>

        {/* Menu Navigation */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-4 md:px-4 md:py-6 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = page === item.id || (item.id === "l" && page === "p");
            return (
              <button
                key={item.id}
                onClick={() => naviger(item.id)}
                title={item.label}
                className={`relative w-full flex items-center justify-center md:justify-start px-2 md:px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group ${
                  isActive
                    ? "bg-emerald-800 text-white shadow-md shadow-emerald-950/40"
                    : "text-emerald-100/70 hover:bg-emerald-900/40 hover:text-white"
                }`}
              >
                <Icon className={`w-5 h-5 mr-0 md:mr-3 transition-colors ${
                  isActive ? "text-emerald-300" : "text-emerald-300/50 group-hover:text-emerald-300"
                }`} />
                <span className="sr-only md:not-sr-only">{item.label}</span>
                {item.id === "m" && messagerie.nonLus > 0 && (
                  <span
                    aria-label={`${messagerie.nonLus} message${messagerie.nonLus > 1 ? "s" : ""} non lu${messagerie.nonLus > 1 ? "s" : ""}`}
                    className="absolute right-1 top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white md:static md:ml-auto md:min-w-5 md:px-1.5 md:text-[10px]"
                  >
                    {messagerie.nonLus}
                  </span>
                )}
                {item.id === "d" && demandes.nonLus > 0 && (
                  <span
                    aria-label={`${demandes.nonLus} message${demandes.nonLus > 1 ? "s" : ""} client${demandes.nonLus > 1 ? "s" : ""} non lu${demandes.nonLus > 1 ? "s" : ""}`}
                    className="absolute right-1 top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white md:static md:ml-auto md:min-w-5 md:px-1.5 md:text-[10px]"
                  >
                    {demandes.nonLus}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Pied de Sidebar */}
        <div className="p-2 md:p-4 border-t border-emerald-900/40 space-y-1.5 bg-emerald-950/60">

          <button
            onClick={ouvrirDeconnexion}
            title="Se déconnecter"
            className="w-full flex items-center justify-center md:justify-start px-2 md:px-4 py-2.5 rounded-xl text-xs font-bold text-rose-300 hover:bg-rose-950/20 hover:text-rose-200 transition cursor-pointer"
          >
            <ArrowLeftStartOnRectangleIcon className="w-4 h-4 mr-0 md:mr-2" />
            <span className="sr-only md:not-sr-only">Se déconnecter</span>
          </button>
        </div>
      </aside>

      {/* Zone de contenu central */}
      <main className="flex-1 h-full overflow-hidden bg-gray-50 flex flex-col">
        <header className="h-16 border-b border-gray-200/60 bg-white flex items-center justify-between px-8 shrink-0 shadow-sm shadow-gray-100/20">
          {page !== "pharmacie" && <h1 className="font-bold text-gray-800 text-lg">
            {page === "l" || page === "p" ? "Gestion du Stock" : page === "a" ? "Ajouter un Médicament" : page === "i" ? "Importation automatique" : page === "c" ? "Historique des Consultations" : page === "d" ? "Demandes clients" : page === "m" ? "Administration" : page === "r" ? "Recherche Globale" : "Paramètres Pharmacie"}
          </h1>}
          <div className="text-xs text-gray-400 font-medium">
            Session active en tant que Pharmacie
          </div>
        </header>

        {info.statut === "en_attente" && (
          <div
            role="status"
            className="shrink-0 border-b border-amber-200 bg-amber-50 px-8 py-3 text-sm font-medium text-amber-900"
          >
            Votre inscription est en cours de validation. Votre pharmacie n&apos;apparaît pas encore dans Mediskip.
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-8">
          <div className={`max-w-6xl mx-auto ${page === "pharmacie" ? "min-h-full" : "h-full"}`}>
            {ComposantCentral}
          </div>
        </div>
      </main>

      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-950/60 backdrop-blur-sm" />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
            aria-describedby="logout-confirm-message"
            className="relative z-10 w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl"
          >
            <h2 id="logout-confirm-title" className="text-lg font-bold text-gray-800">
              Confirmer la déconnexion
            </h2>
            <p id="logout-confirm-message" className="mt-3 text-sm text-gray-600">
              Voulez-vous vraiment vous déconnecter de votre compte ?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogoutConfirmOpen(false);
                  deconnexion();
                }}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Confirmer la déconnexion
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}