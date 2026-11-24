"use client";

import { useRouter } from "next/navigation";
import Dashboard from "@/app/admin/dashboard/dashboard";
import { useAdmin } from "@/app/admin/AdminContext";

const ROUTES_PAR_ID = {
  dashboard: "/admin",
  l: "/admin/stock",
  p: "/admin/stock",
  a: "/admin/ajouter",
  i: "/admin/import",
  c: "/admin/consultations",
  d: "/admin/demandes",
  m: "/admin/messages",
  r: "/admin/recherche",
  pharmacie: "/admin/pharmacie",
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const { pharmacie } = useAdmin();

  const gererNavigation = (cible) => {
    if (!cible) return;
    const chemin = cible.startsWith("/") ? cible : ROUTES_PAR_ID[cible];
    if (chemin) {
      router.push(chemin);
    }
  };

  return <Dashboard pharmacie={pharmacie} onNavigate={gererNavigation} />;
}
