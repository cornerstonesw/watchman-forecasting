// Security headers on every page (same policy as LIFESuite):
//   * CSP — scripts only from Watchman itself; the browser only talks to
//     Supabase; Watchman can't be framed by another site (clickjacking).
//   * HSTS, no sniffing, no referrer leaks.
//   * Permissions: the MICROPHONE is allowed for this site only (voice
//     questions); camera, location, payment stay off.

const preview = process.env.VERCEL_ENV === "preview";
const dev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${preview ? " https://vercel.live" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:" + (preview ? " https://vercel.live https://vercel.com" : ""),
  "font-src 'self'" + (preview ? " https://vercel.live" : ""),
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.pwnedpasswords.com" + (preview ? " https://vercel.live wss://ws-us3.pusher.com" : ""),
  "frame-src 'none'" + (preview ? " https://vercel.live" : ""),
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ").replace("frame-src 'none' https://vercel.live", "frame-src https://vercel.live");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
