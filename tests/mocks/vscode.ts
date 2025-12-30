/**
 * Mock for vscode module in tests
 */

export const workspace = {
    getConfiguration: (section?: string) => ({
        get: (key: string, defaultValue?: unknown) => defaultValue,
        update: async () => { },
        has: () => true,
    }),
    workspaceFolders: [],
};

export const window = {
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    createWebviewPanel: () => ({
        webview: {
            html: '',
            onDidReceiveMessage: () => ({ dispose: () => { } }),
            postMessage: async () => true,
        },
        reveal: () => { },
        onDidDispose: () => ({ dispose: () => { } }),
        dispose: () => { },
    }),
    createStatusBarItem: () => ({
        show: () => { },
        hide: () => { },
        dispose: () => { },
        text: '',
        tooltip: '',
        command: '',
    }),
};

export const commands = {
    registerCommand: () => ({ dispose: () => { } }),
    executeCommand: async () => undefined,
};

export const env = {
    appName: 'Antigravity',
    openExternal: async () => true,
};

export const Uri = {
    parse: (str: string) => ({ toString: () => str }),
    file: (path: string) => ({ fsPath: path }),
};

export const ViewColumn = {
    One: 1,
    Two: 2,
    Three: 3,
};

export const ConfigurationTarget = {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
};
