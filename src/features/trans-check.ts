import {
    commands,
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
} from 'vscode';
import { getXliffFileUrisInWorkSpace, getXliffSourceFile } from './trans-sync';
import { XlfDocument } from './tools/xlf/xlf-document';
import { XmlNode, FilesHelper } from './tools';

// Variables that should be accessible from events
var currentEditor: TextEditor | undefined;
var decorationType: TextEditorDecorationType;
var timeout: NodeJS.Timer;

export class XliffTranslationChecker {
    constructor(context: ExtensionContext) {
        currentEditor = window.activeTextEditor;
        decorationType = window.createTextEditorDecorationType(
            workspace.getConfiguration('xliffSync')['decoration'],
        );

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
        runTranslationChecks(true, false)
    }

    private async checkForNeedWorkTranslations() {
        runTranslationChecks(false, true);
    }

    private async findNextMissingTranslation() {
        this.findNext(getMissingTranslationKeyword(), 'All missing translations have been resolved.');
    }

    private async findNextNeedsWorkTranslation() {
        this.findNext(getNeedsWorkTranslationKeyword(), 'All translations that need work have been resolved.');
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

            const keyWord: string = `${getMissingTranslationKeyword()}|${getNeedsWorkTranslationKeyword()}`;
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
        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(this.highlightUpdate, 1);
    }
}

function getMissingTranslationKeyword(): string {
    let missingTranslationKeyword: string = workspace.getConfiguration('xliffSync')[
        'missingTranslation'
    ];
    if (missingTranslationKeyword == '%EMPTY%') {
        missingTranslationKeyword = '<target/>|<target></target>|<target state="needs-translation"/>';
    }
    return missingTranslationKeyword;
}

function getNeedsWorkTranslationKeyword() : string {
    return '<target state="needs-adaptation">.*</target>';
}

export async function runTranslationChecks(shouldCheckForMissingTranslations: boolean, shouldCheckForNeedWorkTranslations: boolean) {
    try {
        let uris: Uri[] = await getXliffFileUrisInWorkSpace();

        let sourceUri: Uri = await getXliffSourceFile(uris);
        let targetUris = uris.filter((uri) => uri !== sourceUri);

        let missingTranslationText: string = workspace.getConfiguration('xliffSync')[
            'missingTranslation'
        ];
        if (missingTranslationText == '%EMPTY%') {
            missingTranslationText = '';
        }

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
            const targetDocument = await XlfDocument.load(target);
            targetDocument.translationUnitNodes.forEach((unit) => {
                if (shouldCheckForMissingTranslations && checkForMissingTranslation(targetDocument, unit, missingTranslationText)) {
                    targetDocument.setTargetAttribute(unit, 'state', 'needs-translation');
                    missingCount += 1;
                }
                if (shouldCheckForNeedWorkTranslations && checkForNeedWorkTranslation(targetDocument, unit)) {
                    targetDocument.setTargetAttribute(unit, 'state', 'needs-adaptation');
                    needWorkCount += 1;
                }
                if (shouldCheckForNeedWorkTranslations && !problemResolvedInFile && checkForResolvedProblem(targetDocument, unit)) {
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

            if (problemDetectedInFile) {
                const fileName = targetUri.toString().replace(/^.*[\\\/]/, '').replace(/%20/g, ' ');
                window.showInformationMessage(`"${fileName}":${messagesText}`, 'Open Externally').then(selection => {
                    if (selection == 'Open Externally') {
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
    
                FilesHelper.createNewTargetFile(targetUri, newFileContents);
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

function checkForNeedWorkTranslation(targetDocument: XlfDocument, unit: XmlNode) : boolean {
    const sourceText = targetDocument.getUnitSourceText(unit);
    const translText = targetDocument.getUnitTranslation(unit);
    if (!sourceText || !translText) {
        return false;
    }
 
    if (checkForPlaceHolderMismatch(sourceText, translText)) {
        targetDocument.setXliffSyncNote(unit, 'Problem detected: The number of placeholders in the source and translation text do not match.');
        return true;
    }

    if (isOptionCaptionUnit(targetDocument, unit)) {
        if (checkForOptionMemberCountMismatch(sourceText, translText)) {
            targetDocument.setXliffSyncNote(unit, 'Problem detected: The number of option members in the source and translation text do not match.');
            return true;
        }
        if (checkForOptionMemberLeadingSpacesMismatch(sourceText, translText)) {
            targetDocument.setXliffSyncNote(unit, 'Problem detected: The leading spaces in the option values of the source and translation text do not match.');
            return true;
        }
    }

    return false;
}

function checkForResolvedProblem(targetDocument: XlfDocument, unit: XmlNode) : boolean {
    return targetDocument.getTargetAttribute(unit, 'state') != 'needs-adaptation' && targetDocument.tryDeleteXliffSyncNote(unit);
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

function checkForOptionMemberLeadingSpacesMismatch(sourceText: string, translationText: string) {
    const sourceValues: string[] = sourceText.split(',');
    const translValues: string[] = translationText.split(',');
    for (let i in sourceValues) {
        const whiteSpaceCountSource = sourceValues[i].search(/\S|$/);
        const whiteSpaceCountTransl = translValues[i].search(/\S|$/);
        if (whiteSpaceCountSource != whiteSpaceCountTransl) {
            return true;
        }
    }
    return false;
}
