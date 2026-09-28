# Banner prompt for Gemini

Paste the block below into Gemini (use a model with image generation — Nano
Banana / Gemini 3 Pro Image). It is written for **1280 × 640**, which is
GitHub's social-preview size and crops cleanly to X, LinkedIn and Open Graph.

Read the notes after the prompt before you use the result.

---

## The prompt

> Create a 1280 × 640 pixel banner image (exact 2:1 ratio) for an open-source
> software framework called **Flare**.
>
> **What Flare is,** so the image means something: a developer writes one short
> description of a data model, and the framework generates everything around it
> — a database table, an API, validation, and admin screens. One input, many
> precise outputs. It runs at the edge, close to users.
>
> **Concept.** On the left, a single small ember-orange mark: one thick
> horizontal bar, like a single line of code or a struck match. From its right
> edge, six to nine thin horizontal bars fan out and extend to the right, each
> progressively lighter and finer, resolving into a tidy grid of rectangular
> panels — the generated files. The feeling is *one thing becoming many, in
> order*. Structured and deliberate, not explosive, not scattered. Nothing
> should look like sparks, fire, flames or an explosion.
>
> **Palette — use these exact values and nothing else:**
> - Background: near-black `#141414`
> - Primary accent: ember orange `#FF6B35`
> - Deeper accent for the far end of the fan: `#CC3D0B`
> - Type and fine lines: off-white `#FAFAFA`
> - Muted supporting lines: grey `#6B6B6B`
>
> Matte, flat colour. No purple, no blue, no teal, no rainbow gradients.
>
> **Typography.** Set the word **Flare** in a clean geometric sans-serif,
> lowercase or sentence case, medium weight, generous letter-spacing, in
> off-white, positioned upper-left with clear margin. Beneath it in much smaller
> grey text, one line: `describe a resource once`. Render both exactly, spelled
> correctly, with no extra words, no tagline of your own invention, and no
> lorem ipsum.
>
> **Composition.** Keep the left 45% calm and mostly empty apart from the
> wordmark — this is where the eye lands. Keep all text and the wordmark at
> least 80 pixels from every edge so nothing is lost when the banner is cropped
> to a 3:1 social header. Generous negative space. No border or frame.
>
> **Style.** Flat vector-poster look: crisp geometry, hairline rules, hard
> edges, subtle ember glow only where the fan begins. Swiss/technical rather
> than decorative.
>
> **Do not include:** circuit-board patterns, glowing orbs or spheres, rockets,
> lightning bolts, clouds, cartoon mascots, 3D chrome, bokeh, lens flare, stock
> "AI" motifs, code windows with fake text, drop shadows, or any logo other
> than the word Flare.
>
> Output a single flat image at 1280 × 640.

---

## Variants worth asking for after the first one

Once you have a version you like, ask for these as follow-ups in the same
conversation so the design stays consistent:

- **Light version.** "Same design, on `#FAFAFA` paper with `#1F1F1F` type and
  `#CC3D0B` as the accent" — for light-mode READMEs and press.
- **Square.** "Crop to 1:1 at 1024 × 1024, keeping the wordmark centred" —
  for avatars and app icons.
- **Wide social header.** "Re-lay out at 1500 × 500 for an X header, keeping
  the wordmark in the left third."
- **Textless.** "Remove all text, keep the fan and the background" — useful as
  a section divider or a slide background.

## Notes before you ship it

**Check the spelling.** Image models still mangle type. Zoom in on the word
*Flare* and the small line under it. If either is wrong, ask Gemini to fix the
text specifically rather than regenerating — regenerating changes the whole
composition.

**If the text keeps coming out wrong,** ask for the textless variant and set
the wordmark yourself. That is what most teams do, and it is how you get the
kerning right. The docs site uses a geometric sans; Geist, Inter Tight and
Space Grotesk all suit this palette.

**Check it small.** A GitHub social card is often seen at about 320 pixels
wide in a link preview. Shrink your export to that width and confirm the
wordmark is still readable and the fan still reads as structure rather than
mush.

**Where to put the file.** Save the export as `docs/public/banner.png`, then
the README picks it up at
`https://flare-docs.codetotech.com/banner.png`. Set it as the repo's social
preview under **Settings → General → Social preview**, which is a separate
upload from the README image.
