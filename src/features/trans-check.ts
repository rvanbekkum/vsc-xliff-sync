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
    commands,
    DecorationRenderOptions,
    env,
    ExtensionContext,
    Range,
    Selection,
    TextEditor,
    TextEditorDecorationType,
    TextEditorRevealType,
    window,
    workspace,
    Uri,
    WorkspaceConfiguration,
    WorkspaceFolder
} from 'vscode';
import { XlfDocument } from './tools/xlf/xlf-document';
import { FilesHelper, WorkspaceHelper, XmlNode } from './tools';
import { translationState } from './tools/xlf/xlf-translationState';

// Variables that should be accessible from events
var currentEditor: TextEditor | undefined;
var decorationEnabled: boolean;
var decorationTargetTextOnly: boolean;
var decorationType: TextEditorDecorationType;
var timeout: NodeJS.Timer;
var missingTranslationKeywords: string;
var needsWorkTranslationKeywords: string;

export class XliffTranslationChecker {
    constructor(context: ExtensionContext) {
        currentEditor = window.activeTextEditor;
        this.refreshSettings();

        const findNextMissingDisposable = commands.registerCommand(
            'xliffSync.findNextMissingTarget',
            async () => {
                this.findNextMissingTranslation();
            },
        );

        const findNextNeedsWorkDisposable = commands.registerCommand(
            'xliffSync.findNextNeedsWorkTarget',
            async () => {
                this.findNextNeedsWorkTranslation();
            },
        );

        const checkForMissingTranslationsDisposable = commands.registerCommand(
            'xliffSync.checkForMissingTranslations', 
            async() => {
                this.checkForMissingTranslations();
            }
        );

        const checkForNeedWorkTranslationsDisposable = commands.registerCommand(
            'xliffSync.checkForNeedWorkTranslations', 
            async() => {
                this.checkForNeedWorkTranslations();
            }
        );
        
        context.subscriptions.push(findNextMissingDisposable);
        context.subscriptions.push(findNextNeedsWorkDisposable);
        context.subscriptions.push(checkForMissingTranslationsDisposable);
        context.subscriptions.push(checkForNeedWorkTranslationsDisposable);

        window.onDidChangeActiveTextEditor((editor) => {
            currentEditor = editor;
            this.refreshSettings();
            this.pushHighlightUpdate();
        });

        workspace.onDidChangeTextDocument((event) => {
            if (currentEditor && event.document === currentEditor.document) {
                this.pushHighlightUpdate();
            }
        });

        this.pushHighlightUpdate();
    }

    private async checkForMissingTranslations() {
        runTranslationChecks(true, false);
    }

    private async checkForNeedWorkTranslations() {
        runTranslationChecks(false, true);
    }

    private async findNextMissingTranslation() {
        this.findNext(missingTranslationKeywords, 'All missing translations have been resolved.');
    }

    private async findNextNeedsWorkTranslation() {
        this.findNext(needsWorkTranslationKeywords, 'All translations that need work have been resolved.');
    }

    private async findNext(keyWord: string, noMoreMatchesFoundText: string) {
        try {
            if (currentEditor && currentEditor.document) {
                const document = currentEditor.document;
                const text = document.getText();
                const regExp = new RegExp(keyWord, 'g');

                let translationKeywordMatch: RegExpExecArray | null;
                const currentPosition = currentEditor.selection.isEmpty
                    ? currentEditor.selection.active
                    : currentEditor.selection.end;

                let range: Range | undefined;
                let firstRange: Range | undefined;

                while (!range && (translationKeywordMatch = regExp.exec(text))) {
                    const start = document.positionAt(translationKeywordMatch.index);
                    const end = document.positionAt(
                        translationKeywordMatch.index + translationKeywordMatch[0].length,
                    );

                    if (!firstRange) {
                        firstRange = new Range(start, end);
                    }

                    if (end.isAfter(currentPosition)) {
                        range = new Range(start, end);
                    }
                }

                range = range || firstRange;

                if (range) {
                    currentEditor.selection = new Selection(range.start, range.end);
                    currentEditor.revealRange(range, TextEditorRevealType.InCenterIfOutsideViewport);
                }
                else {
                    window.showInformationMessage(noMoreMatchesFoundText);
                }
            }
        }
        catch (ex) {
            window.showErrorMessage(ex.message);
        }
    }

    private highlightUpdate() {
        if (currentEditor && currentEditor.document) {
            const document = currentEditor.document;
            const text = document.getText();

            const keyWord: string = `${missingTranslationKeywords}|${needsWorkTranslationKeywords}`;
            const regExp = new RegExp(keyWord, 'g');

            let missingTranslation: RegExpExecArray | null;
            const decorationRanges: Range[] = [];

            while ((missingTranslation = regExp.exec(text))) {
                const start = document.positionAt(missingTranslation.index);
                const end = document.positionAt(missingTranslation.index + missingTranslation[0].length);

                decorationRanges.push(new Range(start, end));
            }

            currentEditor.setDecorations(decorationType, decorationRanges);
        }
    }

    private pushHighlightUpdate() {
        if (!this.isXliffFileOpen() || !decorationEnabled) {
            return;
        }

        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(this.highlightUpdate, 500);
    }

    private refreshSettings() {
        decorationEnabled = workspace.getConfiguration('xliffSync')['decorationEnabled'];
        decorationTargetTextOnly = workspace.getConfiguration('xliffSync')['decorationTargetTextOnly'];

        missingTranslationKeywords = this.getMissingTranslationKeywords();
        needsWorkTranslationKeywords = this.getNeedsWorkTranslationKeywords();

        const decoration: DecorationRenderOptions = workspace.getConfiguration('xliffSync')['decoration'];
        decorationType = window.createTextEditorDecorationType(
            decoration
        );
    }

    private isXliffFileOpen(): boolean {
        if (!currentEditor) {
            return false;
        }

        const fileName: string | undefined = currentEditor.document.fileName;
        if (!fileName) {
            return false;
        }
        const fileExt: string = fileName.slice((fileName.lastIndexOf(".") - 1 >>> 0) + 2);
        if (FilesHelper.getSupportedFileExtensions().indexOf(fileExt) < 0) {
            return false;
        }

        return true;
    }

    private getMissingTranslationKeywords(): string {
        const currentWorkspaceFolder: WorkspaceFolder | undefined = window.activeTextEditor ?
            workspace.getWorkspaceFolder(window.activeTextEditor.document.uri) :
            undefined;
        let currentWorkspaceFolderUri: Uri | undefined = undefined;
        if (currentWorkspaceFolder) {
            currentWorkspaceFolderUri = currentWorkspaceFolder.uri;
        }

        let missingTranslationKeyword = workspace.getConfiguration('xliffSync', currentWorkspaceFolderUri)[
            'missingTranslation'
        ];
        if (missingTranslationKeyword === '%EMPTY%') {
            missingTranslationKeyword = '<target.*( state="needs-translation")?.*/>|<target.*( state="needs-translation")?.*></target>';
        }
        else if (decorationTargetTextOnly) {
            missingTranslationKeyword = `(?<=<target.*( state="needs-translation")?.*>)${missingTranslationKeyword}(?=</target>)`;
        }
        else {
            missingTranslationKeyword = `<target.*( state="needs-translation")?.*>${missingTranslationKeyword}</target>`;
        }
        return missingTranslationKeyword;
    }

    private getNeedsWorkTranslationKeywords() : string {
        const currentWorkspaceFolder: WorkspaceFolder | undefined = window.activeTextEditor ?
            workspace.getWorkspaceFolder(window.activeTextEditor.document.uri) :
            undefined;
        let currentWorkspaceFolderUri: Uri | undefined = undefined;
        if (currentWorkspaceFolder) {
            currentWorkspaceFolderUri = currentWorkspaceFolder.uri;
        }
        let needsWorkTranslationSubstate = workspace.getConfiguration('xliffSync', currentWorkspaceFolderUri)[
            'needsWorkTranslationSubstate'
        ];

        const segmentNeedsWorkRegExp: string = `(<segment.* subState="${needsWorkTranslationSubstate}".*>)`;
        if (decorationTargetTextOnly) {
            return `((?<=<target.* state="needs-adaptation".*>).*(?=</target>))|${segmentNeedsWorkRegExp}`;
        }
        else {
            return `(<target.* state="needs-adaptation".*>.*</target>)|(<target.* state="needs-adaptation".*/>)|${segmentNeedsWorkRegExp}`;
        }
    }
}

export async function runTranslationChecks(shouldCheckForMissingTranslations: boolean, shouldCheckForNeedWorkTranslations: boolean) {
    const checkWorkspaceFolders: WorkspaceFolder[] | undefined = await WorkspaceHelper.getWorkspaceFolders(true);
    if (!checkWorkspaceFolders) {
        throw new Error(`No workspace folder found to use`);
    }
    
    for (let checkWorkspaceFolder of checkWorkspaceFolders) {
        await runTranslationChecksForWorkspaceFolder(shouldCheckForMissingTranslations, shouldCheckForNeedWorkTranslations, undefined, checkWorkspaceFolder);
    }
}

export async function runTranslationChecksForWorkspaceFolder(shouldCheckForMissingTranslations: boolean, shouldCheckForNeedWorkTranslations: boolean, singleTargetUri?: Uri, checkWorkspaceFolder?: WorkspaceFolder) {
    try {
        let uris: Uri[] = await FilesHelper.getXliffFileUris(checkWorkspaceFolder);

        let sourceUri: Uri = await FilesHelper.getXliffSourceFile(uris, checkWorkspaceFolder);
        let targetUris = uris.filter((uri) => uri !== sourceUri);
        if (singleTargetUri) {
            targetUris = [singleTargetUri];
        }

        const xliffWorkspaceConfiguration: WorkspaceConfiguration = workspace.getConfiguration('xliffSync', checkWorkspaceFolder?.uri);
        let missingTranslationText: string = xliffWorkspaceConfiguration['missingTranslation'];
        if (missingTranslationText === '%EMPTY%') {
            missingTranslationText = '';
        }

        let needWorkRules: string[] = xliffWorkspaceConfiguration['needWorkTranslationRules'];
        let needWorkRulesEnableAll: boolean = xliffWorkspaceConfiguration['needWorkTranslationRulesEnableAll'];
        function isRuleEnabledChecker(ruleName: string): boolean {
            return needWorkRulesEnableAll || needWorkRules.indexOf(ruleName) >= 0;
        }

        const copyFromSourceForLanguages: string[] = xliffWorkspaceConfiguration['copyFromSourceForLanguages'];
        let sourceEqualsTargetExpected: boolean = false;

        const openExternallyAfterEvent: string[] = xliffWorkspaceConfiguration['openExternallyAfterEvent'];

        let noMissingTranslations: boolean = true;
        let noNeedWorkTranslations: boolean = true;
        for (let index = 0; index < targetUris.length; index++) {
            let targetUri: Uri = targetUris[index];
            if (!targetUri) {
                continue;
            }
            const target = targetUri
                ? (await workspace.openTextDocument(targetUri)).getText()
                : undefined;
            if (!target) {
                continue;
            }

            let missingCount: number = 0;
            let needWorkCount: number = 0;
            let problemResolvedInFile: boolean = false;
            const targetDocument = await XlfDocument.load(target, checkWorkspaceFolder?.uri);
            sourceEqualsTargetExpected = targetDocument.sourceLanguage === targetDocument.targetLanguage;
            if (targetDocument.targetLanguage) {
                sourceEqualsTargetExpected = sourceEqualsTargetExpected || (copyFromSourceForLanguages.indexOf(targetDocument.targetLanguage) >= 0);
            }

            targetDocument.translationUnitNodes.forEach((unit) => {
                if (shouldCheckForMissingTranslations && checkForMissingTranslation(targetDocument, unit, missingTranslationText)) {
                    targetDocument.setState(unit, translationState.missingTranslation);
                    missingCount += 1;
                }
                if (shouldCheckForNeedWorkTranslations && checkForNeedWorkTranslation(targetDocument, unit, isRuleEnabledChecker, sourceEqualsTargetExpected)) {
                    targetDocument.setState(unit, translationState.needsWorkTranslation);
                    needWorkCount += 1;
                }
                if (shouldCheckForNeedWorkTranslations && checkForResolvedProblem(targetDocument, unit)) {
                    problemResolvedInFile = true;
                }
            });

            let problemDetectedInFile: boolean = false;
            let messagesText: string = "";
            if (missingCount > 0) {
                noMissingTranslations = false;
                problemDetectedInFile = true;
                messagesText += ` ${missingCount} missing translation(s).`;
            }

            if (needWorkCount > 0) {
                noNeedWorkTranslations = false;
                problemDetectedInFile = true;
                messagesText += ` ${needWorkCount} translation(s) that need work.`;
            }

            let openExternallyAutomatically: boolean = openExternallyAfterEvent.indexOf("Check") > -1;
            if (!openExternallyAutomatically && problemDetectedInFile) {
                openExternallyAutomatically = openExternallyAfterEvent.indexOf('ProblemDetected') > -1;
            }
            if (problemDetectedInFile && !openExternallyAutomatically) {
                const fileName = FilesHelper.getFileNameFromUri(targetUri);
                window.showInformationMessage(`"${fileName}":${messagesText}`, 'Open Externally').then(selection => {
                    if (selection === 'Open Externally') {
                        env.openExternal(targetUri);
                    }
                });
            }

            if (problemDetectedInFile || problemResolvedInFile) {
                // Update the target document file with added needs-translation, need-adaptation attribute values and removed work-notes
                const newFileContents = targetDocument.extract();

                if (!newFileContents) {
                    throw new Error('No ouput generated');
                }
    
                await FilesHelper.createNewTargetFile(targetUri, newFileContents);
            }
            if (openExternallyAutomatically) {
                env.openExternal(targetUri);
            }
        }

        if (noMissingTranslations && shouldCheckForMissingTranslations) {
            window.showInformationMessage("No missing translations have been found!");
        }

        if (noNeedWorkTranslations && shouldCheckForNeedWorkTranslations) {
            window.showInformationMessage("No translations that need work have been found!");
        }
    }
    catch (ex) {
        window.showErrorMessage(ex.message);
    }
    return false;
}

function checkForMissingTranslation(targetDocument: XlfDocument, unit: XmlNode, missingTranslationText: string) : boolean {
    const needsTranslation: boolean = targetDocument.getUnitNeedsTranslation(unit);
    if (needsTranslation) {
        const translation = targetDocument.getUnitTranslation(unit);
        if (!translation || translation === missingTranslationText) {
            return true;
        }
    }
    return false;
}

function checkForNeedWorkTranslation(targetDocument: XlfDocument, unit: XmlNode, isRuleEnabled: (ruleName: string) => boolean, sourceEqualsTargetExpected: boolean) : boolean {
    const sourceText = targetDocument.getUnitSourceText(unit);
    const translText = targetDocument.getUnitTranslation(unit);
    const devNoteText = targetDocument.getUnitDeveloperNote(unit) || '';
    if (!sourceText || !translText) {
        return false;
    }

    if (isRuleEnabled('SourceEqualsTarget')) {
        if (sourceEqualsTargetExpected) {
            if (sourceText !== translText) {
                targetDocument.setXliffSyncNote(unit, 'Problem detected: The source text is not the same as the translation, but the source-language is the same as the target-language.');
                return true;
            }
        }
    }
    
    if (isRuleEnabled('Placeholders') && checkForPlaceHolderMismatch(sourceText, translText)) {
        targetDocument.setXliffSyncNote(unit, 'Problem detected: The number of placeholders in the source and translation text do not match.');
        return true;
    }
    if (isRuleEnabled('PlaceholdersDevNote') && checkForPlaceHolderMismatch(sourceText, devNoteText)) {
        targetDocument.setXliffSyncNote(unit, 'Problem detected: One or more placeholders are missing an explanation in the Developer note.');
        return true;
    }

    if (isOptionCaptionUnit(targetDocument, unit)) {
        if (isRuleEnabled('OptionMemberCount') && checkForOptionMemberCountMismatch(sourceText, translText)) {
            targetDocument.setXliffSyncNote(unit, 'Problem detected: The number of option members in the source and translation text do not match.');
            return true;
        }
        if (isRuleEnabled('OptionLeadingSpaces') && checkForOptionMemberLeadingSpacesMismatch(sourceText, translText)) {
            targetDocument.setXliffSyncNote(unit, 'Problem detected: The leading spaces in the option values of the source and translation text do not match.');
            return true;
        }
    }

    if (isRuleEnabled('ConsecutiveSpacesExist')) {
        if (checkForConsecutiveSpaces(sourceText)) {
            targetDocument.setXliffSyncNote(unit, 'Problem detected: Consecutive spaces exist in the source text.');
            return true;
        }
        if (checkForConsecutiveSpaces(translText)) {
            targetDocument.setXliffSyncNote(unit, 'Problem detected: Consecutive spaces exist in the translation text.');
            return true;
        }
    }

    if (isRuleEnabled('ConsecutiveSpacesConsistent') && checkForConsecutiveSpacesInconsistency(sourceText, translText)) {
        targetDocument.setXliffSyncNote(unit, 'Problem detected: The "consecutive space"-occurrences in source and translation text do not match.');
        return true;
    }

    if (targetDocument.getState(unit) === translationState.needsWorkTranslation) {
        return true;
    }

    return false;
}

function checkForResolvedProblem(targetDocument: XlfDocument, unit: XmlNode) : boolean {
    return targetDocument.getState(unit) !== translationState.needsWorkTranslation && targetDocument.tryDeleteXliffSyncNote(unit);
}

function checkForPlaceHolderMismatch(sourceText: string, translationText: string) {
    return checkForMissingPlaceHolders(sourceText, translationText) ||
           checkForMissingPlaceHolders(translationText, sourceText);
}

function checkForMissingPlaceHolders(textWithPlaceHolders: string, textToCheck: string) {
    const placeHolderRegex = /%[0-9]+|\{[0-9]+\}/g; // Match placeholders of the form %1 OR {0}
    let placeHolderProblemDetected: boolean = false;

    let placeHolders = textWithPlaceHolders.match(placeHolderRegex);
    if (placeHolders) {
        placeHolderProblemDetected = !placeHolders.every(placeHolder => textToCheck.indexOf(placeHolder) >= 0);
    }
    return placeHolderProblemDetected;
}

function isOptionCaptionUnit(targetDocument: XlfDocument, unit: XmlNode) {
    const xliffGenNote = targetDocument.getUnitXliffGeneratorNote(unit);
    if (!xliffGenNote) {
        return false;
    }
    const optionKeywords: string[] = ['Property OptionCaption', 'Property PromotedActionCategories'];
    return optionKeywords.some(keyword => xliffGenNote.indexOf(keyword) >= 0);
}

function checkForOptionMemberCountMismatch(sourceText: string, translationText: string) {
    let noOfCommasSource = (sourceText.match(/,/g) || []).length;
    let noOfCommasTransl = (translationText.match(/,/g) || []).length;
    return noOfCommasSource !== noOfCommasTransl;
}

function checkForOptionMemberLeadingSpacesMismatch(sourceText: string, translationText: string): boolean {
    const sourceValues: string[] = sourceText.split(',');
    const translValues: string[] = translationText.split(',');
    for (let i in sourceValues) {
        const whiteSpaceCountSource = sourceValues[i].search(/\S|$/);
        const whiteSpaceCountTransl = translValues[i].search(/\S|$/);
        if (whiteSpaceCountSource !== whiteSpaceCountTransl) {
            return true;
        }
    }
    return false;
}

function getConsecutiveSpacesMatchesFromText(textToCheck: string): RegExpMatchArray {
    return (textToCheck.match(/\s\s+/g) || []);
}

function checkForConsecutiveSpaces(textToCheck: string): boolean {
    return getConsecutiveSpacesMatchesFromText(textToCheck).length !== 0;
}

function checkForConsecutiveSpacesInconsistency(sourceText: string, translationText: string): boolean {
    const sourceTextConsecutiveSpaces = getConsecutiveSpacesMatchesFromText(sourceText);
    const translTextConsecutiveSpaces = getConsecutiveSpacesMatchesFromText(translationText);
    if (sourceTextConsecutiveSpaces.length !== translTextConsecutiveSpaces.length) {
        return true;
    }
    for (let i in sourceTextConsecutiveSpaces) {
        if (sourceTextConsecutiveSpaces[i].length !== translTextConsecutiveSpaces[i].length) {
            return true;
        }
    }
    return false;
}
