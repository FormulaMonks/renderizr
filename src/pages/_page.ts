import type Component from "../components/_component";

export default abstract class Page {
    components = new Map<string, Component>();

    constructor(public container: HTMLElement) {}

    getContainer(): HTMLElement {
        return this.container;
    }

    /**
     * Add a component to the page
     */
    addComponent<C extends Component>(component: C): C {
        this.components.set(component.constructor.name, component);

        return component;
    }

    /**
     * Removes all registered components
     */
    removeAllComponents(): void {
        for (const component of this.components.values()) {
            component.clear();
        }
    }

    /**
     * Render the page and add event listeners
     */
    abstract render(): void;

    /**
     * Clear the page and remove all event listeners
     */
    abstract clear(): void;
}
