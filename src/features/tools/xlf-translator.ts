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
import { translationState } from './xlf/xlf-translationState';

export class XlfTranslator {
  public static async synchronize(
    source: string,
    target: string | undefined,
    targetLanguage: string | undefined,
    workspaceFolder?: WorkspaceFolder
  ): Promise<string | undefined> {
    const xliffWorkspaceConfiguration: WorkspaceConfiguration = workspace.getConfiguration('xliffSync', workspaceFolder?.uri);
    const findByXliffGeneratorNoteAndSource: boolean = xliffWorkspaceConfiguration['findByXliffGeneratorNoteAndSource'];
    const findByXliffGeneratorAndDeveloperNote: boolean = xliffWorkspaceConfiguration['findByXliffGeneratorAndDeveloperNote'];
    const findByXliffGeneratorNote: boolean = xliffWorkspaceConfiguration['findByXliffGeneratorNote'];
    const findBySourceAndDeveloperNote: boolean = xliffWorkspaceConfiguration['findBySourceAndDeveloperNote'];
    const findBySource: boolean = xliffWorkspaceConfiguration['findBySource'];
    const copyFromSourceForLanguages: string[] = xliffWorkspaceConfiguration['copyFromSourceForLanguages'];
    const copyFromSourceForSameLanguage: boolean = xliffWorkspaceConfiguration['copyFromSourceForSameLanguage'];
    const copyFromSourceOverwrite: boolean = xliffWorkspaceConfiguration['copyFromSourceOverwrite'];
    const parseFromDeveloperNote: boolean = xliffWorkspaceConfiguration['parseFromDeveloperNote'];
    const parseFromDeveloperNoteOverwrite: boolean = xliffWorkspaceConfiguration['parseFromDeveloperNoteOverwrite'];
    const detectSourceTextChanges: boolean = xliffWorkspaceConfiguration['detectSourceTextChanges'];
    const clearTranslationAfterSourceTextChange: boolean = xliffWorkspaceConfiguration['clearTranslationAfterSourceTextChange'];
    const ignoreLineEndingTypeChanges: boolean = xliffWorkspaceConfiguration['ignoreLineEndingTypeChanges'];
    const missingTranslationKeyword: string = xliffWorkspaceConfiguration['missingTranslation'];
    const unitMaps: string = xliffWorkspaceConfiguration['unitMaps'];

    let copyFromSource: boolean = false;

    const mergedDocument = await XlfDocument.load(source, workspaceFolder?.uri);

    if (!mergedDocument || !mergedDocument.valid) {
      return undefined;
    }

    if (!target && !targetLanguage) {
      return undefined;
    }

    const targetDocument = target
      ? await XlfDocument.load(target, workspaceFolder?.uri)
      : XlfDocument.create(<'1.2' | '2.0'>mergedDocument.version, targetLanguage!, workspaceFolder?.uri);
    const language = targetDocument.targetLanguage;

    if (language) {
      mergedDocument.targetLanguage = language;
      copyFromSource = copyFromSourceForSameLanguage && (mergedDocument.sourceLanguage === language);
      copyFromSource = copyFromSource || (copyFromSourceForLanguages.indexOf(language) >= 0);
    }

    let sourceTranslations: { [key: string]: string | undefined; } = {};
    const findByXliffGenNotesIsEnabled: boolean = findByXliffGeneratorNoteAndSource || findByXliffGeneratorAndDeveloperNote || findByXliffGeneratorNote;
    const findByIsEnabled: boolean = findByXliffGenNotesIsEnabled || findBySourceAndDeveloperNote || findBySource || copyFromSource || parseFromDeveloperNote;
    if (unitMaps !== "None") {
        if (unitMaps === "Id") {
            targetDocument.CreateUnitMaps(false, false, false, false, false);
        }
        else {
            targetDocument.CreateUnitMaps(findByXliffGeneratorNoteAndSource, findByXliffGeneratorAndDeveloperNote, findByXliffGeneratorNote, findBySourceAndDeveloperNote, findBySource);
        }
    }

    mergedDocument.translationUnitNodes.forEach((unit) => {
      let targetUnit = targetDocument.findTranslationUnit(unit.attributes.id);
      let translation = undefined;

      if (!targetUnit && findByIsEnabled) {
        const developerNote = mergedDocument.getUnitDeveloperNote(unit);
        const source = mergedDocument.getUnitSource(unit);

        if (findByXliffGenNotesIsEnabled) {
          const xliffGeneratorNote = mergedDocument.getUnitXliffGeneratorNote(unit);
          
          if (xliffGeneratorNote) {
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
          }
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

      if (!translation && (copyFromSource || parseFromDeveloperNote)) {
        let hasNoTranslation: boolean = false;
        if (targetUnit) {
          const translationText: string | undefined = targetDocument.getUnitTranslation(targetUnit);
          if (missingTranslationKeyword === '%EMPTY%') {
            hasNoTranslation = !translationText;
          }
          else {
            hasNoTranslation = translationText === missingTranslationKeyword;
          }
        }
        else {
          hasNoTranslation = true;
        }

        const shouldParseFromDevNote: boolean = parseFromDeveloperNote && (hasNoTranslation || parseFromDeveloperNoteOverwrite);
        const shouldCopyFromSource: boolean = copyFromSource && (hasNoTranslation || copyFromSourceOverwrite);

        if (!translation && shouldParseFromDevNote) {
          translation = mergedDocument.getUnitTranslationFromDeveloperNote(unit);
        }
        if (!translation && shouldCopyFromSource) {
          translation = mergedDocument.getUnitSourceText(unit);
        }
      }

      mergedDocument.mergeUnit(unit, targetUnit, translation);

      if (detectSourceTextChanges && targetUnit) {
        let mergedSourceText = mergedDocument.getUnitSourceText(unit);
        const mergedTranslText = mergedDocument.getUnitTranslation(unit);
        let origSourceText = targetDocument.getUnitSourceText(targetUnit);

        if (mergedSourceText && origSourceText && mergedTranslText) {
          if (ignoreLineEndingTypeChanges) {
            mergedSourceText = mergedSourceText.replace(/\r\n/g, "\n");
            origSourceText = origSourceText.replace(/\r\n/g, "\n");
          }

          if (mergedSourceText !== origSourceText) {
            if (clearTranslationAfterSourceTextChange) {
              mergedDocument.clearUnitTranslation(unit);
              mergedDocument.setState(unit, translationState.missingTranslation);
            }
            else {
              mergedDocument.setXliffSyncNote(unit, 'Source text has changed. Please review the translation.');
              mergedDocument.setState(unit, translationState.needsWorkTranslation);
            }
          }
        }
      }
    });

    return mergedDocument.extract();
  }
}
