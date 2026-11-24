"use client";

import Demandes from "@/app/admin/demandes/demandes";
import { useAdmin } from "@/app/admin/AdminContext";

export default function DemandesPage() {
  const { demandes, discussionOuverteId, ouvrirDiscussion } = useAdmin();

  return (
    <Demandes
      discussions={demandes.discussions}
      nonLus={demandes.nonLus}
      chargement={demandes.chargement}
      erreur={demandes.erreur}
      erreurCanal={demandes.erreurCanal}
      messages={demandes.messages}
      nomsMedicaments={demandes.nomsMedicaments}
      chargementMessages={demandes.chargementMessages}
      erreurMessages={demandes.erreurMessages}
      chargementPrecedents={demandes.chargementPrecedents}
      peutChargerPrecedents={demandes.peutChargerPrecedents}
      chargerMessages={demandes.chargerMessages}
      chargerMessagesPrecedents={demandes.chargerMessagesPrecedents}
      envoyerMessage={demandes.envoyerMessage}
      modifierMessage={demandes.modifierMessage}
      supprimerMessage={demandes.supprimerMessage}
      actualiser={demandes.actualiser}
      discussionOuverteId={discussionOuverteId}
      onOuvrirDiscussion={ouvrirDiscussion}
    />
  );
}
