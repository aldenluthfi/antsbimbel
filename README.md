<picture>
  <source media="(prefers-color-scheme: light)" srcset="/.github/meta/dark.png">
  <source media="(prefers-color-scheme: dark)" srcset="/.github/meta/light.png">
  <img alt="AntsBimbel">
</picture>

<pre>
[ ABOUT ]

Full-fledged scheduling and management dashboard for AntsBimbel, a
tutoring agency owned by... my mom! The project is split into two
services that run side by side.

Backend   --> antsbimbel-be (Django REST API)
Frontend  --> antsbimbel-fe (React + Vite)

[ RUN EVERYTHING WITH DOCKER COMPOSE ]

From the repository root:

    docker compose up --build

Services:

    Frontend     --> http://localhost:5173
    Backend API  --> http://localhost:8000/api

The backend runs migrations automatically on startup.

[ STOP SERVICES ]

    docker compose down

To also remove persistent volumes (SQLite DB + media):

    docker compose down -v

[ NOTES ]

- SQLite data is persisted in a Docker volume and mapped to
  /data/db.sqlite3 in the backend container.
- Media files are persisted in a separate Docker volume.
- If you need Google Drive/Gmail integration, set the corresponding
  environment variables for the backend service in docker-compose.yml.
</pre>
