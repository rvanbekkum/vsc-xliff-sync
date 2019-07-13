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
import { XmlNode } from './tools';

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

        const findNextDisposable = commands.registerCommand(
            'xliffSync.findNextMissingTarget',
            async () => {
                this.findNextMissingTranslation();
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
        
        context.subscriptions.push(findNextDisposable);
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
        try {
            if (currentEditor && currentEditor.document) {
                const document = currentEditor.document;
                const text = document.getText();

                let missingTranslationKeyword: string = workspace.getConfiguration('xliffSync')[
                    'missingTranslation'
                ];
                if (missingTranslationKeyword == '%EMPTY%') {
                    missingTranslationKeyword = '<target/>';
                }

                const regExp = new RegExp(missingTranslationKeyword, 'g');

                let missingTranslation: RegExpExecArray | null;
                const currentPosition = currentEditor.selection.isEmpty
                    ? currentEditor.selection.active
                    : currentEditor.selection.end;

                let range: Range | undefined;
                let firstRange: Range | undefined;

                while (!range && (missingTranslation = regExp.exec(text))) {
                    const start = document.positionAt(missingTranslation.index);
                    const end = document.positionAt(
                        missingTranslation.index + missingTranslation[0].length,
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
                    window.showInformationMessage('All missing translations have been resolved');
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

            const missingTranslationKeyword: string = workspace.getConfiguration('xliffSync')[
                'missingTranslation'
            ];

            const regExp = new RegExp(missingTranslationKeyword, 'g');

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
            const targetDocument = await XlfDocument.load(target);
            targetDocument.translationUnitNodes.forEach((unit) => {
                if (shouldCheckForMissingTranslations && checkForMissingTranslation(targetDocument, unit, missingTranslationText)) {
                    missingCount += 1;
                }
                if (shouldCheckForNeedWorkTranslations && checkForNeedWorkTranslation(targetDocument, unit)) {
                    needWorkCount += 1;
                }
            });

            let showMessageForFile: boolean = false;
            let messagesText: string = "";
            if (missingCount > 0) {
                noMissingTranslations = false;
                showMessageForFile = true;
                messagesText += `${missingCount} missing translation(s).`;
            }

            if (needWorkCount > 0) {
                noNeedWorkTranslations = false;
                showMessageForFile = true;
                messagesText += `${needWorkCount} translation(s) that need work.`;
            }

            if (showMessageForFile) {
                const fileName = targetUri.toString().replace(/^.*[\\\/]/, '').replace(/%20/g, ' ');
                window.showInformationMessage(`"${fileName}": ${messagesText}`, 'Open Externally').then(selection => {
                    if (selection == 'Open Externally') {
                        env.openExternal(targetUri);
                    }
                });
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
    //TODO: Implement technical checks here
    return false;
}
