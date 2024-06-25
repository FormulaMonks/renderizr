export default abstract class Component {
    constructor(public element: HTMLElement | null) {
        this.element = element;
    }

    /**
     * Render the component and add event listeners
     */
    abstract render(): void;
    /**
     * Clear the component and remove all event listeners
     */
    abstract clear(): void;
}
