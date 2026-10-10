// POST /api/visit — fire-and-forget visit tracker.
// Body: { path, referrer, ts }. Appends to a capped JSON log in Vercel Blob.
// Silent no-op when BLOB_READ_WRITE_TOKEN is not configured. Never throws to the client.
import { put, head } from "@vercel/blob"

const KEY = "analytics/visits.json"
const MAX = 5000

async function readVisits(token) {
  try {
    const h = await head(KEY, { token })
    const r = await fetch(h.url, { headers: { authorization: `Bearer ${token}` } })
    if (r.ok) {
      const d = await r.json()
      if (Array.isArray(d)) return d
    }
  } catch {
    /* first visit or transient failure — start fresh */
  }
  return []
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" })
    return
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN || ""
  if (!token) {
    res.status(200).json({ ok: true, stored: false })
    return
  }
  try {
    const body = req.body || {}
    const entry = {
      p: String(body.path || "/").slice(0, 120),
      r: String(body.referrer || "").slice(0, 200),
      t: Number(body.ts) || Date.now(),
    }
    let visits = await readVisits(token)
    visits.push(entry)
    if (visits.length > MAX) visits = visits.slice(visits.length - MAX)
    await put(KEY, JSON.stringify(visits), {
      access: "private",
      contentType: "application/json",
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    res.status(200).json({ ok: true, stored: true })
  } catch {
    res.status(200).json({ ok: true, stored: false })
  }
}
