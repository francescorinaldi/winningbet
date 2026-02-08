# Agent: Error Handling Review

Detect missing, incomplete, or inconsistent error handling.

## What to Look For

### 1. Missing Try/Catch on Async Operations
- `await` calls without surrounding try/catch
- Especially on external API calls, database queries, and network requests
- **Method**: Find all `await` calls and check if they're in a try/catch or if the calling function handles errors

### 2. Swallowed Errors
- `catch` blocks that do nothing (empty body)
- `catch` blocks that only `console.error` but don't handle the error
- Missing error propagation (catch without re-throw or response)
- Note: Some silent catches are intentional for non-critical features — evaluate context

### 3. Incomplete Error Responses
- API endpoints that don't return proper HTTP error codes
- Missing error response body (`res.status(500).end()` without JSON)
- Inconsistent error shapes across endpoints

### 4. Missing Null Checks
- Accessing properties on potentially null/undefined values
- API responses used without checking if they contain data
- Supabase query results used without checking `.error`
- **Method**: Look for `data.property` access without prior `if (data)` check

### 5. Unhandled Promise Rejections
- Promises without `.catch()`
- `async` functions called without `await` (fire-and-forget without error handling)
- **Method**: Search for `.then()` without `.catch()`, and `async` calls without `await`

### 6. Generic Error Messages
- `catch (err) { return res.status(500).json({ error: 'Something went wrong' }) }`
- Error messages that don't help diagnose the problem
- Errors that expose internal details to the client

### 7. Missing Edge Case Handling
- What happens if the database is down?
- What happens if an external API returns unexpected data?
- What happens if a required environment variable is missing?
- Division by zero possibilities

### 8. Inconsistent Error Logging
- Some errors logged with `console.error`, others with `console.warn`, others not logged
- Missing context in error logs (which function, what data)

## Severity Classification

| Pattern | Severity |
|---------|----------|
| Missing try/catch on critical path (auth, payment) | CRITICAL |
| Supabase query result used without error check | HIGH |
| Unhandled promise rejection on user-facing path | HIGH |
| Missing null check on API response data | HIGH |
| Fire-and-forget async without error handling | MEDIUM |
| Empty catch on non-critical feature | LOW |
| Generic error message (but error is handled) | LOW |
| Missing context in error logs | INFO |

## Finding Format

```
### [HIGH] Missing error check on Supabase query
- **File**: `api/stripe-webhook.js:168`
- **Category**: error-handling
- **Issue**: Supabase update result not checked for errors — failed update silently ignored
- **Evidence**:
  ```js
  await supabase
    .from('subscriptions')
    .update({ status: status })
    .eq('stripe_subscription_id', subscription.id);
  // No error check on result
  ```
- **Suggestion**: Destructure `{ error }` and throw/log if present:
  ```js
  const { error } = await supabase.from('subscriptions')...;
  if (error) throw new Error(`Subscription update failed: ${error.message}`);
  ```
```

## Key Areas to Check

1. **Stripe webhook handlers** — Payment-critical, must handle all errors
2. **`cron-tasks.js`** — Settle/send flows handle errors?
3. **Dashboard.js** — Multiple catch blocks with `// Silenzioso`
4. **Frontend API calls** — What happens when fetch fails?
5. **Profile loading** — `.single()` throws if no row found — handled?
6. **Auth middleware** — What if Supabase auth service is down?
7. **Telegram operations** — Non-critical but should log properly

## Special Notes

- In this project, many `catch (_err) { /* Silenzioso */ }` blocks are intentional for non-critical UX features (preferences, streaks, notifications). Flag as LOW, not HIGH.
- Supabase's `.single()` method throws if 0 or 2+ rows match — this can be an issue if called on tables that might have no rows.
- Vercel serverless functions that throw unhandled errors return 500 automatically — but the error message is generic and unhelpful.

## Codex Prompt

Audit error handling in api/stripe-webhook.js and api/cron-tasks.js: (1) For every Supabase call (supabase.from(...).update/upsert/select/insert), check if the { error } response is destructured and checked. List every unchecked Supabase call with file and line number. (2) In stripe-webhook.js, check each handler function (handleCheckoutCompleted, handleSubscriptionUpdated, handleSubscriptionDeleted, handlePaymentFailed) — if any Supabase operation fails silently, will Stripe retry the webhook or will it think it succeeded? (3) Find every .single() call in the entire codebase — for each, determine if it could throw PGRST116 (no rows found) in a legitimate scenario. Format each finding as: ### [SEVERITY] Title with File, Category (error-handling), Issue, Evidence, Suggestion.

## Gemini Prompt

Audit error handling in public/dashboard.js: (1) Find every catch block — classify each as: empty (swallowed), log-only (console.error but no user feedback), or properly handled (shows UI feedback). List each with line number. (2) Find every async function called without await that has no .catch() — these are floating promises with unhandled rejections. (3) Find every place where .data is accessed from a Supabase response without first checking .error — list each with the specific query. (4) Check if getSession() errors are handled — what happens if Supabase auth is unreachable? Format each finding as: ### [SEVERITY] Title with File, Category (error-handling), Issue, Evidence, Suggestion.
