# Verifying an artifact before you hand it over

A single-file render makes no network requests. Check it rather than assert it — the failure mode is a recipient opening a page that renders blank or unstyled, long after you have moved on.

## Check the right thing

A rendered page contains plenty of `https://` — hyperlinks in the documentation, links to `structurizr.com` and `c4model.com`, the SVG namespace `http://www.w3.org/2000/svg`. **None of those is a leak.** They are content, and a page full of them is still perfectly self-contained.

What matters is whether anything is *loaded* over the network: `<script src>`, `<link href>`, `<img src>`, `<source>`, and their relatives.

A naive `grep https://` therefore fails forever and teaches you to ignore it. Match asset-bearing tags instead:

```bash
grep -Eoi '<(script|link|img|source|iframe|embed|video|audio|track|object)[^>]+(src|href|srcset|data|poster)[[:space:]]*=[[:space:]]*["'"'"']?(https?:)?//' \
  /tmp/arch/artifact.html
```

**No output is the pass.** Anything printed is a real external dependency and the artifact is not safe to hand over.

## The stronger check

Open it the way the recipient will — with nothing beside it and no network:

```bash
mkdir -p /tmp/alone && cp /tmp/arch/artifact.html /tmp/alone/
# then open /tmp/alone/artifact.html in a browser
```

If it renders the workspace name, the view list and a diagram from a directory containing nothing else, it is genuinely standalone. Anything that had not been inlined has nothing to resolve against and nowhere to fetch from, so it fails visibly rather than subtly.

Renderizr's own test suite does exactly this, in headless Chrome, on every build.

## If the build refuses

Renderizr will sometimes stop rather than emit a file:

```
Cannot make this bundle artifact-safe: …
```

This is deliberate and means the bundle holds something a Claude artifact upload would reject — a lone surrogate or a U+FFFD in a position that cannot be rewritten safely. The message names the offset and the snippet.

**Do not work around it by disabling the check or hand-editing the output.** A refusal is the tool telling you the artifact would be rejected or corrupted downstream. Report the message; the offending literal is almost always in a dependency, and the fix belongs there or in the build.

## Quick sanity checks

```bash
# Both files exist and are a plausible size — under ~100 KB means something failed
ls -l /tmp/arch/

# The workspace really was baked in, not left to be fetched
grep -c "<workspace name>" /tmp/arch/artifact.html
```

For the multi-file build instead of `--single-file`, the equivalent is that `index.html`, `assets/` and `favicon.png` all exist, and that `assets/` holds one entry script and one stylesheet.
