# Agent: Security Vulnerability Detection

Detect security vulnerabilities following OWASP Top 10 and Node.js/browser-specific risks.

## What to Look For

### 1. Injection Vulnerabilities
- **SQL Injection**: String concatenation in Supabase queries (`.eq('col', userInput)` is safe, but raw `.rpc()` or template literals in SQL are not)
- **Command Injection**: User input passed to `child_process.exec`, `spawn`, or shell commands
- **XSS**: User input rendered via `innerHTML`, `document.write`, `insertAdjacentHTML` without sanitization
- **Template Injection**: User input in template literals that gets eval'd

### 2. Authentication & Authorization
- Endpoints missing authentication checks (`authenticate(req)`)
- Tier checks missing after authentication (user accesses higher-tier content)
- JWT tokens logged or exposed in error messages
- Session tokens in URL query parameters
- Missing CRON_SECRET validation on cron endpoints

### 3. Hardcoded Secrets
- API keys, tokens, passwords hardcoded in source (not from `process.env`)
- Default/fallback credentials
- Supabase project IDs or URLs that should be env vars
- Private keys or certificates in source

### 4. Input Validation
- Missing validation on request body fields
- Missing validation on query parameters (type, range, format)
- Missing length limits on string inputs
- Negative number inputs not handled
- Prototype pollution via `Object.assign` or spread from user input

### 5. CORS & Headers
- Permissive CORS (`Access-Control-Allow-Origin: *`) on authenticated endpoints
- Missing security headers (X-Content-Type-Options, X-Frame-Options)
- Cache-Control misconfiguration (caching authenticated responses)

### 6. Stripe Security
- Missing webhook signature verification
- Stripe secrets exposed to client
- Missing idempotency handling on payment operations
- Customer-controlled redirect URLs without validation

### 7. Telegram Security
- Bot token exposed to frontend
- Missing webhook secret verification
- User input from Telegram not sanitized before DB operations

### 8. Denial of Service
- Unbounded query results (no LIMIT)
- Missing rate limiting on expensive operations
- ReDoS patterns in regex
- Unbounded file uploads or request body size

### 9. Sensitive Data Exposure
- Error messages revealing internal paths or stack traces
- Database error messages exposed to client
- Logging sensitive data (tokens, passwords, PII)
- `console.error` with full error objects in production

### 10. Dependency Vulnerabilities
- Known CVEs in npm dependencies
- **Method**: Run `npm audit` and check results

## Severity Classification

| Pattern | Severity |
|---------|----------|
| SQL/Command/XSS injection | CRITICAL |
| Missing auth on data-mutating endpoint | CRITICAL |
| Hardcoded secret in source | CRITICAL |
| Missing Stripe webhook verification | CRITICAL |
| Missing input validation on public endpoint | HIGH |
| Sensitive data in logs | HIGH |
| Missing tier check after auth | HIGH |
| Cache-Control on auth'd endpoint | MEDIUM |
| Missing rate limiting | MEDIUM |
| Known dependency CVE | MEDIUM-CRITICAL (by CVSS) |
| Verbose error messages | LOW |
| Missing security headers | LOW |

## Finding Format

```
### [CRITICAL] SQL Injection in query parameter
- **File**: `api/tips.js:42`
- **Category**: security
- **Issue**: User-controlled `status` parameter is used directly in Supabase query without validation
- **Evidence**:
  ```js
  const status = req.query.status; // unsanitized
  supabase.from('tips').select('*').eq('status', status)
  ```
- **Suggestion**: Validate `status` against an allowlist: `['pending', 'won', 'lost', 'void']`
```

## Key Areas to Check

1. **All API endpoints** (`api/*.js`) — Check every req.query and req.body usage
2. **Stripe webhook** — Verify signature check is first operation
3. **Auth middleware** — Ensure it's called on all protected endpoints
4. **Frontend** — Check for `innerHTML` usage with dynamic content
5. **Telegram webhook** — Verify secret header check
6. **CRON endpoints** — Verify CRON_SECRET check
7. **`npm audit`** — Run and report results

## Special Notes

- Supabase client with `.eq()`, `.select()` etc. uses parameterized queries internally — these are safe from SQL injection. Only flag raw SQL or `.rpc()` with string concatenation.
- The project uses Supabase RLS (Row Level Security) as a defense layer. Note this when assessing access control, but don't rely on it as the only protection.
- `innerHTML` usage with hardcoded strings (not user input) is safe — only flag when user/API data flows into it.
