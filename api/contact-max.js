// ─────────────────────────────────────────────────────────────────────────
// Redirection vers WhatsApp pour demander son code de connexion à Max.
//
// Le numéro de téléphone n'est JAMAIS écrit dans le code source : il n'est
// donc visible ni sur GitHub, ni dans le JavaScript envoyé au navigateur
// (donc pas non plus indexable par Google). Il vit uniquement dans la
// variable d'environnement Vercel MAX_WHATSAPP_NUMBER, lue ici côté
// serveur, au moment où quelqu'un clique sur le lien.
//
// Appelé par le petit lien "Envoie un petit message à Max !" sur l'écran
// de connexion (src/components/auth/AuthGate.jsx), qui pointe simplement
// vers /api/contact-max — jamais vers un lien wa.me écrit en dur.
// ─────────────────────────────────────────────────────────────────────────
export default function handler(req, res) {
  const number = process.env.MAX_WHATSAPP_NUMBER;

  if (!number) {
    res
      .status(500)
      .send(
        "Numéro WhatsApp non configuré. Ajoutez la variable d'environnement MAX_WHATSAPP_NUMBER dans Vercel."
      );
    return;
  }

  const message =
    "Hello Max, peux-tu m'envoyer mon code pour l'app Padel manager ? Merci :)";
  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

  res.writeHead(302, { Location: url });
  res.end();
}
