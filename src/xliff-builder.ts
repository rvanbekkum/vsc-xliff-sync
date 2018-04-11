import { workspace, Uri } from 'vscode';
import { parseString, Builder } from 'xml2js';
import {} from 'sax';

import * as fs from 'fs';
import * as path from 'path';

import { TranslationBuilder } from './translation-builder';
import { XliffDocument, XliffTranslationUnitNode } from './model/xliffDocument';

export class XLiffBuilder implements TranslationBuilder {
  public async findTranslationFiles(): Promise<Uri[]> {
    return workspace.findFiles('**/*.xlf').then((files) =>
      files.sort((a, b) => {
        if (a.fsPath.length !== b.fsPath.length) {
          return a.fsPath.length - b.fsPath.length;
        }
        return a.fsPath.localeCompare(b.fsPath);
      }),
    );
  }

  public async createTranslationFile(sourceUri: Uri, regionCode: string): Promise<Uri | null> {
    const dir = path.dirname(sourceUri.fsPath);
    let filename = path.basename(sourceUri.fsPath);

    filename = filename.substr(0, filename.indexOf('.')) + `.${regionCode}.xlf`;

    const newFile = await this.createFile(path.join(dir, filename));

    if (newFile) {
      return Uri.file(newFile);
    } else {
      return null;
    }
  }

  public async consolidateTranslationFiles(source: Uri, target: Uri): Promise<string> {
    const sourceDocument = await this.loadXliffFile(source.fsPath);

    if (!sourceDocument) {
      throw new Error('Invalid source file selected');
    }

    const targetDocument = await this.loadXliffFile(target.fsPath);
    const outputDocument = Object.assign({}, sourceDocument);

    if (targetDocument) {
      const outputUnits = this.getTranslationNode(outputDocument);
      const targetUnits = this.getTranslationNode(targetDocument);

      outputUnits.forEach((node, index, ar) => {
        ar[index] = this.mergeTranslationNode(node, targetUnits);
      });
    }

    const builder = new Builder({
      preserveChildrenOrder: true,
    });

    return builder.buildObject(outputDocument);
  }

  private fileExists(file: string): Promise<boolean> {
    return new Promise((resolve, reject) => fs.exists(file, (exists) => resolve(exists)));
  }

  private async createFile(file: string): Promise<string | undefined> {
    const fileExists = await this.fileExists(file);

    if (!fileExists) {
      return new Promise<string | undefined>((resolve, reject) =>
        fs.open(file, 'w', (err, fd) => {
          if (err) {
            resolve();
          } else {
            fs.close(fd, (err) => (err ? resolve() : resolve(file)));
          }
        }),
      );
    }

    return new Promise<string>((resolve, reject) => resolve());
  }

  private async loadXliffFile(file: string): Promise<XliffDocument | undefined> {
    const document = await workspace.openTextDocument(file);
    const sourceText = document && document.getText();

    if (sourceText) {
    } else {
      return undefined;
    }

    return await this.parseXliff(sourceText);
  }

  private parseXliff(source: string): Promise<XliffDocument> {
    return new Promise((resolve, reject) =>
      parseString(
        source,
        {
          preserveChildrenOrder: true,
        },
        (err: any, result: XliffDocument) => {
          if (result && result.xliff && result.xliff.$ && result.xliff.$.version === '1.2') {
            resolve(result);
          } else {
            throw new Error('Invalid file Format');
          }
        },
      ),
    );
  }

  private mergeTranslationNode(
    node: XliffTranslationUnitNode,
    targetDocument: XliffTranslationUnitNode[],
  ): XliffTranslationUnitNode {
    let targetNode = this.findNodeById(targetDocument, node.$.id);

    if (!targetNode) {
      const description = this.getNodeDescription(node);
      const meaning = this.getNodeMeaning(node);

      if (description && meaning) {
        targetNode = this.findNodeByMeaningAndDescription(targetDocument, meaning, description);
      }
    }

    if (targetNode && targetNode.target && targetNode.target.length) {
      return {
        $: node.$,
        source: node.source,
        target: targetNode.target,
        'context-group': node['context-group'],
        note: node.note,
      };
    }

    return node;
  }

  private getTranslationNode(document: XliffDocument): XliffTranslationUnitNode[] {
    const units =
      document.xliff &&
      document.xliff.file &&
      document.xliff.file.length &&
      document.xliff.file[0].body &&
      document.xliff.file[0].body.length &&
      document.xliff.file[0].body[0]['trans-unit'];

    return units || [];
  }

  private findNodeById(
    nodes: XliffTranslationUnitNode[],
    id: string,
  ): XliffTranslationUnitNode | undefined {
    return nodes.find((node) => node.$ && node.$.id === id);
  }

  private findNodeByMeaningAndDescription(
    nodes: XliffTranslationUnitNode[],
    meaning: string,
    description: string,
  ): XliffTranslationUnitNode | undefined {
    return nodes.find(
      (node) =>
        this.getNodeDescription(node) === description && this.getNodeMeaning(node) === meaning,
    );
  }

  private getNodeDescription(node: XliffTranslationUnitNode): string | undefined {
    const description = node.note && node.note.find((note) => note.$.from === 'description');
    return description ? description._ : undefined;
  }

  private getNodeMeaning(node: XliffTranslationUnitNode): string | undefined {
    const description = node.note && node.note.find((note) => note.$.from === 'meaning');
    return description ? description._ : undefined;
  }
}
