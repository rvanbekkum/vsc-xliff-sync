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
