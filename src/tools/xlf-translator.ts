import { XmlNode } from './xml-node';
import { XmlParser } from './xml-parser';
import { XmlBuilder } from './xml-builder';
import { workspace } from 'vscode';

export class XlfTranslator {
  public static async synchronize(source: string, target: string): Promise<string> {
    const output = await new XmlParser().parseDocument(source);
    const targetDocument = await new XmlParser().parseDocument(target);
    const missingTranslation: string = workspace.getConfiguration('i18nSync')['missingTranslation'];

    const language = this.getSourceLanguage(targetDocument);

    if (language) {
      this.setSourceLanguage(output, language);
    }

    const outputTransUnit = this.getTranslationUnitNodes(output) || [];
    const targetTransUnit = this.getTranslationUnitNodes(targetDocument) || [];

    outputTransUnit.forEach((unit) => {
      let targetUnit = this.getTranslationUnitById(targetTransUnit, unit.attributes.id);

      if (!targetUnit) {
        const meaning = this.getMeaning(unit);

        if (meaning) {
          targetUnit = this.getTranslationUnitByMeaning(targetTransUnit, meaning);
        }
      }

      let targetNode: XmlNode | undefined;

      if (targetUnit) {
        targetNode = <XmlNode | undefined>targetUnit.children.find(
          (child) => typeof child !== 'string' && child.name === 'target',
        );
      }

      if (!targetNode) {
        targetNode = {
          name: 'target',
          local: 'target',
          parent: unit,
          attributes: {},
          children: [missingTranslation],
          isSelfClosing: false,
          prefix: '',
          uri: '',
        };
      }

      if (targetNode) {
        this.appendTargetNode(unit, targetNode);
      }
    });

    let retVal = XmlBuilder.create(output)!;

    const rootIdx = retVal.indexOf('<xliff ');

    if (rootIdx > 0) {
      retVal = [retVal.slice(0, rootIdx), '\n', retVal.slice(rootIdx)].join('');
    }

    return retVal;
  }

  public static createNewDocument(language: string): string | undefined {
    const root: XmlNode = {
      local: 'xliff',
      attributes: {
        version: '1.2',
      },
      children: [],
      isSelfClosing: false,
      name: 'xliff',
      parent: undefined,
      prefix: '',
      uri: '',
    };

    root.children.push({
      local: 'file',
      attributes: {
        'source-language': language,
      },
      children: [],
      isSelfClosing: false,
      name: 'file',
      parent: root,
      prefix: '',
      uri: '',
    });
    return XmlBuilder.create(root);
  }

  private static getSourceLanguage(node: XmlNode): string | undefined {
    if (node) {
      if (node.name === 'file') {
        return node.attributes['source-language'];
      } else {
        for (const child of node.children) {
          if (typeof child !== 'string') {
            const language = this.getSourceLanguage(child);
            if (language) {
              return language;
            }
          }
        }
      }
    }
    return;
  }

  private static setSourceLanguage(node: XmlNode, language: string): void {
    if (node) {
      if (node.name === 'file') {
        node.attributes['source-language'] = language;
        return;
      } else {
        for (const child of node.children) {
          if (typeof child !== 'string') {
            this.setSourceLanguage(child, language);
          }
        }
      }
    }
  }

  private static getTranslationUnitNodes(node: XmlNode): XmlNode[] | undefined {
    if (node.name === 'body') {
      return <XmlNode[]>node.children.filter(
        (child) => typeof child !== 'string' && child.name === 'trans-unit',
      );
    } else if (node.children) {
      for (const child of node.children) {
        if (typeof child !== 'string') {
          const nodes = this.getTranslationUnitNodes(child);
          if (nodes) {
            return nodes;
          }
        }
      }
    }
  }

  private static getTranslationUnitById(nodes: XmlNode[], id: string): XmlNode | undefined {
    return nodes.find((node) => node.attributes.id === id);
  }

  private static getMeaning(node: XmlNode): string | undefined {
    const meaningNote = <XmlNode | undefined>node.children.find(
      (node) =>
        typeof node !== 'string' && node.name === 'note' && node.attributes.from === 'meaning',
    );

    if (
      meaningNote &&
      meaningNote.children &&
      meaningNote.children.length &&
      typeof meaningNote.children[0] === 'string'
    ) {
      return <string>meaningNote.children[0];
    }
    return;
  }

  private static getTranslationUnitByMeaning(
    nodes: XmlNode[],
    meaning: string,
  ): XmlNode | undefined {
    return nodes ? nodes.find((node) => this.getMeaning(node) === meaning) : undefined;
  }

  private static appendTargetNode(transUnit: XmlNode, targetNode: XmlNode): void {
    const sourceIdx = transUnit.children.findIndex(
      (child) => typeof child !== 'string' && child.name === 'source',
    );
    const targetIdx = transUnit.children.findIndex(
      (child) => typeof child !== 'string' && child.name === 'target',
    );

    if (targetIdx >= 0) {
      transUnit.children[targetIdx] = targetNode;
    } else if (sourceIdx) {
      transUnit.children.splice(sourceIdx + 1, 0, transUnit.children[sourceIdx - 1], targetNode);
    } else {
      transUnit.children.push(targetNode);
    }
  }
}
