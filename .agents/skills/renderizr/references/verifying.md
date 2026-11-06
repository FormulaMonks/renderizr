# Verifying an output before you hand it over

A render makes no network requests: the `--artifact` folder loads only its own files, and the `--single-file` page loads nothing at all. Check it rather than assert it: the failure mode is a recipient opening a page that renders blank or unstyled, long after you moved on.

## Check the right thing

A rendered page contains plenty of `https://`: hyperlinks in the documentation, links to `structurizr.com` and `c4model.com`, the SVG namespace `http://www.w3.org/2000/svg`. **None of those is a leak.** They are content, and a page full of them is still self-contained.

What matters is whether the page *loads* anything over the network: `<script src>`, `<link href>`, `<img src>`, `<source>`, and their relatives.

A naive `grep https://` therefore fails forever and teaches you to ignore it. Match asset-bearing tags instead, across every file of the folder:

```bash
grep -Eoi '<(script|link|img|source|iframe|embed|video|audio|track|object)[^>]+(src|href|srcset|data|poster)[[:space:]]*=[[:space:]]*["'"'"']?(https?:)?//' \
  /tmp/arch/*
```

**No output is the pass.** Anything printed is a real external dependency and the output is not safe to hand over. The `--artifact` shell links its runtime with relative paths (`./renderizr.js`), which the pattern leaves alone.

## The folder matches its manifest

Every file `manifest.json` lists exists, with its size and hash, and the folder holds nothing else:

```bash
node -e '
const { readFileSync, readdirSync } = require("node:fs");
const { createHash } = require("node:crypto");
const dir = process.argv[1];
const { files } = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
for (const { path, bytes, sha256 } of files.filter((file) => file.sha256)) {
  const data = readFileSync(`${dir}/${path}`);
  if (data.length !== bytes || createHash("sha256").update(data).digest("hex") !== sha256)
    console.log(`mismatch: ${path}`);
}
const listed = new Set(files.map((file) => file.path));
for (const name of readdirSync(dir)) if (!listed.has(name)) console.log(`unlisted: ${name}`);
' /tmp/arch
```

No output is the pass.

## The stronger check

Open it the way the recipient will. For `--artifact`, serve the folder with any static server and open `index.html` over HTTP: a browser blocks module scripts over `file://`, while the artifact host serves every file next to the page. For `--single-file`, copy `index.html` somewhere with nothing beside it and open it from disk:

```bash
mkdir -p /tmp/alone && cp /tmp/single/index.html /tmp/alone/
# then open /tmp/alone/index.html in a browser
```

If it shows the workspace name, the view list and a diagram, the output is complete. Anything the build did not carry has nothing to resolve against and nowhere to fetch from, so it fails visibly rather than subtly.

Renderizr's own test suite does exactly this, in headless Chrome, on every build.

## If the build refuses

Renderizr will sometimes stop rather than write a file:

```
Cannot make this bundle artifact-safe: …
```

This is deliberate and means the bundle holds something a Claude artifact upload would reject: a lone surrogate or a U+FFFD in a position the build cannot safely rewrite. The message names the offset and the snippet. A message that names a file and says it "still spells out" such sequences means the same for that file.

**Do not work around it by disabling the check or hand-editing the output.** A refusal is the tool telling you that something downstream would reject or corrupt the artifact. Report the message; the offending literal is almost always in a dependency, and the fix belongs there or in the build.

## Quick sanity checks

```bash
# The files exist and the manifest names the Renderizr version
ls -l /tmp/arch/
grep '"renderizr"' /tmp/arch/manifest.json

# The workspace really is in the payload, and its name is the page's title
grep -c "<workspace name>" /tmp/arch/workspace.json
grep -o '<title>[^<]*</title>' /tmp/arch/index.html
```

For the multi-file build, the equivalent is that `index.html`, `assets/` and `favicon.png` all exist, and that `assets/` holds one entry script and one stylesheet.
