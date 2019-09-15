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

import { workspace, WorkspaceConfiguration, WorkspaceFolder } from 'vscode';
import { XlfDocument } from './xlf/xlf-document';

export class XlfTranslator {
  public static async synchronize(
    workspaceFolder: WorkspaceFolder,
    source: string,
    target: string | undefined,
    targetLanguage: string | undefined,
  ): Promise<string | undefined> {
    const xliffWorkspaceConfiguration: WorkspaceConfiguration = workspace.getConfiguration('xliffSync', workspaceFolder.uri);
    const findByXliffGeneratorNoteAndSource: boolean = xliffWorkspaceConfiguration['findByXliffGeneratorNoteAndSource'];
    const findByXliffGeneratorAndDeveloperNote: boolean = xliffWorkspaceConfiguration['findByXliffGeneratorAndDeveloperNote'];
    const findByXliffGeneratorNote: boolean = xliffWorkspaceConfiguration['findByXliffGeneratorNote'];
    const findBySourceAndDeveloperNote: boolean = xliffWorkspaceConfiguration['findBySourceAndDeveloperNote'];
    const findBySource: boolean = xliffWorkspaceConfiguration['findBySource'];
    const copyFromSourceForSameLanguage: boolean = xliffWorkspaceConfiguration['copyFromSourceForSameLanguage'];
    let copyFromSource: boolean = false;

    const mergedDocument = await XlfDocument.load(workspaceFolder.uri, source);

    if (!mergedDocument || !mergedDocument.valid) {
      return undefined;
    }

    if (!target && !targetLanguage) {
      return undefined;
    }

    const targetDocument = target
      ? await XlfDocument.load(workspaceFolder.uri, target)
      : XlfDocument.create(workspaceFolder.uri, <'1.2' | '2.0'>mergedDocument.version, targetLanguage!);
    const language = targetDocument.targetLanguage;

    if (language) {
      mergedDocument.targetLanguage = language;
      copyFromSource = copyFromSourceForSameLanguage && (mergedDocument.sourceLanguage === language);
    }

    let sourceTranslations: { [key: string]: string | undefined; } = {};

    mergedDocument.translationUnitNodes.forEach((unit) => {
      let targetUnit = targetDocument.findTranslationUnit(unit.attributes.id);
      let translation = undefined;

      if (!targetUnit) {
        const xliffGeneratorNote = mergedDocument.getUnitXliffGeneratorNote(unit);
        const developerNote = mergedDocument.getUnitDeveloperNote(unit);
        const source = mergedDocument.getUnitSource(unit);

        if (findByXliffGeneratorNoteAndSource && xliffGeneratorNote && source) {
          targetUnit = targetDocument.findTranslationUnitByXliffGeneratorNoteAndSource(xliffGeneratorNote, source);
        }

        if (!targetUnit && findByXliffGeneratorAndDeveloperNote && xliffGeneratorNote && developerNote) {
          targetUnit = targetDocument.findTranslationUnitByXliffGeneratorAndDeveloperNote(
            xliffGeneratorNote,
            developerNote,
          );
        }

        if (!targetUnit && findByXliffGeneratorNote && xliffGeneratorNote) {
          targetUnit = targetDocument.findTranslationUnitByXliffGeneratorNote(xliffGeneratorNote);
        }

        if (!targetUnit && source) {
          if (findBySourceAndDeveloperNote) { // Also match on empty/undefined developerNote
            let transUnitTrl = targetDocument.findTranslationUnitBySourceAndDeveloperNote(source, developerNote);
            if (transUnitTrl) {
              translation = targetDocument.getUnitTranslation(transUnitTrl);
            }
          }

          if (!translation && findBySource) {
            if (!(source in sourceTranslations)) {
              let transUnitTrl = targetDocument.findFirstTranslationUnitBySource(source);
              if (transUnitTrl) {
                translation = targetDocument.getUnitTranslation(transUnitTrl);
                sourceTranslations[source] = translation;
              }
            }
            else {
              translation = sourceTranslations[source];
            }
          }
        }
      }

      if (!translation && copyFromSource) {
        const hasNoTranslation: boolean = !targetUnit || (targetUnit && !targetDocument.getUnitTranslation(targetUnit));
        if (hasNoTranslation) {
          translation = mergedDocument.getUnitSourceText(unit);
        }
      }

      mergedDocument.mergeUnit(unit, targetUnit, translation);

      if (targetUnit) {
        const mergedSourceText = mergedDocument.getUnitSourceText(unit);
        const mergedTranslText = mergedDocument.getUnitTranslation(unit);
        const origSourceText = targetDocument.getUnitSourceText(targetUnit);
        if (mergedSourceText && origSourceText && mergedTranslText && mergedSourceText !== origSourceText) {
          mergedDocument.setXliffSyncNote(unit, 'Source text has changed. Please review the translation.');
          mergedDocument.setTargetAttribute(unit, 'state', 'needs-adaptation');
        }
      }
    });

    return mergedDocument.extract();
  }
}
