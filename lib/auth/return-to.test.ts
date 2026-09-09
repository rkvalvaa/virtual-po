import { describe, expect, it } from 'vitest';
import { loginReturnTo } from './return-to';
describe('invitation login return path', () => {
  it('retains valid invitation paths', () => { expect(loginReturnTo(`/invite/${'a'.repeat(64)}`)).toBe(`/invite/${'a'.repeat(64)}`); });
  it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/invite/not-a-token', undefined, ['/requests']])('rejects non-invitation redirects', value => { expect(loginReturnTo(value)).toBe('/requests'); });
});
