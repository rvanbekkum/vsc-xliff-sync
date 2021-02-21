/*
 * Copyright (c) 2019 Rob van Bekkum
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

import { ExtensionContext, window, commands, OpenDialogOptions, Uri, workspace, env, WorkspaceFolder } from "vscode";
import { XlfDocument } from './tools/xlf/xlf-document';
import { FilesHelper, WorkspaceHelper, XmlNode } from './tools';

export class XliffTranslationImport {
    constructor(context: ExtensionContext) {
        const importTranslationsDisposable = commands.registerCommand(
            'xliffSync.importTranslationsFromFiles',
            async () => {
                this.importTranslationsFromFiles();
            },
        );
        
        context.subscriptions.push(importTranslationsDisposable);
    }

    private async importTranslationsFromFiles() {
        const options: OpenDialogOptions = {
            canSelectMany: true,
            openLabel: 'Select',
            filters: {
               'XLIFF Files': ['xlf', 'xlf2']
           }
       };
       window.showOpenDialog(options).then(fileUris => {
            if (fileUris) {
                importTranslationsFromFiles(fileUris);
            }
       });
    }
}

async function importTranslationsFromFiles(fileUris: Uri[] | undefined) {
    if (!fileUris || fileUris.length === 0) {
        window.showErrorMessage('No files have been provided!');
        return;
    }

    const importWorkspaceFolders: WorkspaceFolder[] | undefined = await WorkspaceHelper.getWorkspaceFolders(true);
    if (!importWorkspaceFolders) {
        throw new Error(`No workspace folder found to use`);
    }
    for (let importWorkspaceFolder of importWorkspaceFolders) {
        await importTranslationsFromFilesForWorkspaceFolder(importWorkspaceFolder, fileUris);
    }
}

async function importTranslationsFromFilesForWorkspaceFolder(importWorkspaceFolder: WorkspaceFolder, fileUris: Uri[] | undefined) {
    if (!fileUris || fileUris.length === 0) {
        window.showErrorMessage('No files have been provided!');
        return;
    }

    let uris: Uri[] = await FilesHelper.getXliffFileUris(importWorkspaceFolder);
    let sourceUri: Uri = await FilesHelper.getXliffSourceFile(uris, importWorkspaceFolder);
    let targetUris = uris.filter((uri) => uri !== sourceUri);
    for (let index = 0; index < fileUris.length; index++) {
        let fileUri: Uri = fileUris[index];
        await importTranslationsFromFile(importWorkspaceFolder, fileUri, targetUris);
    }
}

async function importTranslationsFromFile(workspaceFolder: WorkspaceFolder, fileUri: Uri, targetUris: Uri[]) {
    if (!fileUri) {
        window.showErrorMessage('The provided file URI is invalid!');
        return;
    }
    const replaceTranslationsDuringImport: boolean = workspace.getConfiguration('xliffSync', workspaceFolder.uri)['replaceTranslationsDuringImport'];

    const selFileDocument = await XlfDocument.loadFromUri(fileUri, workspaceFolder.uri);
    let sourceDevNoteTranslations: { [key: string]: (XmlNode | string)[]; } = {};
    selFileDocument.translationUnitNodes.forEach((unit) => {
        const sourceDevNoteText = getSourceDevNoteText(selFileDocument, unit);
        if (sourceDevNoteText && !(sourceDevNoteText in sourceDevNoteTranslations)) {
            const translChildNodes = selFileDocument.getUnitTranslationChildren(unit);
            if (translChildNodes) {
                sourceDevNoteTranslations[sourceDevNoteText] = translChildNodes;
            }
        }
    });

    for (let index = 0; index < targetUris.length; index++) {
        let targetUri: Uri = targetUris[index];
        if (!targetUri) {
            continue;
        }

        const targetDocument = await XlfDocument.loadFromUri(targetUri, workspaceFolder.uri);
        if (targetDocument.targetLanguage !== selFileDocument.targetLanguage) {
            continue;
        }

        let translationsImported: number = 0;
        targetDocument.translationUnitNodes.forEach((unit) => {
            if (!replaceTranslationsDuringImport && targetDocument.getUnitTranslationText(unit)) {
                return;
            }

            let sourceDevNoteText = getSourceDevNoteText(targetDocument, unit);
            if (!sourceDevNoteText) {
                return;
            }
            if (!(sourceDevNoteText in sourceDevNoteTranslations)) {
                sourceDevNoteText = targetDocument.getUnitSourceText(unit);
            }
            if (!sourceDevNoteText) {
                return;
            }
            if (sourceDevNoteText in sourceDevNoteTranslations) {
                targetDocument.mergeUnit(unit, unit, sourceDevNoteTranslations[sourceDevNoteText]);
                translationsImported += 1;
            }
        });

        if (translationsImported > 0) {
            const fileName = targetUri.toString().replace(/^.*[\\\/]/, '').replace(/%20/g, ' ');
            const messagesText = ` ${translationsImported} translation(s) imported.`;
            window.showInformationMessage(`"${fileName}":${messagesText}`, 'Open Externally').then(selection => {
                if (selection === 'Open Externally') {
                    env.openExternal(targetUri);
                }
            });

            // Update the target document file with the imported translations
            const newFileContents = targetDocument.extract();

            if (!newFileContents) {
                throw new Error(`No ouput generated. File: ${targetUri}`);
            }

            await FilesHelper.createNewTargetFile(targetUri, newFileContents);
        }
    }

    function getSourceDevNoteText(xlfDocument: XlfDocument, unit: XmlNode): string | undefined {
        let sourceDevNoteText = xlfDocument.getUnitSourceText(unit);
        if (!sourceDevNoteText) {
            return undefined;
        }
        const devNoteText = xlfDocument.getUnitDeveloperNote(unit);
        if (devNoteText) {
            sourceDevNoteText += devNoteText;
        }
        return sourceDevNoteText;
    }
}