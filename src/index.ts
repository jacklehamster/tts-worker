import { JWT } from "google-auth-library";

export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);

    // Handle favicon redirect
    if (url.pathname === '/favicon.ico') {
      return Response.redirect("https://jacklehamster.github.io/tts-worker/icon.png");
    }

    // Extract query params with defaults
    const text = url.searchParams.get("text") ?? "provide text";
    const languageCode = url.searchParams.get("languageCode") ?? "en-US";
    const name = url.searchParams.get("name") ?? "en-US-Standard-A";
    const encoding = url.searchParams.get("encoding") ?? "mp3";
    const audioEncoding = encoding === "ogg" ? "OGG_OPUS" : "MP3";

    // Define cache key and open cache
    const cacheKey = new Request(url.toString(), request);
    const cache = await caches.open("tts-audio-cache"); // Named cache

    // Check if response is cached
    let response = await cache.match(cacheKey);
    if (response) {
      return response; // Serve from cache
    }

    // If not cached, generate audio
    if (!env.SHEETS_SERVICE_KEY_JSON) {
      return new Response("Missing service credentials", { status: 500 });
    }

    const ttsApiUrl = "https://texttospeech.googleapis.com/v1/text:synthesize";
    const authToken = await getAuthToken(env.SHEETS_SERVICE_KEY_JSON);

    const payload = {
      input: { text },
      voice: { languageCode, name },
      audioConfig: { audioEncoding },
    };

    let ttsResponse;
    try {
      ttsResponse = await fetch(ttsApiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      return new Response(`Fetch error: ${err.message}`, { status: 503 });
    }

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      return new Response(`TTS API error: ${errorText}`, { status: 500 });
    }

    const { audioContent } = await ttsResponse.json<{ audioContent: string }>();
    const binaryString = atob(audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const contentType = audioEncoding === "OGG_OPUS" ? "audio/ogg" : "audio/mp3";
    response = new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // Cache for 24 hours
      },
    });

    // Store in cache
    await cache.put(cacheKey, response.clone());

    return response;
  },
};

async function getAuthToken(credentials: string) {
  const creds = JSON.parse(credentials);
  const client = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const token = await client.authorize();
  return token.access_token;
}
