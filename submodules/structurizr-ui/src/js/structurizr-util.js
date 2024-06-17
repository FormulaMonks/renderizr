structurizr.util.Stack = class Stack {
    #stack = [];

    pop() {
        return this.#stack.pop();
    }

    push(item) {
        this.#stack.push(item);
    }

    peek() {
        if (this.isEmpty()) {
            return undefined;
        } else {
            return this.#stack[this.#stack.length - 1];
        }
    }

    isEmpty() {
        return this.#stack.length === 0;
    }

    count() {
        return this.#stack.length;
    }
};

structurizr.util.selectText = (id) => {
    if (window.getSelection()) {
        var range = document.createRange();
        range.selectNode(document.getElementById(id));
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
    }
};

structurizr.util.dataURIToBlob = (dataURI) => {
    // data:image/png;base64,xxx
    var binaryString = atob(dataURI.split(",")[1]);
    var length = binaryString.length;
    var array = new Uint8Array(length);
    var mimeType = dataURI.split(",")[0].split(":")[1].split(";")[0];

    for (var i = 0; i < length; i++) {
        array[i] = binaryString.charCodeAt(i);
    }

    return new Blob([array], {
        type: mimeType,
    });
};

structurizr.util.downloadFile = (content, contentType, filename) => {
    var blob = new Blob([content], { type: contentType });
    var url = URL.createObjectURL(blob);

    var link = document.createElement("a");
    link.download = filename;
    link.href = url;

    document.body.appendChild(link);
    link.click();
    link.remove();
};

structurizr.util.toBlob = (content, contentType) => new Blob([content], { type: contentType });

structurizr.util.escapeHtml = (html) => {
    if (html) {
        return html
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    } else {
        return undefined;
    }
};

structurizr.util.trim = (s) => {
    if (s === undefined || s === null) {
        return "";
    } else {
        return s.trim();
    }
};

structurizr.util.btoa = (plain) => CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(plain));

structurizr.util.atob = (encoded) => CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(encoded));

structurizr.util.exportWorkspace = (id, json) => {
    const jsonAsString = JSON.stringify(json, null, "    ");
    const filename = "structurizr-" + id + "-workspace.json";
    structurizr.util.downloadFile(
        jsonAsString,
        "text/plain;charset=utf-8",
        filename,
    );
};

structurizr.util.copyAttributeIfSpecified = (
    source,
    destination,
    name,
) => {
    if (source.hasOwnProperty(name)) {
        destination[name] = source[name];
    }
};

structurizr.util.shadeColor = (color, percentAsInteger, darkMode) => {
    if (darkMode === true) {
        percentAsInteger = -percentAsInteger;
    }

    var percent = 0;
    if (percentAsInteger === 0) {
        percent = 0;
    } else {
        if (percentAsInteger > 90) {
            percent = 0.9; // let's cap how much we shade the colour, so it doesn't become white
        } else {
            percent = percentAsInteger / 100;
        }
    }
    const f = Number.parseInt(color.slice(1), 16),
        t = percent < 0 ? 0 : 255,
        p = percent < 0 ? percent * -1 : percent,
        R = f >> 16,
        G = (f >> 8) & 0x00ff,
        B = f & 0x0000ff;
    return (
        "#" +
        (
            0x1000000 +
            (Math.round((t - R) * p) + R) * 0x10000 +
            (Math.round((t - G) * p) + G) * 0x100 +
            (Math.round((t - B) * p) + B)
        )
            .toString(16)
            .slice(1)
    );
};

if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (searchString, position) {
        return this.substr(position || 0, searchString.length) === searchString;
    };
}
