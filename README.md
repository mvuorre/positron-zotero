<a href="https://marketplace.visualstudio.com/items?itemName=mblode.zotero">
  <img src="https://github.com/mblode/vscode-zotero/blob/master/images/icon.png?raw=true" alt="" width=100 height=100>
</a>

# VS Code Citation Picker for Zotero

This package adds Zotero support to VS Code Markdown editing. To use it, you will need to have the Better BibTeX plugin installed in Zotero.

## Features

If you don't feel like typing citations out (and let's be honest, you don't), executing 'Zotero Citation Picker' will call up a citation picker which will insert these for you, formatted and all.

### Two citation picker modes

- Native VS Code picker (default): Search and select citations within VS Code using a QuickPick interface
- Zotero picker: Use Zotero's built-in "Cite as you Write" popup window

You can configure the citation picker behavior in VS Code settings:

- `zotero-citation-picker.citeMethod`: Choose between "vscode" (native VS Code picker) or "zotero" (Zotero's CAYW popup)
- `zotero-citation-picker.port`: Customize the Zotero Better BibTeX URL (only used for Zotero picker mode)

### Native VS Code Citation Picker Features

- Simple search: Type any text to search across titles, authors, and other fields
- Advanced search: Use field-specific searches like:
  - `author:vuorre` - Search by author name
  - `title:climate` - Search in title field
  - `year:2023` - Search by publication year
  - `journal:nature` - Search by journal/publication
  - `tag:statistics` - Search by tags
  - `doi:10.1000` - Search by DOI
  - Multiple fields: `author:smith title:climate` - Search multiple fields simultaneously

- Activate via Command Palette (command + shift + P): Type "Zotero Citation Picker" and press enter.
- Activate via keyboard shortcut: Use alt+shift+z

![Screenshot](images/screenshot.png)

## Requirements

**IMPORTANT:** Zotero, with Better BibTeX installed, must be running while you use these.
