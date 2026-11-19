/**
 * The types of `documentation-classes.js`, the class names the build writes
 * into rendered documentation. The names stay plain JavaScript so the build
 * and the page read one copy; this file lets the page's TypeScript import
 * it.
 */

/** Each kind of markup the build writes a class name on. */
type ClassRole =
    | "tableWrap"
    | "alert"
    | "alertTitle"
    | "alertNote"
    | "alertTip"
    | "alertImportant"
    | "alertWarning"
    | "alertCaution"
    | "unresolvedLink"
    | "mathDisplay"
    | "collapsed"
    | "collapsedSummary"
    | "taskList"
    | "taskListItem"
    | "taskListCheckbox"
    | "menu"
    | "schemeLight"
    | "schemeDark"
    | "footnotes"
    | "footnoteRef"
    | "footnoteBackref"
    | "diagramCard"
    | "diagramCardIcon"
    | "diagramCardText"
    | "diagramCardType"
    | "diagramCardTitle"
    | "diagramCardOpen"
    | "diagramNote"
    | "diagramNoteSource";

/** The class name of each kind of markup the build writes, by its role. */
export declare const CLASSES: Readonly<Record<ClassRole, string>>;
