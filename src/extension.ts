import { commands, ExtensionContext, window, workspace, Uri, Range } from 'vscode';
import { XLiffBuilder } from './xliff-builder';
import { TranslationBuilder } from './translation-builder';
import { XmlBuilder, XmlParser } from './tools';
import { XlfTranslator } from './tools/xlf-translator';

export function activate(context: ExtensionContext) {
  const disposable = commands.registerCommand('extension.synchronizeFiles', async () => {
    try {
      // TODO: search for any available files and automatically select the type.
      const fileType = await window.showQuickPick(['xliff 1.2'], {
        placeHolder: 'Select Translation File Type: ',
      });

      let builder: TranslationBuilder;

      switch (fileType) {
        // TODO: Implements Xliff 2 and XMB
        case 'xliff 1.2':
        default:
          builder = new XLiffBuilder();
      }

      let uris = (await builder.findTranslationFiles()) || [];

      if (!uris.length) {
        throw new Error('No translation file found');
      }

      let sourceUri: Uri;
      let targetUri: Uri;

      if (uris.length === 1) {
        sourceUri = uris[0];
      } else {
        const fsPaths = uris.map((uri) => uri.fsPath);
        const sourcePath = await window.showQuickPick(fsPaths, {
          placeHolder: 'Select Source File: ',
        });

        if (!sourcePath) {
          throw new Error('No source file selected');
        } else {
          sourceUri = uris.find((uri) => uri.fsPath === sourcePath)!;
        }
      }

      uris = uris.filter((uri) => uri !== sourceUri);
      const fsPath = [...uris.map((uri) => uri.fsPath), 'New File...'];

      let targetPath = await window.showQuickPick(fsPath, { placeHolder: 'Select Target File: ' });

      if (!targetPath) {
        throw new Error('No target file selected');
      } else if (targetPath === 'New File...') {
        const targetLanguage = await window.showInputBox({ placeHolder: 'Region/Language Code' });

        if (!targetLanguage) {
          throw new Error('No target language specified');
        } else {
          const targetFile = await builder.createTranslationFile(sourceUri, targetLanguage);

          if (!targetFile) {
            throw new Error('Unable to create target file');
          } else {
            targetUri = targetFile;
          }
        }
      } else {
        targetUri = uris.find((uri) => uri.fsPath === targetPath)!;
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
      console.error('Error writing data to document. ' + ex.message);
    }
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
