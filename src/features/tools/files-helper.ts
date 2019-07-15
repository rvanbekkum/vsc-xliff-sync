import {
  Range,
  TextDocument,
  TextEditor,
  Uri,
  window,
  workspace
} from 'vscode';
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

  public static async createNewTargetFile(targetUri: Uri | undefined, newFileContents: string, sourceUri?: Uri | undefined, targetLanguage?: string | undefined) {
    let document: TextDocument;

    if (targetUri) {
        document = await workspace.openTextDocument(targetUri);
    } 
    else if (sourceUri) {
        targetUri = await FilesHelper.createTranslationFile(targetLanguage!, sourceUri, newFileContents);
        document = await workspace.openTextDocument(targetUri);
    }
    else {
      throw new Error('Could not generate new target file');
    }

    const editor: TextEditor = await window.showTextDocument(document);

    if (!editor) {
        throw new Error('Failed to open target file');
    }

    const range = new Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
    );

    await editor.edit((editBuilder) => {
        editBuilder.replace(range, newFileContents);
    });

    await document.save();
  }
}
