# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Virtual Product Owner, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email security concerns to the maintainers directly or use GitHub's private vulnerability reporting feature:

1. Go to the **Security** tab of this repository
2. Click **Report a vulnerability**
3. Provide a detailed description of the issue

## What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity, typically within 2 weeks for critical issues

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x     | Yes       |

## Security Best Practices for Deployers

- Always use HTTPS in production
- Set strong values for `AUTH_SECRET` (minimum 32 characters)
- Use environment variables for all secrets — never commit credentials
- Keep dependencies updated (`npm audit` regularly)
- Enable rate limiting on public API endpoints (built-in)
- Rotate API keys periodically
- Review webhook subscription URLs before enabling
