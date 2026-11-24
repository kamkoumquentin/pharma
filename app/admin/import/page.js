"use client";

import { useRouter } from "next/navigation";
import ImportationStock from "@/app/admin/import/import";
import { useAdmin } from "@/app/admin/AdminContext";

export default function ImportPage() {
  const router = useRouter();
  const { pharmacie } = useAdmin();

  return (
    <ImportationStock
      pharmacieId={pharmacie.id}
      onImportSuccess={() => router.push("/admin/stock")}
    />
  );
}
