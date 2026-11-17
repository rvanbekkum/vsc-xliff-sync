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
import * as path from 'path';
import {
    ProgressLocation,
    QuickPickItem,
    Uri,
    window,
    workspace,
    WorkspaceConfiguration,
    WorkspaceFolder,
    commands,
    CancellationToken,
    CancellationError,
    Range,
    Position,
    WorkspaceEdit
} from 'vscode';

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
        await synchronizeFilesInWorkspace(true, workspaceFolder);

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
    const synchronizedUri = await synchronizeTargetFile(sourceUri, targetUri, targetLanguage, workspaceFolder);
    if (synchronizedUri) {
        await autoRunTranslationChecks(workspaceFolder, synchronizedUri);
    }
}

export interface AgentSynchronization {
    token: CancellationToken;
    synchronizedFiles: string[];
    skippedFiles: string[];
}

export async function synchronizeTargetFile(sourceUri: Uri, targetUri: Uri | undefined, targetLanguage?: string | undefined, workspaceFolder?: WorkspaceFolder, agent?: AgentSynchronization) {
    if (agent) {
        if (!targetUri) {
            throw new Error('An explicit target file is required for agent synchronization.');
        }
        const source = await FilesHelper.readFile(sourceUri, workspaceFolder?.uri);
        const target = targetLanguage ? undefined : await FilesHelper.readFile(targetUri, workspaceFolder?.uri);
        const contents = await XlfTranslator.synchronize(source, target, targetLanguage, workspaceFolder);
        if (!contents) {
            throw new Error(`No output generated for ${targetUri.fsPath}.`);
        }
        await saveAgentTarget(targetUri, contents, agent, !!targetLanguage);
        return targetUri;
    }
    let fileName: string = targetLanguage || '';
    if (targetUri) {
        fileName = FilesHelper.getFileNameFromUri(targetUri);
    }

    return await window.withProgress({
        location: FilesHelper.useFileSystem(workspaceFolder?.uri || sourceUri)
            ? ProgressLocation.Window
            : ProgressLocation.Notification,
        title: `Syncing "${fileName}"`,
        cancellable: false
    }, async progress => {
        if (!targetUri && !targetLanguage) {
            throw new Error('No target file specified');
        }

        try {
            const source = await FilesHelper.readFile(sourceUri, workspaceFolder?.uri);
            const target = targetUri
                ? await FilesHelper.readFile(targetUri, workspaceFolder?.uri)
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
            return targetUri;
        }
        catch (ex) {
            window.showErrorMessage(`Failed to sync: ${ex.message}; File: ${targetUri} / Target Language: ${targetLanguage}`)
        }
    });
}

export async function saveAgentTarget(targetUri: Uri, contents: string, agent: AgentSynchronization, create: boolean = false) {
    if (/\.g\.xlf2?$/i.test(targetUri.fsPath)) {
        throw new Error(`Generated base XLIFF must never receive translations: ${targetUri.fsPath}`);
    }
    if (agent.token.isCancellationRequested) {
        throw new CancellationError();
    }
    if (FilesHelper.useFileSystem(targetUri)) {
        await FilesHelper.writeFile(targetUri, contents, create, agent.token);
        agent.synchronizedFiles.push(targetUri.fsPath);
        return;
    }
    const edit = new WorkspaceEdit();
    if (create) {
        edit.createFile(targetUri, { overwrite: false });
        edit.insert(targetUri, new Position(0, 0), contents);
    }
    else {
        const document = await workspace.openTextDocument(targetUri);
        if (document.isDirty) {
            throw new Error(`Save or revert unsaved changes before synchronizing ${targetUri.fsPath}.`);
        }
        edit.replace(targetUri, new Range(document.positionAt(0), document.positionAt(document.getText().length)), contents);
    }
    if (agent.token.isCancellationRequested) {
        throw new CancellationError();
    }
    if (!await workspace.applyEdit(edit)) {
        throw new Error(`Failed to edit ${targetUri.fsPath}.`);
    }
    const document = await workspace.openTextDocument(targetUri);
    if (!await document.save()) {
        throw new Error(`Failed to save ${targetUri.fsPath}.`);
    }
    agent.synchronizedFiles.push(targetUri.fsPath);
}

export async function synchronizeAllFiles(sourceUri: Uri, targetUris: Uri[], workspaceFolder?: WorkspaceFolder, agent?: AgentSynchronization) {
    const xliffWorkspaceConfiguration: WorkspaceConfiguration = workspace.getConfiguration('xliffSync', workspaceFolder?.uri);
    const matchingOriginalOnly: boolean = xliffWorkspaceConfiguration['matchingOriginalOnly'];

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
    const skippedFiles: string[] = [];

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
                    if (targetDocOriginal !== sourceDocOriginal &&
                        !(sourceDocOriginal && targetDocOriginal === path.basename(sourceUri.fsPath))) {
                        skippedFiles.push(targetUri.fsPath);
                        agent?.skippedFiles.push(targetUri.fsPath);
                        continue;
                    }
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

            if (!isSlaveLanguage) {
                await synchronizeTargetFile(sourceUri, targetUri, undefined, workspaceFolder, agent);
            }
        }
        catch (ex) {
            if (agent) {
                throw ex;
            }
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
                    if (agent) {
                        await saveAgentTarget(slaveLanguageToUri[slaveLanguage], newSlaveContent, agent);
                    }
                    else {
                        await FilesHelper.createNewTargetFile(slaveLanguageToUri[slaveLanguage], newSlaveContent, sourceUri, slaveLanguage);
                    }
                }
                else if (agent) {
                    throw new Error(`No output generated for language ${slaveLanguage}.`);
                }
            }
        }
    }

    if (agent) {
        for (const slaveLanguage in slaveLanguageToUri) {
            if (agent.synchronizedFiles.indexOf(slaveLanguageToUri[slaveLanguage].fsPath) < 0) {
                throw new Error(`No matching master file found for equivalent language ${slaveLanguage}. Synchronize its master language first or disable equivalentLanguagesEnabled.`);
            }
        }
        return;
    }
    if (skippedFiles.length) {
        window.showWarningMessage(`Skipped translation files with a different original attribute: ${skippedFiles.join(', ')}`);
    }
    else {
        window.showInformationMessage('Translation files successfully synchronized!');
    }

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
