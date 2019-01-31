import { workspace, Uri } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class FilesHelper {
  public static async findTranslationFiles(fileExt: string): Promise<Uri[]> {
    return workspace.findFiles(`**/*.${fileExt}`).then((files) =>
      files.sort((a, b) => {
        if (a.fsPath.length !== b.fsPath.length) {
          return a.fsPath.length - b.fsPath.length;
        }
        return a.fsPath.localeCompare(b.fsPath);
      }),
    );
  }

  public static async createTranslationFile(
    language: string,
    baseUri: Uri,
    content: string,
  ): Promise<Uri> {
    const newFilePath = path.parse(baseUri.fsPath);
    newFilePath.name += `.${language}`;
    newFilePath.base = newFilePath.name + newFilePath.ext;
    //TODO: Make this configurable?
    if (newFilePath.base.endsWith(`.g.${language}.xlf`)) {
      newFilePath.name = newFilePath.name.replace(`.g.${language}`, `.${language}`);
      newFilePath.base = newFilePath.base.replace(`.g.${language}.xlf`, `.${language}.xlf`);
    }
    const xlfPath = path.format(newFilePath);

    return new Promise<Uri>((resolve, reject) => {
      fs.writeFile(xlfPath, content, (error) => {
        if (error) {
          throw error;
        }
        resolve(Uri.file(xlfPath));
      });
    });
  }
}
