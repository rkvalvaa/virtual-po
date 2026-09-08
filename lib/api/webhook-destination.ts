import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export class InvalidWebhookDestination extends Error {
  constructor() { super('Webhook URL must resolve to a public HTTP(S) destination without credentials or fragments.'); }
}

// Conservative public-unicast policy based on the IANA special-purpose registries:
// https://www.iana.org/assignments/iana-ipv4-special-registry/
// https://www.iana.org/assignments/iana-ipv6-special-registry/
const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedV4.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) blockedV6.addSubnet(address, prefix, 'ipv6');

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return !blockedV4.check(address, 'ipv4');
  if (isIP(address) === 6) {
    // Also excludes IPv4-mapped, translation, link-local and unique-local ranges.
    return globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
  }
  return false;
}

export async function validateWebhookDestination(input: string): Promise<{ url: URL; address: string }> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (typeof input !== 'string' || input.length > 2048) throw new InvalidWebhookDestination();
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
      throw new InvalidWebhookDestination();
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const records = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await Promise.race([
        lookup(hostname, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new InvalidWebhookDestination()), 3000);
        }),
      ]);
    if (records.length === 0 || records.some(({ address }) => !isPublicAddress(address))) {
      throw new InvalidWebhookDestination();
    }
    return { url, address: records[0].address };
  } catch {
    // Do not echo URLs (which can contain bearer credentials in query strings).
    throw new InvalidWebhookDestination();
  } finally {
    clearTimeout(timeout);
  }
}
