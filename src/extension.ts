import * as vscode from 'vscode';
import requestPromise from 'request-promise';
import * as fs from 'fs';
import * as path from 'path';

interface ZoteroConfig {
  port: number;
}

// Extract bibliography file path from YAML front matter
function extractBibliographyFile(documentText: string): string | null {
  const yamlMatch = documentText.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!yamlMatch) {
    return null;
  }
  
  const yamlContent = yamlMatch[1];
  const bibliographyMatch = yamlContent.match(/bibliography:\s*([^\s\n]+)/);
  
  return bibliographyMatch ? bibliographyMatch[1].replace(/["']/g, '') : null;
}

// Extract citation key from citation text (e.g., @key or [@key] -> key)
function extractCitationKey(citationText: string): string | null {
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
async function getBibTeXEntry(citeKey: string): Promise<string | null> {
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
    const response: any = await requestPromise(options);
    return response.result || null;
  } catch (err) {
    console.log('Failed to fetch BibTeX entry:', err);
    return null;
  }
}

// Update .bib file with new entry
async function updateBibFile(bibFilePath: string, bibEntry: string, citeKey: string): Promise<void> {
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
  } catch (err) {
    console.log('Failed to update .bib file:', err);
    vscode.window.showWarningMessage(`Failed to update bibliography file: ${err}`);
  }
}

async function showZoteroPicker(): Promise<void> {
  const config: ZoteroConfig = vscode.workspace.getConfiguration('zotero-citation-picker') as any;

  try {
    const result: string = await requestPromise(String(config.port));
    if (result) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        // Insert citation into document
        editor.edit(editBuilder => {
          editor.selections.forEach(selection => {
            editBuilder.delete(selection);
            editBuilder.insert(selection.start, result);
          });
        });

        // Update .bib file
        const documentText = editor.document.getText();
        const bibFile = extractBibliographyFile(documentText);
        
        if (bibFile) {
          const citeKey = extractCitationKey(result);
          
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
    }
  } catch (err: any) {
    console.log('Failed to fetch citation: %j', err.message);
    vscode.window.showErrorMessage('Zotero Citations: could not connect to Zotero. Are you sure it is running?');
  }
}

async function openInZotero(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  let citeKey: string = '';

  if (editor.selection.isEmpty) {
    const range = editor.document.getWordRangeAtPosition(editor.selection.active);
    if (range) {
      citeKey = editor.document.getText(range);
    }
  } else {
    citeKey = editor.document.getText(new vscode.Range(editor.selection.start, editor.selection.end));
  }

  console.log(`Opening ${citeKey} in Zotero`);
  const uri = vscode.Uri.parse(`zotero://select/items/bbt:${citeKey}`);
  await vscode.env.openExternal(uri);
}

async function openPDFZotero(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  let citeKey: string = '';

  if (editor.selection.isEmpty) {
    const range = editor.document.getWordRangeAtPosition(editor.selection.active);
    if (range) {
      citeKey = editor.document.getText(range);
    }
  } else {
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
    const repos: any = await requestPromise(options);
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
  } catch (err: any) {
    console.log('API open PDF in Zotero failed', err);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('Congratulations, your extension "zotero citation picker" is now active!');

  context.subscriptions.push(vscode.commands.registerCommand('extension.openInZotero', openInZotero));
  context.subscriptions.push(vscode.commands.registerCommand('extension.openPDFZotero', openPDFZotero));

  let disposable = vscode.commands.registerCommand('extension.zoteroCitationPicker', () => {
    showZoteroPicker();
  });

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // This function is called when the extension is deactivated
}
