Contributing to HAPA
====================

Thanks for your interest in contributing to HAPA. This guide explains how to get set up and the conventions to follow when working on the project.

---

1. Getting started
------------------

### 1.1. Repo layout

```text
HAPA APP/
  HAPA-FRONTEND/   # Expo/React Native mobile app
  HAPA-BACKEND/    # Flask API service
  supabase/        # Supabase project (DB, Edge Functions, config)
```

Before you start, read:

- `README.md` – high-level overview and setup.
- `ARCHITECTURE.md` – deeper dive into the system.
- `API.md` – logical API surface.

### 1.2. Local setup

- **Frontend**
  - Install Node.js (LTS).
  - In `HAPA-FRONTEND/`:

    ```bash
    npm install
    # or
    yarn
    ```

  - Configure Expo environment (see `README.md` for required env vars).

- **Supabase**
  - Install Supabase CLI and either:
    - Use a local Supabase stack (`supabase start`), or
    - Connect to a shared dev Supabase project.
  - Apply migrations and deploy/update Edge Functions as needed.

- **Backend (Flask)**
  - In `HAPA-BACKEND/`:

    ```bash
    python -m venv .venv
    source .venv/bin/activate  # Windows: .venv\Scripts\activate
    pip install -r requirements.txt
    ```

  - Create a `.env` based on existing config and environment docs.

---

2. Workflow
-----------

### 2.1. Branching

- Create a feature branch per change:

  ```bash
  git checkout -b feature/short-description
  # or
  git checkout -b fix/short-description
  ```

- Keep branches focused on a single logical change (feature, bugfix, refactor).

### 2.2. Commits

- Aim for **small, focused commits** with clear messages.
- Suggested style:
  - `feat: add venue metrics card`
  - `fix: handle otp error state`
  - `refactor: extract api client`
  - `chore: bump expo-sdk`

### 2.3. Pull requests

- Keep PRs relatively small; large changes should be broken into steps.
- In the PR description, include:
  - **What** you changed.
  - **Why** you changed it.
  - **How to test** (steps + devices/platforms).

---

3. Coding guidelines
--------------------

### 3.1. Frontend (HAPA-FRONTEND)

- **Language & framework**
  - Use TypeScript.
  - Expo/React Native patterns with functional components and hooks.

- **Structure**
  - Put screens in `app/` following Expo Router conventions.
  - Reusable UI pieces go into `components/`.
  - Shared logic (API calls, utilities) lives in `lib/` or `hooks/`.

- **API access**
  - Use the central `apiFetch` helper instead of calling `fetch` directly.
  - Keep backend paths logical (`/api/venues/me`, `/api/posts`, etc.) so it’s easy to switch implementations.

- **State management**
  - Prefer React hooks and context over adding a heavy global state library.
  - Use context sparingly for cross-cutting concerns (auth, upload state, theming).

- **Styling & UI**
  - Follow the existing design system and components.
  - Keep UI mobile-first and simple; prioritize readability and touch targets.

### 3.2. Supabase / SQL / Edge Functions

- Keep SQL changes in migrations under `supabase/migrations/`.
- Ensure new tables and columns:
  - Have appropriate types and indexes.
  - Respect existing naming conventions.
- For Edge Functions:
  - Group related logic into a single function where appropriate (e.g., `venues`, `posts`).
  - Enforce authorization with RLS and/or explicit checks—never assume the client is trusted.

### 3.3. Backend (HAPA-BACKEND)

- Follow existing structure:
  - One blueprint per domain (`auth`, `venues`, `posts`, `discover`, `locations`).
  - Shared integration code under `services/` (e.g., SMS, maps).
- Handle errors gracefully and return consistent JSON error shapes.
- Use environment variables for secrets and external endpoints, not hard-coded values.

---

4. Testing & quality
--------------------

### 4.1. Manual testing

At minimum, for each change:

- Test in the Expo app on at least one platform (Android or iOS):
  - Check that navigation still works.
  - Verify any new flows end in a success or clear error state.
- If you touch backend logic:
  - Hit the corresponding endpoint via the app or a tool like `curl` or Postman.
  - Check for clear error responses and no server crashes.

### 4.2. Automated checks

If/when automated tests or linters are set up:

- Run them before pushing:

  ```bash
  # frontend examples
  npm test
  npm run lint

  # backend examples
  pytest
  ```

- Fix any linter or formatter issues introduced by your changes.

---

5. Adding new features
----------------------

When adding a new feature:

1. **Design the flow**
   - Sketch out the user journey (screen sequence, inputs, outputs).
   - Decide where the logic lives:
     - Frontend only?
     - Supabase Edge Function?
     - Flask service?

2. **Define the data model**
   - Do you need new tables/columns or just new queries?
   - Add migrations and, where applicable, RLS policies.

3. **Add or update APIs**
   - Add new endpoints to Supabase Edge Functions or Flask blueprints.
   - Update `API.md` and the `apiFetch` helper mappings if needed.

4. **Wire up the UI**
   - Add screens/components under `HAPA-FRONTEND/app` and `components/`.
   - Keep logic testable and avoid deeply nested components.

5. **Document**
   - Update `README.md`, `ARCHITECTURE.md`, or `API.md` if the feature is significant.
   - Add inline comments only where intent is non-obvious (avoid narrating trivial code).

---

6. Reporting bugs & requesting features
--------------------------------------

When filing an issue or writing a task, include:

- **Context:** Device, OS, environment (dev/staging/prod), app version/build number.
- **Steps to reproduce:** What you did, what you expected, what happened instead.
- **Screenshots or logs:** Where possible, especially for UI or API failures.

For feature requests:

- Describe the user problem first.
- Suggest how it might integrate into existing flows (discoverer vs venue owner).

---

7. Code review etiquette
------------------------

- Be kind and constructive.
- Focus on:
  - Correctness and security.
  - Clarity of code and naming.
  - Consistency with existing patterns.
- Ask questions instead of making assumptions; propose alternatives when suggesting changes.

Thanks again for contributing to HAPA!

