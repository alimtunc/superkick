-- SUP-199 follow-up — persist multi-line diff review anchors.
--
-- 040 shipped first during local development without range end columns. Keep
-- this additive so dev databases that already applied 040 can still submit
-- review comments after pulling the multi-line selection update.

ALTER TABLE diff_review_threads
    ADD COLUMN old_line_end INTEGER CHECK(old_line_end IS NULL OR old_line_end > 0);

ALTER TABLE diff_review_threads
    ADD COLUMN new_line_end INTEGER CHECK(new_line_end IS NULL OR new_line_end > 0);
