import { create, XMLElementOrXMLNode } from 'xmlbuilder';
import { XmlNode } from './xml-node';

export class XmlBuilder {
  public static create(root: XmlNode | undefined): string | undefined {
    if (!root) {
      return undefined;
    }

    const outputNode: XMLElementOrXMLNode = create(root.name, {
      version: '1.0',
      encoding: 'UTF-8',
      stringify: {
        attValue: (str: string) =>
          str
            .replace(/(?!&\S+;)&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/\t/g, '&#x9;')
            .replace(/\n/g, '&#xA;')
            .replace(/\r/g, '&#xD;'),
      },
    });

    if (root.attributes) {
      for (const attribute in root.attributes) {
        outputNode.attribute(attribute, root.attributes[attribute]);
      }
    }

    for (const element of root.children) {
      if (typeof element === 'string') {
        outputNode.text(element);
      } else {
        this.appendNode(outputNode, element);
      }
    }

    // TODO: pretty as an option ?
    return outputNode.end();
  }

  private static appendNode(dest: XMLElementOrXMLNode, source: XmlNode): XMLElementOrXMLNode {
    const appendedNode = dest.node(source.name);

    if (source.attributes) {
      for (const attribute in source.attributes) {
        appendedNode.attribute(attribute, source.attributes[attribute]);
      }
    }

    for (const element of source.children) {
      if (typeof element === 'string') {
        appendedNode.text(element);
      } else {
        this.appendNode(appendedNode, element);
      }
    }

    return dest;
  }
}
