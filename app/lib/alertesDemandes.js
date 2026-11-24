export function jouerSonAlerte() {
  if (typeof window === "undefined") return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const maintenant = ctx.currentTime;
    const notes = [
      { freq: 587.33, debut: maintenant, duree: 0.12 },
      { freq: 880, debut: maintenant + 0.14, duree: 0.16 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, note.debut);

      gain.gain.setValueAtTime(0.001, note.debut);
      gain.gain.exponentialRampToValueAtTime(0.12, note.debut + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, note.debut + note.duree);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(note.debut);
      osc.stop(note.debut + note.duree + 0.01);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 500);
  } catch {
    // Le navigateur peut bloquer l'audio avant toute interaction utilisateur.
  }
}

export async function demanderPermissionNotifications() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  if (
    Notification.permission === "granted" ||
    Notification.permission === "denied"
  ) {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function envoyerNotificationBureau({ titre, corps, onClick }) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return null;
  }

  try {
    const notification = new Notification(titre, {
      body: corps,
      icon: "/icon.png",
    });

    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignorer si le focus est refusé
      }
      notification.close();
      if (typeof onClick === "function") {
        onClick();
      }
    };

    return notification;
  } catch {
    return null;
  }
}
