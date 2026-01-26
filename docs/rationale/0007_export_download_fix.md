# ADR-0007: Fixing Export Download Failures in Tauri

## Status

Accepted

## Context

Users reported that exporting settings and bookmarks failed with the error:

```
Download failed with error: The operation couldn't be completed. (NSURLErrorDomain error -999.)
```

This error occurred when clicking the Export Settings or Export Bookmarks buttons in the Settings panel.

## Problem Analysis

### Root Cause

The `NSURLErrorDomain error -999` is an Apple/WebKit error code meaning "cancelled request". Our original implementation used the standard web download pattern:

```typescript
function downloadExport(): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)  // <-- Problem: called immediately
}
```

The issue is that `link.click()` initiates the download asynchronously, but `URL.revokeObjectURL(url)` was called synchronously immediately after. This revoked the blob URL before the download could actually start, causing the WebKit engine to cancel the request.

### Why This Affects Tauri Specifically

While this pattern often works in regular browsers (which may buffer the URL reference), Tauri's WebView (WKWebView on macOS) is more strict about resource lifecycle. When the blob URL is revoked, WKWebView immediately invalidates it, causing the download to fail with the cancellation error.

## Solution

We implemented a two-tier solution:

### Tier 1: Native Tauri File Dialog (Primary)

Use Tauri's native file system APIs for a proper desktop experience:

```typescript
type SaveResult = 'success' | 'cancelled' | 'unavailable'

async function saveWithTauriDialog(content: string, filename: string): Promise<SaveResult> {
  try {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')

    const filePath = await save({
      title: 'Export File',
      defaultPath: filename,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    if (filePath) {
      await writeTextFile(filePath, content)
      return 'success'
    }
    return 'cancelled'  // User dismissed dialog
  } catch {
    return 'unavailable'  // Tauri not available
  }
}
```

**Key Design Decision:** The function returns a discriminated `SaveResult` type rather than a boolean. This distinguishes between:
- `'success'`: File was saved successfully
- `'cancelled'`: User dismissed the dialog (not an error)
- `'unavailable'`: Tauri APIs not available (should fallback to web download)

This distinction is important because user cancellation should not trigger fallback dialogs, while Tauri unavailability should.

This approach:
- Opens the native OS save dialog
- Lets users choose the save location
- Writes directly to the filesystem
- Works reliably on all desktop platforms

### Tier 2: Web Download with Delayed Revocation (Fallback)

For non-Tauri environments or if the native dialog fails:

```typescript
function triggerWebDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Delay revoking URL to allow download to start
  // 1000ms provides safety margin for slower systems
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
```

### Tier 3: Copy Dialog (Last Resort)

If Tauri is unavailable (web environment), show a dialog with the JSON content that users can copy:

```typescript
// Module-level handler for proper cleanup
let exportDialogKeydownHandler: ((e: KeyboardEvent) => void) | null = null

function showExportDialog(content: string, filename: string, title: string): void {
  // Creates a modal with:
  // - Textarea containing the JSON
  // - "Copy to Clipboard" button
  // - Instructions to save as filename.json
  
  // Store handler for cleanup
  exportDialogKeydownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeExportDialog()
  }
  document.addEventListener('keydown', exportDialogKeydownHandler)
}

function closeExportDialog(): void {
  // Remove keyboard listener to prevent memory leaks
  if (exportDialogKeydownHandler) {
    document.removeEventListener('keydown', exportDialogKeydownHandler)
    exportDialogKeydownHandler = null
  }
  // Remove dialog from DOM...
}
```

**Note:** The copy dialog is only shown when Tauri is unavailable (web fallback). It is NOT shown when the user cancels the native save dialog.

## Implementation Details

### Dependencies Added

**Rust (Cargo.toml):**
```toml
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
```

**TypeScript (package.json):**
```json
"@tauri-apps/plugin-dialog": "^2.6.0",
"@tauri-apps/plugin-fs": "^2.4.5"
```

### Permissions (capabilities/default.json)

```json
"permissions": [
  "dialog:allow-save",
  "fs:allow-write-text-file"
]
```

### Plugin Registration (main.rs)

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    // ...
```

## Alternatives Considered

### 1. Just Delay the Revocation

We could have simply added the `setTimeout` delay without the native dialog:

```typescript
setTimeout(() => URL.revokeObjectURL(url), 100)
```

**Rejected because:** While this fixes the immediate error, blob downloads in Tauri's WebView are still unreliable. The native file dialog provides a much better user experience and guaranteed reliability.

### 2. Use Data URLs Instead of Blob URLs

```typescript
const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`
```

**Rejected because:** Data URLs have size limitations and don't support the `download` attribute filename hint in all browsers/WebViews.

### 3. Implement Download via Rust Backend

Create a Tauri command that handles the entire export flow in Rust.

**Rejected because:** The Tauri plugin approach is cleaner, uses official APIs, and requires less custom code.

## Consequences

### Positive

- Export works reliably on all platforms
- Native file dialog provides familiar UX
- Users can choose save location (better than forced Downloads folder)
- Multiple fallback layers ensure graceful degradation
- Copy dialog provides last-resort option
- Clear distinction between cancellation and failure prevents confusing UX

### Negative

- Added two new Tauri plugin dependencies
- Slightly larger bundle size
- More complex code path with async/await

### Neutral

- Tests mock Tauri plugins to simulate non-Tauri environment
- Web fallback still available for browser-based development

## Code Review Refinements

After initial implementation, code review identified several improvements:

1. **SaveResult Type**: Changed from `boolean` to discriminated union type (`'success' | 'cancelled' | 'unavailable'`) to distinguish user cancellation from Tauri unavailability.

2. **Listener Cleanup**: Added module-level `exportDialogKeydownHandler` variable to track and properly remove the Escape key listener on all close paths, preventing memory leaks.

3. **Copy Dialog Logic**: Refined to only show the copy fallback dialog when Tauri is unavailable, not when the user cancels the native save dialog.

4. **Revocation Delay**: Increased from 100ms to 1000ms to provide safety margin on slower systems.

## References

- [NSURLErrorDomain Codes](https://developer.apple.com/documentation/foundation/1508628-url_loading_system_error_codes) - Apple documentation
- [Tauri Plugin Dialog](https://v2.tauri.app/plugin/dialog/) - Official Tauri v2 dialog plugin
- [Tauri Plugin FS](https://v2.tauri.app/plugin/file-system/) - Official Tauri v2 filesystem plugin
- [Blob URL Lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL) - MDN documentation
