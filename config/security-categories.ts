/**
 * Security categories for feature request classification.
 *
 * Based on ISO 27001 Annex A controls and OWASP top 10 concerns.
 * Used by the Security Agent to identify and tag requests that
 * require security review before implementation.
 */

export interface SecurityCategory {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export const SECURITY_CATEGORIES: SecurityCategory[] = [
  {
    id: 'pii',
    label: 'PII / Personal Data',
    description: 'Involves collection, storage, processing, or display of personally identifiable information (names, emails, addresses, phone numbers, national IDs, etc.)',
    keywords: ['personal data', 'pii', 'gdpr', 'name', 'email', 'address', 'phone', 'ssn', 'national id', 'date of birth', 'user profile', 'contact info'],
    severity: 'critical',
  },
  {
    id: 'auth',
    label: 'Authentication',
    description: 'Touches login, signup, password management, MFA, SSO, session management, or identity verification',
    keywords: ['login', 'signup', 'password', 'mfa', 'two-factor', '2fa', 'sso', 'oauth', 'saml', 'session', 'token', 'jwt', 'identity', 'authentication'],
    severity: 'critical',
  },
  {
    id: 'authz',
    label: 'Authorization / Access Control',
    description: 'Involves role-based access, permissions, resource ownership, multi-tenancy boundaries, or privilege escalation concerns',
    keywords: ['permission', 'role', 'access control', 'rbac', 'admin', 'privilege', 'tenant', 'multi-tenant', 'authorization', 'acl', 'ownership'],
    severity: 'critical',
  },
  {
    id: 'data-storage',
    label: 'Data Storage & Encryption',
    description: 'Involves database changes, data retention, encryption at rest, backup strategies, or sensitive data storage',
    keywords: ['database', 'storage', 'encryption', 'encrypt', 'decrypt', 'backup', 'retention', 'archive', 'data at rest', 'key management'],
    severity: 'high',
  },
  {
    id: 'api-security',
    label: 'API Security',
    description: 'Exposes new API endpoints, webhooks, or integrations that could be attack vectors. Includes rate limiting, input validation, and CORS concerns',
    keywords: ['api', 'endpoint', 'webhook', 'rest', 'graphql', 'rate limit', 'cors', 'input validation', 'payload', 'request', 'response'],
    severity: 'high',
  },
  {
    id: 'third-party',
    label: 'Third-Party Integration',
    description: 'Integrates with external services, SDKs, or dependencies that may introduce supply chain or data sharing risks',
    keywords: ['integration', 'third-party', 'external', 'sdk', 'library', 'vendor', 'partner', 'api key', 'secret', 'credential', 'supply chain'],
    severity: 'high',
  },
  {
    id: 'file-upload',
    label: 'File Upload / Processing',
    description: 'Handles file uploads, downloads, document processing, or media handling that could be vectors for malware or injection',
    keywords: ['upload', 'download', 'file', 'document', 'image', 'media', 'attachment', 'import', 'export', 'csv', 'pdf'],
    severity: 'high',
  },
  {
    id: 'payments',
    label: 'Payments & Financial Data',
    description: 'Involves payment processing, billing, financial data, PCI DSS scope, or monetary transactions',
    keywords: ['payment', 'billing', 'credit card', 'stripe', 'invoice', 'subscription', 'pci', 'financial', 'transaction', 'money', 'pricing'],
    severity: 'critical',
  },
  {
    id: 'logging-audit',
    label: 'Logging & Audit Trail',
    description: 'Affects audit logging, monitoring, or observability. May need to ensure sensitive data is not logged or that audit requirements are met',
    keywords: ['log', 'audit', 'monitor', 'trace', 'observability', 'alert', 'siem', 'compliance', 'forensic'],
    severity: 'medium',
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure & Deployment',
    description: 'Changes to deployment pipelines, cloud infrastructure, networking, DNS, or environment configuration',
    keywords: ['deploy', 'infrastructure', 'cloud', 'aws', 'gcp', 'azure', 'kubernetes', 'docker', 'ci/cd', 'pipeline', 'dns', 'networking', 'firewall', 'vpc'],
    severity: 'high',
  },
  {
    id: 'data-exposure',
    label: 'Data Exposure / Leakage',
    description: 'Risk of exposing internal data through search, reporting, exports, error messages, or UI rendering',
    keywords: ['export', 'report', 'search', 'display', 'render', 'error message', 'stack trace', 'debug', 'verbose', 'data leak'],
    severity: 'medium',
  },
  {
    id: 'compliance',
    label: 'Regulatory Compliance',
    description: 'Touches regulatory requirements such as GDPR, HIPAA, SOC 2, ISO 27001, CCPA, or industry-specific mandates',
    keywords: ['gdpr', 'hipaa', 'sox', 'soc2', 'iso 27001', 'ccpa', 'compliance', 'regulation', 'privacy', 'data protection', 'consent', 'right to delete'],
    severity: 'critical',
  },
];

export const SECURITY_TAG = 'security' as const;
export const SECURITY_CATEGORY_TAGS = SECURITY_CATEGORIES.map(
  (c) => `security:${c.id}` as const
);

export type SecuritySeverity = SecurityCategory['severity'];

export const SEVERITY_ORDER: Record<SecuritySeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function getHighestSeverity(severities: SecuritySeverity[]): SecuritySeverity {
  if (severities.length === 0) return 'low';
  return severities.reduce((highest, current) =>
    SEVERITY_ORDER[current] > SEVERITY_ORDER[highest] ? current : highest
  );
}
