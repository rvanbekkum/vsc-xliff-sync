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

import { workspace } from 'vscode';
import { XlfDocument } from './xlf/xlf-document';

export class XlfTranslator {
  public static async synchronize(
    source: string,
    target: string | undefined,
    targetLanguage: string | undefined,
  ): Promise<string | undefined> {
    const findByXliffGeneratorAndDeveloperNote: boolean = workspace.getConfiguration('xliffSync')[
      'findByXliffGeneratorAndDeveloperNote'
    ];

    const findByXliffGeneratorNote: boolean = workspace.getConfiguration('xliffSync')['findByXliffGeneratorNote'];

    const findBySource: boolean = workspace.getConfiguration('xliffSync')['findBySource'];

    const mergedDocument = await XlfDocument.load(source);

    if (!mergedDocument || !mergedDocument.valid) {
      return undefined;
    }

    if (!target && !targetLanguage) {
      return undefined;
    }

    const targetDocument = target
      ? await XlfDocument.load(target)
      : XlfDocument.create(<'1.2' | '2.0'>mergedDocument.version, targetLanguage!);
    const language = targetDocument.targetLanguage;

    if (language) {
      mergedDocument.targetLanguage = language;
    }

    let sourceTranslations: { [key: string]: string | undefined; } = {};

    mergedDocument.translationUnitNodes.forEach((unit) => {
      let targetUnit = targetDocument.findTranslationUnit(unit.attributes.id);
      let translation = undefined;

      if (!targetUnit) {
        const xliffGeneratorNote = mergedDocument.getUnitXliffGeneratorNote(unit);
        const developerNote = mergedDocument.getUnitDeveloperNote(unit);
        const source = mergedDocument.getUnitSource(unit);

        if (xliffGeneratorNote && source) {
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

        if (!targetUnit && findBySource && source) {
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

      mergedDocument.mergeUnit(unit, targetUnit, translation);
    });

    return mergedDocument.extract();
  }
}
