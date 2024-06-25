import Page from "./_page";

export default class Decisions extends Page {
    render() {
        this.container!.innerHTML = `
            <h2>Decisions</h2>
            <p>Some decisions here...</p>
        `;
    }
    clear(): void {
        this.container!.innerHTML = "";
    }
}
