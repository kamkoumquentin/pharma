"use client";

import RechercheGlobale from "@/app/admin/recherche/recherche";
import { useAdmin } from "@/app/admin/AdminContext";

export default function RecherchePage() {
  const { pharmacie, token } = useAdmin();

  return <RechercheGlobale pharmacieId={pharmacie.id} token={token} />;
}
