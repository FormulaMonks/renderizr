/**
 * The keys Structurizr's model defines (spec 7.2, ADR 17): what edit mode's
 * writer keeps when it reads `workspace.json` the way Structurizr does. A key
 * missing here is one Structurizr drops, so the writer drops it too.
 */

// Structurizr workspace JSON schema, as seen by "a Structurizr read followed by a Structurizr write".
//
// Source: submodules/structurizr (structurizr/structurizr v6.2.2), modules structurizr-core and
// structurizr-client. All paths below are relative to submodules/structurizr/.
//   core = structurizr-core/src/main/java/com/structurizr
//
// How this was derived (not guessed):
//   1. Read the Java classes and the Jackson config in
//      structurizr-client/src/main/java/com/structurizr/io/json/{AbstractJsonReader,AbstractJsonWriter}.java.
//   2. Compiled the submodule's core sources plus io/json against the exact Jackson jars Structurizr
//      2026.09.19 ships (jackson-databind 2.21.2, jackson-annotations 2.21) and asked Jackson itself for
//      the BeanDeserializer properties (read) and BeanSerializer properties (write) of every reachable type.
//   3. Round-tripped the repo fixtures plus a hand-made edge-case workspace through JsonReader + JsonWriter.
//
// STRUCTURIZR_TYPES lists only keys that are BOTH read and written (they survive a round trip).
// Keys that are written but never read (computed) are in STRUCTURIZR_COMPUTED_KEYS; keys that are read
// but never written (legacy aliases folded into another key) are in STRUCTURIZR_READ_ALIASES.
// Any other key in the input is silently dropped (FAIL_ON_UNKNOWN_PROPERTIES=false).
//
// Kinds:
//   "value"          string or boolean scalar (strings: Jackson coerces a JSON number/boolean to a string)
//   "int"            Java int/long/Integer: a JSON fraction truncates toward zero (10.7 -> 10, -5.7 -> -5),
//                    a numeric string ("20") is accepted. There are NO double-typed keys in the schema.
//   "enum:<Name>"    see STRUCTURIZR_ENUMS; an unknown value reads as null and is then omitted
//                    (READ_UNKNOWN_ENUM_VALUES_AS_NULL), except where a setter rejects null (see notes)
//   "<Type>"         nested object
//   ["<Type>"]       array of objects; ["value"] array of strings
//   { map: "value" } string-keyed map of strings (values coerced to strings: 1 -> "1", true -> "true")

export const ROOT_TYPE = "Workspace";

export const STRUCTURIZR_TYPES = {
    // com.structurizr.Workspace extends AbstractWorkspace
    // core/Workspace.java, core/AbstractWorkspace.java
    Workspace: {
        configuration: "WorkspaceConfiguration",
        description: "value",
        documentation: "Documentation", // written as {} when present in the input; omitted when absent (no-arg ctor leaves it null)
        id: "int", // long; written even when 0
        lastModifiedAgent: "value",
        lastModifiedDate: "value", // java.util.Date; written as "yyyy-MM-dd'T'HH:mm:ss'Z'" in UTC (millis dropped)
        lastModifiedUser: "value",
        model: "Model",
        name: "value",
        properties: { map: "value" },
        thumbnail: "value",
        version: "value",
        views: "ViewSet",
    },

    // com.structurizr.configuration.WorkspaceConfiguration
    // core/configuration/WorkspaceConfiguration.java
    WorkspaceConfiguration: {
        scope: "enum:WorkspaceScope",
        users: ["User"], // TreeSet: sorted by username, duplicates by username collapse
        visibility: "enum:Visibility",
    },

    // com.structurizr.configuration.User
    // core/configuration/User.java
    User: {
        role: "enum:Role",
        username: "value",
    },

    // com.structurizr.documentation.Documentation
    // core/documentation/Documentation.java
    Documentation: {
        decisions: ["Decision"], // TreeSet: sorted by id (string compare)
        images: ["Image"], // TreeSet: sorted by name
        sections: ["Section"], // List: input order kept
    },

    // com.structurizr.documentation.Section extends DocumentationContent
    // core/documentation/Section.java, core/documentation/DocumentationContent.java
    // (also always writes "title": "" -- see STRUCTURIZR_COMPUTED_KEYS)
    Section: {
        content: "value", // setter normalizes \r\n and \r to \n
        elementId: "value", // legacy, unused
        filename: "value",
        format: "enum:Format",
        order: "int",
    },

    // com.structurizr.documentation.Decision extends DocumentationContent
    // core/documentation/Decision.java, core/documentation/DocumentationContent.java
    Decision: {
        content: "value",
        date: "value", // java.util.Date; ISO-8601 or epoch millis in, "yyyy-MM-dd'T'HH:mm:ss'Z'" UTC out
        elementId: "value",
        format: "enum:Format",
        id: "value",
        links: ["DecisionLink"], // TreeSet: sorted by id
        status: "value",
        title: "value",
    },

    // com.structurizr.documentation.Decision.Link (static nested class)
    // core/documentation/Decision.java
    DecisionLink: {
        description: "value",
        id: "value",
    },

    // com.structurizr.documentation.Image
    // core/documentation/Image.java
    Image: {
        content: "value",
        name: "value",
        type: "value",
    },

    // com.structurizr.model.Model
    // core/model/Model.java
    // NOTE: no "enterprise" key any more (core/model/Enterprise.java exists but nothing references it).
    Model: {
        customElements: ["CustomElement"],
        deploymentNodes: ["DeploymentNode"],
        people: ["Person"],
        properties: { map: "value" },
        softwareSystems: ["SoftwareSystem"],
    },

    // com.structurizr.model.Person extends StaticStructureElement > GroupableElement > Element > ModelItem
    // core/model/Person.java (+ StaticStructureElement.java, GroupableElement.java, Element.java, ModelItem.java)
    // NOTE: no "location" key any more (core/model/Location.java exists but nothing references it).
    Person: {
        description: "value",
        group: "value",
        id: "value",
        name: "value",
        perspectives: ["Perspective"],
        properties: { map: "value" },
        relationships: ["Relationship"],
        tags: "value", // see notes: default tags "Element,Person" are always prepended
        url: "value", // setter validates; invalid URL fails the read
    },

    // com.structurizr.model.SoftwareSystem extends StaticStructureElement
    // core/model/SoftwareSystem.java
    SoftwareSystem: {
        containers: ["Container"],
        description: "value",
        documentation: "Documentation", // always written (field initialized to new Documentation(), so {} at minimum)
        group: "value",
        id: "value",
        name: "value",
        perspectives: ["Perspective"],
        properties: { map: "value" },
        relationships: ["Relationship"],
        tags: "value", // defaults "Element,Software System"
        url: "value",
    },

    // com.structurizr.model.Container extends StaticStructureElement
    // core/model/Container.java
    Container: {
        components: ["Component"],
        description: "value",
        documentation: "Documentation", // always written, {} at minimum
        group: "value",
        id: "value",
        name: "value",
        perspectives: ["Perspective"],
        properties: { map: "value" },
        relationships: ["Relationship"],
        tags: "value", // defaults "Element,Container"
        technology: "value",
        url: "value",
    },

    // com.structurizr.model.Component extends StaticStructureElement
    // core/model/Component.java
    Component: {
        description: "value",
        documentation: "Documentation", // always written, {} at minimum
        group: "value",
        id: "value",
        name: "value",
        perspectives: ["Perspective"],
        properties: { map: "value" },
        relationships: ["Relationship"],
        tags: "value", // defaults "Element,Component"
        technology: "value",
        url: "value",
    },

    // com.structurizr.model.CustomElement extends GroupableElement
    // core/model/CustomElement.java
    // (getParent() is not @JsonIgnore'd here, so Jackson knows a write-only "parent", but it always
    //  returns null and is never emitted.)
    CustomElement: {
        description: "value",
        group: "value",
        id: "value",
        metadata: "value",
        name: "value",
        perspectives: ["Perspective"],
        properties: { map: "value" },
        relationships: ["Relationship"],
        tags: "value", // defaults "Element"
        url: "value",
    },

    // com.structurizr.model.DeploymentNode extends DeploymentElement > GroupableElement
    // core/model/DeploymentNode.java, core/model/DeploymentElement.java
    DeploymentNode: {
        children: ["DeploymentNode"],
        containerInstances: ["ContainerInstance"],
        deploymentGroups: ["value"], // TreeSet<String>: sorted, deduped
        description: "value",
        environment: "value", // defaults to "Default" and is then always written
        group: "value",
        id: "value",
        infrastructureNodes: ["InfrastructureNode"],
        instances: "value", // String! a JSON number is coerced (3 -> "3"); defaults to "1" and is always written;
        //                     setter validates: positive int, "a..b", "a..N" or "a..*", else the read fails
        name: "value",
        perspectives: ["Perspective"],
        properties: { map: "value" },
        relationships: ["Relationship"],
        softwareSystemInstances: ["SoftwareSystemInstance"],
        tags: "value", // defaults "Element,Deployment Node"
        technology: "value",
        url: "value",
    },

    // com.structurizr.model.InfrastructureNode extends DeploymentElement
    // core/model/InfrastructureNode.java
    InfrastructureNode: {
        description: "value",
        environment: "value", // defaults to "Default", always written
        group: "value",
        id: "value",
        name: "value",
        perspectives: ["Perspective"],
        properties: { map: "value" },
        relationships: ["Relationship"],
        tags: "value", // defaults "Element,Infrastructure Node"
        technology: "value",
        url: "value",
    },

    // com.structurizr.model.SoftwareSystemInstance extends StaticStructureElementInstance > DeploymentElement
    // core/model/SoftwareSystemInstance.java, core/model/StaticStructureElementInstance.java
    // NOTE: no "name" (getName() is @JsonIgnore, setName() is a no-op), no "technology".
    SoftwareSystemInstance: {
        deploymentGroups: ["value"], // TreeSet<String>
        description: "value",
        environment: "value", // defaults to "Default", always written
        group: "value",
        healthChecks: ["HttpHealthCheck"], // TreeSet: sorted by name then url
        id: "value",
        instanceId: "int", // written even when 0
        perspectives: ["Perspective"],
        properties: { map: "value" },
        relationships: ["Relationship"],
        softwareSystemId: "value",
        tags: "value", // no default tags: written exactly as read (omitted when empty)
        url: "value",
    },

    // com.structurizr.model.ContainerInstance extends StaticStructureElementInstance
    // core/model/ContainerInstance.java, core/model/StaticStructureElementInstance.java
    ContainerInstance: {
        containerId: "value",
        deploymentGroups: ["value"],
        description: "value",
        environment: "value", // defaults to "Default", always written
        group: "value",
        healthChecks: ["HttpHealthCheck"],
        id: "value",
        instanceId: "int",
        perspectives: ["Perspective"],
        properties: { map: "value" },
        relationships: ["Relationship"],
        tags: "value", // no default tags
        url: "value",
    },

    // com.structurizr.model.Relationship extends ModelItem
    // core/model/Relationship.java, core/model/ModelItem.java
    Relationship: {
        description: "value", // getter returns "" for null, so a missing description stays omitted
        destinationId: "value",
        id: "value",
        interactionStyle: "enum:InteractionStyle",
        linkedRelationshipId: "value",
        perspectives: ["Perspective"],
        properties: { map: "value" },
        sourceId: "value",
        tags: "value", // defaults "Relationship" plus "Synchronous"/"Asynchronous" from interactionStyle;
        //                no defaults when linkedRelationshipId is set
        technology: "value",
        url: "value",
    },

    // com.structurizr.model.Perspective
    // core/model/Perspective.java
    Perspective: {
        description: "value",
        name: "value",
        url: "value",
        value: "value",
    },

    // com.structurizr.model.HttpHealthCheck
    // core/model/HttpHealthCheck.java
    HttpHealthCheck: {
        headers: { map: "value" }, // no setter: read straight into the private final field
        interval: "int",
        name: "value",
        timeout: "int", // long
        url: "value",
    },

    // com.structurizr.view.ViewSet
    // core/view/ViewSet.java
    ViewSet: {
        componentViews: ["ComponentView"],
        configuration: "Configuration", // always written (field initialized), at least {"styles":{},"terminology":{}}
        containerViews: ["ContainerView"],
        customViews: ["CustomView"],
        deploymentViews: ["DeploymentView"],
        dynamicViews: ["DynamicView"],
        filteredViews: ["FilteredView"],
        imageViews: ["ImageView"],
        systemContextViews: ["SystemContextView"],
        systemLandscapeViews: ["SystemLandscapeView"],
    },

    // com.structurizr.view.SystemLandscapeView extends StaticView > ModelView > View
    // core/view/SystemLandscapeView.java (+ StaticView.java, ModelView.java, View.java)
    SystemLandscapeView: {
        animations: ["Animation"],
        automaticLayout: "AutomaticLayout",
        description: "value",
        dimensions: "Dimensions",
        elements: ["ElementView"],
        enterpriseBoundaryVisible: "value", // boolean, defaults true, always written
        generatedKey: "value", // boolean, @JsonInclude(NON_DEFAULT): false is omitted
        key: "value", // setter replaces "/" with "_"
        order: "int", // see notes on clamping
        paperSize: "enum:PaperSize",
        properties: { map: "value" },
        relationships: ["RelationshipView"],
        softwareSystemId: "value",
        title: "value",
    },

    // com.structurizr.view.SystemContextView extends StaticView
    // core/view/SystemContextView.java
    SystemContextView: {
        animations: ["Animation"],
        automaticLayout: "AutomaticLayout",
        description: "value",
        dimensions: "Dimensions",
        elements: ["ElementView"],
        enterpriseBoundaryVisible: "value", // boolean, defaults true, always written
        generatedKey: "value",
        key: "value",
        order: "int",
        paperSize: "enum:PaperSize",
        properties: { map: "value" },
        relationships: ["RelationshipView"],
        softwareSystemId: "value",
        title: "value",
    },

    // com.structurizr.view.ContainerView extends StaticView
    // core/view/ContainerView.java
    ContainerView: {
        animations: ["Animation"],
        automaticLayout: "AutomaticLayout",
        description: "value",
        dimensions: "Dimensions",
        elements: ["ElementView"],
        externalSoftwareSystemBoundariesVisible: "value", // boolean, defaults false, always written
        generatedKey: "value",
        key: "value",
        order: "int",
        paperSize: "enum:PaperSize",
        properties: { map: "value" },
        relationships: ["RelationshipView"],
        softwareSystemId: "value",
        title: "value",
    },

    // com.structurizr.view.ComponentView extends StaticView
    // core/view/ComponentView.java
    // NOTE: no softwareSystemId (getSoftwareSystemId() is @JsonIgnore here, ComponentView.java:29-31).
    ComponentView: {
        animations: ["Animation"],
        automaticLayout: "AutomaticLayout",
        containerId: "value",
        description: "value",
        dimensions: "Dimensions",
        elements: ["ElementView"],
        externalContainerBoundariesVisible: "value", // boolean, defaults false, always written; read via the
        //   private field because the setter is misnamed setExternalSoftwareSystemBoundariesVisible (ComponentView.java:316)
        generatedKey: "value",
        key: "value",
        order: "int",
        paperSize: "enum:PaperSize",
        properties: { map: "value" },
        relationships: ["RelationshipView"],
        title: "value",
    },

    // com.structurizr.view.DynamicView extends ModelView (no animations)
    // core/view/DynamicView.java
    // NOTE: no softwareSystemId (@JsonIgnore, DynamicView.java:70-71).
    DynamicView: {
        automaticLayout: "AutomaticLayout",
        description: "value",
        dimensions: "Dimensions",
        elementId: "value",
        elements: ["ElementView"],
        externalBoundariesVisible: "value", // boolean (deprecated), defaults false, always written
        generatedKey: "value",
        key: "value",
        order: "int",
        paperSize: "enum:PaperSize",
        properties: { map: "value" },
        relationships: ["RelationshipView"], // written sorted by RelationshipView.order (numeric if all numeric)
        title: "value",
    },

    // com.structurizr.view.DeploymentView extends ModelView
    // core/view/DeploymentView.java
    DeploymentView: {
        animations: ["Animation"],
        automaticLayout: "AutomaticLayout",
        description: "value",
        dimensions: "Dimensions",
        elements: ["ElementView"],
        environment: "value", // defaults to "Default", always written
        generatedKey: "value",
        key: "value",
        order: "int",
        paperSize: "enum:PaperSize",
        properties: { map: "value" },
        relationships: ["RelationshipView"],
        softwareSystemId: "value",
        title: "value",
    },

    // com.structurizr.view.CustomView extends ModelView
    // core/view/CustomView.java
    CustomView: {
        animations: ["Animation"],
        automaticLayout: "AutomaticLayout",
        description: "value",
        dimensions: "Dimensions",
        elements: ["ElementView"],
        generatedKey: "value",
        key: "value",
        order: "int",
        paperSize: "enum:PaperSize",
        properties: { map: "value" },
        relationships: ["RelationshipView"],
        softwareSystemId: "value", // inherited from ModelView; not ignored here (normally absent)
        title: "value",
    },

    // com.structurizr.view.FilteredView extends View
    // core/view/FilteredView.java
    FilteredView: {
        baseViewKey: "value",
        description: "value",
        generatedKey: "value",
        key: "value",
        mode: "enum:FilterMode",
        order: "int",
        properties: { map: "value" },
        tags: ["value"], // no setter: read into the private field; written sorted (TreeSet copy)
        title: "value",
    },

    // com.structurizr.view.ImageView extends View
    // core/view/ImageView.java
    ImageView: {
        content: "value", // setContent validates (ImageUtils.validateImage) and trims
        contentDark: "value", // no 1-arg setter: read into the private field, no validation
        contentLight: "value", // same
        contentType: "value",
        description: "value",
        elementId: "value",
        generatedKey: "value",
        key: "value",
        order: "int",
        properties: { map: "value" },
        title: "value",
    },

    // com.structurizr.view.ElementView
    // core/view/ElementView.java
    ElementView: {
        id: "value",
        x: "int", // always written; a missing x/y is written as 0
        y: "int",
    },

    // com.structurizr.view.RelationshipView
    // core/view/RelationshipView.java
    RelationshipView: {
        description: "value", // getter returns "" for null -> omitted
        id: "value",
        jump: "value", // Boolean, @JsonInclude(NON_NULL): false is written
        order: "value", // String! a JSON number is coerced (3 -> "3"); getter returns "" for null -> omitted
        position: "int", // Integer, @JsonInclude(NON_NULL); clamped to 0..100 by the setter
        properties: { map: "value" },
        response: "value", // Boolean via isResponse(); written when non-null
        routing: "enum:Routing", // @JsonInclude(NON_NULL)
        url: "value",
        vertices: ["Vertex"], // List: input order kept
    },

    // com.structurizr.view.Vertex
    // core/view/Vertex.java
    Vertex: {
        x: "int",
        y: "int",
    },

    // com.structurizr.view.AutomaticLayout
    // core/view/AutomaticLayout.java
    // NOTE: legacy "implementation" and "applied" keys are dropped.
    AutomaticLayout: {
        edgeSeparation: "int", // setter throws on < 0
        nodeSeparation: "int", // setter throws on < 0
        rankDirection: "enum:RankDirection", // setter throws on null, so an unknown value FAILS the read
        rankSeparation: "int", // setter throws on < 0
        vertices: "value", // boolean, always written
    },

    // com.structurizr.view.Dimensions
    // core/view/Dimensions.java
    Dimensions: {
        height: "int", // setter throws on < 0
        width: "int",
    },

    // com.structurizr.view.Animation
    // core/view/Animation.java
    Animation: {
        elements: ["value"], // TreeSet<String>: sorted (string order), deduped
        order: "int",
        relationships: ["value"], // TreeSet<String>
    },

    // com.structurizr.view.Configuration (views.configuration)
    // core/view/Configuration.java
    // NOTE: no "branding" any more (removed from the library, changelog-library.md:72); no "font".
    Configuration: {
        // Kept although the 2026 library dropped it: structurizr-java 5,
        // which `structurizr-cli` still runs, writes it (as `{ }` when
        // unset), and the files edit mode round-trips byte for byte carry it.
        branding: "Branding",
        defaultView: "value",
        lastSavedView: "value", // package-private getter with @JsonGetter
        metadataSymbols: "enum:MetadataSymbols",
        properties: { map: "value" },
        styles: "Styles", // always written, {} at minimum
        terminology: "Terminology", // always written, {} at minimum
        themes: ["value"], // filtered on read: only installed theme names or URLs kept, URLs deduped (see notes)
        viewSortOrder: "enum:ViewSortOrder",
    },

    // com.structurizr.view.Branding and Font, structurizr-java 5.0.2
    // (structurizr-core/src/main/java/com/structurizr/view/Branding.java)
    Branding: {
        font: "Font",
        logo: "value",
    },
    Font: {
        name: "value",
        url: "value",
    },

    // com.structurizr.view.Styles
    // core/view/Styles.java
    Styles: {
        elements: ["ElementStyle"], // no setter: read into the field as a plain list, so input order AND duplicates are kept
        relationships: ["RelationshipStyle"], // same
    },

    // com.structurizr.view.ElementStyle extends AbstractStyle
    // core/view/ElementStyle.java, core/view/AbstractStyle.java
    // All style fields are @JsonInclude(NON_NULL) (ElementStyle.java:12-52).
    ElementStyle: {
        background: "value", // hex or HTML colour name in, lower-case hex out; invalid colour FAILS the read
        border: "enum:Border",
        color: "value", // same colour handling
        colorScheme: "enum:ColorScheme",
        description: "value", // Boolean
        fontSize: "int",
        height: "int",
        icon: "value", // validated (ImageUtils.validateImage) and trimmed; "" -> null
        iconPosition: "enum:IconPosition",
        metadata: "value", // Boolean
        opacity: "int", // clamped to 0..100
        properties: { map: "value" },
        shape: "enum:Shape",
        stroke: "value", // same colour handling
        strokeWidth: "int", // clamped to 1..10
        tag: "value",
        width: "int",
    },

    // com.structurizr.view.RelationshipStyle extends AbstractStyle
    // core/view/RelationshipStyle.java, core/view/AbstractStyle.java
    // All style fields are @JsonInclude(NON_NULL) (RelationshipStyle.java:12-55).
    RelationshipStyle: {
        color: "value", // hex or colour name in, lower-case hex out; invalid FAILS the read
        colorScheme: "enum:ColorScheme",
        dashed: "value", // Boolean (legacy, alongside style)
        description: "value", // Boolean
        fontSize: "int",
        jump: "value", // Boolean
        metadata: "value", // Boolean
        opacity: "int", // clamped to 0..100
        position: "int", // clamped to 0..100
        properties: { map: "value" },
        routing: "enum:Routing",
        style: "enum:LineStyle",
        tag: "value",
        thickness: "int", // not clamped
        width: "int",
    },

    // com.structurizr.view.Terminology
    // core/view/Terminology.java (every field @JsonInclude(NON_EMPTY), defaults "")
    Terminology: {
        code: "value",
        component: "value",
        container: "value",
        deploymentNode: "value",
        enterprise: "value",
        infrastructureNode: "value",
        person: "value",
        relationship: "value",
        softwareSystem: "value",
    },
};

// Keys Structurizr WRITES although it never reads them back (computed on write). A writer that mimics
// "read then write" emits these; a reader must not expect them to influence anything.
export const STRUCTURIZR_COMPUTED_KEYS = {
    // Section.getTitle() is @JsonGetter @JsonInclude(ALWAYS) and returns "" (Section.java:25-29)
    Section: { title: 'always ""' },
    // View.getName() is abstract and not ignored (View.java:119); every view type writes "name":
    SystemLandscapeView: { name: '"System Landscape View"' },
    SystemContextView: {
        name: '"System Context View: <software system name>"',
    },
    ContainerView: { name: '"Container View: <software system name>"' },
    ComponentView: {
        name: '"Component View: <software system name> - <container name>"',
    },
    DynamicView: {
        name: '"Dynamic View: <element name>", "Dynamic View: <system> - <container>" for a container, or "Dynamic View"',
    },
    DeploymentView: {
        name: '"Deployment View: <environment>" or "Deployment View: <software system> - <environment>"',
    },
    CustomView: { name: '"Custom View: " + title' },
    FilteredView: { name: '"Filtered: " + base view name' },
    ImageView: { name: "the view title" },
};

// Keys Structurizr READS but never writes under the same name (legacy aliases).
export const STRUCTURIZR_READ_ALIASES = {
    ViewSet: {
        enterpriseContextViews:
            "replaces systemLandscapeViews (ViewSet.java:763-768)",
    },
    Configuration: {
        theme: "a single string, appended to themes (Configuration.java:50-53)",
    },
    SoftwareSystemInstance: {
        deploymentGroup:
            "string, becomes deploymentGroups: [it] (StaticStructureElementInstance.java:64-67)",
    },
    ContainerInstance: {
        deploymentGroup: "string, becomes deploymentGroups: [it]",
    },
    // Bug, not an alias: ComponentView reads "externalSoftwareSystemBoundariesVisible" into
    // externalContainerBoundariesVisible (misnamed setter, ComponentView.java:316).
    ComponentView: {
        externalSoftwareSystemBoundariesVisible:
            "sets externalContainerBoundariesVisible",
    },
};

export const STRUCTURIZR_ENUMS = {
    // core/configuration/WorkspaceScope.java
    WorkspaceScope: ["Landscape", "SoftwareSystem"],
    // core/configuration/Visibility.java
    Visibility: ["Private", "Public"],
    // core/configuration/Role.java
    Role: ["ReadWrite", "ReadOnly"],
    // core/documentation/Format.java
    Format: ["Markdown", "AsciiDoc"],
    // core/model/InteractionStyle.java
    InteractionStyle: ["Synchronous", "Asynchronous"],
    // core/view/PaperSize.java
    PaperSize: [
        "A6_Portrait",
        "A6_Landscape",
        "A5_Portrait",
        "A5_Landscape",
        "A4_Portrait",
        "A4_Landscape",
        "A3_Portrait",
        "A3_Landscape",
        "A2_Portrait",
        "A2_Landscape",
        "A1_Portrait",
        "A1_Landscape",
        "A0_Portrait",
        "A0_Landscape",
        "Letter_Portrait",
        "Letter_Landscape",
        "Legal_Portrait",
        "Legal_Landscape",
        "Slide_4_3",
        "Slide_16_9",
        "Slide_16_10",
    ],
    // core/view/Routing.java
    Routing: ["Direct", "Curved", "Orthogonal"],
    // core/view/AutomaticLayout.java (nested enum AutomaticLayout.RankDirection)
    RankDirection: ["TopBottom", "BottomTop", "LeftRight", "RightLeft"],
    // core/view/FilterMode.java
    FilterMode: ["Include", "Exclude"],
    // core/view/MetadataSymbols.java
    MetadataSymbols: [
        "SquareBrackets",
        "RoundBrackets",
        "CurlyBrackets",
        "AngleBrackets",
        "DoubleAngleBrackets",
        "None",
    ],
    // core/view/ViewSortOrder.java
    ViewSortOrder: ["Default", "Type", "Key"],
    // core/view/ColorScheme.java
    ColorScheme: ["Light", "Dark"],
    // core/view/Shape.java
    Shape: [
        "Box",
        "RoundedBox",
        "Circle",
        "Ellipse",
        "Hexagon",
        "Diamond",
        "Cylinder",
        "Bucket",
        "Pipe",
        "Person",
        "Robot",
        "Folder",
        "WebBrowser",
        "Window",
        "Terminal",
        "Shell",
        "MobileDevicePortrait",
        "MobileDeviceLandscape",
        "Component",
    ],
    // core/view/Border.java
    Border: ["Solid", "Dashed", "Dotted"],
    // core/view/LineStyle.java
    LineStyle: ["Dashed", "Dotted", "Solid"],
    // core/view/IconPosition.java
    IconPosition: ["Top", "Bottom", "Left"],
    // core/model/Location.java: ["Internal", "External", "Unspecified"] is NOT reachable any more
    // (no element has a "location" property), so it is deliberately left out.
    // structurizr-java 5.0.2: AutomaticLayout.Implementation
    AutomaticLayoutImplementation: ["Graphviz", "Dagre"],
};

/*
 * Keys the writer keeps as found although the 2026 library would compute or
 * drop them. Structurizr writes a view's `name` and a section's `title` on
 * every write, so a file Structurizr wrote carries them and the writer, which
 * computes nothing, keeps them. structurizr-java 5, which `structurizr-cli`
 * runs, still reads and writes `implementation` and `applied`.
 */
for (const type of [
    "SystemLandscapeView",
    "SystemContextView",
    "ContainerView",
    "ComponentView",
    "DynamicView",
    "DeploymentView",
    "CustomView",
    "FilteredView",
    "ImageView",
]) {
    STRUCTURIZR_TYPES[type].name = "value";
}
STRUCTURIZR_TYPES.Section.title = "value";
STRUCTURIZR_TYPES.AutomaticLayout.implementation =
    "enum:AutomaticLayoutImplementation";
STRUCTURIZR_TYPES.AutomaticLayout.applied = "value";

/*
 * Answers to the "Also report" questions. Paths are relative to submodules/structurizr/;
 * client = structurizr-client/src/main/java/com/structurizr, core = structurizr-core/src/main/java/com/structurizr,
 * app = structurizr-application/src/main/java/com/structurizr.
 *
 * 1. Mapper configuration
 *    - Reader: plain `new ObjectMapper()` with ACCEPT_EMPTY_STRING_AS_NULL_OBJECT,
 *      FAIL_ON_UNKNOWN_PROPERTIES=false, READ_UNKNOWN_ENUM_VALUES_AS_NULL=true
 *      (client/io/json/AbstractJsonReader.java:9-12). Default visibility, so setters of ANY visibility
 *      (package-private/protected) are used, and INFER_PROPERTY_MUTATORS lets a private field back a
 *      public getter that has no setter (FilteredView.tags, ImageView.contentLight/contentDark,
 *      HttpHealthCheck.headers, Styles.elements/relationships, ViewSet.configuration, Configuration.styles,
 *      ComponentView.externalContainerBoundariesVisible). Then JsonReader calls workspace.hydrate()
 *      (client/io/json/JsonReader.java:45), which throws WorkspaceValidationException on dangling ids,
 *      duplicate names, duplicate view keys, etc. (core/model/Model.java:412-475, core/view/ViewSet.java:892-1052).
 *    - Writer: JsonMapper with SORT_PROPERTIES_ALPHABETICALLY (client/io/json/AbstractJsonWriter.java:17-19),
 *      INDENT_OUTPUT when indenting (:21-23), inclusion NON_NULL then NON_EMPTY (:25-26; the second call
 *      wins, so the global rule is NON_EMPTY), date format "yyyy-MM-dd'T'HH:mm:ss'Z'" in UTC (:14, :28-30).
 *    - No mixins, no @JsonTypeInfo, no custom (de)serializers, no @JsonPropertyOrder anywhere in core/client.
 *      Every collection is declared with a concrete final element type, so no polymorphism is involved.
 *    - Pretty printer is Jackson's default: 2-space indent, `"key" : value`, arrays as `[ {` ... `}, {` ... `} ]`,
 *      empty objects as `{ }`.
 *
 * 2. Property order on write
 *    Alphabetical within every object (MapperFeature.SORT_PROPERTIES_ALPHABETICALLY,
 *    AbstractJsonWriter.java:19); no @JsonPropertyOrder overrides it. Map keys (properties, headers) are
 *    NOT sorted (ORDER_MAP_ENTRIES_BY_KEYS is off): they come out in HashMap order for properties
 *    (effectively arbitrary) and TreeMap (sorted) order for HttpHealthCheck.headers.
 *    Array order is NOT preserved for most collections, because the setters copy into TreeSets:
 *      - model elements and relationships: by numeric id when both ids parse as ints, else by string
 *        (core/model/ModelItem.java:282-291)
 *      - views: by order, then key case-insensitively (core/view/View.java:169-176)
 *      - ElementView: by numeric id, else string (core/view/ElementView.java:104-113)
 *      - RelationshipView: by the string id + "/" + order (core/view/RelationshipView.java:312-317);
 *        DynamicView re-sorts its relationships by order, numerically when every order parses as a number
 *        (core/view/DynamicView.java:389-404)
 *      - perspectives by name, health checks by name then url, users by username, decisions/links by id,
 *        images by name; deploymentGroups, Animation.elements/relationships and FilteredView.tags as sorted strings
 *      Kept in input order: documentation.sections, RelationshipView.vertices, views.configuration.themes,
 *      styles.elements and styles.relationships (field-backed plain lists: duplicates kept too).
 *    TreeSets also collapse duplicates by the same comparison (two ElementViews with the same id become one).
 *
 * 3. Omission rules (global NON_EMPTY, Jackson 2.21)
 *    - null, "" (empty string), empty arrays/sets and empty maps are omitted.
 *    - 0, false and empty OBJECTS are NOT omitted: NON_EMPTY stopped treating default primitives as empty
 *      in Jackson 2.7, and beans are never "empty". Observed: "id" : 0, "x" : 0, "y" : 0, "order" : 0,
 *      "instanceId" : 0, "externalBoundariesVisible" : false, "vertices" : false, "configuration" : { },
 *      "documentation" : { }.
 *    - Primitive int/boolean fields therefore always appear once the object exists, even when absent from
 *      the input (default 0/false/true). Examples: ElementView x/y, View.order, AutomaticLayout separations
 *      and vertices, enterpriseBoundaryVisible (default true), external*BoundariesVisible (default false),
 *      Section.order, Animation.order, HttpHealthCheck interval/timeout, Dimensions width/height.
 *    - Per-property overrides:
 *        View.generatedKey: @JsonInclude(NON_DEFAULT), so false is omitted (core/view/View.java:69)
 *        Section.title: @JsonInclude(ALWAYS), always "title" : "" (core/documentation/Section.java:25-29)
 *        RelationshipView routing/jump/position: NON_NULL (core/view/RelationshipView.java:29-36)
 *        ElementStyle/RelationshipStyle fields: NON_NULL (core/view/ElementStyle.java:12-52,
 *        core/view/RelationshipStyle.java:12-55); effectively the same as NON_EMPTY for these Integer/Boolean/
 *        enum fields, so "width" : 0 and "thickness" : 0 are written.
 *        Terminology fields: NON_EMPTY (core/view/Terminology.java:12-37), same as global.
 *    - Values that default to non-empty and so are always written: DeploymentNode.instances "1"
 *      (core/model/DeploymentNode.java:27), DeploymentElement.environment "Default"
 *      (core/model/DeploymentElement.java:13), DeploymentView.environment "Default", model element "tags"
 *      (default tags, see 6), SoftwareSystem/Container/Component "documentation" : { }
 *      (SoftwareSystem.java:21, Container.java:20, Component.java:20), views.configuration with
 *      "styles" : { } and "terminology" : { } (core/view/ViewSet.java:47).
 *
 * 4. Numbers: int/long vs double
 *    There is no float/double property anywhere in the reachable schema. Every number is int, long or Integer:
 *      long: Workspace.id, HttpHealthCheck.timeout
 *      int: ElementView.x/y, Vertex.x/y, View.order, Section.order, Animation.order, Dimensions.width/height,
 *           AutomaticLayout.rankSeparation/nodeSeparation/edgeSeparation, StaticStructureElementInstance.instanceId,
 *           HttpHealthCheck.interval
 *      Integer: RelationshipView.position, ElementStyle.width/height/strokeWidth/fontSize/opacity,
 *           RelationshipStyle.thickness/fontSize/width/position/opacity
 *    Jackson's default ACCEPT_FLOAT_AS_INT truncates fractions toward zero (observed 10.7 -> 10, 2.6 -> 2,
 *    60.9 -> 60, 1.9 -> 1) and numeric strings are coerced ("20" -> 20, "42" -> 42 for id).
 *    Number-looking STRING properties: DeploymentNode.instances and RelationshipView.order are Strings, so
 *    a JSON number is written back as a string (3 -> "3").
 *
 * 5. Clamping / normalizing setters (applied on read)
 *    - RelationshipView.setPosition: null stays null, < 0 -> 0, > 100 -> 100 (core/view/RelationshipView.java:17-18,
 *      :260-270). Same for RelationshipStyle.setPosition (core/view/RelationshipStyle.java:8-9, :186-196).
 *    - View.setOrder: Math.max(1, order) (core/view/View.java:92-94). Only runs when "order" is present: an
 *      absent order stays 0 and is written as "order" : 0, while an explicit 0 or negative becomes 1.
 *    - ElementStyle/RelationshipStyle opacity clamped to 0..100; ElementStyle.strokeWidth to 1..10;
 *      colours (background/stroke/color) lower-cased, HTML colour names converted to hex, anything else throws.
 *    - View.setKey replaces "/" with "_"; View.setDescription(null) -> "" (then omitted).
 *    - DocumentationContent.setContent normalizes line endings to \n.
 *    - ModelItem.setUrl / RelationshipView.setUrl: "" -> null; otherwise must be a URL, "{workspace}..." or
 *      "{workspace:N}...", else the read fails.
 *    - Configuration.addTheme (core/view/Configuration.java:89-108): trims; keeps a theme only if it is an
 *      installed theme name (InstalledThemes, populated at runtime by client/view/ThemeUtils.java:151, empty
 *      in a bare JsonReader) or a URL; URLs are deduped; anything else is logged "Unknown theme" and DROPPED
 *      (observed: "default" dropped in a bare JsonReader).
 *    - Dimensions and AutomaticLayout setters throw on negative values; AutomaticLayout.setRankDirection throws
 *      on null, so an unknown rankDirection fails the whole read rather than being dropped.
 *    - DeploymentNode.setInstances validates the format (core/model/DeploymentNode.java:426-449).
 *    - Unknown enum values elsewhere become null and are omitted (observed: shape "Squircle", paperSize
 *      "A9_Bogus", routing "Bogus").
 *
 * 6. Maps vs objects, and tags
 *    - String->String maps: properties on Workspace, Model, every model element, Relationship, every view,
 *      RelationshipView, views.configuration, ElementStyle, RelationshipStyle; and HttpHealthCheck.headers.
 *      Non-string JSON values are coerced to strings.
 *    - perspectives is an ARRAY of Perspective objects (TreeSet sorted by name), not a map.
 *    - tags is a single comma-separated STRING (core/model/ModelItem.java:49-68). Read: split on "," with no
 *      trimming. Write: default tags first, then the stored tags in input order, deduped (LinkedHashSet).
 *      So a missing "tags" is written as e.g. "Element,Person"; "Custom, Person,Element" becomes
 *      "Element,Person,Custom, Person"; "" becomes "Element,Person," (a trailing empty tag).
 *      Element instances have no default tags.
 *
 * 7. Workspace id, lastModifiedDate, configuration
 *    - id: long, read from a number or numeric string, written as a number, written even when 0
 *      (core/AbstractWorkspace.java:17, :46-57).
 *    - lastModifiedDate (and Decision.date): java.util.Date. Read by Jackson's StdDateFormat (ISO-8601 with or
 *      without millis/offset, or epoch millis); written as "yyyy-MM-dd'T'HH:mm:ss'Z'" in UTC with millis lost
 *      (observed "2024-05-01T10:20:30.123+02:00" -> "2024-05-01T08:20:30Z"). JSON null -> omitted.
 *    - configuration (workspace-level): JsonReader/JsonWriter round-trip scope, visibility and users as-is.
 *      The SERVER's save path does more: WorkspaceComponentImpl.putWorkspace sets id to the URL's workspace
 *      id, sets lastModifiedDate to now without millis, then clearConfiguration() and copies back ONLY scope,
 *      dropping visibility and users (app/server/component/workspace/WorkspaceComponentImpl.java:353-359;
 *      the same for encrypted workspaces at :327-333). LocalFileSystemWorkspaceAdapter also stamps
 *      lastModifiedDate without millis when it renders a DSL workspace (…/LocalFileSystemWorkspaceAdapter.java:138).
 *      WorkspaceUtils.fromJson/toJson are plain JsonReader / JsonWriter(indent) (client/util/WorkspaceUtils.java:77-104).
 *
 * 8. Keys dropped on read+write that older Structurizr versions or hand-written files contain
 *    (all confirmed by round-tripping the repo fixtures):
 *      model.enterprise, element "location", automaticLayout.implementation, automaticLayout.applied,
 *      views.configuration.branding (removed, changelog-library.md:72), ModelView "mergeFromRemote"
 *      (the setter is @JsonIgnore, core/view/ModelView.java:182-183, which ignores the whole property),
 *      ComponentView/DynamicView softwareSystemId, element-instance "name"/"technology", "canonicalName",
 *      "parentId", "type", "size", top-level "revision", any "x"/"y" on model items, and any other unknown key.
 */
