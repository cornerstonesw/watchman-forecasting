// Password rules, following NIST SP 800-63B Rev. 4 (August 2025):
//   * length is what matters: at least 15 characters (NIST's minimum for a
//     password on its own; Watchman also requires two-step sign-in)
//   * long passwords are allowed (Supabase's limit is 72 characters), with
//     spaces and any characters — passphrases welcome
//   * NO "must contain a digit / symbol / capital" rules (NIST says not to)
//   * NO forced periodic changes — only when there's reason to think it leaked
//   * reject passwords known from data breaches, and obvious ones (the email
//     address, the app's name, one character repeated, simple sequences)
//
// The same minimum is set in Supabase (Authentication → password settings),
// which enforces it on the server; this file gives friendly messages first.

export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 72;

const CONTEXT_WORDS = ["watchman", "password", "cornerstone", "forecast", "raytheon"];

// Problems that can be checked instantly, in plain words (null = fine)
export function passwordProblem(password: string, email?: string | null): string | null {
  const p = password;
  if (p.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters — a short phrase is easiest to remember.`;
  if (p.length > PASSWORD_MAX) return `Use no more than ${PASSWORD_MAX} characters.`;

  const lower = p.toLowerCase();
  const squashed = lower.replace(/[^a-z0-9]/g, "");
  if (/^(.)\1+$/.test(p) || new Set(p).size < 4) return "That password is too repetitive.";
  if ("abcdefghijklmnopqrstuvwxyz0123456789".includes(squashed) || "qwertyuiopasdfghjklzxcvbnm".includes(squashed))
    return "That password is a simple sequence.";

  const local = (email ?? "").split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (local.length >= 4 && squashed.includes(local)) return "Don't use your email address in your password.";
  // mostly made of obvious words (with a few characters added) → reject
  const used = CONTEXT_WORDS.filter((w) => squashed.includes(w));
  const rest = used.reduce((left, w) => left.split(w).join(""), squashed);
  if (used.length && rest.replace(/\d/g, "").length < 6) return `Avoid passwords built around "${used[0]}".`;
  return null;
}

// Has this exact password appeared in a known data breach? Uses the free
// Have I Been Pwned "range" service: only the first 5 characters of the
// password's SHA-1 hash leave the browser, never the password itself.
// Returns null if the check couldn't run (we don't block on that).
export async function passwordWasBreached(password: string): Promise<boolean | null> {
  try {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password)));
    const hash = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return null;
    const suffix = hash.slice(5);
    return (await res.text()).split("\n").some((line) => {
      const [s, count] = line.trim().split(":");
      return s === suffix && Number(count) > 0;
    });
  } catch {
    return null;
  }
}
