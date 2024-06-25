import Page from "./_page";

export default class Docs extends Page {
    render() {
        this.container!.innerHTML = `
            <h2>Documentation</h2>
            <p>Some documentation here...</p>
        `;
    }
    clear(): void {
        this.container!.innerHTML = "";
    }
}
