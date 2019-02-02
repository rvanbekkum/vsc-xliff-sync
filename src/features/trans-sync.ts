import {
    Range,
    TextDocument,
    TextEditor,
    Uri,
    window,
    workspace
} from 'vscode';

import { FilesHelper } from './tools';
import { XlfTranslator } from './tools/xlf-translator';

import * as path from 'path';

export async function synchronizeFiles(allFiles: boolean) {
    try {
        const baseFile: string = workspace.getConfiguration('xliffSync')['baseFile'];
        let fileType: string | undefined = workspace.getConfiguration('xliffSync')['fileType'];

        // Get the list of XLIFF files in the opened workspace
        let uris: Uri[] = [];

        if (fileType) {
            uris = (await FilesHelper.findTranslationFiles(fileType)) || [];
        }

        if (!uris.length) {
            fileType = await window.showQuickPick(['xlf', 'xmb'], {
                placeHolder: 'Translation file type',
            });

            if (fileType) {
                uris = (await FilesHelper.findTranslationFiles(fileType)) || [];

                if (uris.length) {
                    workspace.getConfiguration('xliffSync').update('fileType', fileType);
                }
            }
        }

        if (!uris.length) {
            throw new Error('No translation file found');
        }

        // Find the base/generated XLIFF file
        let sourceUri = baseFile ? uris.find((uri) => uri.fsPath.indexOf(baseFile) >= 0) : undefined;

        if (!sourceUri) {
            // File not found, request the user to identify the file himself
            const fsPaths = uris.map((uri) => uri.fsPath);
            const sourcePath = await window.showQuickPick(fsPaths, {
                placeHolder: 'Select the base XLIFF file',
            });

            if (!sourcePath) {
                throw new Error('No base XLIFF file specified');
            }

            sourceUri = uris.find((uri) => uri.fsPath === sourcePath)!;
            const filename = path.basename(sourceUri.fsPath);
            workspace.getConfiguration('xliffSync').update('baseFile', filename);
        }

        // filter out the base file and request the target file
        uris = uris.filter((uri) => uri !== sourceUri);

        if (!allFiles) {
            synchronizeSingleFile(sourceUri, uris);
        }
        else {
            synchronizeAllFiles(sourceUri, uris);
        }
    } 
    catch (ex) {
        window.showErrorMessage(ex.message);
    }
}

async function synchronizeSingleFile(sourceUri: Uri, uris: Uri[]) {
    const activeEditor = window.activeTextEditor;

    let targetUri: Uri | undefined;
    let targetLanguage: string | undefined;

    // First try the active file
    if (activeEditor) {
        targetUri = uris.find((uri) => uri.fsPath === activeEditor.document.uri.fsPath);
    }

    if (!targetUri) {
        const fsPath = [...uris.map((uri) => uri.fsPath), 'New File...'];
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
            targetUri = uris.find((uri) => uri.fsPath === targetPath)!;
        }
    }

    if (!targetUri && !targetLanguage) {
        throw new Error('No target file specified');
    }

    const source = (await workspace.openTextDocument(sourceUri)).getText();
    const target = targetUri
        ? (await workspace.openTextDocument(targetUri)).getText()
        : undefined;

    const output = await XlfTranslator.synchronize(source, target, targetLanguage);

    if (!output) {
        throw new Error('No ouput generated');
    }

    let document: TextDocument;

    if (targetUri) {
        document = await workspace.openTextDocument(targetUri);
    } else {
        targetUri = await FilesHelper.createTranslationFile(targetLanguage!, sourceUri, output);
        document = await workspace.openTextDocument(targetUri);
    }

    const editor = await window.showTextDocument(document);

    if (!editor) {
        throw new Error('Failed to open target file');
    }

    const range = new Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
    );

    await editor.edit((editBuilder) => {
        editBuilder.replace(range, output);
    });

    await document.save();
}

async function synchronizeAllFiles(sourceUri: Uri, uris: Uri[]) {
    for (let index = 0; index < uris.length; index++) {
        let targetUri: Uri = uris[index];
        const source = (await workspace.openTextDocument(sourceUri)).getText();
        const target = targetUri
            ? (await workspace.openTextDocument(targetUri)).getText()
            : undefined;

        const output = await XlfTranslator.synchronize(source, target, undefined);

        if (!output) {
            throw new Error('No ouput generated');
        }

        let document: TextDocument = await workspace.openTextDocument(targetUri);

        const range = new Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
        );
        
        const editor: TextEditor = await window.showTextDocument(document);

        await editor.edit((editBuilder) => {
            editBuilder.replace(range, output);
        });

        await document.save();
    }

    window.showInformationMessage('Translation files successfully synchronized!');
}