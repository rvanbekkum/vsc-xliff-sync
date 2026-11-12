import { CancellationError, CancellationToken, commands, extensions, Task, TaskExecution, TaskGroup, tasks, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

function isBuildResult(value: unknown): value is { success: boolean; error?: string } {
    return !!value && typeof value === 'object' && 'success' in value;
}

export async function refreshTranslationSource(folder: WorkspaceFolder, taskName: string, token: CancellationToken): Promise<string> {
    const owner = workspace.getWorkspaceFolder(folder.uri);
    const available = (await tasks.fetchTasks()).filter(task => typeof task.scope === 'object' &&
        (task.scope.uri.toString() === folder.uri.toString() || (!!taskName && task.scope.uri.toString() === owner?.uri.toString())));
    const buildTasks = available.filter(task => task.group?.id === TaskGroup.Build.id);
    const defaultBuildTasks = buildTasks.filter(task => task.group?.isDefault === true);
    const candidates = taskName
        ? available.filter(task => task.name === taskName)
        : defaultBuildTasks.length ? defaultBuildTasks : buildTasks;
    if (!taskName && candidates.length === 0 && fs.existsSync(path.join(folder.uri.fsPath, 'app.json'))) {
        const manifest = JSON.parse(await fs.promises.readFile(path.join(folder.uri.fsPath, 'app.json'), 'utf8'));
        if (!Array.isArray(manifest.features) || !manifest.features.includes('TranslationFile')) {
            throw new Error('The AL app.json must enable TranslationFile before refreshing source translations.');
        }
        const al = extensions.getExtension('ms-dynamics-smb.al');
        if (!al) {
            throw new Error('Install the AL Language extension or configure xliffSync.translationRefreshTask to build this AL project.');
        }
        await al.activate();
        const registered = await commands.getCommands(true);
        if (!registered.includes('al.package')) {
            throw new Error('The AL Language extension does not expose its build command. Configure xliffSync.translationRefreshTask.');
        }
        if (workspace.getConfiguration('al', folder.uri)['incrementalBuild']) {
            throw new Error('Disable al.incrementalBuild for translation generation, or configure a full-build translationRefreshTask.');
        }
        const appUri = Uri.file(path.join(folder.uri.fsPath, 'app.json'));
        // AL commands select their project from the active editor, not URI arguments.
        await window.showTextDocument(await workspace.openTextDocument(appUri), { preview: true });
        if (token.isCancellationRequested) { throw new CancellationError(); }
        const result: unknown = await commands.executeCommand('al.package');
        if (token.isCancellationRequested) { throw new CancellationError(); }
        if (!isBuildResult(result) || result.success !== true) {
            const detail = isBuildResult(result) ? result.error || 'AL build failed' : 'No verifiable build success result returned';
            throw new Error(`AL build did not succeed: ${detail}. No synchronization performed. Configure translationRefreshTask if this AL extension version does not return build results.`);
        }
        return 'al.package';
    }
    if (candidates.length !== 1) {
        throw new Error('No unique source-refresh task found. Configure one default build task for this workspace folder, or set xliffSync.translationRefreshTask to the exact name of a workspace build/extraction task.');
    }
    const task: Task = candidates[0];
    if (task.isBackground) {
        throw new Error('The translation refresh task must be a finite, non-background task with an observable exit code.');
    }
    if (token.isCancellationRequested) {
        throw new CancellationError();
    }
    let execution: TaskExecution | undefined;
    let exitCode: number | undefined;
    let processEnded = false;
    let resolveEnd: () => void = () => {};
    const ended = new Promise<void>(resolve => resolveEnd = resolve);
    const matches = (candidate: TaskExecution) => execution ? candidate === execution : candidate.task === task;
    const processSubscription = tasks.onDidEndTaskProcess(event => {
        if (matches(event.execution)) {
            processEnded = true;
            exitCode = event.exitCode;
        }
    });
    const endSubscription = tasks.onDidEndTask(event => {
        if (matches(event.execution)) {
            resolveEnd();
        }
    });
    const cancellation = token.onCancellationRequested(() => {
        execution?.terminate();
        resolveEnd();
    });
    try {
        execution = await tasks.executeTask(task);
        if (token.isCancellationRequested) {
            execution.terminate();
            throw new CancellationError();
        }
        await ended;
        if (token.isCancellationRequested) {
            throw new CancellationError();
        }
        if (!processEnded || exitCode !== 0) {
            throw new Error(`Translation refresh task "${task.name}" did not succeed (exit code: ${exitCode === undefined ? 'unavailable' : exitCode}). No synchronization performed.`);
        }
        return task.name;
    }
    finally {
        cancellation.dispose();
        endSubscription.dispose();
        processSubscription.dispose();
    }
}
