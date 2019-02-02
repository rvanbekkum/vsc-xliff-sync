import {
    commands,
    ExtensionContext,
    Range,
    Selection,
    TextEditor,
    TextEditorDecorationType,
    TextEditorRevealType,
    window,
    workspace,
} from 'vscode';

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
        
        context.subscriptions.push(findNextDisposable);

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

    private async findNextMissingTranslation() {
        try {
            if (currentEditor && currentEditor.document) {
                const document = currentEditor.document;
                const text = document.getText();

                const missingTranslationKeyword: string = workspace.getConfiguration('xliffSync')[
                    'missingTranslation'
                ];

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