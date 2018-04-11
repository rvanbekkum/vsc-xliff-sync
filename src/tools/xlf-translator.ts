import { XmlNode } from './xml-node';

export class XlfTranslator {
  public static synchronize(source: XmlNode, target: XmlNode): XmlNode {
    const output: XmlNode = Object.assign({}, source);
    const language = this.getSourceLanguage(target);

    if (language) {
      this.setSourceLanguage(output, language);
    }

    const outputTransUnit = this.getTranslationUnitNodes(output);
    const targetTransUnit = this.getTranslationUnitNodes(target);

    if (outputTransUnit && targetTransUnit) {
      for (const unit of outputTransUnit) {
        let targetUnit = this.getTranslationUnitById(targetTransUnit, unit.attributes.id);

        if (!targetUnit) {
          targetUnit = this.getTranslationUnitByNotes(targetTransUnit, '', '');
        }

        if (targetUnit) {
          const targetNode = <XmlNode | undefined>targetUnit.children.find(
            (child) => typeof child !== 'string' && child.name === 'target',
          );

          if (targetNode) {
            this.appendTargetNode(unit, targetNode);
          }
        }
      }
    }
    return output;
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

  private static getTranslationUnitByNotes(
    nodes: XmlNode[],
    description: string,
    meaning: string,
  ): XmlNode | undefined {
    // TODO: Implements
    return;
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
      transUnit.children.splice(sourceIdx + 1, 0, targetNode);
    } else {
      transUnit.children.push(targetNode);
    }
  }
}
