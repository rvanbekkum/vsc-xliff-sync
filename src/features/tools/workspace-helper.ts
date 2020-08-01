/*
 * Copyright (c) 2019 Rob van Bekkum
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

import { workspace, WorkspaceFolder, window } from "vscode";

export class WorkspaceHelper {
    public static async getWorkspaceFolders(allFiles: boolean): Promise<WorkspaceFolder[] | undefined> {
        let currentWorkspaceFolder: WorkspaceFolder | undefined = window.activeTextEditor ?
            workspace.getWorkspaceFolder(window.activeTextEditor.document.uri) :
            undefined;
        let syncWorkspaceFolders: WorkspaceFolder[] | undefined = currentWorkspaceFolder ?
            [currentWorkspaceFolder] :
            workspace.workspaceFolders?.concat([]);
        
        const syncCrossWorkspaceFolders: boolean = workspace.getConfiguration('xliffSync')['syncCrossWorkspaceFolders'];
        if (!allFiles && !currentWorkspaceFolder && syncWorkspaceFolders && syncWorkspaceFolders.length > 1 && !syncCrossWorkspaceFolders) {
            currentWorkspaceFolder = await window.showWorkspaceFolderPick({
              placeHolder: 'Select a workspace folder' 
            });
            syncWorkspaceFolders = undefined;
            if (currentWorkspaceFolder) {
                syncWorkspaceFolders = [currentWorkspaceFolder];
            }
        }
    
        return syncWorkspaceFolders;
      }
}
