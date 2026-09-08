import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { validateWebhookDestination } from './webhook-destination';

/** Connect to the vetted IP, retaining Host/SNI for HTTP routing and TLS identity.
 * Node's request does not follow redirects. No second DNS lookup or pooled socket
 * may substitute a private address after validation (DNS rebinding).
 */
export async function postWebhook(urlString: string, body: string, headers: Record<string, string>): Promise<number> {
  const { url, address } = await validateWebhookDestination(urlString);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send({
      protocol: url.protocol,
      hostname: address,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      agent: false,
      servername: isIP(hostname) ? undefined : hostname,
      headers: { ...headers, Host: url.host, 'Content-Length': Buffer.byteLength(body) },
    }, (response) => {
      resolve(response.statusCode ?? 0);
      // Delivery needs only the status. Bound memory even for an infinite body.
      response.destroy();
    });
    const timer = setTimeout(() => req.destroy(new Error('Webhook delivery timed out')), 5000);
    req.once('error', reject);
    req.once('close', () => clearTimeout(timer));
    req.end(body);
  });
}
