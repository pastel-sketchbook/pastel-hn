const std = @import("std");
const builtin = @import("builtin");
pub const types = @import("types.zig");
pub const json = @import("json.zig");
pub const urls = @import("urls.zig");

var gpa = std.heap.GeneralPurposeAllocator(.{}){};
const allocator = gpa.allocator();

const is_wasm = builtin.cpu.arch == .wasm32;

extern fn js_fetch(url_ptr: [*]const u8, url_len: usize, callback_id: u32) void;
extern fn js_log(ptr: [*]const u8, len: usize) void;

fn log(msg: []const u8) void {
    if (is_wasm) {
        js_log(msg.ptr, msg.len);
    } else {
        std.debug.print("{s}\n", .{msg});
    }
}

export fn wasm_alloc(len: usize) ?[*]u8 {
    const slice = allocator.alloc(u8, len) catch return null;
    return slice.ptr;
}

export fn wasm_free(ptr: [*]u8, len: usize) void {
    allocator.free(ptr[0..len]);
}

export fn wasm_parse_item(json_ptr: [*]const u8, json_len: usize) ?*types.Item {
    const json_str = json_ptr[0..json_len];
    const item = json.parseItem(allocator, json_str) catch return null;
    const item_ptr = allocator.create(types.Item) catch return null;
    item_ptr.* = item;
    return item_ptr;
}

export fn wasm_free_item(item_ptr: *types.Item) void {
    if (item_ptr.by) |by| allocator.free(by);
    if (item_ptr.title) |title| allocator.free(title);
    if (item_ptr.url) |url| allocator.free(url);
    if (item_ptr.text) |text| allocator.free(text);
    if (item_ptr.kids) |kids| allocator.free(kids);
    allocator.destroy(item_ptr);
}

export fn wasm_parse_story_ids(json_ptr: [*]const u8, json_len: usize, out_len: *usize) ?[*]u32 {
    const json_str = json_ptr[0..json_len];
    const ids = json.parseStoryIds(allocator, json_str) catch return null;
    out_len.* = ids.len;
    return ids.ptr;
}

export fn wasm_free_story_ids(ptr: [*]u32, len: usize) void {
    allocator.free(ptr[0..len]);
}

export fn wasm_item_get_id(item: *const types.Item) u32 {
    return item.id;
}

export fn wasm_item_get_score(item: *const types.Item) u32 {
    return item.score;
}

export fn wasm_item_get_descendants(item: *const types.Item) u32 {
    return item.descendants;
}

export fn wasm_item_get_time(item: *const types.Item) u64 {
    return item.time;
}

export fn wasm_item_get_type(item: *const types.Item) u8 {
    return @intFromEnum(item.item_type);
}

export fn wasm_item_get_title(item: *const types.Item, out_len: *usize) ?[*]const u8 {
    if (item.title) |title| {
        out_len.* = title.len;
        return title.ptr;
    }
    return null;
}

export fn wasm_item_get_url(item: *const types.Item, out_len: *usize) ?[*]const u8 {
    if (item.url) |url| {
        out_len.* = url.len;
        return url.ptr;
    }
    return null;
}

export fn wasm_item_get_by(item: *const types.Item, out_len: *usize) ?[*]const u8 {
    if (item.by) |by| {
        out_len.* = by.len;
        return by.ptr;
    }
    return null;
}

export fn wasm_item_get_text(item: *const types.Item, out_len: *usize) ?[*]const u8 {
    if (item.text) |text| {
        out_len.* = text.len;
        return text.ptr;
    }
    return null;
}

export fn wasm_item_get_kids(item: *const types.Item, out_len: *usize) ?[*]const u32 {
    if (item.kids) |kids| {
        out_len.* = kids.len;
        return kids.ptr;
    }
    return null;
}

export fn wasm_build_top_stories_url(buf_ptr: [*]u8, buf_len: usize) usize {
    const buf = buf_ptr[0..buf_len];
    const url = urls.buildStoriesUrl(buf, .top_stories) catch return 0;
    return url.len;
}

export fn wasm_build_new_stories_url(buf_ptr: [*]u8, buf_len: usize) usize {
    const buf = buf_ptr[0..buf_len];
    const url = urls.buildStoriesUrl(buf, .new_stories) catch return 0;
    return url.len;
}

export fn wasm_build_best_stories_url(buf_ptr: [*]u8, buf_len: usize) usize {
    const buf = buf_ptr[0..buf_len];
    const url = urls.buildStoriesUrl(buf, .best_stories) catch return 0;
    return url.len;
}

export fn wasm_build_ask_stories_url(buf_ptr: [*]u8, buf_len: usize) usize {
    const buf = buf_ptr[0..buf_len];
    const url = urls.buildStoriesUrl(buf, .ask_stories) catch return 0;
    return url.len;
}

export fn wasm_build_show_stories_url(buf_ptr: [*]u8, buf_len: usize) usize {
    const buf = buf_ptr[0..buf_len];
    const url = urls.buildStoriesUrl(buf, .show_stories) catch return 0;
    return url.len;
}

export fn wasm_build_job_stories_url(buf_ptr: [*]u8, buf_len: usize) usize {
    const buf = buf_ptr[0..buf_len];
    const url = urls.buildStoriesUrl(buf, .job_stories) catch return 0;
    return url.len;
}

export fn wasm_build_item_url(buf_ptr: [*]u8, buf_len: usize, id: u32) usize {
    const buf = buf_ptr[0..buf_len];
    const url = urls.buildItemUrl(buf, id) catch return 0;
    return url.len;
}

export fn wasm_build_user_url(buf_ptr: [*]u8, buf_len: usize, username_ptr: [*]const u8, username_len: usize) usize {
    const buf = buf_ptr[0..buf_len];
    const username = username_ptr[0..username_len];
    const url = urls.buildUserUrl(buf, username) catch return 0;
    return url.len;
}

export fn wasm_fetch_url(url_ptr: [*]const u8, url_len: usize, callback_id: u32) void {
    if (is_wasm) {
        js_fetch(url_ptr, url_len, callback_id);
    }
}

test {
    _ = types;
    _ = json;
    _ = urls;
}
