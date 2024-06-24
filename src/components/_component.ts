export default abstract class Component {
    /**
     * Render the component and add event listeners
     */
    abstract render(): void;
    /**
     * Clear the component and remove all event listeners
     */
    abstract clear(): void;
}
