/**
 * `test/support/acceptance.js`: how the acceptance set's workspaces are
 * prepared to build offline (spec 15.3). Here only what needs no browser; `test/acceptance.test.js` builds and draws the set itself.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { runCli } from "../scripts/__fixtures__/helpers.js";
import { INVALID_SET, prepareWorkspace } from "./support/acceptance.js";

const SCRATCH = await mkdtemp(join(tmpdir(), "renderizr-acceptance-set-"));
after(() => rm(SCRATCH, { recursive: true, force: true }));

const AWS_THEME =
    "https://static.structurizr.com/themes/amazon-web-services-2020.04.30/theme.json";

/** Prepare a workspace that uses the AWS theme and nothing else. */
async function prepareWithAwsTheme(name) {
    const source = join(SCRATCH, `${name}.json`);
    await writeFile(
        source,
        JSON.stringify({
            name,
            model: {},
            views: { configuration: { themes: [AWS_THEME] } },
        }),
    );
    return prepareWorkspace({ name, source });
}

const styleFor = (workspace, tag) =>
    workspace.views.configuration.styles.elements.find(
        (style) => style.tag === tag,
    );

test("a remote theme is folded in from its committed copy and taken off the list", async () => {
    const workspace = await prepareWithAwsTheme("folded");

    assert.deepEqual(
        workspace.views.configuration.themes,
        [],
        "the theme is still listed, so the build would fetch it",
    );
    assert.ok(
        styleFor(workspace, "Amazon Web Services - EC2"),
        "the theme's styles are missing",
    );
});

test("a theme icon the acceptance set uses is inlined from the committed copy", async () => {
    // The contact sheet is where people check icons and their position
    // (spec 15.2), so the icons the AWS workspace's tags name have to be there.
    const workspace = await prepareWithAwsTheme("icons");

    assert.match(
        styleFor(workspace, "Amazon Web Services - EC2").icon ?? "",
        /^data:image\/png;base64,iVBORw0KGgo/,
        "the EC2 icon is not inlined as a PNG",
    );
});

test("a theme icon with no committed copy is left out rather than fetched", async () => {
    const workspace = await prepareWithAwsTheme("uncopied");

    assert.equal(
        styleFor(workspace, "Amazon Web Services - Alexa For Business")?.icon,
        undefined,
        "an icon with no copy kept its relative name",
    );
});

for (const { name, source, message } of INVALID_SET) {
    test(`the build refuses ${name} with the spec's message`, async () => {
        const out = join(SCRATCH, `invalid-${name}`);
        const { code, stderr } = await runCli([source, "--out", out]);

        assert.notEqual(code, 0, "the build succeeded");
        assert.ok(
            stderr.includes(message),
            `stderr does not hold ${JSON.stringify(message)}:\n${stderr}`,
        );
        assert.ok(!existsSync(out), "an output directory was created anyway");
    });
}
