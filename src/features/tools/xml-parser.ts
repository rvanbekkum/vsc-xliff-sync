/*
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

import * as sax from 'sax';
import { XmlNode } from './xml-node';

export class XmlParser {
  private _root: XmlNode | undefined;
  private _currentNode: XmlNode | undefined;

  public parseDocument(document: string): Promise<XmlNode> {
    return new Promise<XmlNode>((resolve, reject) => this.parse(document, resolve, reject));
  }

  private parse(
    document: string,
    resolve: (root: XmlNode) => void,
    reject: (error: Error) => void,
  ): void {
    const parser = sax.parser(true, {
      xmlns: true,
    });

    parser.onerror = (err) => {
      console.log('Error Occured', err);
      reject(err);
    };

    // TODO: trim as an opt?
    parser.ontext = (text) => {
      if (this._currentNode) {
        this._currentNode.children.push(text);
      }
    };

    parser.onopentag = (node) => {
      let newNode: XmlNode;

      if (this.isQualifiedTag(node)) {
        newNode = {
          name: node.name,
          prefix: node.prefix,
          uri: node.uri,
          parent: this._currentNode,
          children: [],
          local: node.local,
          attributes: {},
          isSelfClosing: node.isSelfClosing,
        };

        for (const attr in node.attributes) {
          newNode.attributes[attr] = node.attributes[attr].value;
        }
      } else {
        newNode = {
          name: node.name,
          prefix: '',
          uri: undefined,
          attributes: node.attributes,
          parent: this._currentNode,
          children: [],
          isSelfClosing: node.isSelfClosing,
          local: node.name,
        };
      }

      if (!this._root) {
        this._root = newNode;
      }

      if (this._currentNode) {
        this._currentNode.children.push(newNode);
      }

      this._currentNode = newNode;
    };

    parser.onclosetag = (node) => {
      if (this._currentNode && this._currentNode.name === node) {
        this._currentNode = this._currentNode.parent;
      } else {
        reject(new Error('invalid document'));
      }
    };

    parser.onend = () => {
      if (this._root && !this._currentNode) {
        resolve(this._root);
      } else {
        reject(new Error('invalid document'));
      }
    };

    parser.write(document).close();
  }

  private isQualifiedTag(tag: sax.BaseTag | sax.QualifiedTag): tag is sax.QualifiedTag {
    return !!(<sax.QualifiedTag>tag).ns;
  }
}
