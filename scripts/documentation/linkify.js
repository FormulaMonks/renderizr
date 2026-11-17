/**
 * GitHub's autolinks: a bare URL, a `www.` address and an email address
 * become links, through markdown-it's `linkify`. The link resolver then
 * reads them like any other link, and code stays untouched.
 *
 * markdown-it's linkify-it links a URL with a scheme and an email address.
 * A `www.` address joins them as a scheme of its own, so a bare domain with
 * no `www.` (`README.md`) stays text, as on GitHub.
 *
 * @param {import("markdown-it").default} md
 */
export function linkify(md) {
    md.set({ linkify: true });

    /** @type {RegExp | undefined} */
    let host;
    md.linkify.add("www.", {
        validate(text, pos, self) {
            host ??= new RegExp(
                self.re.get_url_host_port().source + self.re.get_path().source,
                "iy",
            );
            host.lastIndex = pos;
            return host.exec(text)?.[0].length ?? 0;
        },
        normalize(match) {
            match.url = `http://${match.url}`;
        },
    });
}
