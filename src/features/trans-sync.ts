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
    Uri,
    window,
    workspace,
    WorkspaceFolder
} from 'vscode';

import { FilesHelper, WorkspaceHelper } from './tools';
import { XlfTranslator } from './tools/xlf-translator';

import * as path from 'path';
import { runTranslationChecksForWorkspaceFolder } from './trans-check';

export async function synchronizeFiles(allFiles: boolean) {
    const syncWorkspaceFolders: WorkspaceFolder[] | undefined = await WorkspaceHelper.getWorkspaceFolders(allFiles);
    if (!syncWorkspaceFolders) {
        throw new Error(`No workspace folder found to use`);
    }
    
    for (let syncWorkspaceFolder of syncWorkspaceFolders) {
        await synchronizeFilesForWorkspaceFolder(syncWorkspaceFolder, allFiles);
    }
}

async function synchronizeFilesForWorkspaceFolder(workspaceFolder: WorkspaceFolder, allFiles: boolean) {
    try {
        let uris: Uri[] = await getXliffFileUrisInWorkSpace(workspaceFolder);

        let sourceUri: Uri = await getXliffSourceFile(workspaceFolder, uris);
        let targetUris = uris.filter((uri) => uri !== sourceUri);

        if (!allFiles) {
            synchronizeSingleFile(workspaceFolder, sourceUri, targetUris);
        }
        else {
            synchronizeAllFiles(workspaceFolder, sourceUri, targetUris);
        }
    } 
    catch (ex) {
        window.showErrorMessage(ex.message);
    }
}

export async function synchronizeWithSelectedFile(fileUri: Uri) {
    try {
        const workspaceFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(fileUri);
        if (!workspaceFolder) {
            throw new Error(`File "${fileUri}" does not match any workspace folder!`);
        }

        let uris: Uri[] = await getXliffFileUrisInWorkSpace(workspaceFolder);

        let sourceUri: Uri = await getXliffSourceFile(workspaceFolder, uris);
        
        if (sourceUri.fsPath !== fileUri.fsPath) {
            synchronizeTargetFile(workspaceFolder, sourceUri, fileUri);
        }
        else {
            let targetUris = uris.filter((uri) => uri !== sourceUri);
            synchronizeAllFiles(workspaceFolder, sourceUri, targetUris);
        }
    } 
    catch (ex) {
        window.showErrorMessage(ex.message);
    }
}

/**
* Get the list of XLIFF files in the opened workspace
* 
* @param {WorkspaceFolder} workspaceFolder The folder to restrict the search to.
*
* @returns An array of all file URIs to the XLIFF files in the current workspace.
*/
export async function getXliffFileUrisInWorkSpace(workspaceFolder: WorkspaceFolder): Promise<Uri[]> {
    let fileType: string | undefined = workspace.getConfiguration('xliffSync', workspaceFolder.uri)['fileType'];
    let uris: Uri[] = [];

    if (fileType) {
        uris = (await FilesHelper.findTranslationFiles(workspaceFolder, fileType)) || [];
    }

    if (!uris.length) {
        fileType = await window.showQuickPick(['xlf', 'xlf2'], {
            placeHolder: 'Translation file type',
        });

        if (fileType) {
            uris = (await FilesHelper.findTranslationFiles(workspaceFolder, fileType)) || [];

            if (uris.length) {
                workspace.getConfiguration('xliffSync', workspaceFolder.uri).update('fileType', fileType);
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
 * @returns The Uri of the base/source XLIFF file.
 */
export async function getXliffSourceFile(workspaceFolder: WorkspaceFolder, xliffUris: Uri[]): Promise<Uri> {
    const baseFile: string = workspace.getConfiguration('xliffSync', workspaceFolder.uri)['baseFile'];
    let sourceUri = baseFile ? xliffUris.find((uri) => uri.fsPath.indexOf(baseFile) >= 0) : undefined;

    if (!sourceUri) {
        // File not found, request the user to identify the file himself
        const fsPaths = xliffUris.map((uri) => uri.fsPath);
        const sourcePath = await window.showQuickPick(fsPaths, {
            placeHolder: 'Select the base XLIFF file',
        });

        if (!sourcePath) {
            throw new Error('No base XLIFF file specified');
        }

        sourceUri = xliffUris.find((uri) => uri.fsPath === sourcePath)!;
        const filename = path.basename(sourceUri.fsPath);
        workspace.getConfiguration('xliffSync', workspaceFolder.uri).update('baseFile', filename);
    }

    return sourceUri;
}

async function synchronizeSingleFile(workspaceFolder: WorkspaceFolder, sourceUri: Uri, targetUris: Uri[]) {
    const activeEditor = window.activeTextEditor;

    let targetUri: Uri | undefined;
    let targetLanguage: string | undefined;

    // First try the active file
    if (activeEditor) {
        targetUri = targetUris.find((uri) => uri.fsPath === activeEditor.document.uri.fsPath);
    }

    if (!targetUri) {
        const fsPath = [...targetUris.map((uri) => uri.fsPath), 'New File...'];
        let targetPath = await window.showQuickPick(fsPath, {
            placeHolder: 'Select Target File: ',
        });

        if (!targetPath) {
            throw new Error('No target file selected');
        } 
        else if (targetPath === 'New File...') {
            targetLanguage = await window.showInputBox({ placeHolder: 'Region/Language Code' });

            if (!targetLanguage) {
                throw new Error('No target language specified');
            }
        } 
        else {
            targetUri = targetUris.find((uri) => uri.fsPath === targetPath)!;
        }
    }

    synchronizeTargetFile(workspaceFolder, sourceUri, targetUri, targetLanguage);
}

async function synchronizeTargetFile(workspaceFolder: WorkspaceFolder, sourceUri: Uri, targetUri: Uri | undefined, targetLanguage?: string | undefined) {
    if (!targetUri && !targetLanguage) {
        throw new Error('No target file specified');
    }

    const source = (await workspace.openTextDocument(sourceUri)).getText();
    const target = targetUri
        ? (await workspace.openTextDocument(targetUri)).getText()
        : undefined;

    const newFileContents = await XlfTranslator.synchronize(workspaceFolder, source, target, targetLanguage);

    if (!newFileContents) {
        throw new Error('No ouput generated');
    }

    await FilesHelper.createNewTargetFile(targetUri, newFileContents, sourceUri, targetLanguage);
    autoRunTranslationChecks(workspaceFolder);
}

async function synchronizeAllFiles(workspaceFolder: WorkspaceFolder, sourceUri: Uri, targetUris: Uri[]) {
    for (let index = 0; index < targetUris.length; index++) {
        let targetUri: Uri = targetUris[index];
        const source = (await workspace.openTextDocument(sourceUri)).getText();
        const target = targetUri
            ? (await workspace.openTextDocument(targetUri)).getText()
            : undefined;

        const newFileContents = await XlfTranslator.synchronize(workspaceFolder, source, target, undefined);

        if (!newFileContents) {
            throw new Error('No ouput generated');
        }

        await FilesHelper.createNewTargetFile(targetUri, newFileContents);
    }

    window.showInformationMessage('Translation files successfully synchronized!');

    autoRunTranslationChecks(workspaceFolder);
}

async function autoRunTranslationChecks(workspaceFolder: WorkspaceFolder) {
    const autoCheckMissingTranslations: boolean = workspace.getConfiguration('xliffSync', workspaceFolder.uri)[
        'autoCheckMissingTranslations'
    ];
    const autoCheckNeedWorkTranslations: boolean = workspace.getConfiguration('xliffSync', workspaceFolder.uri)[
        'autoCheckNeedWorkTranslations'
    ];

    runTranslationChecksForWorkspaceFolder(workspaceFolder, autoCheckMissingTranslations, autoCheckNeedWorkTranslations);
}
