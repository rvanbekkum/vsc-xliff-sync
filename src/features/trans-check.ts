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
        
        context.subscriptions.push(findNextDisposable);
        context.subscriptions.push(checkForMissingTranslationsDisposable);

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
        try {
            let uris: Uri[] = await getXliffFileUrisInWorkSpace();

            let sourceUri: Uri = await getXliffSourceFile(uris);
            let targetUris = uris.filter((uri) => uri !== sourceUri);

            let missingTranslation: string = workspace.getConfiguration('xliffSync')[
                'missingTranslation'
            ];
            if (missingTranslation == '%EMPTY%') {
                missingTranslation = '';
            }

            let missingTranslations: boolean = false;
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

                let missingCount = 0;
                const targetDocument = await XlfDocument.load(target);
                targetDocument.translationUnitNodes.forEach((unit) => {
                    const translation = targetDocument.getUnitTranslation(unit);
                    if (!translation || translation === missingTranslation) {
                        missingCount += 1;
                    }
                });

                if (missingCount > 0) {
                    missingTranslations = true;
                    const fileName = targetUri.toString().replace(/^.*[\\\/]/, '').replace(/%20/g, ' ');
                    window.showInformationMessage(`"${fileName}": ${missingCount} missing translation(s).`, 'Open Externally').then(selection => {
                        if (selection == 'Open Externally') {
                            env.openExternal(targetUri);
                        }
                    });
                }
            }

            if (!missingTranslations) {
                window.showInformationMessage("No missing translations have been found!");
            }
        }
        catch (ex) {
            window.showErrorMessage(ex.message);
        }
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