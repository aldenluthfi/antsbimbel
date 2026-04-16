<picture>
  <source media="(prefers-color-scheme: light)" srcset="/.github/meta/dark.png">
  <source media="(prefers-color-scheme: dark)" srcset="/.github/meta/light.png">
  <img alt="AntsBimbel">
</picture>
This repository contains:

- `antsbimbel-be` (Django REST API)
- `antsbimbel-fe` (React + Vite frontend)

## Run Everything With Docker Compose

From the repository root:

```bash
docker compose up --build
```

Services:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api

The backend runs migrations automatically on startup.

## Stop Services

```bash
docker compose down
```

To also remove persistent volumes (SQLite DB + media):

```bash
docker compose down -v
```

## Notes

- SQLite data is persisted in a Docker volume and mapped to `/data/db.sqlite3` in the backend container.
- Media files are persisted in a separate Docker volume.
- If you need Google Drive/Gmail integration, set the corresponding environment variables for the backend service in `docker-compose.yml`.
