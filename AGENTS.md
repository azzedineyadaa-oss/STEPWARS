This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## This project

- Game logic lives in `src/lib/game.ts` and has no imports, so it runs under `node --test`. Keep it free of React Native imports and run `npm test` after changing it.
- `docs.expo.dev` and the Expo API may be unreachable in sandboxed environments; `npx expo install` then fails. Take SDK-compatible versions from `node_modules/expo/bundledNativeModules.json` and install them with npm.
- `src/lib/remote.ts` follows the same rule (type-only imports of `./game.ts`).
- The backend is Supabase (`docs/BACKEND.md`). Any schema change goes in a new file under `supabase/migrations/` and must keep `npm run test:db` and `npm run test:api` (end-to-end test of `src/lib/api.ts` through PostgREST) passing; add scenarios to `supabase/tests/*_test.sql` (shared helpers in `helpers.sql`) for new rules.
- Without `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_KEY` the app runs in demo mode; keep both modes working.
- The app talks to the player with « tu » (the team is « vous »). Keep new copy consistent.
- The project stays on the SDK that Expo Go on the App Store supports (SDK 57 as of October 2026), so the owner can test on an iPhone. Upgrade only once Expo Go supports the new SDK.
- Store publishing steps are in `docs/PUBLICATION.md`.
