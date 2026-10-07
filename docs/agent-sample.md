# Agent sample output (preview deploy, 2026-10-07)

Preview worker `roofing-crm-api-preview` (since deleted), question:

```sh
curl -s -X POST <preview-url>/agent -H 'content-type: application/json' \
  -d '{"question":"Which properties within 5 miles of San Jose have roofs older than 15 years?","context":null}'
```

The pipeline API (`PIPELINE_API`) was not deployed yet, so every pipeline tool returned 404.
The point of the run was to confirm that the model emits real tool calls through the provider.

## Model in use: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (final code, 3 runs)

```json
{"answer":"The find_aged_roofs function failed due to a pipeline API 404 error for /api/leads/aged-roofs. \nSOURCES: none","toolCalls":[{"name":"find_aged_roofs","args":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5,"minRoofAgeYears":15,"limit":200},"resultCount":0}],"sources":[],"resolvedFilters":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5,"minRoofAgeYears":15}}
```
HTTP 200 6.486202s

```json
{"answer":"The find_aged_roofs function failed due to a pipeline API 404 error for /api/leads/aged-roofs. \nSOURCES: none","toolCalls":[{"name":"find_aged_roofs","args":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5,"minRoofAgeYears":15,"limit":200},"resultCount":0}],"sources":[],"resolvedFilters":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5,"minRoofAgeYears":15}}
```
HTTP 200 5.848257s

```json
{"answer":"The function find_aged_roofs failed because the pipeline API 404 for /api/leads/aged-roofs. \nSOURCES: none","toolCalls":[{"name":"geocode_place","args":{"name":"San Jose"},"resultCount":1},{"name":"find_aged_roofs","args":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5,"minRoofAgeYears":15,"limit":200},"resultCount":0}],"sources":[],"resolvedFilters":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5,"minRoofAgeYears":15}}
```
HTTP 200 9.047082s

## Earlier llama run, before the fixes (strict `z.number()` inputs, no last-step `toolChoice: "none"`)

The model sent numbers as strings (`"lat":"37.3382"`), schema validation rejected every call,
and it used all 6 steps on retries, so there was no text. This led to `z.coerce` inputs and a
forced text-only last step.

```json
{"answer":"","toolCalls":[{"name":"geocode_place","args":{"name":"San Jose"},"resultCount":1},{"name":"find_aged_roofs","args":{"lat":"37.3382","lon":"-121.8863","radiusMiles":"5"},"resultCount":0},{"name":"find_aged_roofs","args":{"lat":"37","lon":"-121","radiusMiles":"5"},"resultCount":0},{"name":"find_aged_roofs","args":{"lat":"37.3382","limit":"200","lon":"-121.8863","minRoofAgeYears":"15","radiusMiles":"5"},"resultCount":0},{"name":"find_aged_roofs","args":{"lat":"37.3382","limit":"200","lon":"-121.8863","minRoofAgeYears":"15","radiusMiles":"5"},"resultCount":0},{"name":"find_aged_roofs","args":{"lat":"37.3382","limit":"200","lon":"-121.8863","minRoofAgeYears":"15","radiusMiles":"5"},"resultCount":0}],"sources":[],"resolvedFilters":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5,"minRoofAgeYears":15}}
```

## Comparison: `@cf/openai/gpt-oss-20b` (2 runs, not chosen)

```json
{"answer":"","toolCalls":[{"name":"geocode_place","args":{"name":"San Jose"},"resultCount":1},{"name":"find_aged_roofs<|channel|>analysis","args":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5,"minRoofAgeYears":15},"resultCount":0},{"name":"find_aged_roofs","args":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5,"minRoofAgeYears":15},"resultCount":0},{"name":"search_properties_in_radius","args":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5},"resultCount":0}],"sources":[],"resolvedFilters":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5}}
```
HTTP 200 11.625389s

```json
{"answer":"I called the `find_aged_roofs` tool for a 5‑mile radius around San Jose (lat 37.3382, lon -121.8863) with a minimum roof age of 15 years (default). The tool returned an error, so no properties were identified.  \n\nSOURCES: none","toolCalls":[{"name":"find_aged_roofs","args":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5,"minRoofAgeYears":15,"limit":200},"resultCount":0}],"sources":[],"resolvedFilters":{"lat":37.3382,"lon":-121.8863,"radiusMiles":5,"minRoofAgeYears":15}}
```
HTTP 200 4.011660s

## Invalid body

```json
{"error":"invalid request","issues":[{"origin":"string","code":"too_small","minimum":3,"inclusive":true,"path":["question"],"message":"Too small: expected string to have >=3 characters"},{"expected":"object","code":"invalid_type","path":["context"],"message":"Invalid input: expected object, received undefined"}]}
```
HTTP 400
