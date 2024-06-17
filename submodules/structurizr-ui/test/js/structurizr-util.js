QUnit.test("structurizr.util.btoa()", (assert) => {
    assert.equal("SGVsbG8gV29ybGQ=", structurizr.util.btoa("Hello World"));
});

QUnit.test("structurizr.util.atob()", (assert) => {
    assert.equal("Hello World", structurizr.util.atob("SGVsbG8gV29ybGQ="));
});

QUnit.test(
    "shadeColour_DoesNothing_WhenPassedWhiteWithAPositivePercentage",
    (assert) => {
        var colour = structurizr.util.shadeColor("#ffffff", 50);
        assert.equal(colour, "#ffffff");
    },
);

QUnit.test(
    "shadeColour_DoesNothing_WhenPassedPureBlackWithANegativePercentage",
    (assert) => {
        var colour = structurizr.util.shadeColor("#000000", -50);
        assert.equal(colour, "#000000");
    },
);

QUnit.test(
    "shadeColour_DoesNothing_WhenPassedAZeroPercentage",
    (assert) => {
        var colour = structurizr.util.shadeColor("#aabbcc", 0);
        assert.equal(colour, "#aabbcc");
    },
);

QUnit.test(
    "shadeColour_LightensTheColour_WhenPassedAPositivePercentage",
    (assert) => {
        var colour = structurizr.util.shadeColor("#6699CC", 20);
        assert.equal(colour, "#85add6");
    },
);

QUnit.test(
    "shadeColour_LightensTheColour_WhenPassedANegativePercentage",
    (assert) => {
        var colour = structurizr.util.shadeColor("#6699CC", -50);
        assert.equal(colour, "#334d66");
    },
);

QUnit.test(
    "shadeColour_Lightens_WhenPassedBlackAndAPositivePercentage",
    (assert) => {
        var colour = structurizr.util.shadeColor("#000000", 50);
        assert.equal(colour, "#808080");
    },
);
