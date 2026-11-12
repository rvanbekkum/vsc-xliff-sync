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
  RelativePattern,
  commands,
  CancellationToken,
  CancellationError
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceHelper } from './workspace-helper';

export class FilesHelper {

  public static useFileSystem(resourceUri: Uri): boolean {
    return workspace.getConfiguration('xliffSync', resourceUri)['useFileSystem'];
  }

  public static async getReferenceFilePaths(resourceUri: Uri): Promise<string[]> {
    const configured: string[] = workspace.getConfiguration('xliffSync', resourceUri)['referenceTranslationFiles'] || [];
    const paths: string[] = [];
    for (const filePath of configured) {
      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new Error('referenceTranslationFiles must contain nonempty XLIFF file paths.');
      }
      const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(resourceUri.fsPath, filePath);
      if (!/\.xlf2?$/i.test(resolved)) {
        throw new Error(`Reference translation must be an .xlf or .xlf2 file: ${resolved}`);
      }
      paths.push(await fs.promises.realpath(resolved));
    }
    return Array.from(new Set(paths));
  }

  public static assertSaved(fileUri: Uri): void {
    const document = workspace.textDocuments.find(document => document.uri.toString() === fileUri.toString());
    if (document?.isDirty) {
      throw new Error(`Save or revert unsaved changes before processing ${fileUri.fsPath}.`);
    }
  }

  private static assertLocalFile(fileUri: Uri): void {
    if (fileUri.scheme !== 'file') {
      throw new Error(`Filesystem I/O requires a local file URI: ${fileUri}. Disable xliffSync.useFileSystem to use a VS Code filesystem provider.`);
    }
  }

  public static async readFile(fileUri: Uri, resourceUri: Uri = fileUri): Promise<string> {
    if (!this.useFileSystem(resourceUri)) {
      return (await workspace.openTextDocument(fileUri)).getText();
    }
    this.assertLocalFile(fileUri);
    this.assertSaved(fileUri);
    const contents = await fs.promises.readFile(fileUri.fsPath, 'utf8');
    return contents.replace(/^\uFEFF/, '');
  }

  public static async writeFile(fileUri: Uri, contents: string, create: boolean = false, token?: CancellationToken): Promise<void> {
    this.assertLocalFile(fileUri);
    this.assertSaved(fileUri);
    const folder = workspace.getWorkspaceFolder(fileUri);
    if (folder) {
      const references = await this.getReferenceFilePaths(folder.uri);
      if (!create && references.includes(await fs.promises.realpath(fileUri.fsPath))) {
        throw new Error(`Configured reference translation files are read-only: ${fileUri.fsPath}`);
      }
    }
    let bom = '';
    let original: string | undefined;
    if (!create) {
      original = await fs.promises.readFile(fileUri.fsPath, 'utf8');
      if (original.startsWith('\uFEFF')) {
        bom = '\uFEFF';
      }
    }
    let output = contents.replace(/^\uFEFF/, '');
    const lineEnding = original?.match(/\r\n|\n|\r/)?.[0];
    if (lineEnding) {
      output = output.replace(/\r\n|\n|\r/g, lineEnding);
    }
    output = bom + output;
    this.assertSaved(fileUri);
    if (token?.isCancellationRequested) {
      throw new CancellationError();
    }
    if (original === output) {
      return;
    }
    await fs.promises.writeFile(fileUri.fsPath, output, { encoding: 'utf8', flag: create ? 'wx' : 'w' });
  }

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
      throw new Error(`No translation file found (Workspace: "${workspaceFolder?.name}").`);
    }

    return uris;
  }

  /**
    * Checks if translation files exist in the opened workspace
    *
    * @param {WorkspaceFolder} workspaceFolder The folder to restrict the search to.
    *
    * @returns A boolean that specifies whether translation files exist in the current workspace.
    */
  public static async xliffFilesExist(workspaceFolder?: WorkspaceFolder): Promise<boolean> {
    let fileType: string | undefined = workspace.getConfiguration('xliffSync', workspaceFolder?.uri)['fileType'];
    let uris: Uri[] = [];

    if (fileType) {
      uris = (await FilesHelper.findTranslationFiles(fileType, workspaceFolder)) || [];
    }

    return uris.length !== 0;
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
    const references = await this.getReferenceFilePaths(workspaceFolder.uri);
    const files = await workspace.findFiles(relativePattern);
    const targets: Uri[] = [];
    for (const file of files) {
      if (!references.includes(await fs.promises.realpath(file.fsPath))) {
        targets.push(file);
      }
    }
    return targets.sort((a, b) => {
        if (a.fsPath.length !== b.fsPath.length) {
          return a.fsPath.length - b.fsPath.length;
        }
        return a.fsPath.localeCompare(b.fsPath);
      });
  }

  public static getTranslationFileExtensions(fileType: string): string {
    switch (fileType) {
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

    const uri = Uri.file(xlfPath);
    if (this.useFileSystem(baseUri)) {
      await this.writeFile(uri, content, true);
    }
    else {
      await fs.promises.writeFile(xlfPath, content, 'utf8');
    }
    return uri;
  }

  public static async createNewTargetFile(targetUri: Uri | undefined, newFileContents: string, sourceUri?: Uri | undefined, targetLanguage?: string | undefined): Promise<Uri> {
    if (targetUri) {
      const folder = workspace.getWorkspaceFolder(targetUri);
      if (folder && (await this.getReferenceFilePaths(folder.uri)).includes(await fs.promises.realpath(targetUri.fsPath))) {
        throw new Error(`Configured reference translation files are read-only: ${targetUri.fsPath}`);
      }
    }
    const resourceUri = targetUri || sourceUri;
    if (resourceUri && this.useFileSystem(resourceUri)) {
      if (targetUri) {
        await this.writeFile(targetUri, newFileContents);
        return targetUri;
      }
      if (sourceUri && targetLanguage) {
        return this.createTranslationFile(targetLanguage, sourceUri, newFileContents);
      }
      throw new Error('Could not generate new target file');
    }
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

    let keepEditorOpenAfterSync: boolean = workspace.getConfiguration('xliffSync', targetUri)['keepEditorOpenAfterSync'];
    if (!keepEditorOpenAfterSync) {
      await commands.executeCommand('workbench.action.closeActiveEditor');
    }

    return targetUri;
  }

  public static getFileNameFromUri(fileUri: Uri): string {
    return fileUri.toString().replace(/^.*[\\\/]/, '').replace(/%20/g, ' ');
  }

  public static getSupportedFileExtensions(): string[] {
    return ['xlf', 'xlf2'];
  }
}
