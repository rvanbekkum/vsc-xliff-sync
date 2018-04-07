import { Uri } from 'vscode';

export interface TranslationBuilder {
  findTranslationFiles(): Promise<Uri[]>;
  createTranslationFile(sourceUri: Uri, regionCode: string): Promise<Uri | null>;
  consolidateTranslationFiles(source: Uri, target: Uri): Promise<string>;
}
