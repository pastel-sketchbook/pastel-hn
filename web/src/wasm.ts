import type { HNItem, ItemType } from './types'

export interface WasmExports {
  memory: WebAssembly.Memory
  wasm_alloc: (len: number) => number
  wasm_free: (ptr: number, len: number) => void
  wasm_parse_item: (ptr: number, len: number) => number
  wasm_free_item: (ptr: number) => void
  wasm_parse_story_ids: (ptr: number, len: number, outLen: number) => number
  wasm_free_story_ids: (ptr: number, len: number) => void
  wasm_item_get_id: (ptr: number) => number
  wasm_item_get_score: (ptr: number) => number
  wasm_item_get_descendants: (ptr: number) => number
  wasm_item_get_time: (ptr: number) => bigint
  wasm_item_get_type: (ptr: number) => number
  wasm_item_get_title: (ptr: number, outLen: number) => number
  wasm_item_get_url: (ptr: number, outLen: number) => number
  wasm_item_get_by: (ptr: number, outLen: number) => number
  wasm_item_get_text: (ptr: number, outLen: number) => number
  wasm_item_get_kids: (ptr: number, outLen: number) => number
  wasm_build_top_stories_url: (ptr: number, len: number) => number
  wasm_build_new_stories_url: (ptr: number, len: number) => number
  wasm_build_best_stories_url: (ptr: number, len: number) => number
  wasm_build_ask_stories_url: (ptr: number, len: number) => number
  wasm_build_show_stories_url: (ptr: number, len: number) => number
  wasm_build_job_stories_url: (ptr: number, len: number) => number
  wasm_build_item_url: (ptr: number, len: number, id: number) => number
  wasm_build_user_url: (
    ptr: number,
    len: number,
    usernamePtr: number,
    usernameLen: number,
  ) => number
  wasm_fetch_url: (ptr: number, len: number, callbackId: number) => void
}

let wasmInstance: WasmExports | null = null
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const pendingFetches = new Map<
  number,
  { resolve: (data: string) => void; reject: (err: Error) => void }
>()

export async function initWasm(): Promise<WasmExports> {
  if (wasmInstance) return wasmInstance

  const imports: WebAssembly.Imports = {
    env: {
      js_fetch: (urlPtr: number, urlLen: number, callbackId: number) => {
        const url = readString(urlPtr, urlLen)
        fetch(url)
          .then((res) => res.text())
          .then((data) => {
            const pending = pendingFetches.get(callbackId)
            if (pending) {
              pending.resolve(data)
              pendingFetches.delete(callbackId)
            }
          })
          .catch((err) => {
            const pending = pendingFetches.get(callbackId)
            if (pending) {
              pending.reject(err)
              pendingFetches.delete(callbackId)
            }
          })
      },
      js_log: (ptr: number, len: number) => {
        console.log(readString(ptr, len))
      },
    },
  }

  const response = await fetch('/hn.wasm')
  const bytes = await response.arrayBuffer()
  const { instance } = await WebAssembly.instantiate(bytes, imports)

  wasmInstance = instance.exports as unknown as WasmExports
  return wasmInstance
}

export function getWasm(): WasmExports {
  if (!wasmInstance) throw new Error('WASM not initialized')
  return wasmInstance
}

export function writeString(str: string): { ptr: number; len: number } {
  const wasm = getWasm()
  const bytes = encoder.encode(str)
  const ptr = wasm.wasm_alloc(bytes.length)
  if (!ptr) throw new Error('Failed to allocate memory')
  const mem = new Uint8Array(wasm.memory.buffer, ptr, bytes.length)
  mem.set(bytes)
  return { ptr, len: bytes.length }
}

export function readString(ptr: number, len: number): string {
  const wasm = getWasm()
  const mem = new Uint8Array(wasm.memory.buffer, ptr, len)
  return decoder.decode(mem)
}

export function freeString(ptr: number, len: number): void {
  getWasm().wasm_free(ptr, len)
}

export function parseItem(json: string): HNItem | null {
  const wasm = getWasm()
  const { ptr, len } = writeString(json)

  try {
    const itemPtr = wasm.wasm_parse_item(ptr, len)
    if (!itemPtr) return null

    const outLenPtr = wasm.wasm_alloc(8)
    if (!outLenPtr) {
      wasm.wasm_free_item(itemPtr)
      return null
    }

    const outLenView = new DataView(wasm.memory.buffer, outLenPtr, 8)

    const item: HNItem = {
      id: wasm.wasm_item_get_id(itemPtr),
      type: wasm.wasm_item_get_type(itemPtr) as ItemType,
      score: wasm.wasm_item_get_score(itemPtr),
      descendants: wasm.wasm_item_get_descendants(itemPtr),
      time: Number(wasm.wasm_item_get_time(itemPtr)),
      by: null,
      title: null,
      url: null,
      text: null,
      kids: null,
      parent: null,
      dead: false,
      deleted: false,
    }

    const titlePtr = wasm.wasm_item_get_title(itemPtr, outLenPtr)
    if (titlePtr) {
      const titleLen = Number(outLenView.getBigUint64(0, true))
      item.title = readString(titlePtr, titleLen)
    }

    const urlPtr = wasm.wasm_item_get_url(itemPtr, outLenPtr)
    if (urlPtr) {
      const urlLen = Number(outLenView.getBigUint64(0, true))
      item.url = readString(urlPtr, urlLen)
    }

    const byPtr = wasm.wasm_item_get_by(itemPtr, outLenPtr)
    if (byPtr) {
      const byLen = Number(outLenView.getBigUint64(0, true))
      item.by = readString(byPtr, byLen)
    }

    const textPtr = wasm.wasm_item_get_text(itemPtr, outLenPtr)
    if (textPtr) {
      const textLen = Number(outLenView.getBigUint64(0, true))
      item.text = readString(textPtr, textLen)
    }

    const kidsPtr = wasm.wasm_item_get_kids(itemPtr, outLenPtr)
    if (kidsPtr) {
      const kidsLen = Number(outLenView.getBigUint64(0, true))
      const kidsView = new Uint32Array(wasm.memory.buffer, kidsPtr, kidsLen)
      item.kids = Array.from(kidsView)
    }

    wasm.wasm_free(outLenPtr, 8)
    wasm.wasm_free_item(itemPtr)

    return item
  } finally {
    freeString(ptr, len)
  }
}

export function parseStoryIds(json: string): number[] | null {
  const wasm = getWasm()
  const { ptr, len } = writeString(json)

  try {
    const outLenPtr = wasm.wasm_alloc(8)
    if (!outLenPtr) return null

    const idsPtr = wasm.wasm_parse_story_ids(ptr, len, outLenPtr)
    if (!idsPtr) {
      wasm.wasm_free(outLenPtr, 8)
      return null
    }

    const outLenView = new DataView(wasm.memory.buffer, outLenPtr, 8)
    const idsLen = Number(outLenView.getBigUint64(0, true))

    const idsView = new Uint32Array(wasm.memory.buffer, idsPtr, idsLen)
    const ids = Array.from(idsView)

    wasm.wasm_free(outLenPtr, 8)
    wasm.wasm_free_story_ids(idsPtr, idsLen)

    return ids
  } finally {
    freeString(ptr, len)
  }
}
