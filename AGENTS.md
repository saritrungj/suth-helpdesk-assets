# Repository Guidelines

Hospital IT asset-management app: Express/MySQL API, Vue/Vite client, SQL scripts, and handoff/import docs.

## Project Structure

- `backend/` — CommonJS Express API: endpoints in `routes/`, request logic in `controllers/`, auth checks in `middlewares/`, and shared calculations in `utils/`.
- `frontend/` — Vue 3 SPA: screens in `src/views/`, reusable UI in `src/components/`, state in `src/store/`, HTTP access in `src/services/api.js`, navigation in `src/router/`, and static files in `public/` or `src/assets/`.
- `database/` — `schema.sql`, migrations, and `seed_dummy_data.sql`.
- `docs/` — handoff notes and sample import files.

## Build, Test, and Development Commands

Run each app from its own directory:

```sh
cd backend
npm install
npm run dev       # API with nodemon at http://localhost:3000
```

In another shell:

```sh
cd frontend
npm install
npm run dev       # Vite client at http://localhost:5173
npm run build     # Production bundle
npm run preview   # Serve the built bundle locally
```

Copy `.env.example` to `backend/.env`. From the repository root, run `mysql -u root -p your_database < database/schema.sql`, apply migrations in order, and use `database/seed_dummy_data.sql` for data.

## Coding Style & Naming Conventions

Use two-space indentation. Backend uses CommonJS and semicolons; frontend uses ES modules, Vue `<script setup>`, and Tailwind classes. Name Vue components in PascalCase (`MonthPicker.vue`) and JavaScript variables/functions in camelCase. No formatter or linter is configured; match adjacent files.

## Testing Guidelines

No automated test framework or coverage threshold is configured; backend `npm test` is a placeholder. Run `npm run build` in `frontend` and smoke-test `GET /` plus affected authenticated API flows with the backend and seeded database. For database changes, test a fresh schema and migration path, including Thai fiscal-year boundaries. New tests should sit near the target module and use `*.test.js` or `*.spec.js`.

## Commit & Pull Request Guidelines

Recent history includes `fix: add fiscal year ranges to seed data` and generic “update latest changes” commits. Prefer short, imperative Conventional Commit-style subjects (`feat:`, `fix:`, `docs:`, `db:`). PRs should explain behavior/schema changes, list commands, identify migration order, link an issue when available, and include UI screenshots.

## Security & Configuration

Never commit `.env`, credentials, tokens, or production data. Keep MySQL credentials and `JWT_SECRET` in environment variables, use a strong local secret, and review CSV/XLSX imports before loading. Treat migrations as ordered, reviewed changes.

## Team Workflow

- Two developers; AI-assisted workflow.
- Start each task from a GitHub Issue and dedicated branch; never edit or commit on `main`.
- Before editing, check the branch and `git status`; on `main`, stop and notify the user.
- Read relevant code first; propose a plan for risky or multi-file work.
- Stay within the Issue scope; do not fix unrelated code.
- Before finishing, inspect `git diff`, run relevant checks, and state anything untested.
- Do not commit, push, merge, delete branches, deploy, or change production without explicit user instruction.
- Get approval before schema/migration, auth/security, secrets, destructive-operation, or production work.
- Summarize changed files, test results, and remaining risks.
- For review requests, review only; edit files only when explicitly asked.
