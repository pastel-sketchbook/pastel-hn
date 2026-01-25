const std = @import("std");

pub const ItemType = enum {
    story,
    comment,
    job,
    poll,
    pollopt,
    unknown,

    pub fn fromString(s: []const u8) ItemType {
        if (std.mem.eql(u8, s, "story")) return .story;
        if (std.mem.eql(u8, s, "comment")) return .comment;
        if (std.mem.eql(u8, s, "job")) return .job;
        if (std.mem.eql(u8, s, "poll")) return .poll;
        if (std.mem.eql(u8, s, "pollopt")) return .pollopt;
        return .unknown;
    }
};

pub const Item = struct {
    id: u32,
    item_type: ItemType = .unknown,
    by: ?[]const u8 = null,
    time: u64 = 0,
    text: ?[]const u8 = null,
    url: ?[]const u8 = null,
    score: u32 = 0,
    title: ?[]const u8 = null,
    descendants: u32 = 0,
    kids: ?[]const u32 = null,
    parent: ?u32 = null,
    dead: bool = false,
    deleted: bool = false,
};

pub const User = struct {
    id: []const u8,
    created: u64 = 0,
    karma: i32 = 0,
    about: ?[]const u8 = null,
    submitted: ?[]const u32 = null,
};

test "ItemType.fromString parses story" {
    try std.testing.expectEqual(ItemType.story, ItemType.fromString("story"));
}

test "ItemType.fromString parses comment" {
    try std.testing.expectEqual(ItemType.comment, ItemType.fromString("comment"));
}

test "ItemType.fromString returns unknown for invalid" {
    try std.testing.expectEqual(ItemType.unknown, ItemType.fromString("invalid"));
}
