const GEMINI_MODEL = "gemini-2.5-flash";

// Convert Anthropic-style messages (what the frontend sends) into Gemini's
// { contents: [{ role, parts: [...] }] } shape.
function toGeminiContents(messages) {
  return (messages || []).map((m) => {
    const parts = [];
    if (typeof m.content === "string") {
      parts.push({ text: m.content });
    } else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.type === "text") {
          parts.push({ text: block.text });
        } else if (block.type === "image" && block.source) {
          parts.push({
            inline_data: {
              mime_type: block.source.media_type,
              data: block.source.data,
            },
          });
        }
      }
    }
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
}

export async function POST(req) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY не налаштовано на сервері" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages, maxTokens } = body || {};
  if (!messages) {
    return new Response(JSON.stringify({ error: "messages is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: toGeminiContents(messages),
          generationConfig: { maxOutputTokens: maxTokens || 1000 },
        }),
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return new Response(
        JSON.stringify({ error: data?.error?.message || "gemini api error" }),
        { status: geminiRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Flatten Gemini's response into the Anthropic-style shape the frontend
    // already expects: { content: [{ type: "text", text: "..." }] }
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("") || "";

    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "network error contacting gemini" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
