"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Centrale from "@/app/admin/contenu";
import { useAdmin } from "@/app/admin/AdminContext";
import { supabase } from "@/app/lib/supabaseClient";

function StockContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pharmacie, token } = useAdmin();
  const offreId = searchParams.get("offreId");
  const [offreChargee, setOffreChargee] = useState(null);

  useEffect(() => {
    if (!offreId || !pharmacie?.id) return undefined;
    let actif = true;

    supabase
      .from("offres")
      .select("id, prix, image, disponibilite, medicaments(nom)")
      .eq("id", offreId)
      .eq("id_pharmacie", pharmacie.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!actif || error || !data) {
          if (actif) {
            setOffreChargee({ offreId, valeur: null });
          }
          return;
        }
        setOffreChargee({
          offreId,
          valeur: {
            id: data.id,
            nom: data.medicaments?.nom || "",
            prix: data.prix,
            image: data.image || "",
            disponibilite: data.disponibilite || "disponible",
          },
        });
      });

    return () => {
      actif = false;
    };
  }, [offreId, pharmacie?.id]);

  if (offreId && offreChargee?.offreId !== offreId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const offreAModifier = offreId && offreChargee?.offreId === offreId
    ? offreChargee.valeur
    : null;

  return (
    <Centrale
      key={offreAModifier ? `stock-${offreAModifier.id}` : "stock"}
      pharmacieId={pharmacie.id}
      token={token}
      offreAModifier={offreAModifier}
      onOffreAModifierConsommee={() => router.replace("/admin/stock")}
    />
  );
}

export default function StockPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <StockContent />
    </Suspense>
  );
}
