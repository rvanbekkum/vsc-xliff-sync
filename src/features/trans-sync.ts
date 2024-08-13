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

import open = require('open');
import {
    ProgressLocation,
    QuickPickItem,
    Uri,
    window,
    workspace,
    WorkspaceConfiguration,
    WorkspaceFolder,
    commands
} from 'vscode';
import * as fs from 'fs';

import { FilesHelper, LanguageHelper, WorkspaceHelper } from './tools';
import { XlfTranslator } from './tools/xlf-translator';
import { XlfDocument } from './tools/xlf/xlf-document';
import { runTranslationChecksForWorkspaceFolder } from './trans-check';

export async function synchronizeFiles(allFiles: boolean) {
    const syncWorkspaceFolders: WorkspaceFolder[] | undefined = await WorkspaceHelper.getWorkspaceFolders(allFiles);
    if (!syncWorkspaceFolders) {
        throw new Error(`No workspace folder found to use`);
    }

    const syncCrossWorkspaceFolders: boolean = workspace.getConfiguration('xliffSync')['syncCrossWorkspaceFolders'];
    if (syncCrossWorkspaceFolders) {
        await synchronizeFilesInWorkspace(allFiles);
    }
    else {
        for (let syncWorkspaceFolder of syncWorkspaceFolders) {
            await synchronizeFilesInWorkspace(allFiles, syncWorkspaceFolder);
        }
    }
}

export async function createNewTargetFiles() {
    const syncWorkspaceFolders: WorkspaceFolder[] | undefined = await WorkspaceHelper.getWorkspaceFolders(false);
    if (!syncWorkspaceFolders) {
        throw new Error(`No workspace folder found to use`);
    }
    let workspaceFolder: WorkspaceFolder | undefined;
    const syncCrossWorkspaceFolders: boolean = workspace.getConfiguration('xliffSync')['syncCrossWorkspaceFolders'];
    if (!syncCrossWorkspaceFolders) {
        workspaceFolder = await window.showWorkspaceFolderPick({
            placeHolder: 'Select a workspace folder'
        });
        if (!workspaceFolder) {
            throw new Error(`Aborted. You need to select a workspace folder.`);
        }
    }

    let uris: Uri[] = await FilesHelper.getXliffFileUris(workspaceFolder);
    let sourceUri: Uri = await FilesHelper.getXliffSourceFile(uris, workspaceFolder);
    await executeCreateNewTargetFiles(workspaceFolder, sourceUri);
}

async function executeCreateNewTargetFiles(workspaceFolder: WorkspaceFolder | undefined, sourceUri: Uri) {
    const fileType: string | undefined = workspace.getConfiguration('xliffSync', workspaceFolder?.uri)['fileType'];
    let targetLanguages: string[] | undefined = workspace.getConfiguration('xliffSync', workspaceFolder?.uri)['defaultLanguages'];
    if (!targetLanguages || targetLanguages.length === 0) {
        targetLanguages = await selectNewTargetLanguages(fileType!, true);
    }
    if (!targetLanguages || targetLanguages.length === 0) {
        return;
    }

    for (let targetLanguage of targetLanguages) {
        await synchronizeAndCheckTargetFile(sourceUri, undefined, targetLanguage, workspaceFolder);
    }
}

export async function buildWithTranslations() {
    return await window.withProgress({
        location: ProgressLocation.Notification,
        title: `Building with Translations`,
        cancellable: false
    }, async progress => {
        progress.report({ message: "Initializing..." });
        let workspaceFolders: WorkspaceFolder[] | undefined = await WorkspaceHelper.getWorkspaceFolders(false);
        let workspaceFolder: WorkspaceFolder | undefined = workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error(`No workspace found for active file.`);
        }

        // Execute the build command (Ctrl + Shift + B)
        progress.report({ message: "Executing build command..." });
        const buildCommand: string | undefined = workspace.getConfiguration('xliffSync', workspaceFolder.uri)['buildCommandToExecute'];
        if (!buildCommand) {
            throw new Error(`No build command specified`);
        }
        await commands.executeCommand(buildCommand);

        // Execute the xliffSync.synchronizeSources command
        progress.report({ message: "Synchronizing Translation Units..." });
        let fileType: string | undefined = workspace.getConfiguration('xliffSync', workspaceFolder.uri)['fileType'];
        if (!fileType) {
            throw new Error(`Failed synchronizing translation files.`);
        }
        let translationFiles: Uri[] = await FilesHelper.findTranslationFilesInWorkspaceFolder(fileType, workspaceFolder);
        for (let file of translationFiles) {
            if (!file.fsPath.endsWith(`g.${fileType}`)) {
                await synchronizeWithSelectedFile(file);
                await FilesHelper.saveOpenXliffFiles();
            }
        }

        progress.report({ message: "Build and translation synchronization complete!" });
    });
}

/**
 * Synchronize translation files in a workspace.
 *
 * @param {boolean} allFiles Whether to sync from the base file to all other files or a single one.
 * @param {WorkspaceFolder} workspaceFolder The workspace folder to restrict the sync to.
 */
async function synchronizeFilesInWorkspace(allFiles: boolean, workspaceFolder?: WorkspaceFolder) {
    try {
        let uris: Uri[] = await FilesHelper.getXliffFileUris(workspaceFolder);

        let sourceUri: Uri = await FilesHelper.getXliffSourceFile(uris, workspaceFolder);
        let targetUris = uris.filter((uri) => uri !== sourceUri);

        if (!allFiles) {
            await synchronizeSingleFile(sourceUri, targetUris, workspaceFolder);
        }
        else {
            await synchronizeAllFiles(sourceUri, targetUris, workspaceFolder);
        }
    }
    catch (ex) {
        window.showErrorMessage(ex.message);
    }
}

export async function synchronizeWithSelectedFile(fileUri: Uri) {
    try {
        let workspaceFolder: WorkspaceFolder | undefined;

        const syncCrossWorkspaceFolders: boolean = workspace.getConfiguration('xliffSync')['syncCrossWorkspaceFolders'];
        if (!syncCrossWorkspaceFolders) {
            workspaceFolder = workspace.getWorkspaceFolder(fileUri);
            if (!workspaceFolder) {
                throw new Error(`File "${fileUri}" does not match any workspace folder!`);
            }
        }

        let uris: Uri[] = await FilesHelper.getXliffFileUris(workspaceFolder);

        let sourceUri: Uri = await FilesHelper.getXliffSourceFile(uris, workspaceFolder);

        if (sourceUri.fsPath !== fileUri.fsPath) {
            await synchronizeAndCheckTargetFile(sourceUri, fileUri, undefined, workspaceFolder);
        }
        else {
            let targetUris = uris.filter((uri) => uri !== sourceUri);
            await synchronizeAllFiles(sourceUri, targetUris, workspaceFolder);
        }
    }
    catch (ex) {
        window.showErrorMessage(ex.message);
    }
}

async function synchronizeSingleFile(sourceUri: Uri, targetUris: Uri[], workspaceFolder?: WorkspaceFolder) {
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
            const fileType: string | undefined = workspace.getConfiguration('xliffSync', workspaceFolder?.uri)['fileType'];
            targetLanguage = await selectNewTargetLanguage(fileType!);
            if (!targetLanguage) {
                throw new Error('No target language specified');
            }
        }
        else {
            targetUri = targetUris.find((uri) => uri.fsPath === targetPath)!;
        }
    }

    await synchronizeAndCheckTargetFile(sourceUri, targetUri, targetLanguage, workspaceFolder);
}

async function selectNewTargetLanguage(fileType: string): Promise<string | undefined> {
    var targetLanguages: string[] | undefined = await selectNewTargetLanguages(fileType, false);
    if (targetLanguages) {
        return targetLanguages[0];
    }
    return undefined;
}

async function selectNewTargetLanguages(fileType: string, multiSelectAllowed: boolean): Promise<string[] | undefined> {
    var languageTagOptions: QuickPickItem[] = LanguageHelper.getLanguageTagList(fileType);
    var multiSelectLabel = '$(tasklist) Select multiple...';
    var enterCustomLabel = '$(pencil) Enter custom...';
    var altActions = [];
    if (multiSelectAllowed) {
        altActions.push({ label: multiSelectLabel });
    }
    altActions.push({ label: enterCustomLabel });

    const targetLanguagePickSingle: QuickPickItem | undefined = await window.showQuickPick<QuickPickItem>(
        altActions.concat(languageTagOptions),
        {
            canPickMany: false,
            placeHolder: 'Select target language'
        }
    );
    if (!targetLanguagePickSingle) {
        return undefined;
    }
    if (targetLanguagePickSingle.label === enterCustomLabel) {
        var customTargetLanguage = await window.showInputBox({ prompt: 'Enter target language tag', placeHolder: 'Example: en-US' });
        if (!customTargetLanguage) {
            return undefined;
        }
        return [customTargetLanguage];
    }
    if (targetLanguagePickSingle.label === multiSelectLabel) {
        const targetLanguagePicks: QuickPickItem[] | undefined = await window.showQuickPick<QuickPickItem>(
            languageTagOptions,
            {
                canPickMany: true,
                placeHolder: 'Select target languages'
            }
        );
        let targetLanguageTags: string[] | undefined = undefined;
        if (targetLanguagePicks) {
            targetLanguageTags = targetLanguagePicks.map(lang => lang.label);
        }
        return targetLanguageTags;
    }

    return [targetLanguagePickSingle.label];
}

async function synchronizeAndCheckTargetFile(sourceUri: Uri, targetUri: Uri | undefined, targetLanguage?: string | undefined, workspaceFolder?: WorkspaceFolder) {
    await synchronizeTargetFile(sourceUri, targetUri, targetLanguage, workspaceFolder);
    if (targetUri) {
        await autoRunTranslationChecks(workspaceFolder, targetUri);
    }
}

async function synchronizeTargetFile(sourceUri: Uri, targetUri: Uri | undefined, targetLanguage?: string | undefined, workspaceFolder?: WorkspaceFolder) {
    let fileName: string = targetLanguage || '';
    if (targetUri) {
        fileName = FilesHelper.getFileNameFromUri(targetUri);
    }

    return await window.withProgress({
        location: ProgressLocation.Notification,
        title: `Syncing "${fileName}"`,
        cancellable: false
    }, async progress => {
        if (!targetUri && !targetLanguage) {
            throw new Error('No target file specified');
        }

        try {
            const source = (await workspace.openTextDocument(sourceUri)).getText();
            const target = targetUri
                ? (await workspace.openTextDocument(targetUri)).getText()
                : undefined;

            const newFileContents = await XlfTranslator.synchronize(source, target, targetLanguage, workspaceFolder);

            if (!newFileContents) {
                throw new Error(`No output generated.`);
            }

            targetUri = await FilesHelper.createNewTargetFile(targetUri, newFileContents, sourceUri, targetLanguage);
            const xliffWorkspaceConfiguration: WorkspaceConfiguration = workspace.getConfiguration('xliffSync', workspaceFolder?.uri);
            const openExternallyAfterEvent: string[] = xliffWorkspaceConfiguration['openExternallyAfterEvent'];
            if (openExternallyAfterEvent.indexOf("Sync") > -1) {
                open(decodeURIComponent(targetUri.toString()));
            }
        }
        catch (ex) {
            window.showErrorMessage(`Failed to sync: ${ex.message}; File: ${targetUri} / Target Language: ${targetLanguage}`)
        }
    });
}

async function synchronizeAllFiles(sourceUri: Uri, targetUris: Uri[], workspaceFolder?: WorkspaceFolder) {
    const xliffWorkspaceConfiguration: WorkspaceConfiguration = workspace.getConfiguration('xliffSync', workspaceFolder?.uri);
    const matchingOriginalOnly: string[] = xliffWorkspaceConfiguration['matchingOriginalOnly'];

    let equivalentLanguages: any = xliffWorkspaceConfiguration.inspect('equivalentLanguages')?.workspaceFolderValue;
    if (!equivalentLanguages) {
        equivalentLanguages = xliffWorkspaceConfiguration['equivalentLanguages'];
    }
    const equivalentLanguagesEnabled: boolean = xliffWorkspaceConfiguration['equivalentLanguagesEnabled'];
    let slavesToMaster: { [id: string]: string } = {};
    if (equivalentLanguagesEnabled) {
        for (let master in equivalentLanguages) {
            const slavePattern = equivalentLanguages[master];
            slavesToMaster[slavePattern] = master;
        }
    }
    let masterLanguageToUri: { [masterLangCode: string]: Uri } = {};
    let masterLanguageToSlaveLanguages: { [masterLangCode: string]: string[] } = {};
    let slaveLanguageToUri: { [slaveLangCode: string]: Uri } = {};

    let sourceDocOriginal: string | undefined = undefined;
    if (matchingOriginalOnly) {
        const sourceDoc = await XlfDocument.loadFromUri(sourceUri, workspaceFolder?.uri);
        sourceDocOriginal = sourceDoc.original;
    }

    for (let index = 0; index < targetUris.length; index++) {
        let targetUri: Uri = targetUris[index];

        try {
            let targetDocOriginal: string | undefined = undefined;
            let isSlaveLanguage: boolean = false;
            if (matchingOriginalOnly || equivalentLanguagesEnabled) {
                const targetDoc = await XlfDocument.loadFromUri(targetUri, workspaceFolder?.uri);
                if (matchingOriginalOnly) {
                    targetDocOriginal = targetDoc.original;
                }

                if (equivalentLanguagesEnabled && targetDoc.targetLanguage) {
                    // Check if master language
                    if (targetDoc.targetLanguage in equivalentLanguages) {
                        masterLanguageToUri[targetDoc.targetLanguage] = targetUri;
                    }
                    // Check if slave language
                    else {
                        const masterLanguage: string | undefined = getMasterLanguage(slavesToMaster, targetDoc.targetLanguage);
                        if (masterLanguage) {
                            if (!(masterLanguage in masterLanguageToSlaveLanguages)) {
                                masterLanguageToSlaveLanguages[masterLanguage] = [];
                            }
                            masterLanguageToSlaveLanguages[masterLanguage].push(targetDoc.targetLanguage);
                            slaveLanguageToUri[targetDoc.targetLanguage] = targetUri;
                            isSlaveLanguage = true;
                        }
                    }
                }
            }

            if ((sourceDocOriginal == targetDocOriginal) && !isSlaveLanguage) {
                await synchronizeTargetFile(sourceUri, targetUri, undefined, workspaceFolder);
            }
        }
        catch (ex) {
            window.showErrorMessage(ex.message);
        }
    }

    for (let masterLanguage in masterLanguageToUri) {
        const masterUri: Uri = masterLanguageToUri[masterLanguage];
        const newSlaveDoc = await XlfDocument.loadFromUri(masterUri, workspaceFolder?.uri);

        const slaveLanguages: string[] = masterLanguageToSlaveLanguages[masterLanguage];
        if (slaveLanguages) {
            for (let slaveLanguage of slaveLanguages) {
                newSlaveDoc.targetLanguage = slaveLanguage;
                const newSlaveContent: string | undefined = newSlaveDoc.extract();
                if (newSlaveContent) {
                    await FilesHelper.createNewTargetFile(slaveLanguageToUri[slaveLanguage], newSlaveContent, sourceUri, slaveLanguage);
                }
            }
        }
    }

    window.showInformationMessage('Translation files successfully synchronized!');

    await autoRunTranslationChecks(workspaceFolder);
}

function getMasterLanguage(slavePatternsToMaster: { [id: string]: string }, targetLanguage: string): string | undefined {
    for (let slavePattern in slavePatternsToMaster) {
        if (new RegExp(slavePattern).test(targetLanguage)) {
            return slavePatternsToMaster[slavePattern];
        }
    }
    return undefined;
}

async function autoRunTranslationChecks(workspaceFolder?: WorkspaceFolder, targetUri?: Uri) {
    const autoCheckMissingTranslations: boolean = workspace.getConfiguration('xliffSync', workspaceFolder?.uri)[
        'autoCheckMissingTranslations'
    ];
    const autoCheckNeedWorkTranslations: boolean = workspace.getConfiguration('xliffSync', workspaceFolder?.uri)[
        'autoCheckNeedWorkTranslations'
    ];

    await runTranslationChecksForWorkspaceFolder(autoCheckMissingTranslations, autoCheckNeedWorkTranslations, targetUri, workspaceFolder);
}
