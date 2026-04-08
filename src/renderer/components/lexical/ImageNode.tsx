import React from "react";
import {
    DecoratorNode,
    type EditorConfig,
    type LexicalNode,
    type NodeKey,
    type SerializedLexicalNode,
    type Spread,
} from "lexical";

export type SerializedImageNode = Spread<
    {
        altText: string;
        src: string;
        type: "image";
        version: 1;
    },
    SerializedLexicalNode
>;

export class ImageNode extends DecoratorNode<React.JSX.Element> {
    __src: string;
    __altText: string;

    static getType(): string {
        return "image";
    }

    static clone(node: ImageNode): ImageNode {
        return new ImageNode(node.__src, node.__altText, node.__key);
    }

    static importJSON(serializedNode: SerializedImageNode): ImageNode {
        return new ImageNode(serializedNode.src, serializedNode.altText);
    }

    constructor(src: string, altText = "", key?: NodeKey) {
        super(key);
        this.__src = src;
        this.__altText = altText;
    }

    exportJSON(): SerializedImageNode {
        return {
            altText: this.__altText,
            src: this.__src,
            type: "image",
            version: 1,
        };
    }

    createDOM(_config: EditorConfig): HTMLElement {
        return document.createElement("span");
    }

    updateDOM(_prevNode: ImageNode, _dom: HTMLElement, _config: EditorConfig): boolean {
        return false;
    }

    getSrc(): string {
        return this.__src;
    }

    getAltText(): string {
        return this.__altText;
    }

    decorate(): React.JSX.Element {
        return <img src={this.__src} alt={this.__altText} className="my-2 inline-block h-auto max-w-full rounded-md"/>;
    }
}

export function $createImageNode(src: string, altText = ""): ImageNode {
    return new ImageNode(src, altText);
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
    return node instanceof ImageNode;
}
