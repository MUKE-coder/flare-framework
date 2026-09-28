# Banner prompt for Gemini

Paste the block below into Gemini (a model with image generation — Nano
Banana / Gemini 3 Pro Image). It is written for **1920 × 1005**, which
downsamples cleanly to GitHub's 1280 × 640 social preview and crops to social
headers.

Read the notes after the prompt — one of them will save you a reroll.

---

## The prompt

> Create a wide hero banner image, 1920 × 1005 pixels, for an open-source
> software framework called **Flare**.
>
> **Overall look.** A dark, cinematic hero. The background is near-black
> `#0E0E10`, with a single large soft radial glow in ember orange
> `#FF6B35` blooming from behind the centre of the image and falling off to
> darkness at the edges — like a light source behind the wordmark. Subtle,
> atmospheric, slightly hazy. No stars, no particles, no bokeh.
>
> **Centre.** The word **FLARE** in the exact middle, in heavy bold
> sans-serif capitals, pure white `#FFFFFF`, very large — the word should
> span roughly a third of the image width. Tight letter-spacing, clean
> geometric letterforms, with a soft warm glow behind it where it meets the
> radial light. It is the brightest thing in the image.
>
> Directly beneath it, on one line in a lighter grey `#C9C9CF` at roughly a
> quarter of the wordmark's size:
> `The full-stack framework for Cloudflare and Next.js`
>
> **Below the tagline,** a single horizontal row of seven small pill-shaped
> outlined buttons, evenly spaced and centred. Each pill is a thin 1px
> rounded outline in translucent grey with no fill, containing one short
> label in light grey. The labels, in this exact order:
> `TypeScript` `React` `Cloudflare` `Next.js` `Drizzle` `Prisma` `Tailwind`
>
> **Left edge.** A semi-transparent dark rounded rectangle, partly cropped by
> the left edge of the image, styled like a terminal window with no title
> bar. Inside it, monospace text in muted colours, left-aligned, exactly
> this and nothing more:
> ```
> $ flare gen resource Product
> ✓ created  db/schema/products.ts
> ✓ created  app/api/products/route.ts
> ✓ created  app/dashboard/products/page.tsx
> ```
> The `$` prompt and command in white, the `✓` marks in ember orange, the
> file paths in muted grey.
>
> **Right edge.** A matching semi-transparent dark rounded rectangle, partly
> cropped by the right edge, styled like a code editor window with three
> small circular dots at its top left. Inside it, monospace code, exactly
> this and nothing more:
> ```
> export default defineResource({
>   name: "Product",
>   fields: {
>     price: field.float(),
>   },
> });
> ```
> Syntax-highlighted in soft muted tones — keywords in a dull violet, strings
> in a soft green, punctuation in grey. Nothing in that panel should be
> brighter than the wordmark.
>
> **Both side panels** sit lower than the wordmark, are dimmer than it, and
> fade slightly into the dark background. They are context, not the subject.
>
> **Palette — use only these:** background `#0E0E10`, glow `#FF6B35`, a
> deeper ember `#CC3D0B` at the glow's edge, white `#FFFFFF`, grey
> `#C9C9CF`, muted grey `#6B6B6B`. No blue, no purple wash, no teal, no
> rainbow gradients.
>
> **Composition.** Everything important — wordmark, tagline, pills — sits
> within the centre 60% of the width and at least 90 pixels from the top and
> bottom, so nothing is lost when the banner is cropped to 2:1 or 3:1. The
> side panels may be cropped; nothing else may.
>
> **Render all text exactly as written above**, correctly spelled, with no
> invented words, no lorem ipsum, and no extra UI elements. Do not add a
> logo, mascot, icon, rocket, lightning bolt, cloud, circuit board or sparkle
> motif.
>
> Output one flat image at 1920 × 1005.

---

## The note that will save you a reroll

**The code in the side panels will probably come out garbled.** Image models
approximate small monospace text — the reference image that inspired this
brief has `reating mnd new my-app` and `ho::har()` in it, which is what that
failure looks like. At banner size most people never notice, and it still
reads as "code".

If you want it *right*, do this instead:

1. Ask for the image **with the side panels empty** — "the two side panels
   are empty dark rounded rectangles with no text".
2. Screenshot your own terminal running `flare gen resource Product` and your
   own editor showing a descriptor.
3. Composite them into the empty panels in any image editor.

That is how these banners are usually made, and it is the difference between
"looks like code" and "is code".

## Variants worth asking for afterwards

Ask in the same conversation so the design stays consistent:

- **Light version.** "Same composition on a near-white `#FAFAFA` background,
  ember glow reduced to a soft warm tint, wordmark in `#111111`."
- **Square, 1024 × 1024.** "Crop to square, keep the wordmark and tagline
  centred, drop the side panels."
- **X header, 1500 × 500.** "Re-lay out for a 3:1 header; drop the pills."
- **Clean.** "Remove the side panels and the pills, keep the wordmark,
  tagline and glow" — for slide backgrounds and Open Graph.

## Before you ship it

**Zoom in on the word FLARE and the tagline.** If either is misspelled, ask
Gemini to fix that text specifically rather than regenerating — a
regeneration changes the whole composition.

**Check it at 320 pixels wide.** That is how a GitHub link preview shows it.
The wordmark should still be readable and the pills should still look
deliberate rather than mushy.

**Where the file goes.** Save the export as `docs/public/banner.png`; the
README already points there. Then set it separately as the repo's social
preview under **Settings → General → Social preview**, which is its own
upload and does not read the README.
