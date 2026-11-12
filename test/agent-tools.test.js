const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { test, after } = require('node:test');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xliff-agent-'));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'xliff-outside-'));
after(() => {
    fs.rmSync(root, { recursive: true });
    fs.rmSync(outside, { recursive: true });
});
const uri = filePath => ({ fsPath: filePath, scheme: 'file', toString: () => filePath });
const folder = { uri: uri(root), name: 'test', index: 0 };
const properties = require('../package.json').contributes.configuration.properties;
const defaults = Object.fromEntries(Object.entries(properties).map(([key, value]) => [key.replace('xliffSync.', ''), value.default]));
let config;
let dirty;
let saveSucceeds;
let editSucceeds;
let discovered;
const tools = new Map();
const writes = [];
const processListeners = new Set();
const endListeners = new Set();
let availableTasks = [];
let refreshExitCode = 0;
let refreshAction = () => {};
let taskRuns = 0;
let taskTerminated = false;
const subscribe = listeners => callback => { listeners.add(callback); return { dispose: () => listeners.delete(callback) }; };
class CancellationError extends Error {}
class WorkspaceEdit {
    edits = [];
    createFile(uri, options) { this.edits.push({ type: 'create', uri, options }); }
    insert(uri, _position, contents) { this.edits.push({ type: 'write', uri, contents }); }
    replace(uri, _range, contents) { this.edits.push({ type: 'write', uri, contents }); }
}
const vscode = {
    Uri: { file: uri },
    Range: class {}, Position: class {}, WorkspaceEdit, CancellationError,
    LanguageModelToolResult: class { constructor(content) { this.content = content; } },
    LanguageModelTextPart: class { constructor(value) { this.value = value; } },
    lm: { registerTool(name, tool) { tools.set(name, tool); return { dispose() {} }; } },
    TaskGroup: { Build: { id: 'build' } },
    extensions: { getExtension: () => ({ activate: async () => {} }) },
    commands: { getCommands: async () => ['al.package'], executeCommand: async () => ({ success: true }) },
    tasks: {
        fetchTasks: async () => availableTasks,
        onDidEndTaskProcess: subscribe(processListeners),
        onDidEndTask: subscribe(endListeners),
        executeTask: async task => {
            taskRuns++;
            const execution = { task, terminate() { taskTerminated = true; } };
            setImmediate(() => {
                refreshAction();
                if (refreshExitCode !== null) {
                    for (const listener of processListeners) listener({ execution, exitCode: refreshExitCode });
                }
                for (const listener of endListeners) listener({ execution });
            });
            return execution;
        },
    },
    workspace: {
        textDocuments: [],
        isTrusted: true,
        workspaceFolders: [folder],
        getWorkspaceFolder: value => {
            const relative = path.relative(root, value.fsPath);
            return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? undefined : folder;
        },
        getConfiguration: () => config,
        openTextDocument: async value => ({
            getText: () => fs.readFileSync(value.fsPath, 'utf8'),
            isDirty: dirty.has(value.fsPath),
            positionAt: offset => offset,
            save: async () => saveSucceeds,
        }),
        applyEdit: async edit => {
            if (!editSucceeds) return false;
            for (const item of edit.edits) {
                if (item.type === 'create') fs.writeFileSync(item.uri.fsPath, '', { flag: 'wx' });
                else { fs.writeFileSync(item.uri.fsPath, item.contents); writes.push(item.uri.fsPath); }
            }
            return true;
        },
    },
    window: new Proxy({}, { get: () => () => { throw new Error('Agent tools must not use interactive UI'); } }),
};
const originalLoad = Module._load;
Module._load = function(request, ...args) {
    if (request === 'vscode') return vscode;
    return originalLoad.call(this, request, ...args);
};
const { registerAgentTools } = require('../out/features/agent-tools');
const { FilesHelper } = require('../out/features/tools');
const { runTranslationChecksForWorkspaceFolder } = require('../out/features/trans-check');
Module._load = originalLoad;
const originalFindTranslationFiles = FilesHelper.findTranslationFilesInWorkspaceFolder;
FilesHelper.findTranslationFilesInWorkspaceFolder = async () => discovered.map(uri);
registerAgentTools({ subscriptions: [] });

const sourcePath = path.join(root, 'App.g.xlf');
const targetPath = path.join(root, 'App.nl-NL.xlf');
const unrelatedPath = path.join(root, 'Other.xlf');
const unit = (id, text, target) => `<trans-unit id="${id}"><source>${text}</source>${target === undefined ? '' : `<target state="translated">${target}</target>`}</trans-unit>`;
const document = (original, language, units) => `<xliff version="1.2"><file source-language="en-US" target-language="${language}" original="${original}"><body>${units}</body></file></xliff>`;
function reset() {
    config = { ...defaults, useFileSystem: false, inspect: () => ({}) };
    dirty = new Set();
    saveSucceeds = true;
    editSucceeds = true;
    writes.length = 0;
    discovered = [sourcePath, targetPath];
    vscode.workspace.isTrusted = true;
    vscode.workspace.workspaceFolders = [folder];
    vscode.workspace.textDocuments = [];
    availableTasks = [{ name: 'AL: Package', scope: folder, definition: { type: 'AL' }, group: { id: 'build' }, isBackground: false }];
    refreshExitCode = 0;
    refreshAction = () => {};
    taskRuns = 0;
    taskTerminated = false;
    fs.writeFileSync(sourcePath, document('App', 'en-US', unit('existing', 'Changed') + unit('new', 'New')));
    fs.writeFileSync(targetPath, document('App.g.xlf', 'nl-NL', unit('existing', 'Old', 'Bestaand') + unit('obsolete', 'Removed', 'Weg')));
}
const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
const invoke = async (name, input = {}, cancellation = token) => {
    const result = await tools.get(`xliffSync_${name}`).invoke({ input }, cancellation);
    return JSON.parse(result.content[0].value);
};

test('discovers languages and synchronizes existing translations without UI', async () => {
    reset();
    const listing = await invoke('listFiles');
    assert.equal(listing.files.length, 2);
    assert.deepEqual(listing.files[1], { filePath: targetPath, version: '1.2', sourceLanguage: 'en-US', targetLanguage: 'nl-NL', original: 'App.g.xlf', unitCount: 2, role: 'translationTarget' });
    const result = await invoke('synchronizeFile', { targetFilePath: targetPath });
    assert.deepEqual(result, { sourceFilePath: sourcePath, synchronizedFiles: [targetPath], skippedFiles: [] });
    const text = fs.readFileSync(targetPath, 'utf8');
    assert.match(text, /Bestaand/);
    assert.match(text, /id="new"/);
    assert.match(text, /needs-adaptation/);
    assert.doesNotMatch(text, /obsolete/);
});

test('all-file synchronization respects original matching and equivalent languages', async () => {
    reset();
    const slave = path.join(root, 'App.nl-BE.xlf');
    fs.writeFileSync(slave, document('App', 'nl-BE', unit('existing', 'Old', 'Previous')));
    fs.writeFileSync(unrelatedPath, document('Other', 'de-DE', unit('existing', 'Old', 'Unrelated')));
    discovered.push(slave, unrelatedPath);
    config.equivalentLanguagesEnabled = true;
    const result = await invoke('synchronizeAll');
    assert.deepEqual(result.synchronizedFiles, [targetPath, slave]);
    assert.deepEqual(result.skippedFiles, [unrelatedPath]);
    assert.match(fs.readFileSync(slave, 'utf8'), /target-language="nl-BE"/);
    assert.match(fs.readFileSync(slave, 'utf8'), /Bestaand/);
    assert.match(fs.readFileSync(unrelatedPath, 'utf8'), /Unrelated/);
});

test('creates XLIFF 1.2 and 2.0 files and never overwrites existing targets', async () => {
    reset();
    const created = path.join(root, 'New.de-DE.xlf');
    const result = await invoke('createTargetFile', { targetFilePath: created, targetLanguage: 'de-DE' });
    assert.deepEqual(result.synchronizedFiles, [created]);
    assert.match(fs.readFileSync(created, 'utf8'), /target-language="de-DE"/);
    await assert.rejects(invoke('createTargetFile', { targetFilePath: created, targetLanguage: 'de-DE' }), /already exists/);
    const source2 = path.join(root, 'App.g.xlf2');
    const target2 = path.join(root, 'New.fr-FR.xlf2');
    fs.writeFileSync(source2, '<xliff version="2.0" srcLang="en-US"><file id="app" original="App"><unit id="hello"><segment><source>Hello</source></segment></unit></file></xliff>');
    await invoke('createTargetFile', { sourceFilePath: source2, targetFilePath: target2, targetLanguage: 'fr-FR' });
    assert.match(fs.readFileSync(target2, 'utf8'), /trgLang="fr-FR"/);
    assert.match(fs.readFileSync(target2, 'utf8'), /Hello/);
    await invoke('synchronizeFile', { sourceFilePath: source2, targetFilePath: target2 });
});

test('rejects unsafe, ambiguous and unsaved inputs before writes', async () => {
    reset();
    await assert.rejects(invoke('synchronizeFile', { targetFilePath: sourcePath }), /must never receive translations/);
    await assert.rejects(invoke('synchronizeFile', { targetFilePath: 'relative.xlf' }), /absolute/);
    const external = path.join(outside, 'External.xlf');
    fs.writeFileSync(external, document('App', 'nl-NL', ''));
    await assert.rejects(invoke('synchronizeFile', { sourceFilePath: sourcePath, targetFilePath: external }), /inside workspace/);
    await assert.rejects(invoke('createTargetFile', { targetFilePath: path.join(root, 'Invalid.xlf'), targetLanguage: '../bad' }), /targetLanguage/);
    dirty.add(targetPath);
    await assert.rejects(invoke('synchronizeFile', { targetFilePath: targetPath }), /unsaved/);
    dirty.clear();
    config.baseFile = 'missing';
    assert.equal((await invoke('synchronizeAll')).sourceFilePath, sourcePath);
    config.baseFile = '.g.xlf';
    const secondSource = path.join(root, 'Second.g.xlf');
    fs.copyFileSync(sourcePath, secondSource);
    discovered.push(secondSource);
    await assert.rejects(invoke('synchronizeAll'), /unique base/);
    discovered.pop();
    fs.writeFileSync(targetPath, '<xliff version="3.0"/>');
    await assert.rejects(invoke('synchronizeFile', { targetFilePath: targetPath }), /Invalid or unsupported/);
    vscode.workspace.workspaceFolders.push({ uri: uri(outside) });
    await assert.rejects(invoke('listFiles'), /workspaceFolderPath/);
    vscode.workspace.isTrusted = false;
    await assert.rejects(invoke('synchronizeAll', { sourceFilePath: sourcePath }), /trusted/);
    assert.ok(!writes.includes(sourcePath));
});

test('rejects paths through directory links outside the workspace', async () => {
    reset();
    const link = path.join(root, 'external-link');
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(invoke('createTargetFile', { targetFilePath: path.join(link, 'Escaped.xlf'), targetLanguage: 'de-DE' }), /inside workspace/);
    assert.deepEqual(writes, []);
});

test('reports edit/save failures, partial completion and cancellation', async () => {
    reset();
    editSucceeds = false;
    await assert.rejects(invoke('synchronizeFile', { targetFilePath: targetPath }), /Failed to edit/);
    assert.deepEqual(writes, []);
    editSucceeds = true;
    saveSucceeds = false;
    await assert.rejects(invoke('synchronizeFile', { targetFilePath: targetPath }), /Failed to save/);
    reset();
    await assert.rejects(invoke('synchronizeAll', {}, { isCancellationRequested: true }), CancellationError);
    assert.deepEqual(writes, []);
    let cancellationChecks = 0;
    await assert.rejects(invoke('synchronizeFile', { targetFilePath: targetPath }, {
        get isCancellationRequested() { return ++cancellationChecks >= 4; },
    }), CancellationError);
    assert.deepEqual(writes, []);
    config.equivalentLanguagesEnabled = true;
    const slave = path.join(root, 'Missing.fr-BE.xlf');
    fs.writeFileSync(slave, document('App', 'fr-BE', unit('existing', 'Old', 'Previous')));
    discovered.push(slave);
    await assert.rejects(invoke('synchronizeAll'), error => /No matching master/.test(error.message) && error.message.includes(`Files already saved: ${targetPath}`));
});

test('honors synchronization settings and provides write confirmation', async () => {
    reset();
    config.matchingOriginalOnly = false;
    config.copyFromSourceForLanguages = ['nl-NL'];
    config.copyFromSourceOverwrite = true;
    await invoke('synchronizeAll');
    assert.match(fs.readFileSync(targetPath, 'utf8'), /<target[^>]*>Changed<\/target>/);
    const prepared = tools.get('xliffSync_synchronizeFile').prepareInvocation({ input: { sourceFilePath: sourcePath, targetFilePath: targetPath } });
    assert.ok(prepared.confirmationMessages.message.includes(sourcePath));
    assert.ok(prepared.confirmationMessages.message.includes(targetPath));
});

test('missing checks return paginated findings, honor placeholders and translate=no, and save states', async () => {
    reset();
    config.missingTranslation = 'TODO';
    fs.writeFileSync(targetPath, document('App', 'nl-NL', unit('absent', 'Absent') + unit('empty', 'Empty', '') +
        unit('placeholder', 'Placeholder', 'TODO') + unit('complete', 'Complete', 'Klaar') +
        '<trans-unit id="skip" translate="no"><source>Skip</source></trans-unit>'));
    const before = fs.readFileSync(targetPath, 'utf8');
    const page = await invoke('checkMissingTranslations', { targetFilePath: targetPath, updateFiles: false, offset: 1, limit: 1 });
    assert.equal(page.totalCount, 3);
    assert.equal(page.returnedCount, 1);
    assert.equal(page.nextOffset, 2);
    assert.equal(page.files[0].missingCount, 3);
    assert.deepEqual(page.updatedFiles, []);
    assert.deepEqual(page.findings[0], { filePath: targetPath, id: 'empty', source: 'Empty', target: '', kind: 'missing',
        reason: 'Translation is absent, empty, or matches the configured missing-translation placeholder.' });
    assert.equal(fs.readFileSync(targetPath, 'utf8'), before);
    const checked = await invoke('checkMissingTranslations', { targetFilePath: targetPath });
    assert.deepEqual(checked.updatedFiles, [targetPath]);
    assert.equal((fs.readFileSync(targetPath, 'utf8').match(/state="needs-translation"/g) || []).length, 3);
    const again = await invoke('checkMissingTranslations', { targetFilePath: targetPath, offset: 3 });
    assert.deepEqual(again.updatedFiles, []);
    assert.deepEqual(again.findings, []);
    assert.equal(again.nextOffset, null);
});

test('needs-work checks reuse configured rules and return reasons even when notes are disabled', async () => {
    reset();
    config.addNeedsWorkTranslationNote = false;
    fs.writeFileSync(targetPath, document('App', 'nl-NL', unit('bad', 'Hello %1', 'Hallo') + unit('good', 'Hello %1', 'Hallo %1')));
    const checked = await invoke('checkNeedsWorkTranslations', { targetFilePath: targetPath });
    assert.equal(checked.totalCount, 1);
    assert.equal(checked.files[0].needsWorkCount, 1);
    assert.equal(checked.findings[0].id, 'bad');
    assert.match(checked.findings[0].reason, /placeholders/);
    assert.match(fs.readFileSync(targetPath, 'utf8'), /needs-adaptation/);
    assert.doesNotMatch(fs.readFileSync(targetPath, 'utf8'), /<note/);
    fs.writeFileSync(targetPath, document('App', 'nl-NL', unit('bad', 'Hello %1', 'Hallo')));
    config.needWorkTranslationRules = [];
    const disabled = await invoke('checkNeedsWorkTranslations', { targetFilePath: targetPath });
    assert.equal(disabled.totalCount, 0);
    assert.deepEqual(disabled.updatedFiles, []);
    config.needWorkTranslationRulesEnableAll = true;
    assert.equal((await invoke('checkNeedsWorkTranslations', { targetFilePath: targetPath, updateFiles: false })).totalCount, 1);
});

test('workspace checks exclude the base and include other originals with global pagination', async () => {
    reset();
    fs.writeFileSync(targetPath, document('App', 'nl-NL', unit('first', 'First')));
    fs.writeFileSync(unrelatedPath, document('Other', 'de-DE', unit('second', 'Second')));
    discovered.push(unrelatedPath);
    const checked = await invoke('checkMissingTranslations', { updateFiles: false, offset: 1, limit: 1 });
    assert.deepEqual(checked.files.map(file => file.filePath), [targetPath, unrelatedPath]);
    assert.equal(checked.totalCount, 2);
    assert.equal(checked.findings[0].filePath, unrelatedPath);
    assert.equal(checked.nextOffset, null);
    config.baseFile = 'unknown';
    assert.equal((await invoke('checkMissingTranslations', { updateFiles: false })).totalCount, 2);
    assert.equal((await invoke('checkMissingTranslations', { targetFilePath: targetPath })).totalCount, 1);
});

test('XLIFF 2.0 checks save missing states and custom needs-work substates and notes', async () => {
    reset();
    const target2 = path.join(root, 'Check.xlf2');
    config.needsWorkTranslationSubstate = 'custom:review';
    fs.writeFileSync(target2, '<xliff version="2.0" srcLang="en-US" trgLang="nl-NL"><file id="app"><unit id="missing"><segment><source>Missing</source></segment></unit><unit id="bad"><segment state="translated"><source>Hello %1</source><target>Hallo</target></segment></unit></file></xliff>');
    const missing = await invoke('checkMissingTranslations', { targetFilePath: target2 });
    assert.equal(missing.totalCount, 1);
    assert.match(fs.readFileSync(target2, 'utf8'), /state="initial"/);
    const problems = await invoke('checkNeedsWorkTranslations', { targetFilePath: target2 });
    assert.equal(problems.totalCount, 1);
    assert.match(fs.readFileSync(target2, 'utf8'), /subState="custom:review"/);
    assert.match(fs.readFileSync(target2, 'utf8'), /category="XLIFF Sync"/);
});

test('check tools remove resolved notes, preserve existing needs-work and confirm only updates', async () => {
    reset();
    fs.writeFileSync(targetPath, document('App', 'nl-NL',
        '<trans-unit id="resolved"><source>Hello</source><target state="translated">Hallo</target><note from="XLIFF Sync">Old problem</note></trans-unit>' +
        '<trans-unit id="review"><source>Hello</source><target state="needs-adaptation">Hallo</target></trans-unit>'));
    const checked = await invoke('checkNeedsWorkTranslations', { targetFilePath: targetPath });
    assert.equal(checked.totalCount, 1);
    assert.equal(checked.findings[0].id, 'review');
    assert.match(checked.findings[0].reason, /already marked/);
    assert.doesNotMatch(fs.readFileSync(targetPath, 'utf8'), /Old problem/);
    const tool = tools.get('xliffSync_checkNeedsWorkTranslations');
    assert.ok(tool.prepareInvocation({ input: { targetFilePath: targetPath } }).confirmationMessages.message.includes(targetPath));
    assert.equal(tool.prepareInvocation({ input: { updateFiles: false } }).confirmationMessages, undefined);
});

test('check tools propagate validation, cancellation, and save failures', async () => {
    reset();
    fs.writeFileSync(targetPath, document('App', 'nl-NL', unit('missing', 'Missing')));
    await assert.rejects(invoke('checkMissingTranslations', { targetFilePath: targetPath, limit: 501 }), /limit/);
    await assert.rejects(invoke('checkMissingTranslations', { targetFilePath: targetPath, offset: -1 }), /offset/);
    dirty.add(targetPath);
    await assert.rejects(invoke('checkNeedsWorkTranslations', { targetFilePath: targetPath }), /unsaved/);
    dirty.clear();
    await assert.rejects(invoke('checkMissingTranslations', {}, { isCancellationRequested: true }), CancellationError);
    assert.deepEqual(writes, []);
    saveSucceeds = false;
    await assert.rejects(invoke('checkMissingTranslations', { targetFilePath: targetPath }), /Failed to save/);
});

test('palette checks retain the same saved states and notes as agent checks', async () => {
    reset();
    const original = document('App', 'nl-NL', unit('missing', 'Missing') + unit('problem', 'Hello %1', 'Hallo'));
    fs.writeFileSync(targetPath, original);
    await invoke('checkMissingTranslations', { targetFilePath: targetPath });
    await invoke('checkNeedsWorkTranslations', { targetFilePath: targetPath });
    const expected = fs.readFileSync(targetPath, 'utf8');
    fs.writeFileSync(targetPath, original);
    const getUris = FilesHelper.getXliffFileUris;
    const getSource = FilesHelper.getXliffSourceFile;
    const saveTarget = FilesHelper.createNewTargetFile;
    const previousWindow = vscode.window;
    FilesHelper.getXliffFileUris = async () => [uri(sourcePath), uri(targetPath)];
    FilesHelper.getXliffSourceFile = async files => files[0];
    FilesHelper.createNewTargetFile = async (target, contents) => { fs.writeFileSync(target.fsPath, contents); return target; };
    vscode.window = { showInformationMessage: async () => undefined, showErrorMessage: message => { throw new Error(message); } };
    try {
        await runTranslationChecksForWorkspaceFolder(true, false, uri(targetPath), folder);
        await runTranslationChecksForWorkspaceFolder(false, true, uri(targetPath), folder);
        assert.equal(fs.readFileSync(targetPath, 'utf8'), expected);
    }
    finally {
        FilesHelper.getXliffFileUris = getUris;
        FilesHelper.getXliffSourceFile = getSource;
        FilesHelper.createNewTargetFile = saveTarget;
        vscode.window = previousWindow;
    }
});

test('filesystem mode runs agent listing, sync, creation and checks without opening documents', async () => {
    reset();
    config.useFileSystem = true;
    const openDocument = vscode.workspace.openTextDocument;
    vscode.workspace.openTextDocument = async () => { throw new Error('Filesystem mode must not open documents'); };
    try {
        assert.equal((await invoke('listFiles')).files.length, 2);
        const synced = await invoke('synchronizeFile', { targetFilePath: targetPath });
        assert.deepEqual(synced.synchronizedFiles, [targetPath]);
        assert.match(fs.readFileSync(targetPath, 'utf8'), /Bestaand/);
        const created = path.join(root, 'Filesystem.de-DE.xlf');
        await invoke('createTargetFile', { targetFilePath: created, targetLanguage: 'de-DE' });
        await assert.rejects(invoke('createTargetFile', { targetFilePath: created, targetLanguage: 'de-DE' }), /already exists/);
        const missing = await invoke('checkMissingTranslations', { targetFilePath: created });
        assert.equal(missing.totalCount, 2);
        fs.writeFileSync(targetPath, document('App', 'nl-NL', unit('bad', 'Hello %1', 'Hallo')));
        const checked = await invoke('checkNeedsWorkTranslations', { targetFilePath: targetPath });
        assert.equal(checked.totalCount, 1);
        assert.deepEqual(checked.updatedFiles, [targetPath]);
        assert.match(fs.readFileSync(targetPath, 'utf8'), /needs-adaptation/);
        await invoke('synchronizeAll');
        const source2 = path.join(root, 'Filesystem.g.xlf2');
        const target2 = path.join(root, 'Filesystem.nl-NL.xlf2');
        fs.writeFileSync(source2, '<xliff version="2.0" srcLang="en-US"><file id="app"><unit id="hello"><segment><source>Hello</source></segment></unit></file></xliff>');
        await invoke('createTargetFile', { sourceFilePath: source2, targetFilePath: target2, targetLanguage: 'nl-NL' });
        assert.equal((await invoke('checkMissingTranslations', { targetFilePath: target2 })).totalCount, 1);
        await invoke('synchronizeFile', { sourceFilePath: source2, targetFilePath: target2 });
        assert.match(fs.readFileSync(target2, 'utf8'), /trgLang="nl-NL"/);
    }
    finally {
        vscode.workspace.openTextDocument = openDocument;
    }
});

test('filesystem helpers handle files over 50 MiB, preserve UTF-8 BOM and reject dirty or nonlocal files', async () => {
    reset();
    config.useFileSystem = true;
    const large = uri(path.join(root, 'Large.xlf'));
    const content = document('Large', 'nl-NL', '<!--' + 'x'.repeat(51 * 1024 * 1024) + '-->' + unit('large', 'Hello', 'Hallo'));
    fs.writeFileSync(large.fsPath, '\uFEFF' + content, 'utf8');
    assert.ok(fs.statSync(large.fsPath).size > 50 * 1024 * 1024);
    const read = await FilesHelper.readFile(large);
    assert.equal(read.length, content.length);
    assert.equal(read, content);
    discovered = [large.fsPath];
    const openDocument = vscode.workspace.openTextDocument;
    vscode.workspace.openTextDocument = async () => { throw new Error('Large-file processing must bypass text documents'); };
    try {
        const listing = await invoke('listFiles');
        assert.equal(listing.files[0].unitCount, 1);
        assert.equal(listing.files[0].targetLanguage, 'nl-NL');
    }
    finally {
        vscode.workspace.openTextDocument = openDocument;
    }
    await FilesHelper.writeFile(large, read);
    assert.equal(fs.readFileSync(large.fsPath, 'utf8'), '\uFEFF' + content);
    vscode.workspace.textDocuments = [{ uri: large, isDirty: true }];
    await assert.rejects(FilesHelper.readFile(large), /unsaved/);
    await assert.rejects(FilesHelper.writeFile(large, 'Do not overwrite'), /unsaved/);
    vscode.workspace.textDocuments = [];
    await assert.rejects(FilesHelper.readFile({ ...large, scheme: 'remote' }), /local file URI/);
    await assert.rejects(FilesHelper.writeFile(uri(path.join(root, 'missing-directory', 'Failure.xlf')), 'text', true), /ENOENT/);
    await assert.rejects(FilesHelper.writeFile(large, 'Do not overwrite', true), /EEXIST/);
    await assert.rejects(FilesHelper.writeFile(large, 'Do not overwrite', false, { isCancellationRequested: true }), CancellationError);
});

test('filesystem palette saves and new-file generation do not open editors', async () => {
    reset();
    config.useFileSystem = true;
    const openDocument = vscode.workspace.openTextDocument;
    vscode.workspace.openTextDocument = async () => { throw new Error('Filesystem mode must not open documents'); };
    try {
        const content = document('App', 'nl-NL', unit('saved', 'Saved', 'Opgeslagen'));
        await FilesHelper.createNewTargetFile(uri(targetPath), content);
        assert.equal(fs.readFileSync(targetPath, 'utf8'), content);
        const generated = await FilesHelper.createNewTargetFile(undefined, content, uri(sourcePath), 'es-ES');
        assert.equal(path.basename(generated.fsPath), 'App.es-ES.xlf');
        assert.equal(fs.readFileSync(generated.fsPath, 'utf8'), content);
        await assert.rejects(FilesHelper.createNewTargetFile(undefined, content, uri(sourcePath), 'es-ES'), /EEXIST/);
    }
    finally {
        vscode.workspace.openTextDocument = openDocument;
    }
});

test('document mode still reads editor content and saves via the editor', async () => {
    reset();
    config.keepEditorOpenAfterSync = false;
    const openDocument = vscode.workspace.openTextDocument;
    const previousWindow = vscode.window;
    const commands = vscode.commands;
    const editorText = document('App', 'nl-NL', unit('editor', 'Editor', 'Unsaved editor text'));
    let saved = false;
    let replacement;
    let closed = false;
    const textDocument = { getText: () => editorText, positionAt: offset => offset, save: async () => { saved = true; return true; } };
    vscode.workspace.openTextDocument = async () => textDocument;
    vscode.window = { showTextDocument: async document => {
        assert.equal(document, textDocument);
        return { edit: async callback => { callback({ replace: (_range, contents) => { replacement = contents; } }); return true; } };
    } };
    vscode.commands = { executeCommand: async command => { assert.equal(command, 'workbench.action.closeActiveEditor'); closed = true; } };
    try {
        assert.equal(await FilesHelper.readFile(uri(targetPath)), editorText);
        await FilesHelper.createNewTargetFile(uri(targetPath), 'Updated via editor');
        assert.equal(replacement, 'Updated via editor');
        assert.ok(saved);
        assert.ok(closed);
    }
    finally {
        vscode.workspace.openTextDocument = openDocument;
        vscode.window = previousWindow;
        vscode.commands = commands;
    }
});

test('filesystem no-op writes preserve BOM and CRLF without touching modification time', async () => {
    reset();
    config.useFileSystem = true;
    const target = uri(targetPath);
    const existing = '\uFEFF' + document('App', 'nl-NL', unit('same', 'Same', 'Hetzelfde')).replace(/\n/g, '\r\n') + '\r\n';
    fs.writeFileSync(targetPath, existing);
    fs.utimesSync(targetPath, new Date('2020-01-01'), new Date('2020-01-01'));
    const before = fs.statSync(targetPath).mtimeMs;
    await FilesHelper.writeFile(target, existing.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));
    assert.equal(fs.readFileSync(targetPath, 'utf8'), existing);
    assert.equal(fs.statSync(targetPath).mtimeMs, before);
    await FilesHelper.writeFile(target, '<xliff>\nchanged\n</xliff>\n');
    assert.equal(fs.readFileSync(targetPath, 'utf8'), '\uFEFF<xliff>\r\nchanged\r\n</xliff>\r\n');
});

test('repeated unchanged synchronization preserves bytes and modification time', async () => {
    reset();
    config.useFileSystem = true;
    fs.writeFileSync(sourcePath, document('App', 'en-US', unit('existing', 'Old') + unit('new', 'New')));
    fs.writeFileSync(targetPath, '\uFEFF' + fs.readFileSync(targetPath, 'utf8') + '\r\n');
    await invoke('synchronizeFile', { targetFilePath: targetPath });
    const first = fs.readFileSync(targetPath);
    fs.utimesSync(targetPath, new Date('2020-01-01'), new Date('2020-01-01'));
    const before = fs.statSync(targetPath).mtimeMs;
    await invoke('synchronizeFile', { targetFilePath: targetPath });
    assert.deepEqual(fs.readFileSync(targetPath), first);
    assert.equal(fs.statSync(targetPath).mtimeMs, before);
});

test('resolution context exposes terminology and saves only validated unresolved units', async () => {
    reset();
    config.useFileSystem = true;
    fs.writeFileSync(targetPath, document('App', 'de-DE', unit('known', 'Document', 'Beleg') +
        unit('missing', 'New document') + unit('problem', 'Document %1', 'Dokument')));
    const terminology = await invoke('resolveTranslations', { targetFilePath: targetPath, filter: 'translated' });
    assert.deepEqual(terminology.units.map(unit => [unit.source, unit.target]), [['Document', 'Beleg']]);
    assert.match(terminology.instructions, /user instructions exactly/);
    const context = await invoke('resolveTranslations', { targetFilePath: targetPath, limit: 1 });
    assert.equal(context.totalCount, 2);
    assert.equal(context.nextOffset, 1);
    const saved = await invoke('saveResolvedTranslations', { targetFilePath: targetPath, translations: [
        { id: 'missing', source: 'New document', expectedTarget: '', target: 'Neuer Beleg' },
        { id: 'problem', source: 'Document %1', expectedTarget: 'Dokument', target: 'Beleg %1' },
    ] });
    assert.equal(saved.remainingMissingCount, 0);
    assert.equal(saved.remainingNeedsWorkCount, 0);
    assert.match(fs.readFileSync(targetPath, 'utf8'), /Neuer Beleg/);
    assert.match(fs.readFileSync(targetPath, 'utf8'), /Beleg %1/);
    assert.equal((await invoke('resolveTranslations', { targetFilePath: targetPath })).totalCount, 0);
});

test('resolution rejects invalid batches, stale proposals and inline markup without saving', async () => {
    reset();
    fs.writeFileSync(targetPath, document('App', 'nl-NL', unit('bad', 'Hello %1', 'Hallo') + unit('missing', 'Missing')));
    const before = fs.readFileSync(targetPath, 'utf8');
    await assert.rejects(invoke('saveResolvedTranslations', { targetFilePath: targetPath, translations: [
        { id: 'missing', source: 'Missing', expectedTarget: '', target: 'Ontbrekend' },
        { id: 'bad', source: 'Hello %1', expectedTarget: 'Hallo', target: 'Nog steeds fout' },
    ] }), /no changes saved/);
    assert.equal(fs.readFileSync(targetPath, 'utf8'), before);
    await assert.rejects(invoke('saveResolvedTranslations', { targetFilePath: targetPath, translations: [
        { id: 'bad', source: 'Old source', expectedTarget: 'Hallo', target: 'Hallo %1' },
    ] }), /changed since context/);
    fs.writeFileSync(targetPath, document('App', 'nl-NL', '<trans-unit id="inline"><source>Hello <ph id="1">%1</ph></source><target/></trans-unit>'));
    const context = await invoke('resolveTranslations', { targetFilePath: targetPath });
    assert.equal(context.units[0].hasInlineMarkup, true);
    await assert.rejects(invoke('saveResolvedTranslations', { targetFilePath: targetPath, translations: [
        { id: 'inline', source: context.units[0].source, expectedTarget: '', target: 'Hallo %1' },
    ] }), /inline markup/);
});

test('resolution saves XLIFF 2.0 translated states and escapes plain-text targets', async () => {
    reset();
    const target2 = path.join(root, 'Resolution.xlf2');
    fs.writeFileSync(target2, '<xliff version="2.0" srcLang="en-US" trgLang="nl-NL"><file id="app"><unit id="missing"><segment state="initial"><source>Hello</source></segment></unit></file></xliff>');
    const saved = await invoke('saveResolvedTranslations', { targetFilePath: target2, translations: [
        { id: 'missing', source: 'Hello', expectedTarget: '', target: 'Hallo & welkom' },
    ] });
    assert.equal(saved.remainingMissingCount, 0);
    assert.match(fs.readFileSync(target2, 'utf8'), /state="translated"/);
    assert.match(fs.readFileSync(target2, 'utf8'), /Hallo &amp; welkom/);
});

test('project entry refreshes before discovery, synchronizes/checks, and verifies after resolution', async () => {
    reset();
    config.useFileSystem = true;
    fs.unlinkSync(sourcePath);
    refreshAction = () => fs.writeFileSync(sourcePath, document('App', 'en-US', unit('existing', 'Old') + unit('new', 'New %1')));
    const result = await invoke('updateProjectTranslations');
    assert.equal(taskRuns, 1);
    assert.equal(result.stages.refresh, 'succeeded');
    assert.equal(result.stages.refreshTask, 'AL: Package');
    assert.equal(result.stages.synchronization, 'succeeded');
    assert.equal(result.stages.checks, 'succeeded');
    assert.equal(result.complete, false);
    assert.equal(result.remainingMissingCount, 1);
    assert.deepEqual(result.synchronizedFiles, [targetPath]);
    assert.match(result.nextSteps, /verifyProjectTranslations/);
    await invoke('saveResolvedTranslations', { targetFilePath: targetPath, translations: [
        { id: 'new', source: 'New %1', expectedTarget: '', target: 'Nieuw %1' },
    ] });
    const verified = await invoke('verifyProjectTranslations', { sourceFilePath: result.sourceFilePath });
    assert.equal(taskRuns, 1);
    assert.equal(verified.complete, true);
    assert.equal(verified.remainingMissingCount, 0);
    assert.equal(verified.remainingNeedsWorkCount, 0);
    assert.deepEqual(verified.checkUpdatedFiles, []);
    assert.equal(processListeners.size, 0);
    assert.equal(endListeners.size, 0);
});

test('refresh failures and unknown exit codes stop before synchronization', async () => {
    reset();
    const before = fs.readFileSync(targetPath, 'utf8');
    refreshExitCode = 1;
    await assert.rejects(invoke('updateProjectTranslations'), /did not succeed/);
    assert.equal(fs.readFileSync(targetPath, 'utf8'), before);
    assert.deepEqual(writes, []);
    refreshExitCode = null;
    await assert.rejects(invoke('updateProjectTranslations'), /unavailable/);
    assert.equal(processListeners.size, 0);
    assert.equal(endListeners.size, 0);
});

test('generic refresh defaults prefer the project default build and reject ambiguity', async () => {
    reset();
    availableTasks = [
        { name: 'Compile', scope: folder, definition: { type: 'shell' }, group: { id: 'build' }, isBackground: false },
    ];
    assert.equal((await invoke('updateProjectTranslations')).stages.refreshTask, 'Compile');
    availableTasks.push({ name: 'Production build', scope: folder, definition: { type: 'npm' }, group: { id: 'build', isDefault: true }, isBackground: false });
    assert.equal((await invoke('updateProjectTranslations')).stages.refreshTask, 'Production build');
    availableTasks[1].group.isDefault = false;
    await assert.rejects(invoke('updateProjectTranslations'), /default build task/);
    availableTasks[0].group.isDefault = true;
    availableTasks[1].group.isDefault = true;
    await assert.rejects(invoke('updateProjectTranslations'), /default build task/);
    config.translationRefreshTask = 'Compile';
    assert.equal((await invoke('updateProjectTranslations')).stages.refreshTask, 'Compile');
    assert.equal(taskRuns, 3);
});

test('refresh task configuration is exact, scoped, finite and optional', async () => {
    reset();
    availableTasks = [];
    await assert.rejects(invoke('updateProjectTranslations'), /translationRefreshTask/);
    config.translationRefreshTask = 'Extract translations';
    availableTasks = [{ name: 'Extract translations', scope: folder, definition: { type: 'shell' }, isBackground: true }];
    await assert.rejects(invoke('updateProjectTranslations'), /non-background/);
    availableTasks[0].isBackground = false;
    availableTasks[0].scope = { uri: uri(outside) };
    await assert.rejects(invoke('updateProjectTranslations'), /translationRefreshTask/);
    availableTasks[0].scope = folder;
    const result = await invoke('updateProjectTranslations');
    assert.equal(result.stages.refreshTask, 'Extract translations');
    availableTasks = [];
    const skipped = await invoke('updateProjectTranslations', { refreshSource: false });
    assert.equal(skipped.stages.refresh, 'skipped');
    assert.equal(taskRuns, 1);
    assert.ok(tools.get('xliffSync_updateProjectTranslations').prepareInvocation({ input: {} }).confirmationMessages);
    assert.equal(tools.get('xliffSync_verifyProjectTranslations').prepareInvocation({ input: {} }).confirmationMessages, undefined);
});

test('cancelling project refresh terminates only its task and skips synchronization', async () => {
    reset();
    const before = fs.readFileSync(targetPath, 'utf8');
    let cancelled = false;
    let cancel = () => {};
    refreshAction = () => { cancelled = true; cancel(); };
    await assert.rejects(invoke('updateProjectTranslations', {}, {
        get isCancellationRequested() { return cancelled; },
        onCancellationRequested(callback) { cancel = callback; return { dispose() {} }; },
    }), CancellationError);
    assert.ok(taskTerminated);
    assert.equal(fs.readFileSync(targetPath, 'utf8'), before);
    assert.equal(processListeners.size, 0);
    assert.equal(endListeners.size, 0);
});

test('project checks persist technical problem markings and final verification stays incomplete', async () => {
    reset();
    config.useFileSystem = true;
    fs.writeFileSync(sourcePath, document('App', 'en-US', unit('bad', 'Hello %1')));
    fs.writeFileSync(targetPath, document('App', 'nl-NL', unit('bad', 'Hello %1', 'Hallo')));
    const result = await invoke('updateProjectTranslations', { refreshSource: false });
    assert.equal(result.remainingNeedsWorkCount, 1);
    assert.equal(result.remainingMissingCount, 0);
    assert.deepEqual(result.checkUpdatedFiles, [targetPath]);
    assert.deepEqual(result.synchronizedFiles, [targetPath]);
    assert.match(fs.readFileSync(targetPath, 'utf8'), /needs-adaptation/);
    const verified = await invoke('verifyProjectTranslations');
    assert.equal(verified.complete, false);
    assert.equal(verified.remainingNeedsWorkCount, 1);
});

test('project verification reports skipped files and no-target blockers without saving', async () => {
    reset();
    fs.writeFileSync(targetPath, document('App', 'nl-NL', unit('ok', 'Okay', 'Goed')));
    fs.writeFileSync(unrelatedPath, document('Other', 'de-DE', unit('missing', 'Missing')));
    discovered.push(unrelatedPath);
    const verified = await invoke('verifyProjectTranslations');
    assert.equal(verified.complete, false);
    assert.deepEqual(verified.skippedFiles, [unrelatedPath]);
    assert.equal(verified.remainingMissingCount, 0);
    assert.deepEqual(writes, []);
    discovered = [sourcePath];
    const empty = await invoke('verifyProjectTranslations');
    assert.equal(empty.complete, false);
    assert.equal(empty.blockers.length, 1);
});

test('project rejects reversed source and every writing tool protects generated files', async () => {
    reset();
    const before = fs.readFileSync(sourcePath, 'utf8');
    await assert.rejects(invoke('updateProjectTranslations', { sourceFilePath: targetPath, refreshSource: false }), /must be a generated base/);
    assert.equal(taskRuns, 0);
    for (const name of ['checkMissingTranslations', 'checkNeedsWorkTranslations', 'resolveTranslations', 'saveResolvedTranslations']) {
        await assert.rejects(invoke(name, { targetFilePath: sourcePath }), /must never receive translations/);
    }
    config.baseFile = 'App.nl-NL.xlf';
    assert.equal((await invoke('verifyProjectTranslations')).sourceFilePath, sourcePath);
    assert.equal((await invoke('resolveTranslations', { targetFilePath: targetPath })).filePath, targetPath);
    assert.equal(fs.readFileSync(sourcePath, 'utf8'), before);
    assert.deepEqual(writes, []);
});

test('nested AL project without tasks builds through AL command then updates only language targets', async () => {
    reset();
    config.useFileSystem = true;
    const app = path.join(root, 'NestedApp');
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, 'app.json'), JSON.stringify({ features: ['TranslationFile'] }));
    const base = path.join(app, 'Nested.g.xlf');
    const language = path.join(app, 'Nested.nl-NL.xlf');
    fs.writeFileSync(base, document('Nested', 'en-US', unit('old', 'Old')));
    fs.writeFileSync(language, document('Nested', 'nl-NL', unit('old', 'Old', 'Oud')));
    discovered = [base, language];
    availableTasks = [];
    const previousWindow = vscode.window;
    const previousCommands = vscode.commands;
    let active;
    vscode.window = { showTextDocument: async document => { active = document; } };
    vscode.commands = {
        getCommands: async () => ['al.package'],
        executeCommand: async command => {
            assert.equal(command, 'al.package');
            assert.ok(active.getText().includes('TranslationFile'));
            fs.writeFileSync(base, document('Nested', 'en-US', unit('old', 'Old') + unit('new', 'New')));
            return { success: true };
        },
    };
    try {
        const result = await invoke('updateProjectTranslations', { workspaceFolderPath: app });
        assert.equal(result.stages.refreshTask, 'al.package');
        assert.equal(result.workspaceFolderPath, app);
        assert.deepEqual(result.synchronizedFiles, [language]);
        assert.match(fs.readFileSync(language, 'utf8'), /id="new"/);
        assert.doesNotMatch(fs.readFileSync(base, 'utf8'), /<target/);
        vscode.commands.executeCommand = async () => ({ success: false, error: 'Compiler failed' });
        await assert.rejects(invoke('updateProjectTranslations', { workspaceFolderPath: app }), /Compiler failed/);
        vscode.commands.executeCommand = async () => undefined;
        await assert.rejects(invoke('updateProjectTranslations', { workspaceFolderPath: app }), /verifiable build success/);
    }
    finally {
        vscode.window = previousWindow;
        vscode.commands = previousCommands;
    }
});

test('reference lookup consumes external XLIFF with language filtering, alternatives and pagination', async () => {
    reset();
    config.useFileSystem = true;
    const reference = path.join(outside, 'Vendor.de-DE.xlf');
    const other = path.join(outside, 'Vendor.fr-FR.xlf');
    fs.writeFileSync(reference, document('Vendor', 'de-DE', unit('one', 'Document', 'Beleg') + unit('two', 'Document', 'Dokument') + unit('bad', 'Document %1', 'Falsch')));
    fs.writeFileSync(other, document('Vendor', 'fr-FR', unit('one', 'Document', 'Document')));
    config.referenceTranslationFiles = [reference, other];
    const before = fs.readFileSync(reference, 'utf8');
    const result = await invoke('findReferenceTranslations', { targetLanguage: 'de-DE', sourceLanguage: 'en-US', sourceTexts: ['Document', 'Missing'], limit: 1 });
    assert.equal(result.totalCount, 2);
    assert.equal(result.nextOffset, 1);
    assert.equal(result.matches[0].target, 'Beleg');
    assert.equal(result.matches[0].filePath, await fs.promises.realpath(reference));
    assert.deepEqual(result.unmatchedSourceTexts, ['Missing']);
    assert.equal(result.skippedFiles[0].filePath, await fs.promises.realpath(other));
    const second = await invoke('findReferenceTranslations', { targetLanguage: 'de-DE', query: 'DOCUMENT', offset: 1 });
    assert.equal(second.matches[0].target, 'Dokument');
    assert.equal(second.nextOffset, null);
    assert.equal(fs.readFileSync(reference, 'utf8'), before);
    assert.deepEqual(writes, []);
    assert.deepEqual((await invoke('resolveTranslations', { targetFilePath: targetPath })).referenceTranslationFiles, [reference, other]);
});

test('reference settings exclude files from discovery and protect explicit writes', async () => {
    reset();
    config.useFileSystem = true;
    const reference = path.join(root, 'Reference.de-DE.xlf');
    fs.writeFileSync(reference, document('Vendor', 'de-DE', unit('missing', 'Missing')));
    config.referenceTranslationFiles = ['Reference.de-DE.xlf'];
    await assert.rejects(invoke('resolveTranslations', { targetFilePath: reference }), /read-only/);
    await assert.rejects(FilesHelper.writeFile(uri(reference), 'changed'), /read-only/);
    const find = FilesHelper.findTranslationFilesInWorkspaceFolder;
    const relativePattern = vscode.RelativePattern;
    const findFiles = vscode.workspace.findFiles;
    vscode.RelativePattern = class {};
    vscode.workspace.findFiles = async () => [uri(reference), uri(targetPath)];
    try {
        // Load the original method saved before the test harness's discovery override.
        const files = await originalFindTranslationFiles.call(FilesHelper, 'xlf', folder);
        assert.deepEqual(files.map(file => file.fsPath), [targetPath]);
    }
    finally {
        FilesHelper.findTranslationFilesInWorkspaceFolder = find;
        vscode.RelativePattern = relativePattern;
        vscode.workspace.findFiles = findFiles;
    }
    config.referenceTranslationFiles = [];
    await assert.rejects(invoke('findReferenceTranslations', { targetLanguage: 'de-DE', query: 'Document' }), /No reference translations/);
    config.referenceTranslationFiles = [path.join(root, 'Missing.xlf')];
    await assert.rejects(invoke('findReferenceTranslations', { targetLanguage: 'de-DE', query: 'Document' }), /ENOENT/);
});
