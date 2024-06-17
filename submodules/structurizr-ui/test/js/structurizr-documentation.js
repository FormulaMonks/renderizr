QUnit.test("convertToHeadingAnchor", (assert) => {
    var anchor = convertToHeadingAnchor("System Context");
    assert.equal(anchor, "system-context");
});

QUnit.test(
    "convertToHeadingAnchor removes punctuation characters",
    (assert) => {
        var anchor = convertToHeadingAnchor(
            "System!@$%^&*()=_+[]{}|<>,.?~`/Context",
        );
        assert.equal(anchor, "systemcontext");
    },
);

QUnit.test("registerHeadingAnchor", (assert) => {
    registerHeadingAnchor("1", "Section 1");
    registerHeadingAnchor("2", "Section 2");
    registerHeadingAnchor("3", "Section 3");

    assert.equal(findHeadingAnchor("1", "Section 1"), "section-1");
    assert.equal(findHeadingAnchor("2", "Section 2"), "section-2");
    assert.equal(findHeadingAnchor("3", "Section 3"), "section-3");
});

QUnit.test(
    "registerHeadingAnchor when there are duplicates",
    (assert) => {
        registerHeadingAnchor("1", "Introduction");
        registerHeadingAnchor("2", "Introduction");

        assert.equal(findHeadingAnchor("1", "Introduction"), "introduction");
        assert.equal(findHeadingAnchor("2", "Introduction"), "introduction-1");
    },
);
