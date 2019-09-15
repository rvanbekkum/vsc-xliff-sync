import {
    commands,
    ExtensionContext
} from 'vscode';

import { synchronizeFiles, synchronizeWithSelectedFile, createNewTargetFiles } from './features/trans-sync';
import { XliffTranslationChecker } from './features/trans-check';
import { XliffTranslationImport } from './features/trans-import';

export function activate(context: ExtensionContext) {
    new XliffTranslationChecker(context);
    new XliffTranslationImport(context);

    context.subscriptions.push(
        commands.registerCommand('xliffSync.createNewTargetFiles', async() => {
            createNewTargetFiles();
        })
    );

    context.subscriptions.push(
        commands.registerCommand('xliffSync.synchronizeFile', async () => {
            synchronizeFiles(false);
        })
    );

    context.subscriptions.push(
        commands.registerCommand('xliffSync.synchronizeSources', async (fileUri?) => {
            if (!fileUri) {
                synchronizeFiles(true);
            }
            else {
                synchronizeWithSelectedFile(fileUri);
            }
        })
    );
}

export function deactivate() {

}
