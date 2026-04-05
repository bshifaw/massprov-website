# Apps Script

This folder stores source files for the MassProv Google Apps Script automation.

Suggested use:
- Keep `.gs` source files here while designing the newsletter workflow.
- Copy the code into the Google Apps Script project, or connect this folder to Apps Script later with `clasp` if needed.

Current starter file:
- `newsletter.gs` for calendar sync and newsletter generation functions.

## Current workflow
- Reads events from the Boston Improv Calendar.
- Runs a first-pass relevance review with `include`, `exclude`, and `manual_review` outcomes.
- Writes reviewed events into a Google Sheet tab named `Boston Calendar Cache`.
- Collapses weekly recurring events into a single newsletter mention when the same event appears at least 3 times in the month.
- Writes a deduped newsletter-ready list into a second tab named `Newsletter Preview`.
- Persists recurring-series decisions in a third tab named `Newsletter Rules`.
- Creates a fourth tab named `Newsletter Recipients` for subscriber email addresses.
- Uses Gemini to draft next month's newsletter, with a deterministic fallback if Gemini is unavailable.
- Generates a Gmail draft instead of auto-sending.

## Setup
1. Create or open the Google Sheet that should store the cached events.
2. Open `Extensions` > `Apps Script` from that Sheet.
3. Replace the default script file contents with `newsletter.gs`.
4. In `Project Settings` > `Script Properties`, add `GEMINI_API_KEY`.
5. If needed, set `MASSPROV_CONFIG.DRAFT_RECIPIENT` to the email address that should receive the draft.
6. Make sure the Google account running the script can access the Boston Improv Calendar.

## Main functions
- `syncBostonCalendarEvents()`
  Pulls next month's events from the Boston Improv Calendar, reviews them for newsletter relevance, and writes them to the cache sheet.
- `generateNextMonthNewsletterDraft()`
  Pulls next month's events, reviews them, refreshes the cache sheet, and creates a Gmail draft.
- `sendNextMonthNewsletterToRecipients()`
  Pulls next month's events, reviews them, refreshes the cache sheet, and sends the newsletter to subscribed recipients from `Newsletter Recipients`.

## Notes
- The script uses the Boston Improv Calendar as the source of truth.
- Events are first screened by keyword heuristics, then ambiguous events can be reviewed by Gemini if that mode is enabled.
- The cache sheet includes `Series Key`, `Series Override`, `Manual Override`, `Review Status`, `Effective Review Status`, `Include In Newsletter`, `Review Source`, and `Review Reason` columns for inspection.
- `Series Override`, `Manual Override`, and the `Override` column in `Newsletter Rules` use dropdown validation with `include` and `exclude`.
- `Newsletter Recipients` uses the columns `Email`, `Subscribed`, `Name`, and `Notes`.
- Set `Subscribed` to `TRUE` for recipients who should receive the newsletter.
- `generateNextMonthNewsletterDraft()` creates a draft only.
- `sendNextMonthNewsletterToRecipients()` sends immediately using the subscribed recipients list.
- Enter `include` or `exclude` in `Series Override` on one row to apply that decision to every matching event in the same series on the next run.
- Series overrides are persisted into `Newsletter Rules`, so future automated runs can reuse them month to month.
- Enter `include` or `exclude` in `Manual Override` on the cache sheet to force a decision for one specific event row on the next run.
- Ambiguous events now default to `manual_review` instead of being auto-included.
- The preview tab shows full dates for one-off events and collapsed schedule summaries for recurring series.
- Newsletter drafts are generated but not sent automatically.
- The display timezone is set to Eastern Time in `MASSPROV_CONFIG.DISPLAY_TIME_ZONE`.
