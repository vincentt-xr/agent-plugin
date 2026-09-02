# agent-plugin

The Vincentt recognition mapping, and the wrappers that package it for agent hosts.

**One file is authored: `recognition.md`.** Everything else that contains a sentence about the
product is generated from it by `build/assemble.mjs`. A hand-edit to a generated file fails the
build with a message naming `recognition.md` as the place to make the change.

```
recognition.md          THE SOURCE. The only authored content.
precedence.txt          The one sentence that is in the package and not the grounding.
actions.yml             GENERATED — the four action labels.
build/assemble.mjs      Renders every output. Fails if the source is missing.
build/verbs.mjs         PINNED_PLUGIN_VERBS.
build/lint.mjs          The source lint.
hosts/self-serve/       GENERATED wrapper — the self-serve host.
test/                   node --test
```

## Why the source is here and not in the template

`recognition.md` is consumed by two release paths moving at different speeds: the `v2-template`
tag that carries the grounding, and this repo's own tag that carries the package. It lives in the
repo neither of those owns, and both consume it at build time.

## Running everything

```sh
npm run assemble     # render every output from recognition.md
npm run lint         # the source lint (exits non-zero on a violation)
npm test             # lint + assembly + labels + wrapper ceiling
npm run check        # assemble --check: fail if any tracked output is stale
```

## Publishing

The release job refuses to publish unless the current `v2-template@latest` already contains the
assembled grounding section byte-for-byte. Content reaches creators who cannot install before a
package exists to install, always, because the package cannot publish until it has.

## License

MIT. See `LICENSE`.
