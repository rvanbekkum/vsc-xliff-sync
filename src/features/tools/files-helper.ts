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

import {
  Range,
  TextDocument,
  TextEditor,
  Uri,
  window,
  workspace,
  WorkspaceFolder,
  RelativePattern
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class FilesHelper {
  public static async findTranslationFiles(workspaceFolder: WorkspaceFolder, fileExt: string): Promise<Uri[]> {
    let relativePattern: RelativePattern = new RelativePattern(workspaceFolder, `**/*.${fileExt}`);
    return workspace.findFiles(relativePattern).then((files) =>
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

  public static getFileNameFromUri(fileUri: Uri): string {
    return fileUri.toString().replace(/^.*[\\\/]/, '').replace(/%20/g, ' ');
  }

  public static getSupportedFileExtensions(): string[] {
    return ['xlf', 'xlf2'];
  }
}
