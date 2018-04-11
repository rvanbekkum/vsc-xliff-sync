import { commands, ExtensionContext, window, workspace, Uri, Range } from 'vscode';
import { XLiffBuilder } from './xliff-builder';
import { TranslationBuilder } from './translation-builder';
import { XmlBuilder, XmlParser, FilesHelper } from './tools';
import { XlfTranslator } from './tools/xlf-translator';

export function activate(context: ExtensionContext) {
  const disposable = commands.registerCommand('extension.synchronizeFiles', async () => {
    try {
      const baseFile: string = workspace.getConfiguration('i18nSync')['baseFile'];
      const fileType: string = workspace.getConfiguration('i18nSync')['fileType'];

      // Get the list of i18n files in the opened workspace
      let uris = (await FilesHelper.findTranslationFiles(fileType)) || [];

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
        // TODO: update configuration with file name
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
            // TODO: create the empty file
            targetUri = undefined; // = await builder.createTranslationFile(sourceUri, targetLanguage);
          }
        } else {
          targetUri = uris.find((uri) => uri.fsPath === targetPath)!;
        }
      }

      if (!targetUri) {
        throw new Error('No target file specified');
      }

      const source = await workspace.openTextDocument(sourceUri);
      const sourceText = source && source.getText();

      const target = await workspace.openTextDocument(targetUri);
      const targetText = target && target.getText();

      const parser = new XmlParser();
      const sourceDocument = await parser.parseDocument(sourceText);

      const parser2 = new XmlParser();
      const targetDocument = await parser2.parseDocument(targetText);

      const output = XlfTranslator.synchronize(sourceDocument, targetDocument);

      const outputDocument: string = XmlBuilder.create(output)!;
      //      const outputDocument = await builder.consolidateTranslationFiles(sourceUri, targetUri);

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
        editBuilder.replace(range, outputDocument);
      });
    } catch (ex) {
      // TODO: display error on screen
      console.error('Error writing data to document. ' + ex.message);
    }
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
