/**
 * GET /api/karte
 *
 * Liefert die aktuelle Speisekarte als JSON. Öffentlich — die Karte ist ja
 * auch auf der Webseite für jeden sichtbar.
 *
 * Solange im Admin-Bereich noch nichts gespeichert wurde, antwortet dieser
 * Endpunkt mit 204 (kein Inhalt). Die Startseite zeigt dann die fest
 * eingebaute Karte aus index.html an. Dadurch funktioniert die Seite auch,
 * bevor der Admin-Bereich eingerichtet ist.
 */

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') return new Response(null, { status: 405 });

  if (!env.KARTE) {
    // Ohne KV-Binding gibt es nichts zu laden — die Seite nutzt ihre eigene Karte.
    return new Response(null, { status: 204 });
  }

  const gespeichert = await env.KARTE.get('speisekarte');
  if (!gespeichert) return new Response(null, { status: 204 });

  return new Response(gespeichert, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Kurz zwischenspeichern: die Karte ändert sich selten, aber eine
      // Änderung soll trotzdem zügig sichtbar werden.
      'Cache-Control': 'public, max-age=60'
    }
  });
}
