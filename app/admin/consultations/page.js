"use client";

import Consultations from "@/app/admin/consultations/consultations";
import { useAdmin } from "@/app/admin/AdminContext";

export default function ConsultationsPage() {
  const { pharmacie, token } = useAdmin();

  return (
    <Consultations
      pharmacieId={pharmacie.id}
      token={token}
      ville={pharmacie.ville}
    />
  );
}
