"use client";

import Messages from "@/app/admin/messages/messages";
import { useAdmin } from "@/app/admin/AdminContext";

export default function MessagesPage() {
  const { messagerie } = useAdmin();

  return (
    <Messages
      conversation={messagerie.conversation}
      messages={messagerie.messages}
      envoyerMessage={messagerie.envoyerMessage}
      chargerMessages={messagerie.chargerMessages}
      chargerMessagesPrecedents={messagerie.chargerMessagesPrecedents}
      recharger={messagerie.recharger}
      chargementConversation={messagerie.chargement}
      chargementMessages={messagerie.chargementMessages}
      chargementPrecedents={messagerie.chargementPrecedents}
      peutChargerPrecedents={messagerie.peutChargerPrecedents}
      erreurConversation={messagerie.erreur}
      erreurMessages={messagerie.erreurMessages}
    />
  );
}
