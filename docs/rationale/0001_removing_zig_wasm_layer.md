# ADR-0001: Removing Zig/WASM Layer in Favor of Pure TypeScript

## Status

Accepted

## Date

2026-01-24

## Context

The original architecture for wasm-hn (now pastel-hn) included:

- **Zig -> WASM**: Core HN API client (JSON parsing, URL building)
- **TypeScript**: WASM bindings and UI
- **Tauri**: Desktop shell

The Zig/WASM layer was fully implemented with:

| Component | Lines | Purpose |
|-----------|-------|---------|
| `src/main.zig` | 180 | WASM exports (25 functions) |
| `src/json.zig` | 237 | JSON parsing + 8 tests |
| `src/urls.zig` | 95 | URL building + 7 tests |
| `src/types.zig` | 56 | Type definitions + 3 tests |
| `build.zig` | 38 | Build configuration |
| `build.zig.zon` | 12 | Package manifest |
| `web/src/wasm.ts` | 209 | TypeScript WASM bindings |
| **Total** | **827** | |
| `hn.wasm` | 61KB | Compiled binary |

The WASM layer exported functions for:
- Memory management (`wasm_alloc`, `wasm_free`)
- JSON parsing (`wasm_parse_item`, `wasm_parse_story_ids`)
- Item field accessors (`wasm_item_get_*`)
- URL building (`wasm_build_*_url`)

However, a parallel TypeScript implementation (`api.ts`, ~150 lines) was created
that handles all API operations using native browser `fetch()` and `response.json()`.
**The WASM layer was never integrated into the application and remained dormant.**

## Decision Drivers

1. **Practical product focus** - Ship a working HN client efficiently
2. **Development velocity** - Single-language stack is faster to iterate
3. **Maintenance burden** - 827 lines of code providing no current value
4. **Performance reality** - Native JSON parsing is sufficient for HN's payloads

## Analysis

### What the Zig/WASM Layer Provided

1. **JSON parsing** via `std.json` (parseItem, parseStoryIds)
2. **URL building** for all HN API endpoints
3. **Memory management** (wasm_alloc, wasm_free)
4. **Type definitions** (Item, User, ItemType)

### Why It's Not Needed

1. **Payload size**: HN items are ~500 bytes each. Native `response.json()` parses
   these in microseconds.

2. **WASM-JS boundary cost**: String copying between WASM and JS memory negates
   any parsing performance gains. Each item requires:
   - Copy JSON string JS -> WASM
   - Parse in WASM
   - Copy each string field WASM -> JS
   
3. **No compute-heavy operations**: The app doesn't perform search, filtering,
   or ranking that would benefit from WASM's performance.

4. **Complexity cost**: Two languages, two build systems, manual memory management
   for the same functionality that 10 lines of native JS provides.

### Performance Comparison

| Operation | Native JS | Zig/WASM | Notes |
|-----------|-----------|----------|-------|
| Parse 1 item (~500B) | ~0.1ms | ~0.05ms | Negligible difference |
| Parse 30 items | ~3ms | ~1.5ms + copy overhead | WASM boundary negates gains |
| Parse 10,000 items | ~100ms | ~50ms | Would matter, but HN API never returns this many |

The HN API returns at most 500 story IDs per endpoint, and items are fetched
individually. The largest payload is the story ID array (~2KB), which native
JSON handles trivially.

### Code Comparison

**Zig + WASM bindings (827 lines):**
```zig
// Parse item, handle memory, export to JS...
pub export fn wasm_parse_item(json_ptr: [*]const u8, json_len: usize) ?*Item {
    const json = json_ptr[0..json_len];
    return parseItem(allocator, json) catch return null;
}
// + 20 more export functions, memory management, accessors...
```

**Native TypeScript (10 lines):**
```typescript
async function fetchItem(id: number): Promise<HNItem> {
  const response = await fetch(`${BASE_URL}/item/${id}.json`)
  const raw = await response.json()
  return rawToItem(raw)
}
```

## Decision

Remove the Zig/WASM layer entirely. The TypeScript `api.ts` already provides all
required functionality with simpler architecture.

## Consequences

### Positive

- **Single-language codebase** - TypeScript for app logic, minimal Rust for Tauri
- **Faster development** - No WASM compilation step, no memory management
- **Smaller bundle** - Remove 61KB WASM binary
- **Simpler debugging** - Single-language stack traces
- **Reduced maintenance** - 827 fewer lines to maintain
- **Faster builds** - No Zig compilation required

### Negative

- **Loss of learning project aspect** - No longer demonstrates Zig/WASM skills
- **Reintroduction cost** - Would need to rebuild if compute-heavy features added

### Neutral

- **Project rename** - "wasm-hn" renamed to "pastel-hn" to reflect the change

## When to Reconsider

Reintroduce WASM (Zig, Rust, or AssemblyScript) if the project needs:

- Processing 10,000+ items at once (full history search)
- Complex client-side ranking/scoring algorithms
- Offline storage with binary serialization
- CPU-intensive text processing or fuzzy search
- Real-time filtering of large datasets

## Files Removed

```
src/
  main.zig       (180 lines - WASM exports)
  json.zig       (237 lines - JSON parsing)
  urls.zig       (95 lines - URL building)
  types.zig      (56 lines - type definitions)
build.zig        (38 lines - build config)
build.zig.zon    (12 lines - package manifest)
web/src/wasm.ts  (209 lines - TS bindings)
zig-out/         (build artifacts)
.zig-cache/      (build cache)
web/public/hn.wasm (61KB binary)
```

## References

- Original TODO.md Phase 1 specification
- Hacker News API: https://github.com/HackerNews/API
- WASM-JS interop overhead: https://pspdfkit.com/blog/2018/a-real-world-webassembly-benchmark/
