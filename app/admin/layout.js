"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  ChartBarSquareIcon,
  BellIcon,
  BellAlertIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/24/outline";
import { supabase } from "@/app/lib/supabaseClient";
import { logErreur } from "@/app/lib/logger";
import { useMessagerie } from "@/app/lib/messagerie";
import { useDemandes } from "@/app/lib/demandes";
import {
  jouerSonAlerte,
  demanderPermissionNotifications,
  envoyerNotificationBureau,
} from "@/app/lib/alertesDemandes";
import { formaterNomPharmacie } from "@/app/lib/formatNomPharmacie.mjs";
import { useToast } from "@/app/components/Toast";
import { AdminProvider } from "@/app/admin/AdminContext";
import StatutVisibiliteBadge from "@/app/admin/StatutVisibiliteBadge";

const ROUTES_AUTH = [
  "/admin/connexion",
  "/admin/inscription",
  "/admin/reinitialiser",
];

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

const NAV_ITEMS = [
  { href: "/admin", label: "Tableau de bord", icon: ChartBarSquareIcon, exact: true },
  { href: "/admin/stock", label: "Voir le stock", icon: Squares2X2Icon },
  { href: "/admin/ajouter", label: "Ajouter un médicament", icon: PlusCircleIcon },
  { href: "/admin/import", label: "Importation automatique", icon: DocumentTextIcon },
  { href: "/admin/consultations", label: "Consultations", icon: UsersIcon },
  { href: "/admin/demandes", label: "Demandes clients", icon: ChatBubbleLeftEllipsisIcon },
  { href: "/admin/messages", label: "Administration", icon: ChatBubbleLeftRightIcon },
  { href: "/admin/recherche", label: "Rechercher un produit", icon: MagnifyingGlassIcon },
  { href: "/admin/pharmacie", label: "Ma pharmacie", icon: CalendarDaysIcon },
];

function titreEntete(pathname) {
  if (!pathname || pathname === "/admin") return "Tableau de bord";
  if (pathname.startsWith("/admin/stock")) return "Gestion du Stock";
  if (pathname.startsWith("/admin/ajouter")) return "Ajouter un Médicament";
  if (pathname.startsWith("/admin/import")) return "Importation automatique";
  if (pathname.startsWith("/admin/consultations")) return "Historique des Consultations";
  if (pathname.startsWith("/admin/demandes")) return "Demandes clients";
  if (pathname.startsWith("/admin/messages")) return "Administration";
  if (pathname.startsWith("/admin/recherche")) return "Recherche Globale";
  return "Paramètres Pharmacie";
}

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const nav = useRouter();
  const showToast = useToast();

  const estRouteAuth = ROUTES_AUTH.some((route) => pathname?.startsWith(route));

  const [info, setinfo] = useState({
    id: "",
    nom: "",
    ville: "",
    emplacement: "",
    photo: "",
    visible: true,
    abonnement_expire_le: null,
  });
  const [token, setToken] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(!estRouteAuth);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [discussionOuverteId, setDiscussionOuverteId] = useState(null);
  const [modificationsNonEnregistrees, setModificationsNonEnregistrees] = useState(false);
  const [sonActif, setSonActif] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("pharma_alertes_son") !== "off";
  });
  const [permissionNotif, setPermissionNotif] = useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const annulerModificationsRef = useRef(null);
  const canalStatutRef = useRef(null);
  const titreInitialRef = useRef(null);
  const aChargeDemandesRef = useRef(false);
  const precedentNonLusRef = useRef(0);

  const pharmacieActiveId = estRouteAuth ? "" : info.id;
  const messagerie = useMessagerie(pharmacieActiveId, !estRouteAuth && pathname?.startsWith("/admin/messages"));
  const demandes = useDemandes(pharmacieActiveId, !estRouteAuth && pathname?.startsWith("/admin/demandes"), discussionOuverteId);

  const viderCacheDemandes = demandes.viderCache;
  const viderCacheMessagerie = messagerie.viderCache;
  const preparerOuvertureDiscussion = demandes.preparerOuverture;

  const ouvrirDiscussion = useCallback((discussionId) => {
    preparerOuvertureDiscussion(discussionId);
    setDiscussionOuverteId(discussionId);
  }, [preparerOuvertureDiscussion]);

  const basculerSon = () => {
    setSonActif((precedent) => {
      const suivant = !precedent;
      if (typeof window !== "undefined") {
        localStorage.setItem("pharma_alertes_son", suivant ? "on" : "off");
      }
      return suivant;
    });
  };

  const activerNotifications = async () => {
    const resultat = await demanderPermissionNotifications();
    setPermissionNotif(resultat);
    if (resultat === "granted") {
      showToast("Notifications bureau activées !", "success");
    } else if (resultat === "denied") {
      showToast("Notifications bloquées par le navigateur.", "info");
    }
  };

  useEffect(() => {
    if (estRouteAuth || typeof document === "undefined") return undefined;

    if (titreInitialRef.current === null) {
      titreInitialRef.current = document.title.replace(/^\(\d+\)\s*/, "");
    }
    const titreBase = titreInitialRef.current || "Medipharmac | Administration pharmacie";
    document.title =
      demandes.nonLus > 0
        ? `(${demandes.nonLus}) Nouvelle demande — Pharma`
        : titreBase;

    return () => {
      if (titreInitialRef.current !== null) {
        document.title = titreInitialRef.current;
      }
    };
  }, [demandes.nonLus, estRouteAuth]);

  useEffect(() => {
    if (estRouteAuth || demandes.chargement) return;

    if (!aChargeDemandesRef.current) {
      aChargeDemandesRef.current = true;
      precedentNonLusRef.current = demandes.nonLus;
      return;
    }

    if (demandes.nonLus > precedentNonLusRef.current) {
      if (sonActif) {
        jouerSonAlerte();
      }
      if (
        typeof document !== "undefined" &&
        (document.hidden || !pathname?.startsWith("/admin/demandes"))
      ) {
        envoyerNotificationBureau({
          titre: "Nouvelle demande client",
          corps: `Vous avez ${demandes.nonLus} message${demandes.nonLus > 1 ? "s" : ""} non lu${demandes.nonLus > 1 ? "s" : ""}.`,
          onClick: () => nav.push("/admin/demandes"),
        });
      }
    }

    precedentNonLusRef.current = demandes.nonLus;
  }, [demandes.chargement, demandes.nonLus, estRouteAuth, nav, pathname, sonActif]);

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

  const rafraichirPharmacie = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile, error } = await supabase
        .from("pharmacies")
        .select("id, nom, ville, emplacement, photo, telephone, latitude, longitude, statut, visible, abonnement_expire_le")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (!error && profile) {
        setinfo(profile);
        return profile;
      }
      return null;
    } catch (error) {
      logErreur("AdminLayout", "rafraîchissement du profil pharmacie", error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (estRouteAuth) return undefined;

    let actif = true;
    const fetchProfile = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (!actif) return;

        if (userError || !user) {
          viderCacheDemandes();
          viderCacheMessagerie();
          localStorage.removeItem("token_pharmacie");
          nav.push("/admin/connexion");
          return;
        }

        let profile = null;
        let profError = null;
        const meta = user.user_metadata || {};
        const estComptePharmacieMeta = meta.role === "pharmacie";
        const maxAttempts = estComptePharmacieMeta ? 5 : 1;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const res = await supabase
            .from("pharmacies")
            .select("id, nom, ville, emplacement, photo, telephone, latitude, longitude, statut, visible, abonnement_expire_le")
            .eq("owner_id", user.id)
            .maybeSingle();

          profile = res.data;
          profError = res.error;

          if (profile) break;

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
        }

        if (!actif) return;

        // Si aucun profil n'a été trouvé, tenter une auto-création uniquement pour un compte pharmacie
        if (!profile && !profError && estComptePharmacieMeta) {
          const nomPharma = meta.nom || meta.pharmacie_nom;

          if (nomPharma) {
            const pharmacieData = {
              nom: String(nomPharma).trim(),
              telephone: meta.telephone ? String(meta.telephone).trim() : "",
              ville: meta.ville ? String(meta.ville).trim() : "",
              emplacement: meta.emplacement ? String(meta.emplacement).trim() : null,
              latitude: meta.latitude !== undefined && meta.latitude !== null ? parseFloat(meta.latitude) : 0,
              longitude: meta.longitude !== undefined && meta.longitude !== null ? parseFloat(meta.longitude) : 0,
              owner_id: user.id,
              statut: "actif",
              etat: "normal",
              photo: null,
            };

            const { data: createdProfile, error: createError } = await supabase
              .from("pharmacies")
              .insert(pharmacieData)
              .select("id, nom, ville, emplacement, photo, telephone, latitude, longitude, statut, visible, abonnement_expire_le")
              .single();

            if (!createError && createdProfile) {
              profile = createdProfile;
              showToast("Votre pharmacie a été créée avec succès !", "success");
            } else if (createError && createError.code === "23505") {
              const { data: existingProfile } = await supabase
                .from("pharmacies")
                .select("id, nom, ville, emplacement, photo, telephone, latitude, longitude, statut, visible, abonnement_expire_le")
                .eq("owner_id", user.id)
                .maybeSingle();
              if (existingProfile) profile = existingProfile;
            } else {
              logErreur("AdminLayout", "création automatique de la pharmacie", createError, {
                ownerId: user.id,
              });
            }
          }
        }

        if (!actif) return;

        if (profError || !profile) {
          await supabase.auth.signOut();
          viderCacheDemandes();
          viderCacheMessagerie();
          localStorage.removeItem("token_pharmacie");
          localStorage.removeItem("role_pharmacie");
          showToast("Adresse e-mail ou mot de passe incorrect.", "error");
          nav.push("/admin/connexion");
          return;
        }

        setinfo(profile);
        setToken("active");
        setLoadingProfile(false);
      } catch (error) {
        logErreur("AdminLayout", "vérification de la session", error);
        viderCacheDemandes();
        viderCacheMessagerie();
        localStorage.removeItem("token_pharmacie");
        nav.push("/admin/connexion");
      }
    };

    fetchProfile();
    return () => {
      actif = false;
    };
  }, [estRouteAuth, nav, showToast, viderCacheDemandes, viderCacheMessagerie]);

  useEffect(() => {
    if (estRouteAuth || !info.id) return undefined;

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
          const miseAJour = {};
          if (Object.prototype.hasOwnProperty.call(pharmacie, "statut")) {
            miseAJour.statut = pharmacie.statut;
          }
          if (Object.prototype.hasOwnProperty.call(pharmacie, "visible")) {
            miseAJour.visible = pharmacie.visible;
          }
          if (Object.prototype.hasOwnProperty.call(pharmacie, "abonnement_expire_le")) {
            miseAJour.abonnement_expire_le = pharmacie.abonnement_expire_le;
          }
          if (Object.keys(miseAJour).length === 0) return;

          setinfo((precedent) => (
            String(precedent.id) === String(pharmacie.id)
              ? { ...precedent, ...miseAJour }
              : precedent
          ));
        }
      )
      .subscribe((status, error) => {
        if (!actif) return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          logErreur("AdminLayout", "canal Realtime du statut pharmacie", error || status, {
            pharmacieId: info.id,
            canalStatus: status,
          });
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
  }, [estRouteAuth, info.id]);

  const signalerModifications = useCallback((modifie, annuler) => {
    annulerModificationsRef.current = annuler;
    setModificationsNonEnregistrees(modifie);
  }, []);

  const confirmerNavigation = useCallback(() => {
    if (!modificationsNonEnregistrees) return true;
    if (!window.confirm("Vous avez des modifications non enregistrées. Voulez-vous vraiment quitter cette page ?")) {
      return false;
    }
    annulerModificationsRef.current?.();
    annulerModificationsRef.current = null;
    setModificationsNonEnregistrees(false);
    return true;
  }, [modificationsNonEnregistrees]);

  const handleNavigationClick = useCallback((event, href) => {
    if (pathname === href) return;
    if (!confirmerNavigation()) {
      event.preventDefault();
    }
  }, [confirmerNavigation, pathname]);

  useEffect(() => {
    let actif = true;
    Promise.resolve().then(() => {
      if (!actif) return;
      annulerModificationsRef.current = null;
      setModificationsNonEnregistrees(false);
    });
    return () => {
      actif = false;
    };
  }, [pathname]);

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
      logErreur("AdminLayout", "déconnexion serveur", error, { pharmacieId: info.id });
    }
    localStorage.removeItem("token_pharmacie");
    localStorage.removeItem("role_pharmacie");
    viderCacheDemandes();
    viderCacheMessagerie();
    showToast("Déconnexion réussie !", "success");
    nav.push("/admin/connexion");
  };

  const ouvrirDeconnexion = () => {
    if (!confirmerNavigation()) return;
    setIsLogoutConfirmOpen(true);
  };

  const contexteValue = useMemo(
    () => ({
      pharmacie: info,
      setPharmacie: setinfo,
      token,
      demandes,
      messagerie,
      discussionOuverteId,
      ouvrirDiscussion,
      rafraichirPharmacie,
      signalerModifications,
    }),
    [info, token, demandes, messagerie, discussionOuverteId, ouvrirDiscussion, rafraichirPharmacie, signalerModifications]
  );

  if (estRouteAuth) {
    return children;
  }

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

  const estPagePharmacie = pathname?.startsWith("/admin/pharmacie");

  return (
    <AdminProvider value={contexteValue}>
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
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname?.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  onClick={(e) => handleNavigationClick(e, item.href)}
                  className={`relative w-full flex items-center justify-center md:justify-start px-2 md:px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group ${
                    isActive
                      ? "bg-emerald-800 text-white shadow-md shadow-emerald-950/40"
                      : "text-emerald-100/70 hover:bg-emerald-900/40 hover:text-white"
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 mr-0 md:mr-3 transition-colors ${
                      isActive ? "text-emerald-300" : "text-emerald-300/50 group-hover:text-emerald-300"
                    }`}
                  />
                  <span className="sr-only md:not-sr-only">{item.label}</span>
                  {item.href === "/admin/messages" && messagerie.nonLus > 0 && (
                    <span
                      aria-label={`${messagerie.nonLus} message${messagerie.nonLus > 1 ? "s" : ""} non lu${messagerie.nonLus > 1 ? "s" : ""}`}
                      className="absolute right-1 top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white md:static md:ml-auto md:min-w-5 md:px-1.5 md:text-[10px]"
                    >
                      {messagerie.nonLus}
                    </span>
                  )}
                  {item.href === "/admin/demandes" && demandes.nonLus > 0 && (
                    <span
                      aria-label={`${demandes.nonLus} message${demandes.nonLus > 1 ? "s" : ""} client${demandes.nonLus > 1 ? "s" : ""} non lu${demandes.nonLus > 1 ? "s" : ""}`}
                      className="absolute right-1 top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white md:static md:ml-auto md:min-w-5 md:px-1.5 md:text-[10px]"
                    >
                      {demandes.nonLus}
                    </span>
                  )}
                </Link>
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
          <header className="h-16 border-b border-gray-200/60 bg-white flex items-center justify-between gap-4 px-8 shrink-0 shadow-sm shadow-gray-100/20">
            {!estPagePharmacie ? (
              <h1 className="font-bold text-gray-800 text-lg truncate">
                {titreEntete(pathname)}
              </h1>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3 shrink-0">
              <StatutVisibiliteBadge pharmacie={info} variant="compact" />
              <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
                {permissionNotif !== "unsupported" && (
                  <button
                    type="button"
                    onClick={activerNotifications}
                    title={
                      permissionNotif === "granted"
                        ? "Notifications bureau activées"
                        : permissionNotif === "denied"
                          ? "Notifications bureau bloquées dans le navigateur"
                          : "Activer les notifications bureau"
                    }
                    aria-label="Notifications bureau"
                    className={`rounded-lg p-1.5 transition cursor-pointer ${
                      permissionNotif === "granted"
                        ? "bg-emerald-50 text-emerald-600"
                        : permissionNotif === "denied"
                          ? "text-gray-300 cursor-not-allowed"
                          : "text-gray-500 hover:bg-gray-100 hover:text-emerald-600"
                    }`}
                  >
                    {permissionNotif === "granted" ? (
                      <BellAlertIcon className="h-4 w-4" />
                    ) : (
                      <BellIcon className="h-4 w-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={basculerSon}
                  title={sonActif ? "Couper le son des alertes" : "Activer le son des alertes"}
                  aria-label={sonActif ? "Couper le son des alertes" : "Activer le son des alertes"}
                  className={`rounded-lg p-1.5 transition cursor-pointer ${
                    sonActif
                      ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                      : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  }`}
                >
                  {sonActif ? (
                    <SpeakerWaveIcon className="h-4 w-4" />
                  ) : (
                    <SpeakerXMarkIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              <span className="hidden xl:inline text-xs text-gray-400 font-medium">
                Session active en tant que Pharmacie
              </span>
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

          {info.visible === false && (
            <div
              role="status"
              className="shrink-0 border-b border-amber-200 bg-amber-50 px-8 py-3 text-sm font-medium text-amber-900"
            >
              Votre pharmacie est masquée aux clients. Vous pouvez continuer à utiliser le tableau de bord pour corriger la situation.
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto p-8">
            <div className={`max-w-6xl mx-auto ${estPagePharmacie ? "min-h-full" : "h-full"}`}>
              {children}
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
    </AdminProvider>
  );
}
