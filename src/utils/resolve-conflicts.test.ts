import { describe, test, expect } from "vitest"
import { resolveConflicts, getUpdatedAt } from "./resolve-conflicts"

function md(updatedAt?: string, body = "Hello") {
  if (!updatedAt) return body
  return `---\nupdated_at: ${updatedAt}\n---\n\n${body}`
}

describe("getUpdatedAt", () => {
  test("parses ISO date string", () => {
    expect(getUpdatedAt(md("2024-03-11T14:30:00.000Z"))).toBe(
      Date.parse("2024-03-11T14:30:00.000Z"),
    )
  })

  test("returns null for no frontmatter", () => {
    expect(getUpdatedAt("Just some text")).toBe(null)
  })

  test("returns null for frontmatter without updated_at", () => {
    expect(getUpdatedAt("---\ntitle: Test\n---\n\nBody")).toBe(null)
  })
})

describe("resolveConflicts", () => {
  const ts1 = Date.parse("2024-01-01T00:00:00Z")
  const ts2 = Date.parse("2024-06-01T00:00:00Z")

  test("no changes when files are identical", () => {
    const local = { "a.md": md("2024-03-01T00:00:00Z") }
    const remote = { "a.md": md("2024-03-01T00:00:00Z") }
    const { resolved, deletedFromRemote } = resolveConflicts(local, remote, ts1, ts2)
    expect(resolved).toEqual({})
    expect(deletedFromRemote).toEqual([])
  })

  test("picks version with later updated_at when both have timestamps", () => {
    const local = { "a.md": md("2024-06-01T00:00:00Z", "local") }
    const remote = { "a.md": md("2024-03-01T00:00:00Z", "remote") }
    const { resolved } = resolveConflicts(local, remote, ts1, ts1)
    expect(resolved["a.md"]).toBe(local["a.md"])
  })

  test("picks remote when remote has later updated_at", () => {
    const local = { "a.md": md("2024-03-01T00:00:00Z", "local") }
    const remote = { "a.md": md("2024-06-01T00:00:00Z", "remote") }
    const { resolved } = resolveConflicts(local, remote, ts1, ts1)
    expect(resolved["a.md"]).toBeUndefined()
  })

  test("picks local when only local has updated_at", () => {
    const local = { "a.md": md("2024-06-01T00:00:00Z", "local") }
    const remote = { "a.md": "remote content" }
    const { resolved } = resolveConflicts(local, remote, ts1, ts1)
    expect(resolved["a.md"]).toBe(local["a.md"])
  })

  test("picks remote when only remote has updated_at", () => {
    const local = { "a.md": "local content" }
    const remote = { "a.md": md("2024-06-01T00:00:00Z", "remote") }
    const { resolved } = resolveConflicts(local, remote, ts1, ts1)
    expect(resolved["a.md"]).toBeUndefined()
  })

  test("uses commit timestamp fallback when neither has updated_at", () => {
    const local = { "a.md": "local content" }
    const remote = { "a.md": "remote content" }
    // local commit is newer
    const { resolved } = resolveConflicts(local, remote, ts2, ts1)
    expect(resolved["a.md"]).toBe("local content")
  })

  test("uses commit timestamp fallback — remote wins", () => {
    const local = { "a.md": "local content" }
    const remote = { "a.md": "remote content" }
    // remote commit is newer
    const { resolved } = resolveConflicts(local, remote, ts1, ts2)
    expect(resolved["a.md"]).toBeUndefined()
  })

  test("includes files only in local (new local additions)", () => {
    const local = { "new.md": "new file" }
    const remote = {}
    const { resolved } = resolveConflicts(local, remote, ts1, ts1)
    expect(resolved["new.md"]).toBe("new file")
  })

  test("files only in remote need no action", () => {
    const local = {}
    const remote = { "remote-only.md": "remote file" }
    // remote commit is newer, so keep the remote file
    const { resolved, deletedFromRemote } = resolveConflicts(local, remote, ts1, ts2)
    expect(resolved).toEqual({})
    expect(deletedFromRemote).toEqual([])
  })

  test("local deletion wins when local commit is newer", () => {
    const local = {}
    const remote = { "deleted.md": "should be deleted" }
    const { deletedFromRemote } = resolveConflicts(local, remote, ts2, ts1)
    expect(deletedFromRemote).toEqual(["deleted.md"])
  })

  test("local deletion loses when remote commit is newer", () => {
    const local = {}
    const remote = { "kept.md": "should be kept" }
    const { deletedFromRemote } = resolveConflicts(local, remote, ts1, ts2)
    expect(deletedFromRemote).toEqual([])
  })

  test("handles non-markdown files with commit timestamp fallback", () => {
    const local = { "config.json": '{"a":1}' }
    const remote = { "config.json": '{"b":2}' }
    const { resolved } = resolveConflicts(local, remote, ts2, ts1)
    expect(resolved["config.json"]).toBe('{"a":1}')
  })

  test("handles multiple files with mixed outcomes", () => {
    const local = {
      "a.md": md("2024-06-01T00:00:00Z", "local-a"),
      "b.md": md("2024-01-01T00:00:00Z", "local-b"),
      "c.md": "same content",
      "new-local.md": "brand new",
    }
    const remote = {
      "a.md": md("2024-03-01T00:00:00Z", "remote-a"),
      "b.md": md("2024-09-01T00:00:00Z", "remote-b"),
      "c.md": "same content",
      "new-remote.md": "also new",
    }
    const { resolved, deletedFromRemote } = resolveConflicts(local, remote, ts1, ts1)
    // a.md: local wins (later updated_at)
    expect(resolved["a.md"]).toBe(local["a.md"])
    // b.md: remote wins (later updated_at) — not in resolved
    expect(resolved["b.md"]).toBeUndefined()
    // c.md: identical — not in resolved
    expect(resolved["c.md"]).toBeUndefined()
    // new-local.md: local-only addition
    expect(resolved["new-local.md"]).toBe("brand new")
    // new-remote.md: remote-only — no action
    expect(resolved["new-remote.md"]).toBeUndefined()
    expect(deletedFromRemote).toEqual([])
  })

  test("equal updated_at picks local", () => {
    const local = { "a.md": md("2024-06-01T00:00:00Z", "local") }
    const remote = { "a.md": md("2024-06-01T00:00:00Z", "remote") }
    const { resolved } = resolveConflicts(local, remote, ts1, ts1)
    expect(resolved["a.md"]).toBe(local["a.md"])
  })
})
