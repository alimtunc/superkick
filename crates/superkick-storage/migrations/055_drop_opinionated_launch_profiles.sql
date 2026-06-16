-- Strip the opinionated builtin launch profiles. The product now ships only the
-- empty `custom` container; launches are built by picking configured agents in
-- order, not by choosing a Plan/Implement/Review-style profile.
--
-- Only the read-only builtin rows are removed (an operator-authored profile that
-- happens to share one of these ids is left alone). Steps are dropped first so
-- the deletion is correct regardless of the FK pragma. Existing launch tasks are
-- unaffected: they replay from their frozen `profile_snapshot`, not these rows.
DELETE FROM launch_profile_steps
WHERE profile_id IN (
    SELECT id FROM launch_profiles
    WHERE is_readonly = 1
      AND id IN (
          'standard', 'fast_fix', 'plan_only', 'implement_only',
          'review_only', 'claude_workflow', 'claude_background', 'full_session'
      )
);

DELETE FROM launch_profiles
WHERE is_readonly = 1
  AND id IN (
      'standard', 'fast_fix', 'plan_only', 'implement_only',
      'review_only', 'claude_workflow', 'claude_background', 'full_session'
  );
