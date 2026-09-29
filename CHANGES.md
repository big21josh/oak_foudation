# Design update — what changed

Copy these files over your project (same paths), then run:

    npm install      # adds @fontsource/inter, removes quicksand/baloo-2
    npm run dev

| File | What |
|---|---|
| src/app/globals.css | Rewritten from the Figma tokens (main #162E55, Chillax + Inter, r24/16/14, navy shadows), desktop sidebar + mobile header/bottom nav, all screens |
| src/app/layout.tsx | Inter via fontsource, Chillax via Fontshare link, viewport-fit=cover for phone safe areas |
| src/components/icon.tsx (new) | Renders your public/icons/*.svg as masks so one file works for active (white) and inactive (grey) |
| src/components/shell.tsx | Sidebar / mobile header / frosted bottom nav per Figma |
| src/components/registration.tsx | Form, stats, requirements group, consent, entry-pass screen |
| src/components/check-in.tsx | Scanner, success, fail screens (now real time / count / next session) |
| src/components/programme.tsx | Featured card, badges, session rows, pin icons |
| src/components/partners.tsx | Search field with icon, subtitle, labels |
| src/components/attendance.tsx | Empty state, Event Overview tiles, participants list |
| src/app/check-in/page.tsx | Passes sessions into CheckIn |
| src/lib/data.ts | Adds nextSession() + eventDays |
| package.json | Font dependencies |
