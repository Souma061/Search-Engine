# Relevance benchmark

Run the benchmark against production:

```powershell
npm run eval:relevance
```

Run it against another environment:

```powershell
$env:SEARCH_API_URL = "http://localhost:3000/search"
npm run eval:relevance
```

`relevance.v1.json` is the versioned set of query judgments. Each `grade` is an integer from 1 (relevant) to 3 (ideal result). Add real developer queries and every page that is genuinely relevant; do not remove failed queries merely because ranking changed.

The evaluator requests the first ten results, waits 1.1 seconds between requests to respect the public API rate limit, and reports MRR@10, Recall@10, and NDCG@10. Set `EVAL_REQUEST_DELAY_MS=0` only when testing an endpoint without that limit.
