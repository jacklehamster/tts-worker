import { Buffer } from 'buffer';

export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') {
      return Response.redirect("https://jacklehamster.github.io/tts-worker/icon.png");
    }

    const text = url.searchParams.get("text") ?? "provide text";
    const languageCode = url.searchParams.get("languageCode") ?? "en-US";
    const name = url.searchParams.get("name") ?? "en-US-Standard-A";
    const encoding = url.searchParams.get("encoding") ?? "mp3";
    const audioEncoding = encoding === "ogg" ? "OGG_OPUS" : "MP3";

    // Google TTS API endpoint
    const ttsApiUrl = "https://texttospeech.googleapis.com/v1/text:synthesize";

    const authToken = await getAuthToken(env.SHEETS_SERVICE_KEY_JSON);

    const payload = {
      input: { text },
      voice: {
        languageCode,
        name,
      },
      audioConfig: { audioEncoding },
    };

    const ttsResponse = await fetch(ttsApiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!ttsResponse.ok) {
      return new Response("TTS API error", { status: 500 });
    }

    const { audioContent } = await ttsResponse.json<{ audioContent: string }>();
    const audioBuffer = Buffer.from(audioContent, "base64");

    const contentType = audioEncoding === "OGG_OPUS" ? "audio/ogg" : "audio/mp3";
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": contentType,
      },
    });
  },
};

// Function to get OAuth2 token using service account
async function getAuthToken(credentials: string) {
  const { JWT } = await import("google-auth-library");
  const creds = JSON.parse(credentials);
  const client = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const token = await client.authorize();
  return token.access_token;
}
