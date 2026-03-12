const rateLimitStore = new Map();

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

function clean(value, maxLen = 2000) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLen);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const existing = rateLimitStore.get(ip) || [];
  const fresh = existing.filter((ts) => now - ts < WINDOW_MS);
  if (fresh.length >= MAX_REQUESTS_PER_WINDOW) {
    rateLimitStore.set(ip, fresh);
    return true;
  }
  fresh.push(now);
  rateLimitStore.set(ip, fresh);
  return false;
}

function normalizePayload(raw) {
  return {
    first_name: clean(raw.first_name, 120),
    last_name: clean(raw.last_name, 120),
    company: clean(raw.company, 200),
    email: clean(raw.email, 254).toLowerCase(),
    product: clean(raw.product, 300),
    competitors: clean(raw.competitors, 500),
    csi_code: clean(raw.csi_code, 20),
    message: clean(raw.message, 3000),
    form_id: clean(raw.form_id, 120),
    source_page: clean(raw.source_page, 200),
    source_url: clean(raw.source_url, 1000),
    submitted_at: clean(raw.submitted_at, 120),
    utm_source: clean(raw.utm_source, 120),
    utm_medium: clean(raw.utm_medium, 120),
    utm_campaign: clean(raw.utm_campaign, 120),
    utm_term: clean(raw.utm_term, 120),
    utm_content: clean(raw.utm_content, 120),
    website: clean(raw.website, 200)
  };
}

function validate(payload) {
  const errors = [];
  if (!payload.first_name) errors.push("first_name is required");
  if (!payload.email) errors.push("email is required");
  if (!payload.product) errors.push("product is required");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email);
  if (payload.email && !emailOk) errors.push("email is invalid");
  return errors;
}

function buildEmail(payload, ip) {
  const fullName = [payload.first_name, payload.last_name].filter(Boolean).join(" ");
  const subject = `New Spec Audit Lead: ${fullName || payload.email}`;
  const lines = [
    `Name: ${fullName || "(not provided)"}`,
    `Email: ${payload.email || "(not provided)"}`,
    `Company: ${payload.company || "(not provided)"}`,
    `Product: ${payload.product || "(not provided)"}`,
    `Competitors: ${payload.competitors || "(not provided)"}`,
    `CSI Code: ${payload.csi_code || "(not provided)"}`,
    `Message: ${payload.message || "(not provided)"}`,
    "",
    `Form ID: ${payload.form_id || "(not provided)"}`,
    `Source Page: ${payload.source_page || "(not provided)"}`,
    `Source URL: ${payload.source_url || "(not provided)"}`,
    `Submitted At (client): ${payload.submitted_at || "(not provided)"}`,
    `UTM Source: ${payload.utm_source || "(not provided)"}`,
    `UTM Medium: ${payload.utm_medium || "(not provided)"}`,
    `UTM Campaign: ${payload.utm_campaign || "(not provided)"}`,
    `UTM Term: ${payload.utm_term || "(not provided)"}`,
    `UTM Content: ${payload.utm_content || "(not provided)"}`,
    `IP: ${ip}`
  ];
  const text = lines.join("\n");
  const html = `
    <h2>New Spec Audit Lead</h2>
    <p><strong>Name:</strong> ${escapeHtml(fullName || "(not provided)")}</p>
    <p><strong>Email:</strong> ${escapeHtml(payload.email || "(not provided)")}</p>
    <p><strong>Company:</strong> ${escapeHtml(payload.company || "(not provided)")}</p>
    <p><strong>Product:</strong> ${escapeHtml(payload.product || "(not provided)")}</p>
    <p><strong>Competitors:</strong> ${escapeHtml(payload.competitors || "(not provided)")}</p>
    <p><strong>CSI Code:</strong> ${escapeHtml(payload.csi_code || "(not provided)")}</p>
    <p><strong>Message:</strong><br>${escapeHtml(payload.message || "(not provided)")}</p>
    <hr>
    <p><strong>Form ID:</strong> ${escapeHtml(payload.form_id || "(not provided)")}</p>
    <p><strong>Source Page:</strong> ${escapeHtml(payload.source_page || "(not provided)")}</p>
    <p><strong>Source URL:</strong> ${escapeHtml(payload.source_url || "(not provided)")}</p>
    <p><strong>Submitted At (client):</strong> ${escapeHtml(payload.submitted_at || "(not provided)")}</p>
    <p><strong>UTM Source:</strong> ${escapeHtml(payload.utm_source || "(not provided)")}</p>
    <p><strong>UTM Medium:</strong> ${escapeHtml(payload.utm_medium || "(not provided)")}</p>
    <p><strong>UTM Campaign:</strong> ${escapeHtml(payload.utm_campaign || "(not provided)")}</p>
    <p><strong>UTM Term:</strong> ${escapeHtml(payload.utm_term || "(not provided)")}</p>
    <p><strong>UTM Content:</strong> ${escapeHtml(payload.utm_content || "(not provided)")}</p>
    <p><strong>IP:</strong> ${escapeHtml(ip)}</p>
  `;

  return { subject, text, html };
}

async function sendWithResend(payload, ip) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !toEmail || !fromEmail) {
    throw new Error("Missing RESEND_API_KEY, CONTACT_TO_EMAIL, or CONTACT_FROM_EMAIL");
  }

  const { subject, text, html } = buildEmail(payload, ip);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      reply_to: payload.email || undefined,
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error (${response.status}): ${body}`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests" });
  }

  let raw = req.body || {};
  if (typeof req.body === "string") {
    try {
      raw = JSON.parse(req.body || "{}");
    } catch (error) {
      return res.status(400).json({ ok: false, error: "Invalid JSON payload" });
    }
  }
  const payload = normalizePayload(raw);

  if (payload.website) {
    // Honeypot hit: pretend success to avoid training bots.
    return res.status(200).json({ ok: true });
  }

  const errors = validate(payload);
  if (errors.length > 0) {
    return res.status(400).json({ ok: false, error: errors.join(", ") });
  }

  try {
    await sendWithResend(payload, ip);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("contact submit failed", error);
    return res.status(500).json({ ok: false, error: "Unable to process request" });
  }
};
