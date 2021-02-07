/*
 * Copyright (c) 2019 Rob van Bekkum
 * Copyright (c) 2018 Emmanuel Antaya
 *
 * Licensed under the MIT license.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { create, XMLElementOrXMLNode } from 'xmlbuilder';
import { XmlNode } from './xml-node';

export class XmlBuilder {
  public static create(root: XmlNode | undefined, headless: boolean = false): string | undefined {
    if (!root) {
      return undefined;
    }

    const outputNode: XMLElementOrXMLNode = create(root.name, {
      version: '1.0',
      encoding: 'UTF-8',
      headless: headless,
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
        outputNode.text(element.replace(/\r\n/g, '\n'));
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
        appendedNode.text(element.replace(/\r\n/g, '\n'));
      } else {
        this.appendNode(appendedNode, element);
      }
    }

    return dest;
  }
}
