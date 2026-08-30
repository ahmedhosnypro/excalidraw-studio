# Excalidraw Studio — Build Plan

> A self-hosted, open-source rebuild of [excalidraw.com](https://excalidraw.com/) with the
> **paid-tier features we all want**: user accounts, server-side file storage, file
> switching, comments, and presentations — all backed by our own infrastructure.

---

## 1. Research Summary (collected 2026-08-31)

### 1.1 Source references

| Source | What was extracted |
| --- | --- |
| Live site inspection via agent-browser | Full main-menu structure, shapes toolbar, zoom controls, welcome screen, library sidebar, command palette (all sections), complete keyboard-shortcuts list (Tools / View / Editor) |
| Uploaded screenshots (6) | Command palette (App/Export/Editor/Tools/Elements/Links sections), right sidebar with 3 tabs (Libraries, Comments, Present), top-left main menu incl. Preferences (theme, language, canvas background) |
| Cloned repo `/tmp/excalidraw-research` (master) | `dev-docs/docs/@excalidraw/excalidraw/**` — integration (Next.js `dynamic` + `ssr:false`), props, `excalidrawAPI`, `UIOptions`, `Sidebar` children components (`Sidebar.Header/Tabs/Tab/TabTriggers/TabTrigger/Trigger`), `MainMenu`, `WelcomeScreen`, `Footer`, `useHandleLibrary` |
| npm registry | `@excalidraw/excalidraw@0.18.1`, `drizzle-orm@1.0.0-rc.4`, `drizzle-kit@1.0.0-rc.4`, `eslint-plugin-drizzle@0.2.3`, `@libsql/client@0.17.4`, `oxlint@1.80`, `@biomejs/biome@2.5`, `jscpd@5.1`, `knip@6.33`, `lefthook@2.1`, `@typescript/native-preview` (tsgo) |

### 1.2 Excalidraw integration facts (from dev-docs)

- Excalidraw does **not support SSR** → must be imported via `next/dynamic` with `ssr: false` through a `"use client"` wrapper.
- `excalidrawAPI` callback gives an API object: `updateScene`, `getSceneElements`, `getAppState`, `setActiveTool`, `toggleSidebar({ name, tab })`, `scrollToContent`, `setToast`, `resetScene`, `history`, …
- `onChange(elements, appState, files)` is the save hook (debounce → autosave).
- `theme` prop (`"light" | "dark"`) fully controls the editor theme — bind to `next-themes`.
- `name` prop controls the drawing name used for exports.
- Custom right sidebar: `<Sidebar name="..." docked onDock>` + `Sidebar.Tabs` → `Sidebar.Tab tab="libraries|comments|present"` + `Sidebar.TabTriggers` → `Sidebar.TabTrigger` + `Sidebar.Trigger` for toolbar buttons.
- Library persistence: `onLibraryChange(items)` + `useHandleLibrary` for installing from libraries.excalidraw.com.
- `UIOptions.canvasActions` toggles built-in menu entries (we keep most, disable `loadScene`/`saveToActiveFile` in favour of our own server-backed items).
- Exports: `serializeAsJSON`, `exportToBlob`, `exportToSvg`, `MIME_TYPES`, `loadFromBlob`, `restore`.
- `handleKeyboardGlobally` binds shortcuts to `document` so our command palette can coexist.

### 1.3 Feature parity matrix (target vs. excalidraw.com)

| Feature | excalidraw.com (free) | Our app |
| --- | :--- | :--- |
| Full drawing canvas, tools, properties | ✅ | ✅ (npm package) |
| Light / dark / system theme | ✅ | ✅ (`next-themes` + `theme` prop) |
| Main menu (top-left) incl. Preferences, canvas background | ✅ | ✅ (custom `MainMenu` override) |
| Command palette (Ctrl+/ or Ctrl+Shift+P) | ✅ | ✅ (cmdk, all sections) |
| Shortcuts help dialog (bottom-right "?") | ✅ | ✅ (full shortcut reference) |
| All keyboard shortcuts | ✅ | ✅ (package + app-level) |
| Right sidebar: Libraries | ✅ | ✅ (built-in library + server persistence) |
| Right sidebar: Comments | 💰 paid | ✅ custom (per-file, DB-backed) |
| Right sidebar: Present | 💰 paid | ✅ custom (frames → slide presentation) |
| Sign in / sign up | 💰 paid | ✅ (email + password, session cookies) |
| Save files on server | 💰 paid | ✅ (storage factory: local FS now, S3/Vercel Blob later) |
| Switch / manage files | 💰 paid | ✅ (file switcher dialog + recent files) |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Next.js 16 App Router (single user route "/")                    │
│                                                                    │
│  src/app/page.tsx  ── dynamic(ssr:false) ──▶  <Editor />          │
│                                                                    │
│  <Editor> (client)                                                 │
│   ├─ <Excalidraw>  (npm package, theme-bound)                     │
│   │   ├─ MainMenu custom override (Open/Save/Export/Prefs/…)       │
│   │   ├─ WelcomeScreen (custom copy: "save to your account")       │
│   │   ├─ Sidebar name="studio" (libraries | comments | present)    │
│   │   └─ Footer / top-right custom UI (auth, file switcher)        │
│   ├─ <CommandPalette> (cmdk)  Ctrl+K / Ctrl+/ / Ctrl+Shift+P      │
│   ├─ <ShortcutsDialog> (?)                                       │
│   ├─ <AuthDialog> (sign in / sign up)                             │
│   └─ <FilesDialog> (open / switch / rename / delete / new)        │
│                                                                    │
│  State: zustand (editor + ui store) · TanStack Query (server)     │
└──────────────────────────────────────────────────────────────────┘
                              │  fetch /api/*
┌──────────────────────────────────────────────────────────────────┐
│ API routes (route handlers, all server-side)                      │
│  POST /api/auth/signup · login · logout · GET /api/auth/me        │
│  GET/POST /api/files            list (search) / create            │
│  GET/PATCH/DELETE /api/files/:id  load / rename / delete          │
│  PUT  /api/files/:id/content    save scene (autosave target)      │
│  GET/POST /api/files/:id/comments · DELETE /api/comments/:id      │
└──────────────────────────────────────────────────────────────────┘
        │                          │
┌─────────────────┐   ┌───────────────────────────────────────────┐
│ Drizzle ORM      │   │ Storage Factory — src/server/storage      │
│ + @libsql/client│   │  StorageAdapter (interface)                │
│ SQLite (db/)     │   │  ├─ LocalFileSystemStorage (default)      │
│ users            │   │  ├─ S3Storage      (later, same iface)    │
│ sessions         │   │  └─ VercelBlobStorage (later, same iface) │
│ files            │   │  createStorage() ← STORAGE_DRIVER env     │
│ comments         │   │  put / get / delete / exists / move       │
└─────────────────┘   └───────────────────────────────────────────┘
```

### 2.1 Key design decisions

1. **Drizzle over Prisma** — user-mandated (`drizzle-orm@1.0.0-rc.4` + `@libsql/client`).
   Schema in `src/db/schema.ts`, dialect `sqlite`; migrations via `drizzle-kit`.
   The repository layer (`src/server/repositories/*`) is dialect-agnostic so a later
   PostgreSQL swap only touches `src/db/` + `drizzle.config.ts`.
2. **Storage factory pattern** — `StorageAdapter` interface (`put`, `get`, `delete`,
   `exists`). `createStorage()` reads `STORAGE_DRIVER` env (`local` today; `s3`,
   `vercel-blob`, … later). Scene JSON blobs live in storage; **metadata** (name,
   timestamps, ownership) lives in SQLite. This keeps DB rows small and makes the
   AWS/Vercel migration a single new adapter class.
3. **Custom session auth** (no NextAuth) — email + password with PBKDF2 hashing via
   Web Crypto (zero native deps, works in Bun), opaque session tokens in httpOnly
   cookies, sessions table with expiry. Simple, portable, fully controlled.
4. **Single user route** (`/`) — everything else is `/api/*` handlers. The editor is
   one focused app shell.
5. **Excalidraw package as the engine** — we don't fork the canvas; we wrap it and
   add our persistence, collaboration-free multi-file management, comments, and
   presentation mode around it.

### 2.2 Database schema (drizzle / sqlite)

```ts
users     (id uuid pk, email text unique, name text, passwordHash text,
           createdAt int, updatedAt int)
sessions  (id uuid pk, userId → users, tokenHash text unique,
           expiresAt int, createdAt int)
files     (id uuid pk, userId → users, name text, storageKey text,
           createdAt int, updatedAt int)   // scene JSON in storage at storageKey
comments  (id uuid pk, fileId → files, userId → users, body text,
           x real, y real, resolved int(0/1), createdAt int, updatedAt int)
```

All timestamps are unix-epoch integers (portable across sqlite → pg).

### 2.3 API contract (summary)

| Route | Method | Auth | Body / Result |
| --- | --- | --- | --- |
| `/api/auth/signup` | POST | – | `{ email, password, name }` → sets cookie |
| `/api/auth/login` | POST | – | `{ email, password }` → sets cookie |
| `/api/auth/logout` | POST | ✓ | clears cookie + deletes session |
| `/api/auth/me` | GET | – | `{ user } | { user: null }` |
| `/api/files` | GET | ✓ | list user's files (recent-first) |
| `/api/files` | POST | ✓ | `{ name }` → creates file + empty scene |
| `/api/files/:id` | GET | ✓ | metadata + scene JSON |
| `/api/files/:id` | PATCH | ✓ | `{ name }` rename |
| `/api/files/:id` | DELETE | ✓ | deletes metadata + storage blob |
| `/api/files/:id/content` | PUT | ✓ | `{ elements, appState, files }` autosave |
| `/api/files/:id/comments` | GET/POST | ✓ | list / add comment |
| `/api/comments/:id` | DELETE | ✓ | delete own comment |

---

## 3. UI Specification (from live-site research)

### 3.1 Layout

- **Top-left**: hamburger → main menu (dropdown):
  - Open… `Ctrl+O` · Save to server `Ctrl+S` · Export image… `Ctrl+Shift+E`
  - Command palette `Ctrl+/` · Find on canvas `Ctrl+F` · Help `?`
  - Switch file… (our feature) · Reset the canvas
  - divider → GitHub link · Sign in / Sign out (contextual)
  - **Preferences**: Theme (light/dark/system, `Shift+Alt+D`), Canvas background swatches
- **Top-center**: Excalidraw shapes toolbar (package-provided: Hand `H`, Selection `V`,
  Rectangle `R`, Diamond `D`, Ellipse `O`, Arrow `A`, Line `L`, Draw `P`, Text `T`,
  Image `9`, Eraser `E`, more-tools menu: Frame `F`, Laser `K`, Bucket `B`, Lasso…)
- **Top-right**: file name chip · Files switcher button · Sign in button / user avatar
  menu (My files, Sign out)
- **Right sidebar** (docked, 3 tabs):
  - **Libraries** — built-in excalidraw library items, persisted per user in storage;
    "Browse libraries" opens libraries.excalidraw.com; add-selection-to-library
  - **Comments** — per-file comment thread with canvas pin (x/y), author, timestamp,
    resolve toggle, delete own
  - **Present** — lists frames as slides; play → fullscreen presentation stepping
    through frames (arrow keys / click), exit with Esc
- **Bottom-left**: zoom controls + undo/redo (package-provided)
- **Bottom-right**: help button `?` → shortcuts dialog
- **Welcome screen** (empty canvas): logo, "Your drawings are saved to your account"
  (signed-in) or browser-storage warning (guest), actions: Open `Ctrl+O`, Help `?`,
  Sign in / Sign up

### 3.2 Command palette (cmdk) — sections & items

- **App**: Dark mode toggle `Shift+Alt+D`, Library, Find on canvas, Share/Export,
  My files, New file, Switch file, Sign in/out
- **Export**: Export image `Ctrl+Shift+E`, Save to server `Ctrl+S`, Download `.excalidraw`
- **Editor**: Undo, Redo, Zoom in `Ctrl++`, Zoom out `Ctrl+-`, Reset zoom `Ctrl+0`,
  Zoom to fit `Shift+1`, Zen mode `Alt+Z`, View mode `Alt+R`, Toggle grid `Ctrl+'`,
  Snap to objects `Alt+S`, Select all `Ctrl+A`, Clear canvas `Ctrl+Delete`,
  Canvas background
- **Tools**: Hand `H`, Selection `V`, Rectangle `R`, Diamond `D`, Ellipse `O`,
  Arrow `A`, Line `L`, Draw `P`, Text `T`, Image `9`, Eraser `E`, Frame `F`,
  Laser `K`, Bucket `B`, Keep-tool-active `Q`
- **Elements**: Zoom to selection `Shift+3`, Zoom to fit viewport `Shift+2`
- **Files**: recent files (switch directly)

Open with `Ctrl+K`, `Ctrl+/`, or `Ctrl+Shift+P`.

### 3.3 Keyboard shortcuts (app-level; canvas shortcuts come from the package)

- `Ctrl+K` / `Ctrl+/` / `Ctrl+Shift+P` — command palette
- `Ctrl+O` — open / switch file dialog
- `Ctrl+S` — save to server (guests → prompt sign-in)
- `Ctrl+Shift+E` — export image (package dialog)
- `Shift+Alt+D` — cycle light/dark theme
- `?` — shortcuts help dialog
- `Esc` — close palette / dialogs / presentation
- Arrow keys / `Shift+←/→` — navigate presentation (when presenting)
- All in-canvas shortcuts (tools, zoom, alignment, grouping, …) handled by the
  Excalidraw package via `handleKeyboardGlobally` where needed.

### 3.4 Theme

`next-themes` (light default, class strategy) →
- app shell uses shadcn tokens,
- `<Excalidraw theme={resolvedTheme}>` keeps canvas in sync.

---

## 4. Quality Tooling (pre-commit gate, strict)

Order (each step must pass **including warnings**, else commit is blocked):

1. **tsgo** (`@typescript/native-preview`) — `tsgo --noEmit` type check
2. **oxlint** — `oxlint .` with `--max-warnings 0` (warnings are fatal)
3. **biome** — `biome check .` with `--error-on-warnings`
4. **eslint** — `eslint .` with `--max-warnings 0`
   (flat config: `eslint-config-next` + `eslint-plugin-drizzle`)
5. **jscpd** — copy/paste detector; any clone found → exit 1 (blocks commit)
6. **knip** — unused files/exports/deps detection; any issue → blocks commit

Orchestrated by **lefthook** (`pre-commit`). No `eslint-disable` comments, no
weakened rules — code is fixed instead. Unused scaffold (e.g. shadcn components we
don't use) gets **deleted**, not ignored.

---

## 5. Milestones (each = one commit, pushed)

| # | Milestone | Deliverables |
| --- | --- | --- |
| **M0** | Plan + repo bootstrap | `PLAN.md`, `.gitignore` (full list), git config, initial commit + push to `ahmedhosnypro/excalidraw-app` |
| **M1** | Data + storage foundation | drizzle schema + client, `drizzle.config.ts`, db push, storage factory (local FS), auth APIs (signup/login/logout/me), files + comments APIs, `src/lib/api` typed client |
| **M2** | Editor core | Excalidraw dynamic wrapper, theme binding, custom MainMenu, welcome screen, top-right auth/file UI, file switcher dialog, autosave (debounced onChange → PUT content), guest → local-only mode |
| **M3** | Command palette + shortcuts | cmdk palette with all sections/shortcuts, shortcuts help dialog, app-level hotkeys, find-on-canvas |
| **M4** | Right sidebar | Libraries tab (persist per user), Comments tab (full CRUD + canvas pins), Present tab (frames → slides, fullscreen playback) |
| **M5** | Quality gates | lefthook pre-commit (tsgo → oxlint → biome → eslint → jscpd → knip), configs (biome.json, knip.json, jscpd opts, .oxlintrc), fix ALL warnings, delete unused scaffold, final lint-clean commit |
| **M6** | Verification | agent-browser E2E: sign up → create file → draw → autosave → switch → reload → verify persistence, palette, sidebar, theme, shortcuts, presentation; fix issues; final push |

---

## 6. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Excalidraw package conflicts with React 19 / Next 16 | Package 0.18.x supports React 19 (umd + module builds); dynamic import isolates SSR issues |
| `drizzle-orm@1.0.0-rc.4` API drift vs stable docs | Verified actual `dist/types` of the installed RC — `drizzle()` from `drizzle-orm/libsql`, standard sqlite table builders |
| knip flags the 50+ shadcn scaffold components | Delete every unused scaffold file (rule: only what we use ships) |
| jscpd flags shadcn internals | Only lint our `src` code (`src/**/*.{ts,tsx}`), never `node_modules` |
| Theme FOUC / hydration mismatch | `next-themes` `suppressHydrationWarning` + class strategy |
| Autosave races when switching files | Save-in-flight queue keyed by file id; flush on switch/unload |
| Sandbox resets | DB + storage live under `db/` (gitignored); app re-inits empty state gracefully |
