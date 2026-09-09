# ESL Walkie-Talkie — Single File Edition

Upload `index.html` (and optionally `.nojekyll`) to the root of your GitHub Pages repository.

This build embeds the QR generator, DEFLATE compressor, CSS, and app JavaScript directly inside `index.html`, so there are no `vendor/` or relative JavaScript files that GitHub Pages can fail to locate.

If replacing an older build, delete the old `app.js`, `style.css`, and `vendor/` files or simply leave them unused; this `index.html` does not reference them.
