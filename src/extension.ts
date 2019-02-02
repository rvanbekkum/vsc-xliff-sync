import {
    commands,
    ExtensionContext
} from 'vscode';

import { synchronizeFiles } from './features/trans-sync';
import { XliffTranslationChecker } from './features/trans-check';

export function activate(context: ExtensionContext) {
    new XliffTranslationChecker(context);

    context.subscriptions.push(
        commands.registerCommand('xliffSync.synchronizeFile', async () => {
            synchronizeFiles(false);
        })
    );

    context.subscriptions.push(
        commands.registerCommand('xliffSync.synchronizeAllFiles', async () => {
            synchronizeFiles(true);
        })
    );
}

export function deactivate() {

}
