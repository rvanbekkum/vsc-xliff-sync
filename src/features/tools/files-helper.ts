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
import { WorkspaceHelper } from './workspace-helper';

export class FilesHelper {

  /**
  * Get the list of XLIFF files in the opened workspace
  * 
  * @param {WorkspaceFolder} workspaceFolder The folder to restrict the search to.
  *
  * @returns An array of all file URIs to the XLIFF files in the current workspace.
  */
  public static async getXliffFileUris(workspaceFolder?: WorkspaceFolder): Promise<Uri[]> {
    let fileType: string | undefined = workspace.getConfiguration('xliffSync', workspaceFolder?.uri)['fileType'];
    let uris: Uri[] = [];

    if (fileType) {
        uris = (await FilesHelper.findTranslationFiles(fileType, workspaceFolder)) || [];
    }

    if (!uris.length) {
        fileType = await window.showQuickPick(['xlf', 'xlf2'], {
            placeHolder: 'Translation file type',
        });

        if (fileType) {
            uris = (await FilesHelper.findTranslationFiles(fileType, workspaceFolder)) || [];

            if (uris.length) {
                workspace.getConfiguration('xliffSync', workspaceFolder?.uri).update('fileType', fileType);
            }
        }
    }

    if (!uris.length) {
        throw new Error('No translation file found');
    }

    return uris;
  }

  /**
   * Retrieves the base/source/generated XLIFF file from a collection of XLIFF file URIs.
   * Also prompts the user to specify a base file, if this wasn't done already.
   * 
   * @param {Uri[]} xliffUris Array of XLIFF file URIs.
   * @param {WorkspaceFolder} workspaceFolder The workspace folder to restrict the search to.
   * @returns The Uri of the base/source XLIFF file.
   */
  public static async getXliffSourceFile(xliffUris: Uri[], workspaceFolder?: WorkspaceFolder): Promise<Uri> {
    const resourceUri: Uri | undefined = workspaceFolder?.uri;
    const baseFile: string = workspace.getConfiguration('xliffSync', resourceUri)['baseFile'];
    let sourceUri: Uri | undefined;

    const sourceUris: Uri[] | undefined = baseFile ? xliffUris.filter((uri) => uri.fsPath.indexOf(baseFile) >= 0) : undefined;
    if (sourceUris) {
      if (sourceUris.length === 1) {
        sourceUri = sourceUris[0];
      }
      else {
        sourceUri = await this.selectBaseFile(sourceUris, resourceUri);
      }
    }

    if (!sourceUri) {
      // File not found, request the user to identify the file himself
      sourceUri = await this.selectBaseFile(xliffUris, resourceUri);
      if (!sourceUri) {
        throw new Error('No base XLIFF file specified');
      }
    }

    return sourceUri;
  }

  private static async selectBaseFile(xliffUris: Uri[], resourceUri?: Uri): Promise<Uri | undefined> {
    let sourceUri: Uri | undefined;
    if (xliffUris.length > 1) {
      const fsPaths = xliffUris.map((uri) => uri.fsPath);
      const sourcePath = await window.showQuickPick(fsPaths, {
          placeHolder: 'Select the base XLIFF file',
      });
  
      if (!sourcePath) {
          return undefined;
      }

      sourceUri = xliffUris.find((uri) => uri.fsPath === sourcePath)!;
    }
    else if (xliffUris.length === 1) {
      sourceUri = xliffUris[0];
    }
    else {
      return undefined;
    }

    const filename = path.basename(sourceUri.fsPath);
    workspace.getConfiguration('xliffSync', resourceUri).update('baseFile', filename);

    return sourceUri;
  }

  public static async findTranslationFiles(fileType: string, workspaceFolder?: WorkspaceFolder): Promise<Uri[]> {
    if (workspaceFolder) {
      return await FilesHelper.findTranslationFilesInWorkspaceFolder(fileType, workspaceFolder);
    }
    else {
      let allFileUris: Uri[] = [];
      const workspaceFolders: WorkspaceFolder[] | undefined = await WorkspaceHelper.getWorkspaceFolders(true);
      if (workspaceFolders) {
        for (let wsFolder of workspaceFolders) {
          let folderFileUris: Uri[] = await FilesHelper.findTranslationFilesInWorkspaceFolder(fileType, wsFolder);
          allFileUris = allFileUris.concat(folderFileUris);
        }
      }
      return allFileUris;
    }
  }

  public static async findTranslationFilesInWorkspaceFolder(fileType: string, workspaceFolder: WorkspaceFolder): Promise<Uri[]> {
    const fileExt: string = FilesHelper.getTranslationFileExtensions(fileType);

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

  public static getTranslationFileExtensions(fileType: string): string {
    switch(fileType) {
      case 'xlf':
        return 'xlf';
      case 'xlf2':
        return 'xlf*';
    }
    return 'xlf';
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

  public static async createNewTargetFile(targetUri: Uri | undefined, newFileContents: string, sourceUri?: Uri | undefined, targetLanguage?: string | undefined): Promise<Uri> {
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

    return targetUri;
  }

  public static getFileNameFromUri(fileUri: Uri): string {
    return fileUri.toString().replace(/^.*[\\\/]/, '').replace(/%20/g, ' ');
  }

  public static getSupportedFileExtensions(): string[] {
    return ['xlf', 'xlf2'];
  }
}
