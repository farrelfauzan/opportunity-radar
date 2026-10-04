/**
 * True for an address on this machine or a private network, written as a host
 * name or IP literal. Feeds may only redirect to public hosts; the LLM base URL
 * may use plain http only for these.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)?.slice(1).map(Number);
  if (v4) {
    const [a, b] = v4;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (!host.includes(":")) return false; // a host name such as fda.gov, not an IPv6 literal
  return host === "::" || host === "::1" || /^(fc|fd|fe8|fe9|fea|feb)/.test(host) || host.startsWith("::ffff:");
}
