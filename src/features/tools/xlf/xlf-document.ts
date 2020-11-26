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

import { XmlNode, XmlParser, XmlBuilder } from '..';
import { workspace, Uri, WorkspaceConfiguration } from 'vscode';
import { translationState } from './xlf-translationState';

export class XlfDocument {
  public get valid(): boolean {
    return (
      !!this.root && (this.version === '1.2' || this.version === '2.0') && !!this.sourceLanguage
    );
  }

  public get version(): string | undefined {
    return this.root && this.root.attributes && this.root.attributes['version'];
  }

  public get sourceLanguage(): string | undefined {
    switch (this.version) {
      case '1.2':
        const fileNode = this.root && this.getNode('file', this.root);
        return fileNode && fileNode.attributes && fileNode.attributes['source-language'];

      case '2.0':
        return this.root && this.root.attributes && this.root.attributes['srcLang'];

      default:
        return undefined;
    }
  }

  public set sourceLanguage(lng: string | undefined) {
    switch (this.version) {
      case '1.2':
        const fileNode = this.root && this.getNode('file', this.root);
        if (fileNode && lng) {
          fileNode.attributes['source-language'] = lng;
        }
        break;
      case '2.0':
        if (this.root && lng) {
          this.root.attributes['srcLang'] = lng;
        }
        break;
      default:
        break;
    }
  }

  public get targetLanguage(): string | undefined {
    switch (this.version) {
      case '1.2':
        const fileNode = this.root && this.getNode('file', this.root);
        return fileNode && fileNode.attributes && fileNode.attributes['target-language'];

      case '2.0':
        return this.root && this.root.attributes && this.root.attributes['trgLang'];

      default:
        return undefined;
    }
  }

  public set targetLanguage(lng: string | undefined) {
    switch (this.version) {
      case '1.2':
        const fileNode = this.root && this.getNode('file', this.root);
        if (fileNode && lng) {
          fileNode.attributes['target-language'] = lng;
        }
        break;
      case '2.0':
        if (this.root && lng) {
          this.root.attributes['trgLang'] = lng;
        }
        break;
      default:
        break;
    }
  }

  public get translationUnitNodes(): XmlNode[] {
    if (!this.root) {
      return [];
    }
    let transUnits: XmlNode[] = [];

    switch (this.version) {
      case '1.2':
        const bodyNode = this.getNode('body', this.root);
        if (bodyNode) {
          transUnits = this.getTranslationUnitsFromRoot(bodyNode);
          transUnits = transUnits.concat(this.getGroupTranslationUnitNodes(bodyNode));
          return transUnits;
        } else {
          return [];
        }
      case '2.0':
        const fileNode = this.getNode('file', this.root);
        if (fileNode) {
          return <XmlNode[]>fileNode.children.filter(
            (node) => typeof node !== 'string' && node.name === 'unit',
          );
        } else {
          return [];
        }
      default:
        return [];
    }
  }

  private getGroupTranslationUnitNodes(rootNode: XmlNode): XmlNode[] {
    let transUnits: XmlNode[] = [];
    let groupNodes: XmlNode[] = <XmlNode[]> rootNode.children.filter(
      (node) => typeof node !== 'string' && node.name === 'group',
    );
    groupNodes.forEach(
      groupNode => {
        transUnits = transUnits.concat(this.getTranslationUnitsFromRoot(groupNode));
        transUnits = transUnits.concat(this.getGroupTranslationUnitNodes(groupNode));
      }
    );
    return transUnits;
  }

  private getTranslationUnitsFromRoot(rootNode: XmlNode): XmlNode[] {
    return <XmlNode[]> rootNode.children.filter(
      (node) => typeof node !== 'string' && node.name === 'trans-unit',
    );
  }

  private root: XmlNode | undefined;
  private developerNoteDesignation: string;
  private xliffGeneratorNoteDesignation: string;
  private preserveTargetAttributes: boolean;
  private preserveTargetOrder: boolean;
  private parseFromDeveloperNoteSeparator: string;
  private missingTranslation: string;
  private needsWorkTranslationSubstate: string;
  private addNeedsWorkTranslationNote: boolean;

  private constructor(resourceUri: Uri | undefined) {
    const xliffWorkspaceConfiguration: WorkspaceConfiguration = workspace.getConfiguration('xliffSync', resourceUri);
    this.developerNoteDesignation = xliffWorkspaceConfiguration['developerNoteDesignation'];
    this.xliffGeneratorNoteDesignation = xliffWorkspaceConfiguration['xliffGeneratorNoteDesignation'];
    this.preserveTargetAttributes = xliffWorkspaceConfiguration['preserveTargetAttributes'];
    this.preserveTargetOrder = xliffWorkspaceConfiguration['preserveTargetAttributesOrder'];
    this.parseFromDeveloperNoteSeparator = xliffWorkspaceConfiguration['parseFromDeveloperNoteSeparator'];

    this.missingTranslation = xliffWorkspaceConfiguration['missingTranslation'];
    if (this.missingTranslation === '%EMPTY%') {
      this.missingTranslation = '';
    }
    this.needsWorkTranslationSubstate = xliffWorkspaceConfiguration['needsWorkTranslationSubstate'];
    this.addNeedsWorkTranslationNote = xliffWorkspaceConfiguration['addNeedsWorkTranslationNote'];
  }

  public static async load(source: string, resourceUri: Uri | undefined): Promise<XlfDocument> {
    const doc = new XlfDocument(resourceUri);
    doc.root = await new XmlParser().parseDocument(source);
    return doc;
  }

  public static create(version: '1.2' | '2.0', language: string, resourceUri: Uri | undefined): XlfDocument {
    const doc = new XlfDocument(resourceUri);

    doc.root = {
      local: 'xliff',
      attributes: {
        version,
      },
      children: [],
      isSelfClosing: false,
      name: 'xliff',
      parent: undefined,
      prefix: '',
      uri: '',
    };

    if (version === '1.2') {
      doc.root.children.push({
        local: 'file',
        attributes: {
          'target-language': language,
        },
        children: [],
        isSelfClosing: false,
        name: 'file',
        parent: doc.root,
        prefix: '',
        uri: '',
      });
    } else {
      doc.root.attributes['trgLang'] = language;
    }

    return doc;
  }

  public extract(): string | undefined {
    let retVal: string | undefined;

    if (this.valid) {
      retVal = XmlBuilder.create(this.root)!;

      const rootIdx = retVal.indexOf('<xliff ');

      if (rootIdx > 0) {
        retVal = [retVal.slice(0, rootIdx), '\n', retVal.slice(rootIdx)].join('');
      }
    }

    return retVal;
  }

  public findTranslationUnit(id: string): XmlNode | undefined {
    return this.translationUnitNodes.find((node) => node.attributes.id === id);
  }

  public findTranslationUnitByXliffGeneratorNoteAndSource(
    xliffGenNote: string,
    source: string,
  ): XmlNode | undefined {
    return this.translationUnitNodes.find(
      (node) => this.getUnitXliffGeneratorNote(node) === xliffGenNote && this.getUnitSource(node) === source,
    );
  }

  public findTranslationUnitByXliffGeneratorNote(xliffGenNote: string): XmlNode | undefined {
    return this.translationUnitNodes.find((node) => this.getUnitXliffGeneratorNote(node) === xliffGenNote);
  }

  public findTranslationUnitByXliffGeneratorAndDeveloperNote(
    xliffGenNote: string,
    devNote: string,
  ): XmlNode | undefined {
    return this.translationUnitNodes.find(
      (node) =>
        this.getUnitXliffGeneratorNote(node) === xliffGenNote && this.getUnitDeveloperNote(node) === devNote,
    );
  }

  public findTranslationUnitBySourceAndDeveloperNote(
    source: string,
    devNote: string | undefined,
  ): XmlNode | undefined {
    return this.translationUnitNodes.find(
      (node) => 
        (this.getUnitSource(node) === source) && (this.getUnitDeveloperNote(node) === devNote) && this.getUnitTranslation(node) !== undefined);
  }

  public findFirstTranslationUnitBySource(source: string): XmlNode | undefined {
    return this.translationUnitNodes.find((node) => this.getUnitSource(node) === source && this.getUnitTranslation(node) !== undefined);
  }

  public getUnitNeedsTranslation(unitNode: XmlNode): boolean {
    const translateAttribute = unitNode.attributes['translate'];
    if (translateAttribute) {
      return translateAttribute === 'yes';
    }
    return true;
  }

  public getUnitSource(unitNode: XmlNode): string | undefined {
    const sourceNode = this.getNode('source', unitNode);
    if (sourceNode) {
      return XmlBuilder.create(sourceNode);
    } else {
      return undefined;
    }
  }

  public getUnitSourceText(unitNode: XmlNode): string | undefined {
    const sourceNode = this.getNode('source', unitNode);
    if (sourceNode && typeof sourceNode.children[0] === 'string') {
      return sourceNode.children[0] as string;
    } else {
      return undefined;
    }
  }

  public getUnitTranslation(unitNode: XmlNode): string | undefined {
    const translationNode = this.getNode('target', unitNode);
    if (translationNode && typeof translationNode.children[0] === 'string') {
      return translationNode.children[0] as string;
    } else {
      return undefined;
    }
  }

  public getUnitXliffGeneratorNote(unitNode: XmlNode): string | undefined {
    let xliffGenNode: XmlNode | undefined;

    switch (this.version) {
      case '1.2':
        xliffGenNode = <XmlNode | undefined>unitNode.children.find(
          (node) =>
            typeof node !== 'string' && node.name === 'note' && node.attributes.from === this.xliffGeneratorNoteDesignation,
        );
        break;

      case '2.0':
        const notesNode = this.getNode('notes', unitNode);
        if (notesNode) {
          xliffGenNode = <XmlNode | undefined>notesNode.children.find(
            (node) =>
              typeof node !== 'string' &&
              node.name === 'note' &&
              node.attributes.category === this.xliffGeneratorNoteDesignation,
          );
        }
        break;

      default:
        break;
    }
    if (
      xliffGenNode &&
      xliffGenNode.children &&
      xliffGenNode.children.length &&
      typeof xliffGenNode.children[0] === 'string'
    ) {
      return <string>xliffGenNode.children[0];
    }

    return undefined;
  }

  public getUnitDeveloperNote(unitNode: XmlNode): string | undefined {
    let devNode: XmlNode | undefined;

    switch (this.version) {
      case '1.2':
        devNode = <XmlNode | undefined>unitNode.children.find(
          (node) =>
            typeof node !== 'string' &&
            node.name === 'note' &&
            node.attributes.from === this.developerNoteDesignation,
        );
        break;

      case '2.0':
        const notesNode = this.getNode('notes', unitNode);
        if (notesNode) {
          devNode = <XmlNode | undefined>notesNode.children.find(
            (node) =>
              typeof node !== 'string' &&
              node.name === 'note' &&
              node.attributes.category === this.developerNoteDesignation,
          );
        }
        break;

      default:
        break;
    }

    if (
      devNode &&
      devNode.children &&
      devNode.children.length &&
      typeof devNode.children[0] === 'string'
    ) {
      return <string>devNode.children[0];
    }

    return undefined;
  }

  public getUnitTranslationFromDeveloperNote(unitNode: XmlNode): string | undefined {
    const developerNote: string | undefined = this.getUnitDeveloperNote(unitNode);
    if (!developerNote) {
      return undefined;
    }

    const translationEntries: string[] = developerNote.split(this.parseFromDeveloperNoteSeparator);
    let translation: string | undefined = undefined;
    for (const translationEntry of translationEntries) {
      const sepIdx: number = translationEntry.indexOf('=');
      if (sepIdx < 0) {
        continue;
      }

      var language = translationEntry.substr(0, sepIdx);
      if (language === this.targetLanguage) {
        translation = translationEntry.substr(sepIdx + 1);
        break;
      }
    }

    return translation;
  }

  public mergeUnit(sourceUnit: XmlNode, targetUnit: XmlNode | undefined, translation?: string): void {
    let targetNode: XmlNode | undefined;

    if (targetUnit) {
      if (this.preserveTargetAttributes) {
        // Use the target's attribute values
        if (this.preserveTargetOrder) {
          const sourceAttributes = sourceUnit.attributes;
          sourceUnit.attributes = targetUnit.attributes;
          sourceUnit.attributes['id'] = sourceAttributes['id'];
          for (const attr in sourceAttributes) {
            if (!sourceUnit.attributes[attr]) {
              sourceUnit.attributes[attr] = sourceAttributes[attr];
            }
          }
        } else {
          for (const attr in targetUnit.attributes) {
            if (attr !== 'id') {
              sourceUnit.attributes[attr] = targetUnit.attributes[attr];
            }
          }
        }
      }
      else {
        // Use the source's attribute values for the attributes in common, and extend these with any extra attributes from the target.
        const targetAttributes = targetUnit.attributes;
        for (const attr in targetAttributes) {
          if (!sourceUnit.attributes[attr]) {
            sourceUnit.attributes[attr] = targetAttributes[attr];
          }
        }
      }

      targetNode = this.getNode('target', targetUnit);
    }

    const needsTranslation: boolean = this.getUnitNeedsTranslation(sourceUnit);
    if (needsTranslation && !targetNode) {
      let attributes: { [key: string]: string; } = {};
      if (!translation) {
        translation = this.missingTranslation;
        this.updateStateAttributes(attributes, translationState.missingTranslation);
      }
      else {
        this.updateStateAttributes(attributes, translationState.translated);
      }

      targetNode = this.createTargetNode(sourceUnit, attributes, translation);
    }
    else if (!needsTranslation && targetNode) {
      this.deleteTargetNode(sourceUnit);
    }

    if (needsTranslation && targetNode) {
      if (translation) {
        targetNode.children = [translation];
        if (!targetNode.attributes) {
          targetNode.attributes = {};
        }
        this.updateStateAttributes(targetNode.attributes, translationState.translated);
      }
      this.appendTargetNode(sourceUnit, targetNode);
    }
  }

  public updateStateAttributes(attributes: { [key: string]: string; }, newState: translationState) {
    switch (this.version) {
      case '1.2':
        switch (newState) {
          case translationState.missingTranslation:
            attributes['state'] = 'needs-translation';
            break;
          case translationState.needsWorkTranslation:
            attributes['state'] = 'needs-adaptation';
            break;
          case translationState.translated:
            attributes['state'] = 'translated';
            break;
        }
        break;
      case '2.0':
        switch (newState) {
          case translationState.missingTranslation:
            attributes['state'] = 'initial';
            delete attributes["subState"];
            break;
          case translationState.needsWorkTranslation:
            attributes['state'] = 'translated';
            attributes['subState'] = this.needsWorkTranslationSubstate;
            break;
          case translationState.translated:
            attributes['state'] = 'translated';
            delete attributes["subState"];
            break;
        }
        break;
    }
  }

  public createTargetNode(parentUnit: XmlNode, attributes: { [key: string]: string; }, translation: string): XmlNode {
    return {
      name: 'target',
      local: 'target',
      parent: parentUnit,
      attributes: attributes,
      children: [translation],
      isSelfClosing: false,
      prefix: '',
      uri: '',
    };
  }

  public appendTargetNode(unit: XmlNode, targetNode: XmlNode): void {
    let sourceIdx: number;
    let targetIdx: number;

    switch (this.version) {
      case '1.2':
        sourceIdx = unit.children.findIndex(
          (child) => typeof child !== 'string' && child.name === 'source',
        );
        targetIdx = unit.children.findIndex(
          (child) => typeof child !== 'string' && child.name === 'target',
        );

        if (targetIdx >= 0) {
          unit.children[targetIdx] = targetNode;
        } else if (sourceIdx) {
          unit.children.splice(sourceIdx + 1, 0, unit.children[sourceIdx - 1], targetNode);
        } else {
          unit.children.push(targetNode);
        }
        break;
      case '2.0':
        const segmentNode = this.getNode('segment', unit);
        if (segmentNode) {
          targetNode.parent = segmentNode;
          sourceIdx = segmentNode.children.findIndex(
            (node) => typeof node !== 'string' && node.name === 'source',
          );
          targetIdx = segmentNode.children.findIndex(
            (node) => typeof node !== 'string' && node.name === 'target',
          );

          if (targetIdx >= 0) {
            segmentNode.children[targetIdx] = targetNode;
          } else if (sourceIdx) {
            segmentNode.children.splice(
              sourceIdx + 1,
              0,
              segmentNode.children[sourceIdx - 1],
              targetNode,
            );
          } else {
            segmentNode.children.push(targetNode);
          }
        }
        break;
      default:
        break;
    }
  }

  public getTargetAttribute(unit: XmlNode, attribute: string): string | undefined {
    let targetNode = this.getNode('target', unit);
    if (targetNode && targetNode.attributes) {
      let attributeValue = targetNode.attributes[attribute];
      if (attributeValue !== null && typeof attributeValue !== "undefined") {
        return attributeValue;
      }
    }
    return undefined;
  }

  public getState(unit: XmlNode): translationState | undefined {
    let stateNode: XmlNode | undefined = this.tryGetStateNode(unit);
    if (stateNode && stateNode.attributes) {
      switch (this.version) {
        case '1.2':
          {
            const state: string | undefined = stateNode.attributes['state'];
            switch (state) {
              case 'needs-translation':
                return translationState.missingTranslation;
              case 'needs-adaptation':
                return translationState.needsWorkTranslation;
              case 'translated':
                return translationState.translated;
            }
            break;
          }
        case '2.0':
          {
            const state: string | undefined = stateNode.attributes['state'];
            switch (state) {
              case 'initial':
                return translationState.missingTranslation;
              case 'translated':
                if (stateNode.attributes['subState'] === this.needsWorkTranslationSubstate) {
                  return translationState.needsWorkTranslation;
                }
                else {
                  return translationState.translated;
                }
            }
          }
      }
    }
    return undefined;
  }

  private tryGetStateNode(unit: XmlNode): XmlNode | undefined {
    let stateNodeTag: string = 'target';
    switch (this.version) {
      case '1.2':
        stateNodeTag = 'target';
        break;
      case '2.0':
        stateNodeTag = 'segment';
        break;
    }

    return this.getNode(stateNodeTag, unit);
  }


  public setTargetAttribute(unit: XmlNode, attribute: string, attributeValue: string) {
    let targetNode: XmlNode | undefined = this.getNode('target', unit);
    if (!targetNode) {
      let attributes: { [key: string]: string; } = {};
      attributes[attribute] = attributeValue;
      targetNode = this.createTargetNode(unit, attributes, "");
      this.appendTargetNode(unit, targetNode);
    }
    else {
      targetNode.attributes[attribute] = attributeValue;
    }
  }

  public setState(unit: XmlNode, newState: translationState) {
    let stateNode = this.tryGetStateNode(unit);
    if (!stateNode && this.version === '1.2') {
      let attributes: { [key: string]: string; } = {};
      this.updateStateAttributes(attributes, newState);
      let targetNode: XmlNode = this.createTargetNode(unit, attributes, "");
      this.appendTargetNode(unit, targetNode);
    }
    else if (stateNode) {
      this.updateStateAttributes(stateNode.attributes, newState);
    }
  }

  private deleteTargetNode(unit: XmlNode) {
    if (unit) {
      const index = unit.children.indexOf('target', 0);
      if (index > -1) {
        unit.children.splice(index, 1);
      }
    }
  }

  public setXliffSyncNote(unit: XmlNode, noteText: string) {
    if (!this.addNeedsWorkTranslationNote) {
      return;
    }

    let noteAttributes: { [key: string]: string; } = {};
    const fromAttribute = 'XLIFF Sync';
    let notesParent: XmlNode | undefined = unit;
    switch (this.version) {
      case '1.2':
        noteAttributes['from'] = fromAttribute;
        break;
      case '2.0':
        noteAttributes['category'] = fromAttribute;
        notesParent = this.getNode('notes', unit);
        if (!notesParent) {
          notesParent = {
            name: 'notes',
            local: 'notes',
            parent: unit,
            attributes: {},
            children: [],
            isSelfClosing: false,
            prefix: '',
            uri: '',
          };
          unit.children.push(notesParent);
        }
        break;
      default:
        return;
    }
    noteAttributes['annotates'] = 'general';
    noteAttributes['priority'] = '1';

    let noteNode = {
      name: 'note',
      local: 'note',
      parent: notesParent,
      attributes: noteAttributes,
      children: [noteText],
      isSelfClosing: false,
      prefix: '',
      uri: '',
    };

    const noteIdx: number = this.findXliffSyncNoteIndex(notesParent);
    let targetIdx = unit.children.findIndex(
      (child) => typeof child !== 'string' && child && child.name === 'target',
    );
    if (noteIdx >= 0) {
      notesParent.children[noteIdx] = noteNode;
    }
    else if (this.version === '1.2' && targetIdx) {
      unit.children.splice(targetIdx + 1, 0, unit.children[targetIdx - 1], noteNode);
    }
    else {
      notesParent.children.push(noteNode);
    }
  }

  public tryDeleteXliffSyncNote(unit: XmlNode): boolean {
    let notesParent: XmlNode | undefined = this.getNotesParent(unit);
    if (notesParent) {
      const noteIdx: number = this.findXliffSyncNoteIndex(notesParent);
      if (noteIdx >= 0) {
        let deleteCount: number = 1;

        let newLineChild = notesParent.children[noteIdx + 1];
        if (newLineChild && typeof newLineChild === 'string' && /^\s+$/g.test(newLineChild)) {
          deleteCount += 1;
        }

        notesParent.children.splice(noteIdx, deleteCount);

        return true;
      }
    }
    return false;
  }

  private findXliffSyncNoteIndex(notesParent: XmlNode | undefined): number {
    if (!notesParent) {
      return -1;
    }

    let categoryAttributeName: string;
    switch (this.version) {
      case '1.2':
        categoryAttributeName = 'from';
        break;
      case '2.0':
        categoryAttributeName = 'category';
        break;
      default:
        categoryAttributeName = 'from';
        break;
    }
    const categoryAttributeValue: string = 'XLIFF Sync';

    return notesParent.children.findIndex(
      (child) => typeof child !== 'string' && child.name === 'note' && child.attributes && (child.attributes[categoryAttributeName] === categoryAttributeValue),
    );
  }

  private getNotesParent(unit: XmlNode): XmlNode | undefined {
    let notesParent: XmlNode | undefined = unit;
    switch (this.version) {
      case '1.2':
        break;
      case '2.0':
        notesParent = this.getNode('notes', unit);
        break;
      default:
        return undefined;
    }
    return notesParent;
  }

  private getNode(tag: string, node: XmlNode): XmlNode | undefined {
    if (node) {
      if (node.name === tag) {
        return node;
      } else {
        for (const child of node.children) {
          if (typeof child !== 'string') {
            const reqNode = this.getNode(tag, child);
            if (reqNode) {
              return reqNode;
            }
          }
        }
      }
    }

    return undefined;
  }
}
