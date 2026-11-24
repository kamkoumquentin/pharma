"use client";

import MaPharmacie from "@/app/admin/ma-pharmacie";
import { useAdmin } from "@/app/admin/AdminContext";

export default function PharmaciePage() {
  const { pharmacie, setPharmacie, signalerModifications } = useAdmin();

  return (
    <MaPharmacie
      info={pharmacie}
      onUpdate={(newProfile) => setPharmacie(newProfile)}
      onUnsavedState={signalerModifications}
    />
  );
}
