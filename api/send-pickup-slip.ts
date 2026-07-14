// Vercel serverless function (Edge runtime) that sends the pickup slip email
// through Resend. The API key stays server-side and is never exposed to the
// browser.
//
// Required environment variables (set in Vercel > Project > Settings > Env):
//   RESEND_API_KEY     - your Resend API key
//   PICKUP_FROM_EMAIL  - the verified "from" address, e.g.
//                        "Goldsure Stock Tracker <vignesh@goldsure.com.au>"
//                        (the domain must be verified in Resend)

export const config = { runtime: "edge" };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return json({ error: "Email is not configured. Set RESEND_API_KEY in the deployment environment." }, 500);
  }

  const from = process.env.PICKUP_FROM_EMAIL || "Goldsure Stock Tracker <onboarding@resend.dev>";

  let payload: {
    to?: string[];
    cc?: string[];
    subject?: string;
    html?: string;
    attachments?: { filename: string; content: string }[];
  };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const to = (payload.to ?? []).filter(Boolean);
  const cc = (payload.cc ?? []).filter(Boolean);
  if (!to.length || !payload.subject || !payload.html) {
    return json({ error: "Missing recipient, subject, or content" }, 400);
  }

  const attachments = (payload.attachments ?? []).filter((item) => item && item.filename && item.content);

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      cc: cc.length ? cc : undefined,
      subject: payload.subject,
      html: payload.html,
      attachments: attachments.length ? attachments : undefined,
    }),
  });

  const data = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) {
    return json({ error: (data as { message?: string }).message || "Resend rejected the email", detail: data }, resendResponse.status);
  }

  return json({ id: (data as { id?: string }).id ?? null }, 200);
}
