"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Ajouter from "@/app/admin/ajouter/ajouter";
import { useAdmin } from "@/app/admin/AdminContext";

function AjouterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pharmacie, token } = useAdmin();

  const medicamentId = searchParams.get("medicamentId") || "";
  const nom = searchParams.get("nom") || "";

  return (
    <Ajouter
      key={`${medicamentId}-${nom}`}
      pharmacieId={pharmacie.id}
      token={token}
      initialMedicamentId={medicamentId}
      initialNom={nom}
      onAddSuccess={() => router.push("/admin/stock")}
      onModifierOffre={(offre) => {
        if (offre?.id) {
          router.push(`/admin/stock?offreId=${offre.id}`);
        } else {
          router.push("/admin/stock");
        }
      }}
    />
  );
}

export default function AjouterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <AjouterContent />
    </Suspense>
  );
}
