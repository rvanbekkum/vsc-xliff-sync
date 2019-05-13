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
