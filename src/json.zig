const std = @import("std");
const types = @import("types.zig");

pub const ParseError = error{
    InvalidJson,
    OutOfMemory,
    UnexpectedToken,
};

pub fn parseItem(allocator: std.mem.Allocator, json_str: []const u8) ParseError!types.Item {
    const parsed = std.json.parseFromSlice(
        std.json.Value,
        allocator,
        json_str,
        .{},
    ) catch return ParseError.InvalidJson;
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) return ParseError.InvalidJson;

    const obj = root.object;

    const id = blk: {
        const id_val = obj.get("id") orelse return ParseError.InvalidJson;
        if (id_val != .integer) return ParseError.InvalidJson;
        break :blk @as(u32, @intCast(id_val.integer));
    };

    var item = types.Item{ .id = id };

    if (obj.get("type")) |type_val| {
        if (type_val == .string) {
            item.item_type = types.ItemType.fromString(type_val.string);
        }
    }

    if (obj.get("by")) |by_val| {
        if (by_val == .string) {
            item.by = allocator.dupe(u8, by_val.string) catch return ParseError.OutOfMemory;
        }
    }

    if (obj.get("time")) |time_val| {
        if (time_val == .integer) {
            item.time = @as(u64, @intCast(time_val.integer));
        }
    }

    if (obj.get("title")) |title_val| {
        if (title_val == .string) {
            item.title = allocator.dupe(u8, title_val.string) catch return ParseError.OutOfMemory;
        }
    }

    if (obj.get("url")) |url_val| {
        if (url_val == .string) {
            item.url = allocator.dupe(u8, url_val.string) catch return ParseError.OutOfMemory;
        }
    }

    if (obj.get("text")) |text_val| {
        if (text_val == .string) {
            item.text = allocator.dupe(u8, text_val.string) catch return ParseError.OutOfMemory;
        }
    }

    if (obj.get("score")) |score_val| {
        if (score_val == .integer) {
            item.score = @as(u32, @intCast(score_val.integer));
        }
    }

    if (obj.get("descendants")) |desc_val| {
        if (desc_val == .integer) {
            item.descendants = @as(u32, @intCast(desc_val.integer));
        }
    }

    if (obj.get("parent")) |parent_val| {
        if (parent_val == .integer) {
            item.parent = @as(u32, @intCast(parent_val.integer));
        }
    }

    if (obj.get("dead")) |dead_val| {
        if (dead_val == .bool) {
            item.dead = dead_val.bool;
        }
    }

    if (obj.get("deleted")) |deleted_val| {
        if (deleted_val == .bool) {
            item.deleted = deleted_val.bool;
        }
    }

    if (obj.get("kids")) |kids_val| {
        if (kids_val == .array) {
            const arr = kids_val.array;
            var kids = allocator.alloc(u32, arr.items.len) catch return ParseError.OutOfMemory;
            for (arr.items, 0..) |kid, i| {
                if (kid == .integer) {
                    kids[i] = @as(u32, @intCast(kid.integer));
                }
            }
            item.kids = kids;
        }
    }

    return item;
}

pub fn parseStoryIds(allocator: std.mem.Allocator, json_str: []const u8) ParseError![]u32 {
    const parsed = std.json.parseFromSlice(
        std.json.Value,
        allocator,
        json_str,
        .{},
    ) catch return ParseError.InvalidJson;
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .array) return ParseError.InvalidJson;

    const arr = root.array;
    var ids = allocator.alloc(u32, arr.items.len) catch return ParseError.OutOfMemory;

    for (arr.items, 0..) |item, i| {
        if (item != .integer) {
            allocator.free(ids);
            return ParseError.InvalidJson;
        }
        ids[i] = @as(u32, @intCast(item.integer));
    }

    return ids;
}

test "parseItem parses story with all fields" {
    const allocator = std.testing.allocator;
    const json =
        \\{"id":123,"type":"story","by":"user1","time":1234567890,"title":"Test Title","url":"https://example.com","score":100,"descendants":50}
    ;

    const item = try parseItem(allocator, json);
    defer {
        if (item.by) |by| allocator.free(by);
        if (item.title) |title| allocator.free(title);
        if (item.url) |url| allocator.free(url);
    }

    try std.testing.expectEqual(@as(u32, 123), item.id);
    try std.testing.expectEqual(types.ItemType.story, item.item_type);
    try std.testing.expectEqualStrings("user1", item.by.?);
    try std.testing.expectEqualStrings("Test Title", item.title.?);
    try std.testing.expectEqualStrings("https://example.com", item.url.?);
    try std.testing.expectEqual(@as(u32, 100), item.score);
    try std.testing.expectEqual(@as(u32, 50), item.descendants);
}

test "parseItem parses comment" {
    const allocator = std.testing.allocator;
    const json =
        \\{"id":456,"type":"comment","by":"commenter","time":1234567890,"text":"Hello world","parent":123}
    ;

    const item = try parseItem(allocator, json);
    defer {
        if (item.by) |by| allocator.free(by);
        if (item.text) |text| allocator.free(text);
    }

    try std.testing.expectEqual(@as(u32, 456), item.id);
    try std.testing.expectEqual(types.ItemType.comment, item.item_type);
    try std.testing.expectEqualStrings("commenter", item.by.?);
    try std.testing.expectEqualStrings("Hello world", item.text.?);
    try std.testing.expectEqual(@as(u32, 123), item.parent.?);
}

test "parseItem handles missing optional fields" {
    const allocator = std.testing.allocator;
    const json =
        \\{"id":789,"type":"story"}
    ;

    const item = try parseItem(allocator, json);

    try std.testing.expectEqual(@as(u32, 789), item.id);
    try std.testing.expect(item.by == null);
    try std.testing.expect(item.title == null);
    try std.testing.expect(item.url == null);
}

test "parseItem fails on invalid json" {
    const allocator = std.testing.allocator;
    const result = parseItem(allocator, "not valid json");
    try std.testing.expectError(ParseError.InvalidJson, result);
}

test "parseItem fails on missing id" {
    const allocator = std.testing.allocator;
    const json =
        \\{"type":"story","title":"No ID"}
    ;
    const result = parseItem(allocator, json);
    try std.testing.expectError(ParseError.InvalidJson, result);
}

test "parseStoryIds parses array of ids" {
    const allocator = std.testing.allocator;
    const json = "[1,2,3,4,5]";

    const ids = try parseStoryIds(allocator, json);
    defer allocator.free(ids);

    try std.testing.expectEqual(@as(usize, 5), ids.len);
    try std.testing.expectEqual(@as(u32, 1), ids[0]);
    try std.testing.expectEqual(@as(u32, 5), ids[4]);
}

test "parseStoryIds handles empty array" {
    const allocator = std.testing.allocator;
    const json = "[]";

    const ids = try parseStoryIds(allocator, json);
    defer allocator.free(ids);

    try std.testing.expectEqual(@as(usize, 0), ids.len);
}

test "parseStoryIds fails on non-array" {
    const allocator = std.testing.allocator;
    const result = parseStoryIds(allocator, "123");
    try std.testing.expectError(ParseError.InvalidJson, result);
}
