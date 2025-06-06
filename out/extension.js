"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const request_promise_1 = __importDefault(require("request-promise"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// QuickPick item for bibliography entries
class EntryItem {
    result;
    label;
    detail;
    description;
    alwaysShow;
    constructor(result) {
        this.result = result;
        this.label = result.title || 'Untitled';
        this.detail = result.citekey || '';
        this.alwaysShow = true; // Prevent VS Code from filtering this item
        if (result.author && result.author.length > 0) {
            const names = result.author.map(a => `${a.given || ''} ${a.family || ''}`.trim());
            if (names.length === 1) {
                this.description = names[0];
            }
            else if (names.length === 2) {
                this.description = names.join(' and ');
            }
            else if (names.length > 2) {
                this.description = names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
            }
        }
        else {
            this.description = '';
        }
    }
}
// QuickPick item for error messages
class ErrorItem {
    message;
    label;
    alwaysShow;
    constructor(message) {
        this.message = message;
        this.label = message.replace(/\r?\n/g, ' ');
        this.alwaysShow = true; // Prevent VS Code from filtering this item
    }
}
// Extract bibliography file path from YAML front matter
function extractBibliographyFile(documentText) {
    const yamlMatch = documentText.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
        return null;
    }
    const yamlContent = yamlMatch[1];
    const bibliographyMatch = yamlContent.match(/bibliography:\s*([^\s\n]+)/);
    return bibliographyMatch ? bibliographyMatch[1].replace(/["']/g, '') : null;
}
// Extract citation key from citation text (e.g., @key or [@key] -> key)
function extractCitationKey(citationText) {
    // Try @key format first (what Zotero actually returns)
    let match = citationText.match(/@([a-zA-Z0-9_-]+)/);
    if (match) {
        return match[1];
    }
    // Fallback to [@key] format
    match = citationText.match(/\[@([^\]]+)\]/);
    return match ? match[1] : null;
}
// Get BibTeX entry from Zotero for a given citation key
async function getBibTeXEntry(citeKey) {
    const options = {
        method: 'POST',
        uri: 'http://localhost:23119/better-bibtex/json-rpc',
        body: {
            'jsonrpc': '2.0',
            'method': 'item.export',
            'params': [[citeKey], 'Better BibTeX']
        },
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Request-Promise'
        },
        json: true
    };
    try {
        const response = await (0, request_promise_1.default)(options);
        return response.result || null;
    }
    catch (err) {
        console.log('Failed to fetch BibTeX entry:', err);
        return null;
    }
}
// Parse advanced search query into Better BibTeX search format
function parseSearchQuery(query) {
    const trimmedQuery = query.trim();
    // Map common field names to Better BibTeX search fields
    const fieldMapping = {
        'author': 'creator',
        'creator': 'creator',
        'title': 'title',
        'year': 'date',
        'date': 'date',
        'journal': 'publicationTitle',
        'publication': 'publicationTitle',
        'tag': 'tag',
        'note': 'note',
        'doi': 'DOI',
        'isbn': 'ISBN',
        'type': 'itemType'
    };
    // Check for multiple field:value patterns separated by spaces
    const advancedSearchPatterns = trimmedQuery.match(/(\w+):("[^"]+"|[^\s]+)/g);
    if (advancedSearchPatterns && advancedSearchPatterns.length > 0) {
        const searchConditions = [];
        for (const pattern of advancedSearchPatterns) {
            const match = pattern.match(/^(\w+):(.+)$/);
            if (match) {
                const [, field, value] = match;
                const searchField = fieldMapping[field.toLowerCase()] || field;
                const searchValue = value.replace(/^["']|["']$/g, '').trim(); // Remove quotes
                searchConditions.push([searchField, 'contains', searchValue]);
            }
        }
        // If we have multiple conditions, they are AND-ed by default
        return searchConditions;
    }
    // Check for single field:value pattern
    const singleAdvancedPattern = /^(\w+):(.+)$/;
    const singleMatch = trimmedQuery.match(singleAdvancedPattern);
    if (singleMatch) {
        const [, field, value] = singleMatch;
        const searchField = fieldMapping[field.toLowerCase()] || field;
        const searchValue = value.replace(/^["']|["']$/g, '').trim(); // Remove quotes
        return [[searchField, 'contains', searchValue]];
    }
    // For simple queries, use quicksearch-titleCreatorYear which searches across multiple fields
    return [['quicksearch-titleCreatorYear', 'contains', trimmedQuery]];
}
// Search Zotero database using Better BibTeX JSON-RPC
async function searchZotero(query) {
    const searchTerms = parseSearchQuery(query);
    const options = {
        method: 'POST',
        uri: 'http://localhost:23119/better-bibtex/json-rpc',
        body: {
            'jsonrpc': '2.0',
            'method': 'item.search',
            'params': [searchTerms]
        },
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Request-Promise'
        },
        json: true,
        timeout: 5000
    };
    try {
        const response = await (0, request_promise_1.default)(options);
        const results = response.result || [];
        return results;
    }
    catch (err) {
        console.log('Failed to search Zotero:', err);
        throw new Error('Could not connect to Zotero. Is Zotero running with Better BibTeX?');
    }
}
// Update .bib file with new entry
async function updateBibFile(bibFilePath, bibEntry, citeKey) {
    try {
        let bibContent = '';
        // Read existing .bib file if it exists
        if (fs.existsSync(bibFilePath)) {
            bibContent = fs.readFileSync(bibFilePath, 'utf8');
            // Check if the citation key already exists
            if (bibContent.includes(`{${citeKey},`) || bibContent.includes(`{${citeKey} `)) {
                console.log(`Citation key ${citeKey} already exists in .bib file`);
                return;
            }
        }
        // Append new entry
        const newContent = bibContent + (bibContent && !bibContent.endsWith('\n') ? '\n' : '') + bibEntry + '\n';
        fs.writeFileSync(bibFilePath, newContent, 'utf8');
        console.log(`Added citation ${citeKey} to ${bibFilePath}`);
    }
    catch (err) {
        console.log('Failed to update .bib file:', err);
        vscode.window.showWarningMessage(`Failed to update bibliography file: ${err}`);
    }
}
// Native VS Code citation picker using QuickPick
async function showVSCodePicker() {
    const picker = vscode.window.createQuickPick();
    picker.placeholder = 'Search for citations... (try "author:lastname" for advanced search)';
    picker.canSelectMany = false;
    // Disable QuickPick's built-in filtering since we do our own search
    picker.matchOnDescription = false;
    picker.matchOnDetail = false;
    let searchTimeout;
    let currentSearchId = 0;
    const performSearch = async (query, searchId) => {
        console.log(`performSearch called: "${query}" (ID: ${searchId})`);
        if (!query.trim()) {
            console.log('Empty query, clearing items');
            picker.busy = false;
            picker.items = [];
            return;
        }
        console.log(`Starting search for "${query}" (ID: ${searchId})`);
        picker.busy = true;
        try {
            const results = await searchZotero(query);
            // Check if this search is still the current one (not superseded by a newer search)
            if (searchId === currentSearchId) {
                const items = results.map(result => new EntryItem(result));
                console.log(`Search "${query}" (ID: ${searchId}): Found ${results.length} results, created ${items.length} items`);
                // IMPORTANT: Set busy = false BEFORE setting items so they can be displayed
                picker.busy = false;
                picker.items = items;
                // Debug: Check picker state after setting items
                console.log(`After setting items: busy=${picker.busy}, enabled=${picker.enabled}, items.length=${picker.items.length}`);
                // Force a small delay to ensure the picker has time to update
                setTimeout(() => {
                    console.log(`Delayed check: picker.items.length=${picker.items.length}, actualDisplayed=${picker.activeItems.length}`);
                }, 50);
            }
            else {
                console.log(`Discarding outdated search results for "${query}" (ID: ${searchId}, current: ${currentSearchId})`);
            }
        }
        catch (err) {
            console.log(`Search error for "${query}":`, err.message);
            if (searchId === currentSearchId) {
                picker.busy = false; // Set busy = false BEFORE setting error items
                picker.items = [new ErrorItem(err.message)];
            }
        }
    };
    picker.onDidChangeValue(value => {
        console.log(`onDidChangeValue: "${value}" (currentSearchId will be ${currentSearchId + 1})`);
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        // Increment search ID to track the latest search
        currentSearchId++;
        const thisSearchId = currentSearchId;
        console.log(`Scheduled search for "${value}" with ID ${thisSearchId} in 300ms`);
        searchTimeout = setTimeout(() => {
            performSearch(value, thisSearchId);
        }, 300); // Debounce search by 300ms
    });
    picker.onDidAccept(() => {
        const selection = picker.activeItems[0];
        if (selection && selection instanceof EntryItem) {
            insertCitation(`@${selection.result.citekey}`);
        }
        picker.hide();
    });
    picker.onDidHide(() => {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        picker.dispose();
    });
    // Start with empty items
    picker.items = [];
    picker.show();
}
// Use Zotero's built-in CAYW picker
async function showZoteroPicker() {
    const config = vscode.workspace.getConfiguration('zotero-citation-picker');
    try {
        const result = await (0, request_promise_1.default)(String(config.port));
        if (result) {
            await insertCitation(result);
        }
    }
    catch (err) {
        console.log('Failed to fetch citation: %j', err.message);
        vscode.window.showErrorMessage('Zotero Citations: could not connect to Zotero. Are you sure it is running?');
    }
}
// Insert citation and update .bib file
async function insertCitation(citation) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active text editor found');
        return;
    }
    // Insert citation into document
    await editor.edit(editBuilder => {
        editor.selections.forEach(selection => {
            editBuilder.delete(selection);
            editBuilder.insert(selection.start, citation);
        });
    });
    // Update .bib file
    const documentText = editor.document.getText();
    const bibFile = extractBibliographyFile(documentText);
    if (bibFile) {
        const citeKey = extractCitationKey(citation);
        if (citeKey) {
            const bibEntry = await getBibTeXEntry(citeKey);
            if (bibEntry) {
                const documentDir = path.dirname(editor.document.uri.fsPath);
                const bibFilePath = path.resolve(documentDir, bibFile);
                await updateBibFile(bibFilePath, bibEntry, citeKey);
            }
        }
    }
}
// Main citation picker function that chooses between methods
async function showCitationPicker() {
    const config = vscode.workspace.getConfiguration('zotero-citation-picker');
    const citeMethod = config.citeMethod || 'zotero';
    if (citeMethod === 'vscode') {
        await showVSCodePicker();
    }
    else {
        await showZoteroPicker();
    }
}
async function openInZotero() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    let citeKey = '';
    if (editor.selection.isEmpty) {
        const range = editor.document.getWordRangeAtPosition(editor.selection.active);
        if (range) {
            citeKey = editor.document.getText(range);
        }
    }
    else {
        citeKey = editor.document.getText(new vscode.Range(editor.selection.start, editor.selection.end));
    }
    console.log(`Opening ${citeKey} in Zotero`);
    const uri = vscode.Uri.parse(`zotero://select/items/bbt:${citeKey}`);
    await vscode.env.openExternal(uri);
}
async function openPDFZotero() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    let citeKey = '';
    if (editor.selection.isEmpty) {
        const range = editor.document.getWordRangeAtPosition(editor.selection.active);
        if (range) {
            citeKey = editor.document.getText(range);
        }
    }
    else {
        citeKey = editor.document.getText(new vscode.Range(editor.selection.start, editor.selection.end));
    }
    console.log(`Opening ${citeKey} in Zotero`);
    const options = {
        method: 'POST',
        uri: 'http://localhost:23119/better-bibtex/json-rpc',
        body: {
            'jsonrpc': '2.0',
            'method': 'item.attachments',
            'params': [citeKey]
        },
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Request-Promise'
        },
        json: true // Automatically parses the JSON string in the response
    };
    let uri = vscode.Uri.parse(`zotero://select/items/bbt:${citeKey}`);
    try {
        const repos = await (0, request_promise_1.default)(options);
        console.log(repos['result']);
        console.log('User has %d repos', repos['result'].length);
        for (const elt of repos['result']) {
            if (elt['path'].endsWith('.pdf')) {
                uri = vscode.Uri.parse(elt['open']);
                break;
            }
        }
        console.log(uri);
        await vscode.env.openExternal(uri);
    }
    catch (err) {
        console.log('API open PDF in Zotero failed', err);
    }
}
function activate(context) {
    console.log('Congratulations, your extension "zotero citation picker" is now active!');
    context.subscriptions.push(vscode.commands.registerCommand('extension.openInZotero', openInZotero));
    context.subscriptions.push(vscode.commands.registerCommand('extension.openPDFZotero', openPDFZotero));
    let disposable = vscode.commands.registerCommand('extension.zoteroCitationPicker', () => {
        showCitationPicker();
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
function deactivate() {
    // This function is called when the extension is deactivated
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map