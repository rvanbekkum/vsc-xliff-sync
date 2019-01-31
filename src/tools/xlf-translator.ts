import { workspace } from 'vscode';
import { XlfDocument } from './xlf/xlf-document';

export class XlfTranslator {
  public static async synchronize(
    source: string,
    target: string | undefined,
    targetLanguage: string | undefined,
  ): Promise<string | undefined> {
    const findByMeaningAndDescription: boolean = workspace.getConfiguration('xliffSync')[
      'findByMeaningAndDescription'
    ];

    const findByMeaning: boolean = workspace.getConfiguration('xliffSync')['findByMeaning'];

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

    mergedDocument.translationUnitNodes.forEach((unit) => {
      let targetUnit = targetDocument.findTranslationUnit(unit.attributes.id);

      if (!targetUnit) {
        const meaning = mergedDocument.getUnitMeaning(unit);
        const description = mergedDocument.getUnitDescription(unit);
        const source = mergedDocument.getUnitSource(unit);

        if (meaning && source) {
          targetUnit = targetDocument.findTranslationUnitByMeaningAndSource(meaning, source);
        }

        if (!targetUnit && findByMeaningAndDescription && meaning && description) {
          targetUnit = targetDocument.findTranslationUnitByMeaningAndDescription(
            meaning,
            description,
          );
        }

        if (!targetUnit && findByMeaning && meaning) {
          targetUnit = targetDocument.findTranslationUnitByMeaning(meaning);
        }
      }

      mergedDocument.mergeUnit(unit, targetUnit);
    });

    return mergedDocument.extract();
  }
}
