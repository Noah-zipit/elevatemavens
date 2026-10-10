// GET /api/admin/visits — aggregated analytics for the admin dashboard.
// Authed with ADMIN_PASSWORD via Bearer token (timing-safe compare).
// Returns { configured: false } when Blob is not wired yet.
import crypto from "crypto"
import { head } from "@vercel/blob"

const KEY = "analytics/visits.json"

function isAuthed(req) {
  const pw = process.env.ADMIN_PASSWORD || ""
  if (!pw) return false
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "")
  if (!m) return false
  const a = Buffer.from(m[1])
  const b = Buffer.from(pw)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function topEntries(obj, n) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }))
}

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    res.status(401).json({ error: "unauthorized" })
    return
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN || ""
  if (!token) {
    res.status(200).json({ configured: false })
    return
  }
  let visits = []
  try {
    const h = await head(KEY, { token })
    const r = await fetch(h.url, { headers: { authorization: `Bearer ${token}` } })
    if (r.ok) {
      const d = await r.json()
      if (Array.isArray(d)) visits = d
    }
  } catch {
    /* empty log */
  }

  const now = Date.now()
  const DAY = 86400000
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const pages = {}
  const referrers = {}
  for (const v of visits) {
    const p = v.p || "/"
    pages[p] = (pages[p] || 0) + 1
    if (v.r) {
      let host = v.r
      try {
        host = new URL(v.r).hostname.replace(/^www\./, "")
      } catch {
        host = String(v.r).slice(0, 48)
      }
      if (host) referrers[host] = (referrers[host] || 0) + 1
    }
  }

  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const from = d.getTime()
    const to = from + DAY
    days.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: visits.filter((v) => v.t >= from && v.t < to).length,
    })
  }

  res.status(200).json({
    configured: true,
    total: visits.length,
    today: visits.filter((v) => v.t >= todayStart.getTime()).length,
    week: visits.filter((v) => v.t >= now - 7 * DAY).length,
    topPages: topEntries(pages, 8),
    topReferrers: topEntries(referrers, 8),
    days,
    recent: visits
      .slice(-20)
      .reverse()
      .map((v) => ({ t: v.t, p: v.p || "/", r: v.r || "" })),
  })
}
