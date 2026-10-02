/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), file
 * structurizr-application/src/main/resources/static/static/js/structurizr-ui.js
 * (openingMetadataSymbols, closingMetadataSymbols, getMetadataForElement,
 * getMetadataForRelationship).
 *
 * Copyright Structurizr. Licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Modified by Renderizr: ported to typed TypeScript and made a pure function
 * of the workspace it is given.
 */

import type { ModelElement, ModelRelationship } from "./types";
import type { WorkspaceModel } from "./workspace";

const SYMBOLS: Record<string, [string, string]> = {
    SquareBrackets: ["[", "]"],
    RoundBrackets: ["(", ")"],
    CurlyBrackets: ["{", "}"],
    AngleBrackets: ["<", ">"],
    DoubleAngleBrackets: ["<<", ">>"],
    None: ["", ""],
};

const symbolsFor = (model: WorkspaceModel) =>
    SYMBOLS[model.configuration.metadataSymbols] ?? SYMBOLS.SquareBrackets;

/**
 * The bracketed line under an element's name: its type term (with
 * `terminology` overrides) and, when asked and known, `: technology`. A
 * custom element shows its own `metadata`, or nothing.
 */
export function getMetadataForElement(
    model: WorkspaceModel,
    element: Partial<ModelElement>,
    includeTechnology: boolean,
): string {
    const [open, close] = symbolsFor(model);
    if (element.type === "Custom") {
        return element.metadata ? `${open}${element.metadata}${close}` : "";
    }
    const term = model.getTerminologyFor(element);
    return includeTechnology && element.technology
        ? `${open}${term}: ${element.technology}${close}`
        : `${open}${term}${close}`;
}

/** A relationship's technology in the workspace's metadata symbols, or nothing. */
export function getMetadataForRelationship(
    model: WorkspaceModel,
    relationship: Partial<ModelRelationship>,
): string {
    if (!relationship.technology) return "";
    const [open, close] = symbolsFor(model);
    return `${open}${relationship.technology}${close}`;
}
