"use client";

import { 
  BuildingStorefrontIcon, 
  PencilIcon, 
  PlusCircleIcon, 
  Squares2X2Icon, 
  ArrowLeftStartOnRectangleIcon, 
  ArrowLeftIcon,
  DocumentTextIcon,
  UsersIcon,
  MagnifyingGlassIcon
} from "@heroicons/react/24/solid";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Centrale from "./contenu";
import Modification from "./modifier/modifier";
import Ajouter from "./ajouter/ajouter";
import ImportationStock from "./import/import";
import Consultations from "./consultations/consultations";
import RechercheGlobale from "./recherche/recherche";
import { supabase } from "@/app/lib/supabaseClient";
import { useToast } from "@/app/components/Toast";

const MedicalMapPinIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
    <path d="M9.5 8h5v2h-5z" fill="white" />
    <path d="M11 6.5h2v5h-2z" fill="white" />
  </svg>
);

export default function Acceuil() {
  const [page, setpage] = useState("l"); // 'l' for stock list, 'm' for modification, 'a' for add
  const [info, setinfo] = useState({ id: "", nom: "", emplacement: "", photo: "" });
  const [token, setToken] = useState("");
  const nav = useRouter();
  const showToast = useToast();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          localStorage.removeItem("token_pharmacie");
          nav.push("/admin/connexion");
          return;
        }

        const { data: profile, error: profError } = await supabase
          .from("pharmacies")
          .select("*")
          .eq("password", user.id)
          .maybeSingle();

        if (profError || !profile) {
          showToast("Accès interdit : cette interface est réservée aux pharmaciens.", "error");
          await supabase.auth.signOut();
          localStorage.removeItem("token_pharmacie");
          nav.push("/admin/connexion");
          return;
        }

        setinfo(profile);
        setToken("active");
      } catch (error) {
        console.error("Erreur de vérification de la session :", error);
        localStorage.removeItem("token_pharmacie");
        nav.push("/admin/connexion");
      }
    };

    fetchProfile();
  }, [nav, showToast]);

  const naviger = (idPage) => {
    setpage(idPage);
  };

  const deconnexion = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Erreur déconnexion serveur :", error);
    }
    localStorage.removeItem("token_pharmacie");
    localStorage.removeItem("role_pharmacie");
    showToast("Déconnexion réussie !", "success");
    nav.push("/admin/connexion");
  };

  const navItems = [
    { id: "l", label: "Voir le stock", icon: Squares2X2Icon },
    { id: "a", label: "Ajouter un médicament", icon: PlusCircleIcon },
    { id: "i", label: "Importation automatique", icon: DocumentTextIcon },
    { id: "c", label: "Consultations", icon: UsersIcon },
    { id: "r", label: "Rechercher un produit", icon: MagnifyingGlassIcon },
    { id: "m", label: "Modifier les infos", icon: PencilIcon },
  ];

  // Selection de la section centrale
  let ComposantCentral;
  if (page === "l" || page === "p") {
    ComposantCentral = <Centrale pharmacieId={info.id} token={token} />;
  } else if (page === "m") {
    ComposantCentral = (
      <Modification 
        info={info} 
        token={token} 
        onUpdate={(newProfile) => {
          setinfo(newProfile);
        }} 
      />
    );
  } else if (page === "a") {
    ComposantCentral = <Ajouter pharmacieId={info.id} token={token} onAddSuccess={() => setpage("l")} />;
  } else if (page === "i") {
    ComposantCentral = <ImportationStock pharmacieId={info.id} onImportSuccess={() => setpage("l")} />;
  } else if (page === "c") {
    ComposantCentral = <Consultations pharmacieId={info.id} token={token} />;
  } else if (page === "r") {
    ComposantCentral = <RechercheGlobale pharmacieId={info.id} token={token} />;
  }

  return (
    <div className="flex w-screen h-screen bg-gray-50/50 overflow-hidden font-sans">
      
      {/* Sidebar latérale */}
      <aside className="w-80 h-full bg-emerald-950 text-white flex flex-col border-r border-emerald-900/50 shrink-0">
        
        {/* Info Pharmacie */}
        <div className="p-6 border-b border-emerald-900/40 flex flex-col items-center">
          <div className="relative w-20 h-20 mb-4 bg-emerald-800/80 rounded-2xl flex items-center justify-center border border-emerald-700/50 shadow-inner overflow-hidden group">
            {info.photo ? (
              <img 
                src={info.photo} 
                alt="Logo Pharmacie" 
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
              />
            ) : (
              <BuildingStorefrontIcon className="w-10 h-10 text-emerald-200" />
            )}
          </div>
          <h2 className="font-bold text-center text-lg leading-tight truncate w-full text-emerald-50">
            {info.nom || "Chargement..."}
          </h2>
          <p className="text-xs text-emerald-300/80 flex items-center justify-center gap-1 mt-1.5 truncate w-full">
            <MedicalMapPinIcon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="truncate">{info.emplacement || "Non spécifié"}</span>
          </p>
        </div>

        {/* Menu Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = page === item.id || (item.id === "l" && page === "p");
            return (
              <button
                key={item.id}
                onClick={() => naviger(item.id)}
                className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group ${
                  isActive
                    ? "bg-emerald-800 text-white shadow-md shadow-emerald-950/40"
                    : "text-emerald-100/70 hover:bg-emerald-900/40 hover:text-white"
                }`}
              >
                <Icon className={`w-5 h-5 mr-3 transition-colors ${
                  isActive ? "text-emerald-300" : "text-emerald-300/50 group-hover:text-emerald-300"
                }`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Pied de Sidebar */}
        <div className="p-4 border-t border-emerald-900/40 space-y-1.5 bg-emerald-950/60">
          
          <button
            onClick={() => nav.push("/admin/connexion")}
            className="w-full flex items-center px-4 py-2.5 rounded-xl text-xs font-semibold text-emerald-200/60 hover:text-emerald-200 hover:bg-emerald-900/20 transition cursor-pointer"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Retour connexion
          </button>

          <button
            onClick={deconnexion}
            className="w-full flex items-center px-4 py-2.5 rounded-xl text-xs font-bold text-rose-300 hover:bg-rose-950/20 hover:text-rose-200 transition cursor-pointer"
          >
            <ArrowLeftStartOnRectangleIcon className="w-4 h-4 mr-2" />
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* Zone de contenu central */}
      <main className="flex-1 h-full overflow-hidden bg-gray-50 flex flex-col">
        <header className="h-16 border-b border-gray-200/60 bg-white flex items-center justify-between px-8 shrink-0 shadow-sm shadow-gray-100/20">
          <h1 className="font-bold text-gray-800 text-lg">
            {page === "l" || page === "p" ? "Gestion du Stock" : page === "a" ? "Ajouter un Médicament" : page === "i" ? "Importation automatique" : page === "c" ? "Historique des Consultations" : page === "r" ? "Recherche Globale" : "Paramètres Pharmacie"}
          </h1>
          <div className="text-xs text-gray-400 font-medium">
            Session active en tant que Pharmacie
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto h-full">
            {ComposantCentral}
          </div>
        </div>
      </main>

    </div>
  );
}