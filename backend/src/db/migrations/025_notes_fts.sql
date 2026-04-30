-- FTS5 virtual table backed by notes.content
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  content,
  content='notes',
  content_rowid='id'
);

-- Sync triggers
CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

-- Backfill from existing notes
INSERT INTO notes_fts(rowid, content) SELECT id, content FROM notes WHERE content IS NOT NULL;
