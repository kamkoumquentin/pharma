"use client";

import { useRouter } from "next/navigation";
import Ajouter from "@/app/admin/ajouter/ajouter";
import { useAdmin } from "@/app/admin/AdminContext";

export default function AjouterPage() {
  const router = useRouter();
  const { pharmacie, token } = useAdmin();

  return (
    <Ajouter
      pharmacieId={pharmacie.id}
      token={token}
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
