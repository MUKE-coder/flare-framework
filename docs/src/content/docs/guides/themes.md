---
title: Themes
description: "Six looks for the whole app: sign-in, dashboard, admin and home page. Pick one at create time, switch any time."
---

Every Flare app ships six themes, so two apps built with Flare don't have to
look alike. A theme changes everything at once:

- **Colours:** the brand colour, links and focus rings.
- **Type:** each theme has its own typeface, self-hosted.
- **Shape:** corner radius, button shape and heading weight.
- **Sign-in layout:** each theme lays out the auth screens its own way.

| Theme | Look | Sign-in layout |
| --- | --- | --- |
| `default` | Calm and centred, indigo | Centred form; sign-up beside a highlights panel |
| `coral` | Warm and rounded, pink-red gradient | A big card floating over a blurred glimpse of the app |
| `amber` | Plain and direct, yellow pill buttons | Wordmark above a boxed form, footer links below |
| `sky` | Crisp blue, bold headings | Top bar, big left-aligned heading, social sign-in first |
| `mono` | Black and white on a fine grid | Form over a grid and glow, a showcase panel beside it |
| `emerald` | Fresh green | Narrow form column beside a customer quote |

The [docs home page](/) shows each one.

## Choosing one

When you create the app, `flare create` asks. In scripts, pass it as a flag:

```bash
npx flare create shop --theme coral
```

Later, switch it with:

```bash
npx flare theme          # list them, with the current one marked
npx flare theme mono     # switch; restart flare dev to see it
```

That edits one line in `lib/site.ts`. To try a theme without changing the
file, set `FLARE_THEME` in the shell or in `.env`:

```bash
FLARE_THEME=emerald npx flare dev
```

`FLARE_THEME` is read when the app is built or `flare dev` starts, and it wins
over `lib/site.ts`. It's baked into the build rather than read per request,
which keeps pages static and cacheable. So a deployed app keeps the theme it
was built with.

## Making it yours

- **Words:** `lib/site.ts` holds the name, tagline, description, the home
  page's features and customers, the highlights and testimonial beside the
  sign-in forms, and the legal and support links.
- **Colours and shape:** each theme is a block of CSS variables in
  `app/globals.css`, under `[data-theme="…"]`: `--brand`,
  `--brand-foreground`, `--link`, `--radius`, `--button-radius`,
  `--heading-weight` and `--font-theme`. Change a value and every screen
  follows. The admin's shadcn/ui tokens (`--primary`, `--ring`) derive from
  them.
- **Logo:** `BrandMark` in `components/auth/auth-shell.tsx` draws the app's
  initial on the brand colour. Put your logo there.
- **Layouts:** the six sign-in layouts are the cases of `AuthShell` in the same
  file. The home page is `app/page.tsx` with `components/marketing/`.

## Dark mode

Every theme has a dark variant, following the system setting or the admin's
toggle. Links lighten automatically on dark backgrounds to stay readable.
