# Agent: Performance Issue Detection

Detect performance bottlenecks, inefficiencies, and optimization opportunities.

## What to Look For

### 1. N+1 Query Patterns
- Database queries inside loops (e.g., `for (tip of tips) { await supabase.from(...) }`)
- Sequential API calls that could be batched with `Promise.all`
- **Method**: Look for `await` inside `for`/`forEach`/`while` loops, especially with DB or API calls

### 2. Unbounded Data Fetching
- Supabase queries without `.limit()`
- API calls that could return unlimited results
- Missing pagination on list endpoints
- **Method**: Check all `.select()` calls for missing `.limit()`

### 3. Redundant API Calls
- Fetching the same data multiple times in the same request/page load
- Not caching frequently accessed data
- Calling an API to get data that's already available in context
- **Method**: Trace data flow through functions, check if same endpoint is called multiple times

### 4. Missing Caching Opportunities
- Expensive computations repeated on every request
- Data that changes rarely but is fetched on every page load
- **Method**: Check API response patterns vs Cache-Control headers

### 5. Memory Issues
- Event listeners added but never removed
- Growing arrays/maps without cleanup
- Closures capturing large objects unnecessarily
- `setInterval` without corresponding `clearInterval`
- IntersectionObservers created but never disconnected
- **Method**: Search for `addEventListener`, `setInterval`, `new IntersectionObserver` and check cleanup

### 6. Frontend Performance
- Forced synchronous layouts (reading layout props then writing in same frame)
- Heavy computation in animation frames
- Particle system: O(n^2) connection checking
- Large DOM operations without batching
- Missing `passive: true` on scroll/touch handlers

### 7. Blocking Operations
- Synchronous operations in async serverless functions
- `require()` of heavy modules at file level that delays cold starts
- Sequential operations that could be parallel

### 8. O(n^2) or Worse Algorithms
- Nested loops over the same dataset
- Linear search when a Map/Set would be O(1)
- Sorting then searching (when a single pass would do)
- **Method**: Look for nested `for`/`forEach` over same or related arrays

## Severity Classification

| Pattern | Severity |
|---------|----------|
| N+1 DB query pattern (in production endpoint) | HIGH |
| Unbounded query without LIMIT | HIGH |
| Memory leak (interval/listener never cleaned) | HIGH |
| Sequential awaits that could be parallel | MEDIUM |
| O(n^2) algorithm on small datasets (<100) | LOW |
| O(n^2) algorithm on potentially large datasets | HIGH |
| Missing cache on frequently called endpoint | MEDIUM |
| Redundant API call on page load | MEDIUM |
| Minor optimization opportunity | LOW |

## Finding Format

```
### [HIGH] N+1 database query in settle handler
- **File**: `api/cron-tasks.js:96-116`
- **Category**: performance
- **Issue**: Each tip is updated individually in a loop (`await supabase.from('tips').update(...).eq('id', tip.id)`) — N database calls for N tips
- **Evidence**:
  ```js
  for (const tip of tips) {
    await supabase.from('tips').update({...}).eq('id', tip.id); // N calls
    await supabase.from('tip_outcomes').upsert({...});           // another N calls
  }
  ```
- **Suggestion**: Batch updates using a single query with `.in('id', tipIds)` or Supabase's `.upsert()` with an array
```

## Key Areas to Check

1. **`cron-tasks.js` settle loop** — Updates tips one-by-one in a loop
2. **`cron-tasks.js` email sending** — Sends emails sequentially to each subscriber
3. **`dashboard.js` loadHistory** — 4 parallel API calls (good) but then processes all results
4. **`script.js` particle system** — O(n^2) `drawConnections()` comparing every particle pair
5. **`setInterval` in dashboard** — Notification polling every 60s. Is it cleaned up?
6. **`script.js` IntersectionObservers** — Multiple observers created. Are they ever disconnected?
7. **`cron-tasks.js` sendEmailDigest** — `listUsers()` fetches ALL users — could be huge

## Special Notes

- The particle system O(n^2) is capped at 80 particles max (6400 comparisons), which is fine for animation. Flag as LOW/INFO.
- Frontend `fetch` calls can't easily be batched due to different API endpoints. Don't flag these unless truly redundant.
- Supabase client automatically pools connections, so individual queries aren't as expensive as raw DB calls.

## Codex Prompt

Find performance issues in the api/ directory: (1) Find every for/forEach/while loop that contains an await call to supabase or an external API — these are N+1 patterns. Show the loop and the await inside it. (2) Find every Supabase .select() query that does NOT have a .limit() — these are unbounded fetches. (3) In api/cron-tasks.js, check if supabase.auth.admin.listUsers() is paginated or fetches all users at once. (4) Find any sequential await calls that could run in parallel with Promise.all. Format each finding as: ### [SEVERITY] Title with File, Category (performance), Issue, Evidence, Suggestion.

## Gemini Prompt

Find performance issues in public/script.js and public/dashboard.js: (1) Find every setInterval() call and check if clearInterval() is ever called for it — report uncleaned intervals. (2) Find every addEventListener() call and check if removeEventListener() is ever called — report potential memory leaks. (3) Find any IntersectionObserver or ResizeObserver that is created but never disconnected. (4) Find any O(n^2) patterns — nested loops over the same or related arrays. (5) Check if the same API endpoint is fetched multiple times during page load. Format each finding as: ### [SEVERITY] Title with File, Category (performance), Issue, Evidence, Suggestion.
