import { workspace, Uri } from 'vscode';

export class FilesHelper {
  public static async findTranslationFiles(fileExt: string): Promise<Uri[]> {
    return workspace.findFiles(`**/*.${fileExt}`).then((files) =>
      files.sort((a, b) => {
        if (a.fsPath.length !== b.fsPath.length) {
          return a.fsPath.length - b.fsPath.length;
        }
        return a.fsPath.localeCompare(b.fsPath);
      }),
    );
  }
}
