//! Repo-import scanner for managed skills.
//!
//! Walks each operator-configured `skills.import_dirs` entry as a *repo root*
//! and yields candidates the API layer persists as `SkillOrigin::Imported`
//! skills. Two shapes are recognised anywhere within the bounded walk:
//!
//! - `<dir>/SKILL.md` → a `Skill` artifact (frontmatter `name` falls back to the
//!   parent directory stem; `description` + body taken from the file).
//! - `commands/*.md` or `.claude/commands/*.md` → a `Command` artifact (`name`
//!   falls back to the file stem).
//!
//! The walk recurses to a bounded depth ([`MAX_WALK_DEPTH`]) so pointing an
//! import dir at a repo root, at `.claude`, or directly at `.claude/skills`
//! discovers the same skills regardless of nesting. Bodies are capped,
//! credential-shaped files are skipped, and dangling symlinks (a `fs::metadata`
//! error) are ignored rather than fatal.
//!
//! Symlinks are classified with `fs::symlink_metadata` (never followed for
//! classification) and any symlink whose canonical target escapes the
//! import-dir root is dropped — a link to `/home/user` must not exfiltrate
//! arbitrary repo content into the importable listing.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use superkick_core::SkillArtifact;

/// Upper bound on an imported body. Heavy real-world skills (a ~200-line ticket
/// playbook) fit comfortably; anything past this is almost certainly a stray
/// large file, not a skill.
const MAX_BODY_BYTES: usize = 64 * 1024;

/// How deep the walk recurses below an import-dir root before giving up.
/// Covers the deepest realistic layout (`root/.claude/skills/<name>/`) with
/// headroom while bounding work on a pathological tree.
const MAX_WALK_DEPTH: usize = 6;

/// Directory names never descended into when an import dir is a repo root. These
/// hold no skills and a recursive walk through `node_modules` / `.git` / build
/// output is pathologically slow and noisy.
const PRUNED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".venv",
    "venv",
    ".next",
    ".turbo",
    "vendor",
    ".cache",
];

/// True when a child directory must not be descended into: an explicitly pruned
/// name, or any dot-directory other than `.claude` (where skills/commands live).
fn is_pruned_dir(name: &str) -> bool {
    PRUNED_DIRS.contains(&name) || (name.starts_with('.') && name != ".claude")
}

/// One importable skill discovered on disk. `id`/`label` derive from the
/// frontmatter `name` (or the path stem); the API layer maps this straight onto
/// a `SkillDefinition` with `origin = Imported`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillImportCandidate {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub artifact_kind: SkillArtifact,
    pub body: String,
    pub source_path: PathBuf,
}

/// Scan every configured import dir and return the candidates found. Each entry
/// is treated as a repo root: a bounded-depth walk discovers `<dir>/SKILL.md`
/// skills and `commands/*.md` / `.claude/commands/*.md` commands at any nesting
/// level, so pointing at a repo root, at `.claude`, or at `.claude/skills` all
/// work. Missing or unreadable dirs are skipped (not an error) so a stale config
/// entry can't break the importable listing. Results are de-duplicated by `id`
/// (first writer wins) and sorted for a stable UI order.
pub fn scan_import_dirs(dirs: &[PathBuf]) -> Vec<SkillImportCandidate> {
    let mut out: Vec<SkillImportCandidate> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for dir in dirs {
        // Config paths are user-authored, so a leading `~` is expected; std
        // never expands it and would canonicalize a literal `~` dir to nothing.
        let expanded = expand_home(dir);
        // The import-dir root is the confinement boundary: every path we read or
        // recurse into must canonicalize to within it. A non-canonicalizable
        // root (missing dir) yields no candidates.
        let Ok(root) = fs::canonicalize(&expanded) else {
            continue;
        };
        walk_dir(&expanded, &root, 0, &mut out, &mut seen);
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

/// Expand a leading `~` / `~/…` to `$HOME`. Other path shapes pass through
/// unchanged; a missing `$HOME` leaves the `~` literal (then fails to resolve).
fn expand_home(dir: &Path) -> PathBuf {
    let Some(s) = dir.to_str() else {
        return dir.to_path_buf();
    };
    let rest = if s == "~" {
        Some("")
    } else {
        s.strip_prefix("~/")
    };
    match (rest, std::env::var_os("HOME")) {
        (Some(rest), Some(home)) => {
            let mut p = PathBuf::from(home);
            if !rest.is_empty() {
                p.push(rest);
            }
            p
        }
        _ => dir.to_path_buf(),
    }
}

/// True iff `path` canonicalizes to a location inside `root`. A symlink
/// pointing outside the import dir (or any IO error resolving it) fails closed.
fn within_root(path: &Path, root: &Path) -> bool {
    fs::canonicalize(path)
        .map(|real| real.starts_with(root))
        .unwrap_or(false)
}

/// Push a candidate iff its `id` has not been claimed yet (first writer wins).
fn push_unique(
    out: &mut Vec<SkillImportCandidate>,
    seen: &mut HashSet<String>,
    c: SkillImportCandidate,
) {
    if seen.insert(c.id.clone()) {
        out.push(c);
    }
}

/// Recursively walk `dir`, collecting skill and command candidates. At every
/// directory we harvest a sibling `SKILL.md` (the dir is a skill) and any
/// markdown directly inside a `commands/` dir, then descend into subdirectories
/// up to [`MAX_WALK_DEPTH`]. Entries are visited in a stable (sorted) order so
/// "first writer wins" dedup is deterministic.
fn walk_dir(
    dir: &Path,
    root: &Path,
    depth: usize,
    out: &mut Vec<SkillImportCandidate>,
    seen: &mut HashSet<String>,
) {
    harvest_skill_md(dir, root, out, seen);
    // `commands/` (Claude) and `prompts/` (Codex) both hold loose *.md commands.
    if matches!(
        dir.file_name().and_then(|n| n.to_str()),
        Some("commands" | "prompts")
    ) {
        harvest_commands(dir, root, out, seen);
    }
    if depth >= MAX_WALK_DEPTH {
        return;
    }
    for path in sorted_child_dirs(dir, root) {
        walk_dir(&path, root, depth + 1, out, seen);
    }
}

/// A directory is a skill iff it holds a `SKILL.md` (regular file or in-tree
/// symlink). An escaping-symlink `SKILL.md` is dropped.
fn harvest_skill_md(
    dir: &Path,
    root: &Path,
    out: &mut Vec<SkillImportCandidate>,
    seen: &mut HashSet<String>,
) {
    let skill_md = dir.join("SKILL.md");
    let is_escaping_link = fs::symlink_metadata(&skill_md)
        .map(|m| m.file_type().is_symlink() && !within_root(&skill_md, root))
        .unwrap_or(false);
    if is_escaping_link {
        return;
    }
    if fs::metadata(&skill_md)
        .map(|m| m.is_file())
        .unwrap_or(false)
    {
        if let Some(c) = candidate_from_skill_file(&skill_md, dir) {
            push_unique(out, seen, c);
        }
    }
}

/// Expand a `commands/` (or `.claude/commands/`) dir into one command candidate
/// per markdown file directly inside it.
fn harvest_commands(
    dir: &Path,
    root: &Path,
    out: &mut Vec<SkillImportCandidate>,
    seen: &mut HashSet<String>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut paths: Vec<PathBuf> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() && !within_root(&path, root) {
            continue;
        }
        if path.is_file() && is_markdown(&path) {
            paths.push(path);
        }
    }
    paths.sort();
    for path in paths {
        if let Some(c) = candidate_from_command_file(&path) {
            push_unique(out, seen, c);
        }
    }
}

/// Immediate subdirectories of `dir` that are safe to descend into: real dirs
/// or in-tree symlinked dirs (an escaping symlink is dropped before recursion).
/// Sorted for a deterministic walk order.
fn sorted_child_dirs(dir: &Path, root: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs: Vec<PathBuf> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(is_pruned_dir)
        {
            continue;
        }
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() && !within_root(&path, root) {
            continue;
        }
        if path.is_dir() {
            dirs.push(path);
        }
    }
    dirs.sort();
    dirs
}

fn candidate_from_skill_file(path: &Path, skill_dir: &Path) -> Option<SkillImportCandidate> {
    let raw = read_capped(path)?;
    let parsed = parse_frontmatter(&raw);
    if has_credential_shape(&parsed) {
        return None;
    }
    let fallback = path_stem(skill_dir);
    let name = parsed.name.unwrap_or(fallback);
    let id = slugify(&name)?;
    Some(SkillImportCandidate {
        label: name,
        id,
        description: parsed.description,
        artifact_kind: SkillArtifact::Skill,
        body: parsed.body,
        source_path: path.to_path_buf(),
    })
}

fn candidate_from_command_file(path: &Path) -> Option<SkillImportCandidate> {
    let raw = read_capped(path)?;
    let parsed = parse_frontmatter(&raw);
    if has_credential_shape(&parsed) {
        return None;
    }
    let fallback = path_stem(path);
    let name = parsed.name.unwrap_or(fallback);
    let id = slugify(&name)?;
    Some(SkillImportCandidate {
        label: name,
        id,
        description: parsed.description,
        artifact_kind: SkillArtifact::Command,
        body: parsed.body,
        source_path: path.to_path_buf(),
    })
}

/// True if any persisted field (frontmatter `name` / `description` or the body)
/// matches a credential shape. Scanning the frontmatter too closes the gap where
/// a secret in `description:` would otherwise be stored verbatim.
fn has_credential_shape(parsed: &ParsedDoc) -> bool {
    let fields = [
        parsed.name.as_deref(),
        parsed.description.as_deref(),
        Some(parsed.body.as_str()),
    ];
    fields
        .into_iter()
        .flatten()
        .any(|field| superkick_core::redaction::scan(field).is_some())
}

/// Read a file, returning `None` on any IO error (dangling symlink, race) or if
/// it exceeds [`MAX_BODY_BYTES`].
fn read_capped(path: &Path) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    if meta.len() as usize > MAX_BODY_BYTES {
        return None;
    }
    fs::read_to_string(path).ok()
}

fn is_markdown(path: &Path) -> bool {
    path.extension().and_then(|e| e.to_str()) == Some("md")
}

fn path_stem(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string()
}

struct ParsedDoc {
    name: Option<String>,
    description: Option<String>,
    body: String,
}

/// Split a markdown file on a leading `---` frontmatter fence and pull the
/// scalar `name` / `description` keys. We deliberately avoid a full YAML
/// dependency: skill frontmatter is flat `key: value` and a tolerant line
/// parser is both lighter and impossible to break on body content that happens
/// to contain YAML-like text. A file without a leading fence is all body.
fn parse_frontmatter(raw: &str) -> ParsedDoc {
    let trimmed = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let Some(rest) = trimmed.strip_prefix("---") else {
        return ParsedDoc {
            name: None,
            description: None,
            body: raw.trim().to_string(),
        };
    };
    // The opening fence must be its own line: `---\n...`. Anything else (e.g. a
    // markdown horizontal rule `--- text`) is treated as body.
    let rest = match rest.strip_prefix('\n') {
        Some(r) => r,
        None => {
            return ParsedDoc {
                name: None,
                description: None,
                body: raw.trim().to_string(),
            };
        }
    };
    let Some((front, body)) = split_closing_fence(rest) else {
        return ParsedDoc {
            name: None,
            description: None,
            body: raw.trim().to_string(),
        };
    };
    let mut name = None;
    let mut description = None;
    for line in front.lines() {
        if let Some((key, value)) = line.split_once(':') {
            let value = unquote(value.trim());
            match key.trim() {
                "name" if !value.is_empty() => name = Some(value),
                "description" if !value.is_empty() => description = Some(value),
                _ => {}
            }
        }
    }
    ParsedDoc {
        name,
        description,
        body: body.trim().to_string(),
    }
}

/// Find the closing `---` fence line, returning `(frontmatter, body)`.
fn split_closing_fence(rest: &str) -> Option<(&str, &str)> {
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        let stripped = line.strip_suffix('\n').unwrap_or(line);
        if stripped.trim_end() == "---" {
            let front = &rest[..offset];
            let body = &rest[offset + line.len()..];
            return Some((front, body));
        }
        offset += line.len();
    }
    None
}

fn unquote(value: &str) -> String {
    let bytes = value.as_bytes();
    if bytes.len() >= 2
        && ((bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\''))
    {
        return value[1..value.len() - 1].to_string();
    }
    value.to_string()
}

/// Lowercase, replace runs of non-alphanumeric with `-`, trim leading/trailing
/// `-`. Returns `None` if nothing survives (so an all-symbol name is skipped
/// rather than imported under an empty id).
fn slugify(name: &str) -> Option<String> {
    let mut slug = String::with_capacity(name.len());
    let mut prev_dash = false;
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            slug.push('-');
            prev_dash = true;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() { None } else { Some(slug) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn parses_skill_dir_with_frontmatter_name_and_description() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(
            &root.join("ticket/SKILL.md"),
            "---\nname: Ticket\ndescription: Run a ticket A→Z\n---\n# Ticket\n\nbody here",
        );
        let found = scan_import_dirs(&[root.to_path_buf()]);
        assert_eq!(found.len(), 1);
        let c = &found[0];
        assert_eq!(c.id, "ticket");
        assert_eq!(c.label, "Ticket");
        assert_eq!(c.description.as_deref(), Some("Run a ticket A→Z"));
        assert_eq!(c.artifact_kind, SkillArtifact::Skill);
        assert_eq!(c.body, "# Ticket\n\nbody here");
    }

    #[test]
    fn skill_name_falls_back_to_dir_stem() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(
            &root.join("deep-research/SKILL.md"),
            "# no frontmatter\n\nbody",
        );
        let found = scan_import_dirs(&[root.to_path_buf()]);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "deep-research");
        assert_eq!(found[0].label, "deep-research");
        assert_eq!(found[0].description, None);
        assert_eq!(found[0].body, "# no frontmatter\n\nbody");
    }

    #[test]
    fn parses_command_files_in_commands_dir() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(
            &root.join("commands/ship.md"),
            "---\ndescription: Ship it\n---\nThe ship command body",
        );
        let found = scan_import_dirs(&[root.to_path_buf()]);
        assert_eq!(found.len(), 1);
        let c = &found[0];
        assert_eq!(c.id, "ship");
        assert_eq!(c.label, "ship");
        assert_eq!(c.artifact_kind, SkillArtifact::Command);
        assert_eq!(c.description.as_deref(), Some("Ship it"));
        assert_eq!(c.body, "The ship command body");
    }

    #[test]
    fn loose_top_level_markdown_is_not_a_command() {
        // A repo root is full of top-level markdown (README, CHANGELOG); only
        // files under a `commands/` dir count as commands.
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(&root.join("README.md"), "---\nname: \"Read Me\"\n---\nbody");
        let found = scan_import_dirs(&[root.to_path_buf()]);
        assert!(
            found.is_empty(),
            "loose top-level markdown must not be imported as a command"
        );
    }

    #[test]
    fn discovers_nested_skills_and_commands_from_a_repo_root() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(
            &root.join(".claude/skills/deep-research/SKILL.md"),
            "---\nname: Deep Research\ndescription: Research deeply\n---\n# DR\n\nbody",
        );
        write(
            &root.join(".claude/commands/handoff.md"),
            "---\nname: \"Hand Off\"\n---\nthe handoff body",
        );

        // Pointing at the repo root discovers both, regardless of nesting.
        let from_root = scan_import_dirs(&[root.to_path_buf()]);
        assert_eq!(from_root.len(), 2, "{from_root:?}");
        let skill = from_root.iter().find(|c| c.id == "deep-research").unwrap();
        assert_eq!(skill.artifact_kind, SkillArtifact::Skill);
        assert_eq!(skill.label, "Deep Research");
        let command = from_root.iter().find(|c| c.id == "hand-off").unwrap();
        assert_eq!(command.artifact_kind, SkillArtifact::Command);
        assert_eq!(command.label, "Hand Off");

        // Pointing at `.claude` or directly at `.claude/skills` finds the same
        // skill — the scanner is agnostic to where the root is anchored.
        let from_claude = scan_import_dirs(&[root.join(".claude")]);
        assert_eq!(from_claude.len(), 2);
        let from_skills = scan_import_dirs(&[root.join(".claude/skills")]);
        assert_eq!(from_skills.len(), 1);
        assert_eq!(from_skills[0].id, "deep-research");
    }

    #[test]
    fn expands_a_leading_tilde_to_home() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path();
        write(
            &home.join("notes/.claude/skills/jot/SKILL.md"),
            "---\nname: Jot\n---\nbody",
        );
        // SAFETY: single-threaded test; HOME is restored implicitly per process.
        unsafe { std::env::set_var("HOME", home) };
        let found = scan_import_dirs(&[PathBuf::from("~/notes/.claude/skills")]);
        assert_eq!(found.len(), 1, "{found:?}");
        assert_eq!(found[0].id, "jot");
    }

    #[test]
    fn prunes_vcs_and_dependency_dirs_from_the_walk() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        // Junk that lives under pruned dirs must never be descended into, even
        // when it is shaped exactly like a skill.
        write(&root.join(".git/junk/SKILL.md"), "# junk\nbody");
        write(&root.join("node_modules/pkg/SKILL.md"), "# dep\nbody");
        write(&root.join("target/debug/SKILL.md"), "# build\nbody");
        write(&root.join(".cache/x/SKILL.md"), "# cache\nbody");
        // A real skill under .claude is still found.
        write(
            &root.join(".claude/skills/real/SKILL.md"),
            "---\nname: Real\n---\nbody",
        );

        let found = scan_import_dirs(&[root.to_path_buf()]);
        assert_eq!(found.len(), 1, "{found:?}");
        assert_eq!(found[0].id, "real");
    }

    #[test]
    fn skips_files_with_credential_shaped_body() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(
            &root.join("leaky/SKILL.md"),
            "---\nname: Leaky\n---\nتوken ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        );
        let found = scan_import_dirs(&[root.to_path_buf()]);
        assert!(found.is_empty(), "credential-shaped body must be skipped");
    }

    #[test]
    fn caps_oversized_body() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let huge = "x".repeat(MAX_BODY_BYTES + 1);
        write(
            &root.join("huge/SKILL.md"),
            &format!("---\nname: Huge\n---\n{huge}"),
        );
        let found = scan_import_dirs(&[root.to_path_buf()]);
        assert!(found.is_empty(), "oversized file must be skipped");
    }

    #[test]
    fn ignores_dangling_symlink() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(&root.join("real/SKILL.md"), "# real\nbody");
        #[cfg(unix)]
        std::os::unix::fs::symlink(root.join("missing"), root.join("dangling")).unwrap();
        let found = scan_import_dirs(&[root.to_path_buf()]);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "real");
    }

    #[test]
    #[cfg(unix)]
    fn escaping_symlink_dir_is_skipped() {
        let outside = TempDir::new().unwrap();
        write(&outside.path().join("secret/SKILL.md"), "# stolen\nbody");

        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(&root.join("real/SKILL.md"), "# real\nbody");
        std::os::unix::fs::symlink(outside.path().join("secret"), root.join("escape")).unwrap();

        let found = scan_import_dirs(&[root.to_path_buf()]);
        assert_eq!(found.len(), 1, "only the in-tree skill should import");
        assert_eq!(found[0].id, "real");
    }

    #[test]
    #[cfg(unix)]
    fn escaping_symlink_skill_md_is_skipped() {
        let outside = TempDir::new().unwrap();
        let leaked = outside.path().join("leaked.md");
        write(&leaked, "# stolen\nbody");

        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let skill_dir = root.join("victim");
        fs::create_dir_all(&skill_dir).unwrap();
        std::os::unix::fs::symlink(&leaked, skill_dir.join("SKILL.md")).unwrap();

        let found = scan_import_dirs(&[root.to_path_buf()]);
        assert!(
            found.is_empty(),
            "a SKILL.md symlink escaping the import dir must be skipped"
        );
    }

    #[test]
    fn skips_secret_in_frontmatter_description() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        write(
            &root.join("leaky/SKILL.md"),
            "---\nname: Leaky\ndescription: token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\n---\nclean body",
        );
        let found = scan_import_dirs(&[root.to_path_buf()]);
        assert!(
            found.is_empty(),
            "a credential in the frontmatter description must be skipped"
        );
    }

    #[test]
    fn missing_dir_yields_nothing() {
        let found = scan_import_dirs(&[PathBuf::from("/no/such/superkick/import/dir")]);
        assert!(found.is_empty());
    }

    #[test]
    fn dedups_by_id_across_dirs() {
        let tmp = TempDir::new().unwrap();
        let a = tmp.path().join("a");
        let b = tmp.path().join("b");
        write(&a.join("ticket/SKILL.md"), "---\nname: Ticket\n---\nfrom a");
        write(&b.join("ticket/SKILL.md"), "---\nname: Ticket\n---\nfrom b");
        let found = scan_import_dirs(&[a, b]);
        assert_eq!(found.len(), 1);
    }

    #[test]
    fn body_without_frontmatter_is_whole_file() {
        let parsed = parse_frontmatter("just a body\nsecond line");
        assert_eq!(parsed.name, None);
        assert_eq!(parsed.description, None);
        assert_eq!(parsed.body, "just a body\nsecond line");
    }

    #[test]
    fn horizontal_rule_is_not_frontmatter() {
        let parsed = parse_frontmatter("--- not a fence\nbody");
        assert_eq!(parsed.name, None);
        assert_eq!(parsed.body, "--- not a fence\nbody");
    }

    #[test]
    fn slugify_drops_all_symbol_names() {
        assert_eq!(slugify("!!!"), None);
        assert_eq!(slugify("Hello World"), Some("hello-world".to_string()));
        assert_eq!(slugify("  spaced  "), Some("spaced".to_string()));
    }
}
