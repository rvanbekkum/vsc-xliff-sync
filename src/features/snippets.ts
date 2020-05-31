import { CompletionItemKind, languages, SnippetString, window, workspace, WorkspaceConfiguration, commands } from "vscode";

export async function registerSnippets() {
    const xliffWorkspaceConfiguration: WorkspaceConfiguration = workspace.getConfiguration('xliffSync');
    const enableSnippetsForLanguages: string[] = xliffWorkspaceConfiguration['enableSnippetsForLanguages'];
    const snippetTargetLanguage: string = xliffWorkspaceConfiguration['snippetTargetLanguage'];
    workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('xliffSync.enableSnippetsForLanguages') || e.affectsConfiguration('xliffSync.snippetTargetLanguage')) {
            window.showInformationMessage('The XLIFF Sync snippet settings were changed. Please reload VSCode to apply the changes.', 'Reload').then(selection => {
                if (selection === 'Reload') {
                    commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
    });

    if (enableSnippetsForLanguages.indexOf('al') > -1) {
        registerALSnippets(snippetTargetLanguage);
    }
}

function registerALSnippets(snippetTargetLanguage: string) {
    languages.registerCompletionItemProvider('al', {
        provideCompletionItems(doc, pos, token, context) {
            return [
                {
                    label: "tcaptionwithtranslation",
                    insertText: new SnippetString(
                        `Caption = '\${1:CaptionText}', Comment = '\${2:${snippetTargetLanguage}}=\${3:Translation}';`
                    ),
                    detail: "Snippet (XLIFF Sync): Caption with Comment-Translation",
                    kind: CompletionItemKind.Snippet
                },
                {
                    label: "tcommentwithtranslation",
                    insertText: new SnippetString(
                        `Comment = '\${1:${snippetTargetLanguage}}=\${2:Translation}'`
                    ),
                    detail: "Snippet (XLIFF Sync): Comment with Translation",
                    kind: CompletionItemKind.Snippet
                },
                {
                    label: "toptioncaptionwithtranslation",
                    insertText: new SnippetString(
                        `OptionCaption = '\${1:OptionCaptionText}', Comment = '\${2:${snippetTargetLanguage}}=\${3:Translation}';`
                    ),
                    detail: "Snippet (XLIFF Sync): OptionCaption with Comment-Translation",
                    kind: CompletionItemKind.Snippet
                },
                {
                    label: "tpromotedactioncategorieswithtranslation",
                    insertText: new SnippetString(
                        `PromotedActionCategories = '\${1:PromotedActionCategoriesText}', Comment = '\${2:${snippetTargetLanguage}}=\${3:Translation}';`
                    ),
                    detail: "Snippet (XLIFF Sync): PromotedActionCategories with Comment-Translation",
                    kind: CompletionItemKind.Snippet
                },
                {
                    label: "tlabelwithtranslation",
                    insertText: new SnippetString(
                        `\${1:LabelName}: Label '\${2:LabelText}', Comment = '\${3:${snippetTargetLanguage}}=\${4:Translation}';`
                    ),
                    detail: "Snippet (XLIFF Sync): Label with Comment-Translation",
                    kind: CompletionItemKind.Snippet
                },
                {
                    label: "ttooltipwithtranslation",
                    insertText: new SnippetString(
                        `ToolTip = '\${1:ToolTipText}', Comment = '\${2:${snippetTargetLanguage}}=\${3:Translation}';`
                    ),
                    detail: "Snippet (XLIFF Sync): ToolTip with Comment-Translation",
                    kind: CompletionItemKind.Snippet
                },
            ];
        }
    });
}