# simple-email-list

A minimal API to collect email subscriptions with SQLite.

## Requirements

- Node.js 24 LTS
- pnpm

## Setup

```bash
pnpm install
pnpm build
```

## Running

```bash
pnpm start
```

Port defaults to `3000`. Override with the `PORT` env var.

Runs behind nginx — client IP is read from `X-Forwarded-For`.

## API

### `POST /subscribe`

```bash
curl -X POST http://localhost:3000/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email": "user@example.com"}'
```

**Responses**

| Status | Body |
|---|---|
| `200` | `{ "ok": true }` |
| `400` | `{ "error": "Invalid email address" }` |
| `400` | `{ "error": "Invalid JSON" }` |
| `400` | `{ "error": "Payload too large" }` |
| `404` | `{ "error": "Not found" }` |

Rate limited requests are silently dropped — they return `200` identically to a successful subscription.

## CSV import

```bash
pnpm import -- path/to/file.csv
```

Expected format — one email per line, `email` header row:

```
email
user@example.com
another@example.com
```

Duplicate and invalid emails are skipped. A summary is printed on completion.

## CSV export

```bash
pnpm export -- path/to/output.csv
```

Exports all emails in the database in the same format accepted by import.

## Summary

```bash
pnpm summary
```

Prints a count of total emails and new emails in the last 7 and 30 days:

```
Total:        1000
Last 7 days:  12
Last 30 days: 47
```

## Configuration

| Env var | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `DB_PATH` | `data/emails.db` | SQLite database path |
| `RATE_LIMIT_ENABLED` | `true` | Enable IP and email rate limiting |

Rate limit: 10 requests per IP and per email address per hour.

## Nginx

A template nginx config is provided in `email-list.nginx.conf`. It:

- Redirects HTTP to HTTPS
- Exposes only `POST /subscribe` and returns 404 for all other paths
- Forwards the real client IP via `X-Forwarded-For` for rate limiting
- Enforces a 2 KB body size limit at the nginx level

Copy and adjust the file (replace `example.com` and TLS paths), then:

```bash
cp email-list.nginx.conf /etc/nginx/sites-available/email-list
ln -s /etc/nginx/sites-available/email-list /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## Systemd

Copy and adjust `email-list.service`, then:

```bash
useradd -r -s /sbin/nologin email-list
cp email-list.service /etc/systemd/system/
systemctl enable --now email-list
```

The service expects the app to be deployed to `/opt/email-list`.

## Development

```bash
pnpm test     # build + run tests
pnpm check    # format + lint + fix
```
