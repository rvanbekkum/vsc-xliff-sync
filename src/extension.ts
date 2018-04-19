import { commands, ExtensionContext, window, workspace, Uri, Range, Selection } from 'vscode';

import { FilesHelper } from './tools';
import { XlfTranslator } from './tools/xlf-translator';

import * as path from 'path';

export function activate(context: ExtensionContext) {
  let currentEditor = window.activeTextEditor;
  let timeout: NodeJS.Timer;

  const disposable = commands.registerCommand('extension.synchronizeFiles', async () => {
    try {
      const baseFile: string = workspace.getConfiguration('i18nSync')['baseFile'];
      let fileType: string | undefined = workspace.getConfiguration('i18nSync')['fileType'];

      // Get the list of i18n files in the opened workspace
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
            workspace.getConfiguration('i18nSync').update('fileType', fileType);
          }
        }
      }

      if (!uris.length) {
        throw new Error('No translation file found');
      }

      // Find the angular generated i18n file
      let sourceUri = baseFile ? uris.find((uri) => uri.fsPath.indexOf(baseFile) >= 0) : undefined;

      if (!sourceUri) {
        // File not found, request the user to identify the file himself
        const fsPaths = uris.map((uri) => uri.fsPath);
        const sourcePath = await window.showQuickPick(fsPaths, {
          placeHolder: 'Select Angular generated i18n file',
        });

        if (!sourcePath) {
          throw new Error('No Angular generated i18n file');
        }

        sourceUri = uris.find((uri) => uri.fsPath === sourcePath)!;
        const filename = path.basename(sourceUri.fsPath);
        workspace.getConfiguration('i18nSync').update('baseFile', filename);
      }

      // filter out the base file and request the target file
      uris = uris.filter((uri) => uri !== sourceUri);

      const activeEditor = window.activeTextEditor;

      let targetUri: Uri | undefined;

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
        } else if (targetPath === 'New File...') {
          const targetLanguage = await window.showInputBox({ placeHolder: 'Region/Language Code' });

          if (!targetLanguage) {
            throw new Error('No target language specified');
          } else {
            const newDoc = XlfTranslator.createNewDocument(targetLanguage);

            if (!newDoc) {
              throw new Error('Unable to generate new localization file');
            }

            targetUri = await FilesHelper.createTranslationFile(targetLanguage, sourceUri, newDoc);
          }
        } else {
          targetUri = uris.find((uri) => uri.fsPath === targetPath)!;
        }
      }

      if (!targetUri) {
        throw new Error('No target file specified');
      }

      const source = (await workspace.openTextDocument(sourceUri)).getText();
      const target = (await workspace.openTextDocument(targetUri)).getText();

      const output = await XlfTranslator.synchronize(source, target);

      const document = await workspace.openTextDocument(targetUri);
      const editor = await window.showTextDocument(document);

      if (!editor) {
        throw new Error('Failed to open target file');
      }

      const range = new Range(
        document.positionAt(0),
        document.positionAt(document.getText().length - 1),
      );

      await editor.edit((editBuilder) => {
        editBuilder.replace(range, output);
      });

      await document.save();
    } catch (ex) {
      window.showErrorMessage(ex.message);
    }
  });

  context.subscriptions.push(disposable);

  const findNextDisposable = commands.registerCommand(
    'extension.findNextMissingTarget',
    async () => {
      try {
        if (currentEditor && currentEditor.document) {
          const document = currentEditor.document;
          const text = document.getText();

          const missingTranslationKeyword: string = workspace.getConfiguration('i18nSync')[
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
          }
        }
      } catch (ex) {
        window.showErrorMessage(ex.message);
      }
    },
  );

  context.subscriptions.push(findNextDisposable);

  window.onDidChangeActiveTextEditor((editor) => {
    currentEditor = editor;
    pushHighlightUpdate();
  });

  workspace.onDidChangeTextDocument((event) => {
    if (currentEditor && event.document === currentEditor.document) {
      pushHighlightUpdate();
    }
  });

  pushHighlightUpdate();

  function highlightUpdate() {
    if (currentEditor && currentEditor.document) {
      const document = currentEditor.document;
      const text = document.getText();

      const missingTranslationKeyword: string = workspace.getConfiguration('i18nSync')[
        'missingTranslation'
      ];

      const decorationType = window.createTextEditorDecorationType(
        workspace.getConfiguration('i18nSync')['decoration'],
      );

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

  function pushHighlightUpdate() {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(highlightUpdate, 1);
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
