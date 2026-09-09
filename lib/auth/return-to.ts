export function loginReturnTo(value: unknown): string {
  return typeof value === 'string' && /^\/invite\/[a-f0-9]{64}$/.test(value) ? value : '/requests';
}
