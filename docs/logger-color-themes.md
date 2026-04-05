# Logger Color Themes

ZinTrust request logs can use one of five terminal color palettes. The default theme is `arctic`, and all themes are selected with `LOG_COLOR_THEME` when text logging is enabled.

Fresh ZinTrust project scaffolds now enable request-path logging and ANSI colors by default with `LOG_HTTP_REQUEST=true`, `LOG_COLOR=true`, and `LOG_COLOR_THEME=arctic`.

## Enable Theme Selection

```env
LOG_FORMAT=text
LOG_COLOR=true
LOG_COLOR_THEME=arctic
```

- `LOG_COLOR_THEME` accepts `arctic`, `sharp-ops`, `soft-contrast`, `neon-grid`, and `production-safe`.
- Invalid values fall back to `arctic`.
- `LOG_COLOR` still controls whether ANSI color codes are emitted at all. The runtime fallback is `true`, and you can still use `auto` or `false`/`never` when needed.
- JSON logs and file logs stay uncolored.

## Shared Request Example

All five themes color the same request log structure:

```text
[INFO] [GET] /queue-monitor/api/events 200 OK (222ms) [requestId=32af0e13-8512-473b-a695-95b29238865d]
[INFO] [POST] /api/jobs 201 Created (18ms) [requestId=1a8e0d02-cb43-4e2a-bf1a-fef749247fdb]
[INFO] [PUT] /api/profile 401 Unauthorized (84ms) [requestId=7c044194-7f3b-4469-a021-f0f8f7130e2c]
[INFO] [DELETE] /api/users/42 404 Not Found (356ms) [requestId=b1e4e42f-bb0f-41ad-9df5-0be62be36fd0]
[INFO] [OPTIONS] /broadcasting/auth 419 Page Expired (9ms) [requestId=dd45f96d-45db-4726-a99b-fd3fd10c35e2]
[INFO] [POST] /api/payments/capture 500 Internal Server Error (1042ms) [requestId=40b7fe2c-825a-4a15-89c6-f2a5cd36075b]
```

## Theme Reference

### Arctic Terminal

```env
LOG_COLOR_THEME=arctic
```

Default palette for ZinTrust. It uses colder cyan and blue separation, stronger green success markers, a softer ice-blue path, and a visible but still secondary request id so long-running backend sessions stay readable.

| Segment             | Color intent                  |
| ------------------- | ----------------------------- |
| `[INFO]`            | bright cyan                   |
| `GET`               | bright blue                   |
| `POST`              | bright green                  |
| `PUT`               | bright yellow                 |
| `DELETE`            | bright red                    |
| `OPTIONS` / `419`   | bright magenta                |
| `200` / `201`       | bright green                  |
| `401` / `404`       | yellow                        |
| `500`               | bright red                    |
| `(18ms ... 1042ms)` | cyan to blue to yellow to red |
| `[requestId=...]`   | dim cyan                      |

### Sharp Ops

```env
LOG_COLOR_THEME=sharp-ops
```

Higher-contrast operations palette. Warnings and failures separate more aggressively from normal traffic.

| Segment             | Color intent           |
| ------------------- | ---------------------- |
| `[INFO]`            | cyan                   |
| `GET`               | bright blue            |
| `POST`              | green                  |
| `PUT`               | yellow                 |
| `DELETE`            | red                    |
| `OPTIONS` / `419`   | bright magenta         |
| `200` / `201`       | green                  |
| `401` / `404`       | yellow                 |
| `500`               | red                    |
| `(18ms ... 1042ms)` | green to yellow to red |
| `[requestId=...]`   | dim gray               |

### Soft Contrast

```env
LOG_COLOR_THEME=soft-contrast
```

Lower-intensity colors for long watches, with a brighter path segment so the route stays prominent without neon-level saturation.

| Segment             | Color intent                  |
| ------------------- | ----------------------------- |
| `[INFO]`            | bold white                    |
| `GET`               | blue                          |
| `POST`              | cyan                          |
| `PUT`               | yellow                        |
| `DELETE`            | bright red                    |
| `OPTIONS` / `419`   | bright magenta                |
| `200` / `201`       | cyan                          |
| `401` / `404`       | yellow                        |
| `500`               | red                           |
| `(18ms ... 1042ms)` | cyan to blue to yellow to red |
| `[requestId=...]`   | dim white                     |

### Neon Grid

```env
LOG_COLOR_THEME=neon-grid
```

Most expressive option. This palette is tuned for dense debug sessions where method, status, and latency need to pop immediately.

| Segment             | Color intent                          |
| ------------------- | ------------------------------------- |
| `[INFO]`            | cyan                                  |
| `GET`               | bright cyan                           |
| `POST`              | bright green                          |
| `PUT`               | bright yellow                         |
| `DELETE`            | bright red                            |
| `OPTIONS` / `419`   | bright magenta                        |
| `200` / `201`       | bright green                          |
| `401` / `404`       | bright yellow                         |
| `500`               | bright red                            |
| `(18ms ... 1042ms)` | bright cyan to green to yellow to red |
| `[requestId=...]`   | dim gray                              |

### Production Safe

```env
LOG_COLOR_THEME=production-safe
```

Conservative palette that tracks standard operations color expectations closely while keeping request logs segmented.

| Segment             | Color intent           |
| ------------------- | ---------------------- |
| `[INFO]`            | blue                   |
| `GET`               | blue                   |
| `POST`              | green                  |
| `PUT`               | yellow                 |
| `DELETE`            | red                    |
| `OPTIONS` / `419`   | bright magenta         |
| `200` / `201`       | green                  |
| `401` / `404`       | yellow                 |
| `500`               | red                    |
| `(18ms ... 1042ms)` | green to yellow to red |
| `[requestId=...]`   | dim gray               |

## Visual Palette Sheet

For a side-by-side visual preview outside the docs site, use the palette sheet in `dev/request-log-color-samples.html`.
