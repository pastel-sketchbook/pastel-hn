const std = @import("std");

pub const BASE_URL = "https://hacker-news.firebaseio.com/v0";

pub const Endpoint = enum {
    top_stories,
    new_stories,
    best_stories,
    ask_stories,
    show_stories,
    job_stories,

    pub fn path(self: Endpoint) []const u8 {
        return switch (self) {
            .top_stories => "/topstories.json",
            .new_stories => "/newstories.json",
            .best_stories => "/beststories.json",
            .ask_stories => "/askstories.json",
            .show_stories => "/showstories.json",
            .job_stories => "/jobstories.json",
        };
    }
};

pub fn buildStoriesUrl(buf: []u8, endpoint: Endpoint) ![]const u8 {
    var fbs = std.io.fixedBufferStream(buf);
    const writer = fbs.writer();
    try writer.writeAll(BASE_URL);
    try writer.writeAll(endpoint.path());
    return fbs.getWritten();
}

pub fn buildItemUrl(buf: []u8, id: u32) ![]const u8 {
    var fbs = std.io.fixedBufferStream(buf);
    const writer = fbs.writer();
    try writer.writeAll(BASE_URL);
    try writer.writeAll("/item/");
    try writer.print("{d}", .{id});
    try writer.writeAll(".json");
    return fbs.getWritten();
}

pub fn buildUserUrl(buf: []u8, username: []const u8) ![]const u8 {
    var fbs = std.io.fixedBufferStream(buf);
    const writer = fbs.writer();
    try writer.writeAll(BASE_URL);
    try writer.writeAll("/user/");
    try writer.writeAll(username);
    try writer.writeAll(".json");
    return fbs.getWritten();
}

test "buildStoriesUrl builds top stories url" {
    var buf: [256]u8 = undefined;
    const url = try buildStoriesUrl(&buf, .top_stories);
    try std.testing.expectEqualStrings("https://hacker-news.firebaseio.com/v0/topstories.json", url);
}

test "buildStoriesUrl builds new stories url" {
    var buf: [256]u8 = undefined;
    const url = try buildStoriesUrl(&buf, .new_stories);
    try std.testing.expectEqualStrings("https://hacker-news.firebaseio.com/v0/newstories.json", url);
}

test "buildStoriesUrl builds ask stories url" {
    var buf: [256]u8 = undefined;
    const url = try buildStoriesUrl(&buf, .ask_stories);
    try std.testing.expectEqualStrings("https://hacker-news.firebaseio.com/v0/askstories.json", url);
}

test "buildItemUrl builds item url" {
    var buf: [256]u8 = undefined;
    const url = try buildItemUrl(&buf, 12345);
    try std.testing.expectEqualStrings("https://hacker-news.firebaseio.com/v0/item/12345.json", url);
}

test "buildItemUrl handles large ids" {
    var buf: [256]u8 = undefined;
    const url = try buildItemUrl(&buf, 42069420);
    try std.testing.expectEqualStrings("https://hacker-news.firebaseio.com/v0/item/42069420.json", url);
}

test "buildUserUrl builds user url" {
    var buf: [256]u8 = undefined;
    const url = try buildUserUrl(&buf, "dang");
    try std.testing.expectEqualStrings("https://hacker-news.firebaseio.com/v0/user/dang.json", url);
}

test "Endpoint.path returns correct paths" {
    try std.testing.expectEqualStrings("/topstories.json", Endpoint.top_stories.path());
    try std.testing.expectEqualStrings("/beststories.json", Endpoint.best_stories.path());
    try std.testing.expectEqualStrings("/showstories.json", Endpoint.show_stories.path());
    try std.testing.expectEqualStrings("/jobstories.json", Endpoint.job_stories.path());
}
