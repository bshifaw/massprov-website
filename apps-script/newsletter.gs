const NO_EVENTS_MESSAGE = 'No improv-relevant events found for next month.';

const MASSPROV_CONFIG = {
  CALENDAR_ID: '81687222fb24e4afa47ad547fe20830fd1fa5f5769f28dc166001ee646147d8e@group.calendar.google.com',
  DISPLAY_TIME_ZONE: 'America/New_York',
  CACHE_SHEET_NAME: 'Boston Calendar Cache',
  PREVIEW_SHEET_NAME: 'Newsletter Preview',
  RULES_SHEET_NAME: 'Newsletter Rules',
  RECIPIENTS_SHEET_NAME: 'Newsletter Recipients',
  DRAFT_RECIPIENT: '',
  DRAFT_SUBJECT_PREFIX: 'MassProv Newsletter Draft',
  DESCRIPTION_PREVIEW_LENGTH: 220,
  GEMINI_MODEL: 'gemini-2.5-flash',
  GEMINI_API_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
  ENABLE_GEMINI_EVENT_REVIEW: false,
  EVENT_REVIEW_BATCH_SIZE: 5,
  RECURRING_COLLAPSE_MIN_OCCURRENCES: 3
};

const IMPROV_INCLUDE_KEYWORDS = [
  'improv',
  'improvised',
  'improviser',
  'improvisation',
  'longform',
  'shortform',
  'musical improv',
  'improv jam',
  'harold',
  'monoscene',
  'scene study'
];

const NON_IMPROV_EXCLUDE_KEYWORDS = [
  'standup',
  'stand-up',
  'stand up',
  'open mic',
  'poetry slam',
  'karaoke',
  'burlesque',
  'drag show',
  'roast battle'
];

function syncBostonCalendarEvents() {
  const range = getNextMonthDateRange_();
  ensureRecipientsSheet_();
  persistSeriesOverridesFromCache_();
  const overrides = getOverridesFromSheet_();
  const reviewedEvents = applyOverrides_(
    getBostonCalendarEventsForNextMonth(),
    overrides
  );
  const includedEvents = reviewedEvents.filter(function(event) {
    return event.includeInNewsletter;
  });
  const newsletterEvents = collapseRecurringEvents_(includedEvents);
  const result = writeEventsToSheet(reviewedEvents);
  writeNewsletterPreviewToSheet(newsletterEvents);
  const monthLabel = Utilities.formatDate(
    range.start,
    MASSPROV_CONFIG.DISPLAY_TIME_ZONE,
    'MMMM yyyy'
  );

  Logger.log(
    'Synced %s reviewed events for %s into sheet "%s".',
    reviewedEvents.length,
    monthLabel,
    result.getName()
  );
}

function generateNextMonthNewsletterDraft() {
  const newsletterPackage = buildNextMonthNewsletterPackage_();
  const recipient = getDraftRecipient_();
  const newsletterRecipients = getNewsletterRecipients_();
  const draft = GmailApp.createDraft(
    recipient,
    newsletterPackage.subject,
    newsletterPackage.plainTextBody,
    {
      htmlBody: newsletterPackage.htmlBody
    }
  );

  Logger.log(
    'Created Gmail draft %s for %s with %s included events (%s reviewed total, %s newsletter recipients configured).',
    draft.getId(),
    newsletterPackage.monthLabel,
    newsletterPackage.newsletterEvents.length,
    newsletterPackage.reviewedEvents.length,
    newsletterRecipients.length
  );
}

function sendNextMonthNewsletterToRecipients() {
  const newsletterPackage = buildNextMonthNewsletterPackage_();
  const toRecipient = getDraftRecipient_();
  const newsletterRecipients = getNewsletterRecipients_();
  if (newsletterRecipients.length === 0) {
    throw new Error(
      'No subscribed newsletter recipients found. Add rows to the "' +
        MASSPROV_CONFIG.RECIPIENTS_SHEET_NAME +
        '" sheet with Subscribed set to TRUE.'
    );
  }

  const bccRecipients = newsletterRecipients.filter(function(email) {
    return email !== String(toRecipient || '').trim().toLowerCase();
  });
  const totalRecipients = bccRecipients.length +
    (newsletterRecipients.indexOf(String(toRecipient || '').trim().toLowerCase()) === -1 ? 0 : 1);

  GmailApp.sendEmail(
    toRecipient,
    newsletterPackage.subject,
    newsletterPackage.plainTextBody,
    {
      htmlBody: newsletterPackage.htmlBody,
      bcc: bccRecipients.join(',')
    }
  );

  Logger.log(
    'Sent newsletter for %s to %s subscribed recipients (To: %s).',
    newsletterPackage.monthLabel,
    totalRecipients,
    toRecipient
  );
}

function getBostonCalendarEventsForNextMonth() {
  const range = getNextMonthDateRange_();
  const events = getBostonCalendarEvents_(range.start, range.end);
  return reviewEventsForNewsletter_(events);
}

function buildNextMonthNewsletterPackage_() {
  const monthRange = getNextMonthDateRange_();
  ensureRecipientsSheet_();
  persistSeriesOverridesFromCache_();
  const overrides = getOverridesFromSheet_();
  const reviewedEvents = applyOverrides_(
    getBostonCalendarEventsForNextMonth(),
    overrides
  );
  const includedEvents = reviewedEvents.filter(function(event) {
    return event.includeInNewsletter;
  });
  const newsletterEvents = collapseRecurringEvents_(includedEvents);

  writeEventsToSheet(reviewedEvents);
  writeNewsletterPreviewToSheet(newsletterEvents);

  const monthLabel = Utilities.formatDate(
    monthRange.start,
    MASSPROV_CONFIG.DISPLAY_TIME_ZONE,
    'MMMM yyyy'
  );
  const subject = MASSPROV_CONFIG.DRAFT_SUBJECT_PREFIX + ': ' + monthLabel;
  const plainTextBody = generateNewsletterText_(newsletterEvents, monthRange);
  const htmlBody = buildHtmlFromPlainText_(plainTextBody);

  return {
    monthRange: monthRange,
    monthLabel: monthLabel,
    reviewedEvents: reviewedEvents,
    newsletterEvents: newsletterEvents,
    subject: subject,
    plainTextBody: plainTextBody,
    htmlBody: htmlBody
  };
}

function writeEventsToSheet(events) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error(
      'No active spreadsheet found. Bind this Apps Script project to a Google Sheet before syncing events.'
    );
  }

  const sheet =
    spreadsheet.getSheetByName(MASSPROV_CONFIG.CACHE_SHEET_NAME) ||
    spreadsheet.insertSheet(MASSPROV_CONFIG.CACHE_SHEET_NAME);

  const headers = [[
    'Event ID',
    'Title',
    'Start',
    'End',
    'All Day',
    'Location',
    'Description',
    'Source Calendar ID',
    'Series Key',
    'Series Override',
    'Manual Override',
    'Review Status',
    'Effective Review Status',
    'Include In Newsletter',
    'Review Source',
    'Review Reason',
    'Last Synced At'
  ]];

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);

  if (events.length > 0) {
    const syncedAt = new Date();
    const rows = events.map(function(event) {
      return [
        event.id,
        event.title,
        event.start,
        event.end,
        event.isAllDay,
        event.location,
        event.description,
        event.calendarId,
        buildRecurringSeriesKey_(event),
        event.seriesOverride,
        event.manualOverride,
        event.reviewStatus,
        event.effectiveReviewStatus,
        event.includeInNewsletter,
        event.reviewSource,
        event.reviewReason,
        syncedAt
      ];
    });

    sheet.getRange(2, 1, rows.length, headers[0].length).setValues(rows);
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers[0].length);
  applyOverrideDropdownsToCacheSheet_(sheet, headers[0]);

  return sheet;
}

function writeNewsletterPreviewToSheet(events) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error(
      'No active spreadsheet found. Bind this Apps Script project to a Google Sheet before writing newsletter preview.'
    );
  }

  const sheet =
    spreadsheet.getSheetByName(MASSPROV_CONFIG.PREVIEW_SHEET_NAME) ||
    spreadsheet.insertSheet(MASSPROV_CONFIG.PREVIEW_SHEET_NAME);

  const headers = [[
    'Title',
    'Schedule',
    'Location',
    'Description',
    'Recurring Series',
    'Occurrences',
    'Source Event IDs'
  ]];

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);

  if (events.length > 0) {
    const rows = events.map(function(event) {
      return [
        event.title,
        formatPreviewSchedule_(event),
        event.location || '',
        truncateText_(event.description, MASSPROV_CONFIG.DESCRIPTION_PREVIEW_LENGTH) || '',
        event.isRecurringSeries ? 'TRUE' : 'FALSE',
        event.seriesOccurrences || 1,
        event.sourceEventIds ? event.sourceEventIds.join(', ') : event.id
      ];
    });

    sheet.getRange(2, 1, rows.length, headers[0].length).setValues(rows);
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers[0].length);

  return sheet;
}

function buildNewsletterHtml(events, monthRange) {
  return buildHtmlFromPlainText_(buildNewsletterPlainText(events, monthRange));
}

function buildNewsletterPlainText(events, monthRange) {
  const monthLabel = Utilities.formatDate(
    monthRange.start,
    MASSPROV_CONFIG.DISPLAY_TIME_ZONE,
    'MMMM yyyy'
  );

  if (events.length === 0) {
    return [
      'Hi all,',
      '',
      'There are no improv-relevant events listed yet for ' + monthLabel + ' on the Boston Improv Calendar.',
      '',
      'Live calendar: ' + buildCalendarPublicUrl_(),
      'Submission instructions: https://linktr.ee/bostonimprovcalendar',
      'Instagram: https://www.instagram.com/bostonimprovcalendar/'
    ].join('\n');
  }

  const groupedEvents = groupEventsByDay_(events);
  const lines = [
    'Hi all,',
    '',
    'Here are the improv events currently listed on the Boston Improv Calendar for ' + monthLabel + '.',
    ''
  ];

  Object.keys(groupedEvents).forEach(function(dayKey) {
    const group = groupedEvents[dayKey];
    lines.push(group.label);

    group.events.forEach(function(event) {
      lines.push('- ' + event.title);
      lines.push('  ' + formatNewsletterSchedule_(event));

      if (event.location) {
        lines.push('  ' + event.location);
      }

      if (event.description) {
        lines.push('  ' + truncateText_(event.description, MASSPROV_CONFIG.DESCRIPTION_PREVIEW_LENGTH));
      }

      lines.push('');
    });
  });

  lines.push('This newsletter is based on the Boston Improv Calendar, maintained by another community organizer.');
  lines.push('Calendar: ' + buildCalendarPublicUrl_());
  lines.push('Submission instructions: https://linktr.ee/bostonimprovcalendar');
  lines.push('Instagram: https://www.instagram.com/bostonimprovcalendar/');

  return lines.join('\n');
}

function reviewEventsForNewsletter_(events) {
  if (events.length === 0) {
    return [];
  }

  const heuristicReviewed = events.map(function(event) {
    return applyHeuristicEventReview_(event);
  });

  const needsAiReview = heuristicReviewed.filter(function(event) {
    return event.reviewSource === 'needs_ai_review';
  });

  if (
    !MASSPROV_CONFIG.ENABLE_GEMINI_EVENT_REVIEW ||
    needsAiReview.length === 0 ||
    !hasGeminiApiKey_()
  ) {
    return heuristicReviewed.map(function(event) {
      if (event.reviewSource !== 'needs_ai_review') {
        return event;
      }

      return withReviewDecision_(event, 'manual_review', 'fallback', 'No Gemini review available. Needs manual review.');
    });
  }

  const aiDecisions = classifyEventsForImprovRelevance_(needsAiReview);

  return heuristicReviewed.map(function(event) {
    if (event.reviewSource !== 'needs_ai_review') {
      return event;
    }

    const aiDecision = aiDecisions[event.id];
    if (!aiDecision) {
      return withReviewDecision_(event, 'manual_review', 'fallback', 'Gemini returned no decision. Needs manual review.');
    }

    return withReviewDecision_(
      event,
      aiDecision.includeInNewsletter ? 'include' : 'exclude',
      'gemini',
      aiDecision.reviewReason
    );
  });
}

function applyHeuristicEventReview_(event) {
  const normalizedTitle = normalizeSeriesText_(event.title);
  const normalizedDescription = normalizeSeriesText_(event.description);
  const titleHasIncludeKeyword = IMPROV_INCLUDE_KEYWORDS.some(function(keyword) {
    return normalizedTitle.indexOf(keyword) !== -1;
  });
  const descriptionHasIncludeKeyword = IMPROV_INCLUDE_KEYWORDS.some(function(keyword) {
    return normalizedDescription.indexOf(keyword) !== -1;
  });
  const titleHasExcludeKeyword = NON_IMPROV_EXCLUDE_KEYWORDS.some(function(keyword) {
    return normalizedTitle.indexOf(keyword) !== -1;
  });
  const descriptionHasExcludeKeyword = NON_IMPROV_EXCLUDE_KEYWORDS.some(function(keyword) {
    return normalizedDescription.indexOf(keyword) !== -1;
  });

  if (/^test\d*$/i.test(String(event.title || '').trim())) {
    return withReviewDecision_(event, 'exclude', 'heuristic', 'Looks like test data.');
  }

  if (event.start.getFullYear() < new Date().getFullYear() - 1) {
    return withReviewDecision_(event, 'exclude', 'heuristic', 'Event date looks invalid or stale.');
  }

  if (titleHasIncludeKeyword && (titleHasExcludeKeyword || descriptionHasExcludeKeyword)) {
    return withReviewDecision_(event, 'manual_review', 'heuristic', 'Mixed improv and non-improv signals in event details.');
  }

  if (titleHasIncludeKeyword) {
    return withReviewDecision_(event, 'include', 'heuristic', 'Matched improv-related keywords in title.');
  }

  if (descriptionHasIncludeKeyword && !titleHasExcludeKeyword && !descriptionHasExcludeKeyword) {
    return withReviewDecision_(event, 'include', 'heuristic', 'Matched improv-related keywords in description.');
  }

  if ((titleHasExcludeKeyword || descriptionHasExcludeKeyword) && !titleHasIncludeKeyword && !descriptionHasIncludeKeyword) {
    return withReviewDecision_(event, 'exclude', 'heuristic', 'Matched non-improv keywords without improv signals.');
  }

  return withReviewDecision_(event, 'manual_review', 'heuristic', 'Ambiguous event. Needs manual review.');
}

function classifyEventsForImprovRelevance_(events) {
  const decisions = {};
  const batches = chunkArray_(events, MASSPROV_CONFIG.EVENT_REVIEW_BATCH_SIZE);

  batches.forEach(function(batch) {
    try {
      const responseText = callGemini_({
        prompt: buildGeminiEventReviewPrompt_(batch),
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 2048
        }
      });

      const parsed = parseGeminiJsonResponse_(responseText);
      parsed.forEach(function(item) {
        if (!item || !item.eventId) {
          return;
        }

        decisions[item.eventId] = {
          includeInNewsletter: !!item.includeInNewsletter,
          reviewReason: item.reviewReason || 'Gemini provided no reason.'
        };
      });
    } catch (error) {
      Logger.log('Gemini event review failed for batch: %s', error.message);

      batch.forEach(function(event) {
        decisions[event.id] = {
          includeInNewsletter: false,
          reviewReason: 'Gemini review failed. Needs manual review.'
        };
      });
    }
  });

  return decisions;
}

function generateNewsletterText_(events, monthRange) {
  if (events.length === 0) {
    return buildNewsletterPlainText([], monthRange);
  }

  if (!hasGeminiApiKey_()) {
    Logger.log('GEMINI_API_KEY is not set. Falling back to deterministic newsletter copy.');
    return buildNewsletterPlainText(events, monthRange);
  }

  try {
    const responseText = callGemini_({
      prompt: buildGeminiNewsletterPrompt_(events, monthRange),
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 4096
      }
    });

    return responseText || buildNewsletterPlainText(events, monthRange);
  } catch (error) {
    Logger.log('Gemini newsletter generation failed: %s', error.message);
    return buildNewsletterPlainText(events, monthRange);
  }
}

function buildGeminiNewsletterPrompt_(events, monthRange) {
  const monthLabel = Utilities.formatDate(
    monthRange.start,
    MASSPROV_CONFIG.DISPLAY_TIME_ZONE,
    'MMMM yyyy'
  );

  return [
    'Write a short, warm, community-style email newsletter draft for MassProv.',
    '',
    'Audience:',
    '- Improvisers and improv fans in Massachusetts.',
    '',
    'Goals:',
    '- Summarize next month\'s improv-relevant events in a friendly, skimmable way.',
    '- Keep the message concise and easy to read on a phone.',
    '- Do not invent facts or fill in missing details.',
    '- Do not mention excluded events or the filtering process.',
    '',
    'Formatting rules:',
    '- Plain text only.',
    '- No markdown headings or bullets.',
    '- Use short paragraphs.',
    '- Use at most 2 emojis total, and only if natural.',
    '- If an event is missing location or description, omit that detail rather than making it up.',
    '',
    'Required closing idea:',
    '- Mention that the newsletter is based on the Boston Improv Calendar.',
    '- Thank the Boston Improv Calendar team briefly.',
    '- Tell people to use https://linktr.ee/bostonimprovcalendar for submission instructions.',
    '- Mention https://www.instagram.com/bostonimprovcalendar/ as their Instagram.',
    '',
    'Month:',
    monthLabel,
    '',
    'Events:',
    formatEventsForPrompt_(events)
  ].join('\n');
}

function buildGeminiEventReviewPrompt_(events) {
  return [
    'You are reviewing events for a MassProv improv newsletter.',
    '',
    'Task:',
    '- Decide whether each event should be included in the newsletter.',
    '- Include events that are clearly improv-related, improv-adjacent, or highly relevant to improvisers.',
    '- Exclude events that are mainly stand-up, poetry, karaoke, drag, burlesque, roast battles, or otherwise not meaningfully related to improv.',
    '- If an event is mixed-format, include it only if improv is a meaningful part of the event.',
    '- Base your decision only on the text provided.',
    '- Return only valid JSON.',
    '- Do not use markdown code fences.',
    '- Return a JSON array of objects in this exact shape: [{"eventId":"...","includeInNewsletter":true,"reviewReason":"..."}]',
    '',
    'Events:',
    formatEventsForPrompt_(events)
  ].join('\n');
}

function formatEventsForPrompt_(events) {
  return events.map(function(event) {
    return [
      'Event ID: ' + event.id,
      'Title: ' + event.title,
      'When: ' + formatPromptDateTime_(event),
      'Location: ' + (event.location || 'N/A'),
      'Description: ' + (event.description || 'N/A')
    ].join('\n');
  }).join('\n\n');
}

function callGemini_(options) {
  const geminiKey = getGeminiApiKey_();
  const url =
    MASSPROV_CONFIG.GEMINI_API_BASE_URL +
    encodeURIComponent(MASSPROV_CONFIG.GEMINI_MODEL) +
    ':generateContent?key=' +
    encodeURIComponent(geminiKey);

  const payload = {
    contents: [
      {
        parts: [{ text: options.prompt }]
      }
    ],
    generationConfig: options.generationConfig || {}
  };

  if (options.systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: options.systemInstruction }]
    };
  }

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  if (responseCode < 200 || responseCode >= 300) {
    throw new Error('Gemini API request failed with status ' + responseCode + ': ' + responseText);
  }

  const parsed = JSON.parse(responseText);
  const text = extractGeminiText_(parsed);
  if (!text) {
    throw new Error('Gemini API returned no text. Raw response: ' + responseText);
  }

  return text.trim();
}

function extractGeminiText_(responseJson) {
  if (
    !responseJson ||
    !responseJson.candidates ||
    !responseJson.candidates.length ||
    !responseJson.candidates[0].content ||
    !responseJson.candidates[0].content.parts
  ) {
    return '';
  }

  return responseJson.candidates[0].content.parts
    .map(function(part) {
      return part.text || '';
    })
    .join('');
}

function parseGeminiJsonResponse_(responseText) {
  const trimmed = responseText.trim();

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch && fencedMatch[1]) {
      return JSON.parse(fencedMatch[1].trim());
    }

    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrayMatch && arrayMatch[0]) {
      return JSON.parse(arrayMatch[0]);
    }

    throw new Error('Unable to parse Gemini JSON response: ' + trimmed);
  }
}

function getBostonCalendarEvents_(start, end) {
  const calendar = CalendarApp.getCalendarById(MASSPROV_CONFIG.CALENDAR_ID);
  if (!calendar) {
    throw new Error(
      'Calendar not found. Make sure the Apps Script account is subscribed to ' +
        MASSPROV_CONFIG.CALENDAR_ID +
        ' before running this script.'
    );
  }

  const rawEvents = calendar.getEvents(start, end);
  const normalizedEvents = rawEvents.map(function(event) {
    return normalizeCalendarEvent_(event, calendar.getId());
  });

  normalizedEvents.sort(function(a, b) {
    return a.start.getTime() - b.start.getTime();
  });

  return normalizedEvents;
}

function normalizeCalendarEvent_(event, calendarId) {
  return {
    id: event.getId(),
    title: event.getTitle(),
    start: event.getStartTime(),
    end: event.getEndTime(),
    isAllDay: event.isAllDayEvent(),
    location: safeTrim_(event.getLocation()),
    description: safeTrim_(event.getDescription()),
    calendarId: calendarId,
    reviewStatus: 'manual_review',
    includeInNewsletter: false,
    reviewSource: '',
    reviewReason: ''
  };
}

function getNextMonthDateRange_() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 1);

  return { start: start, end: end };
}

function collapseRecurringEvents_(events) {
  const groupedBySeries = {};

  events.forEach(function(event) {
    const key = buildRecurringSeriesKey_(event);
    if (!groupedBySeries[key]) {
      groupedBySeries[key] = [];
    }
    groupedBySeries[key].push(event);
  });

  const collapsed = [];

  Object.keys(groupedBySeries).forEach(function(key) {
    const group = groupedBySeries[key].slice().sort(function(a, b) {
      return a.start.getTime() - b.start.getTime();
    });

    if (shouldCollapseRecurringSeries_(group)) {
      collapsed.push(createRecurringSeriesEvent_(group));
      return;
    }

    Array.prototype.push.apply(collapsed, group);
  });

  collapsed.sort(function(a, b) {
    return a.start.getTime() - b.start.getTime();
  });

  return collapsed;
}

function groupEventsByDay_(events) {
  return events.reduce(function(groups, event) {
    const dayKey = Utilities.formatDate(
      event.start,
      MASSPROV_CONFIG.DISPLAY_TIME_ZONE,
      'yyyy-MM-dd'
    );
    const dayLabel = Utilities.formatDate(
      event.start,
      MASSPROV_CONFIG.DISPLAY_TIME_ZONE,
      'EEEE, MMMM d'
    );

    if (!groups[dayKey]) {
      groups[dayKey] = {
        label: dayLabel,
        events: []
      };
    }

    groups[dayKey].events.push(event);
    return groups;
  }, {});
}

function formatEventTimeRange_(event) {
  if (event.isAllDay) {
    return 'All day';
  }

  const start = Utilities.formatDate(
    event.start,
    MASSPROV_CONFIG.DISPLAY_TIME_ZONE,
    'h:mm a'
  );
  const end = Utilities.formatDate(
    event.end,
    MASSPROV_CONFIG.DISPLAY_TIME_ZONE,
    'h:mm a'
  );

  return start + ' - ' + end + ' ET';
}

function formatPromptDateTime_(event) {
  if (event.isRecurringSeries) {
    return event.seriesScheduleSummary;
  }

  const dateLabel = Utilities.formatDate(
    event.start,
    MASSPROV_CONFIG.DISPLAY_TIME_ZONE,
    'EEEE, MMMM d, yyyy'
  );

  if (event.isAllDay) {
    return dateLabel + ' (all day)';
  }

  return dateLabel + ' ' + formatEventTimeRange_(event);
}

function formatNewsletterSchedule_(event) {
  if (event.isRecurringSeries) {
    return event.seriesScheduleSummary;
  }

  return formatEventTimeRange_(event);
}

function formatPreviewSchedule_(event) {
  if (event.isRecurringSeries) {
    return event.seriesScheduleSummary;
  }

  return formatPromptDateTime_(event);
}

function buildCalendarPublicUrl_() {
  return (
    'https://calendar.google.com/calendar/embed?src=' +
    encodeURIComponent(MASSPROV_CONFIG.CALENDAR_ID) +
    '&ctz=' +
    encodeURIComponent(MASSPROV_CONFIG.DISPLAY_TIME_ZONE)
  );
}

function getDraftRecipient_() {
  if (MASSPROV_CONFIG.DRAFT_RECIPIENT) {
    return MASSPROV_CONFIG.DRAFT_RECIPIENT;
  }

  const fallback = Session.getEffectiveUser().getEmail();
  if (!fallback) {
    throw new Error(
      'Set MASSPROV_CONFIG.DRAFT_RECIPIENT to the email address that should receive the newsletter draft.'
    );
  }

  return fallback;
}

function ensureRecipientsSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error(
      'No active spreadsheet found. Bind this Apps Script project to a Google Sheet before creating the recipients sheet.'
    );
  }

  const sheet =
    spreadsheet.getSheetByName(MASSPROV_CONFIG.RECIPIENTS_SHEET_NAME) ||
    spreadsheet.insertSheet(MASSPROV_CONFIG.RECIPIENTS_SHEET_NAME);

  const headers = [
    'Email',
    'Subscribed',
    'Name',
    'Notes'
  ];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (currentHeaders.join('||') !== headers.join('||')) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);

  const subscribedIndex = headers.indexOf('Subscribed');
  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(['TRUE', 'FALSE'], true)
    .setAllowInvalid(false)
    .build();
  const numRows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, subscribedIndex + 1, numRows, 1).setDataValidation(validation);

  return sheet;
}

function getNewsletterRecipients_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    return [];
  }

  const sheet = ensureRecipientsSheet_();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return [];
  }

  const headers = data[0];
  const emailIndex = headers.indexOf('Email');
  const subscribedIndex = headers.indexOf('Subscribed');
  if (emailIndex === -1) {
    return [];
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const deduped = {};

  data.slice(1).forEach(function(row) {
    const email = String(row[emailIndex] || '').trim();
    if (!email || !emailRegex.test(email)) {
      return;
    }

    if (subscribedIndex !== -1) {
      const subscribedValue = String(row[subscribedIndex] || '').trim().toLowerCase();
      if (subscribedValue && subscribedValue !== 'true') {
        return;
      }
    }

    deduped[email.toLowerCase()] = true;
  });

  return Object.keys(deduped);
}

function getOverridesFromSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    return { manualOverrides: {}, seriesOverrides: {} };
  }

  const rulesSheet = ensureRulesSheet_(spreadsheet);
  const ruleOverrides = getSeriesOverridesFromRulesSheet_(rulesSheet);

  const sheet = spreadsheet.getSheetByName(MASSPROV_CONFIG.CACHE_SHEET_NAME);
  if (!sheet) {
    return { manualOverrides: {}, seriesOverrides: ruleOverrides };
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return { manualOverrides: {}, seriesOverrides: ruleOverrides };
  }

  const headers = data[0];
  const eventIdIndex = headers.indexOf('Event ID');
  const seriesKeyIndex = headers.indexOf('Series Key');
  const seriesOverrideIndex = headers.indexOf('Series Override');
  const manualOverrideIndex = headers.indexOf('Manual Override');
  if (eventIdIndex === -1) {
    return { manualOverrides: {}, seriesOverrides: {} };
  }

  return data.slice(1).reduce(function(acc, row) {
    const eventId = String(row[eventIdIndex] || '').trim();
    const manualOverride = normalizeManualOverride_(
      manualOverrideIndex === -1 ? '' : row[manualOverrideIndex]
    );
    const seriesKey = String(seriesKeyIndex === -1 ? '' : row[seriesKeyIndex] || '').trim();
    const seriesOverride = normalizeManualOverride_(
      seriesOverrideIndex === -1 ? '' : row[seriesOverrideIndex]
    );

    if (eventId && manualOverride) {
      acc.manualOverrides[eventId] = manualOverride;
    }

    if (seriesKey && seriesOverride) {
      acc.seriesOverrides[seriesKey] = seriesOverride;
    }

    return acc;
  }, {
    manualOverrides: {},
    seriesOverrides: Object.assign({}, ruleOverrides)
  });
}

function applyOverrides_(events, overrides) {
  return events.map(function(event) {
    const seriesKey = buildRecurringSeriesKey_(event);
    const manualOverride = normalizeManualOverride_(overrides.manualOverrides[event.id]);
    const seriesOverride = normalizeManualOverride_(overrides.seriesOverrides[seriesKey]);

    if (!manualOverride) {
      if (!seriesOverride) {
        return Object.assign({}, event, {
          seriesOverride: '',
          manualOverride: '',
          effectiveReviewStatus: event.reviewStatus
        });
      }

      return Object.assign({}, event, {
        seriesOverride: seriesOverride,
        manualOverride: '',
        effectiveReviewStatus: seriesOverride,
        includeInNewsletter: seriesOverride === 'include'
      });
    }

    return Object.assign({}, event, {
      seriesOverride: seriesOverride,
      manualOverride: manualOverride,
      effectiveReviewStatus: manualOverride,
      includeInNewsletter: manualOverride === 'include'
    });
  });
}

function persistSeriesOverridesFromCache_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    return;
  }

  const cacheSheet = spreadsheet.getSheetByName(MASSPROV_CONFIG.CACHE_SHEET_NAME);
  if (!cacheSheet) {
    ensureRulesSheet_(spreadsheet);
    return;
  }

  const data = cacheSheet.getDataRange().getValues();
  if (data.length < 2) {
    ensureRulesSheet_(spreadsheet);
    return;
  }

  const headers = data[0];
  const seriesKeyIndex = headers.indexOf('Series Key');
  const seriesOverrideIndex = headers.indexOf('Series Override');
  const titleIndex = headers.indexOf('Title');
  const locationIndex = headers.indexOf('Location');
  if (seriesKeyIndex === -1 || seriesOverrideIndex === -1 || titleIndex === -1) {
    ensureRulesSheet_(spreadsheet);
    return;
  }

  const pendingRules = data.slice(1).reduce(function(acc, row) {
    const seriesKey = String(row[seriesKeyIndex] || '').trim();
    const seriesOverride = normalizeManualOverride_(row[seriesOverrideIndex]);
    if (!seriesKey || !seriesOverride) {
      return acc;
    }

    const title = String(row[titleIndex] || '').trim();
    const location = String(locationIndex === -1 ? '' : row[locationIndex] || '').trim();
    acc[seriesKey] = {
      label: buildSeriesLabel_(title, location),
      override: seriesOverride
    };
    return acc;
  }, {});

  const rulesSheet = ensureRulesSheet_(spreadsheet);
  if (Object.keys(pendingRules).length === 0) {
    return;
  }

  const headersRow = rulesSheet.getRange(1, 1, 1, rulesSheet.getLastColumn()).getValues()[0];
  const ruleKeyIndex = headersRow.indexOf('Series Key');
  const ruleLabelIndex = headersRow.indexOf('Series Label');
  const ruleOverrideIndex = headersRow.indexOf('Override');
  const ruleNotesIndex = headersRow.indexOf('Notes');
  const ruleUpdatedIndex = headersRow.indexOf('Last Updated');
  const lastRow = rulesSheet.getLastRow();
  const existingRows = lastRow > 1
    ? rulesSheet.getRange(2, 1, lastRow - 1, headersRow.length).getValues()
    : [];
  const rowIndexByKey = {};

  existingRows.forEach(function(row, index) {
    const key = String(row[ruleKeyIndex] || '').trim();
    if (key) {
      rowIndexByKey[key] = index;
    }
  });

  Object.keys(pendingRules).forEach(function(seriesKey) {
    const rule = pendingRules[seriesKey];
    if (Object.prototype.hasOwnProperty.call(rowIndexByKey, seriesKey)) {
      const row = existingRows[rowIndexByKey[seriesKey]];
      row[ruleKeyIndex] = seriesKey;
      row[ruleLabelIndex] = rule.label;
      row[ruleOverrideIndex] = rule.override;
      row[ruleUpdatedIndex] = new Date();
      return;
    }

    const newRow = new Array(headersRow.length).fill('');
    newRow[ruleKeyIndex] = seriesKey;
    newRow[ruleLabelIndex] = rule.label;
    newRow[ruleOverrideIndex] = rule.override;
    newRow[ruleNotesIndex] = '';
    newRow[ruleUpdatedIndex] = new Date();
    existingRows.push(newRow);
  });

  if (lastRow > 1) {
    rulesSheet.getRange(2, 1, lastRow - 1, headersRow.length).clearContent();
  }
  if (existingRows.length > 0) {
    rulesSheet.getRange(2, 1, existingRows.length, headersRow.length).setValues(existingRows);
  }
  applyOverrideDropdownsToRulesSheet_(rulesSheet, headersRow);
}

function ensureRulesSheet_(spreadsheet) {
  const sheet =
    spreadsheet.getSheetByName(MASSPROV_CONFIG.RULES_SHEET_NAME) ||
    spreadsheet.insertSheet(MASSPROV_CONFIG.RULES_SHEET_NAME);

  const headers = [
    'Series Key',
    'Series Label',
    'Override',
    'Notes',
    'Last Updated'
  ];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (currentHeaders.join('||') !== headers.join('||')) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  applyOverrideDropdownsToRulesSheet_(sheet, headers);

  return sheet;
}

function getSeriesOverridesFromRulesSheet_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return {};
  }

  const headers = data[0];
  const keyIndex = headers.indexOf('Series Key');
  const overrideIndex = headers.indexOf('Override');
  if (keyIndex === -1 || overrideIndex === -1) {
    return {};
  }

  return data.slice(1).reduce(function(acc, row) {
    const key = String(row[keyIndex] || '').trim();
    const override = normalizeManualOverride_(row[overrideIndex]);
    if (key && override) {
      acc[key] = override;
    }
    return acc;
  }, {});
}

function applyOverrideDropdownsToCacheSheet_(sheet, headers) {
  const seriesOverrideIndex = headers.indexOf('Series Override');
  const manualOverrideIndex = headers.indexOf('Manual Override');
  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(['include', 'exclude'], true)
    .setAllowInvalid(false)
    .build();
  const numRows = Math.max(sheet.getMaxRows() - 1, 1);

  if (seriesOverrideIndex !== -1) {
    sheet.getRange(2, seriesOverrideIndex + 1, numRows, 1).setDataValidation(validation);
  }
  if (manualOverrideIndex !== -1) {
    sheet.getRange(2, manualOverrideIndex + 1, numRows, 1).setDataValidation(validation);
  }
}

function applyOverrideDropdownsToRulesSheet_(sheet, headers) {
  const overrideIndex = headers.indexOf('Override');
  if (overrideIndex === -1) {
    return;
  }

  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(['include', 'exclude'], true)
    .setAllowInvalid(false)
    .build();
  const numRows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, overrideIndex + 1, numRows, 1).setDataValidation(validation);
}

function getGeminiApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    throw new Error('Set GEMINI_API_KEY in Apps Script Script Properties before using Gemini features.');
  }

  return key;
}

function hasGeminiApiKey_() {
  try {
    return !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  } catch (error) {
    return false;
  }
}

function buildHtmlFromPlainText_(plainText) {
  return '<div>' + escapeHtml_(plainText).replace(/\n/g, '<br>') + '</div>';
}

function withReviewDecision_(event, reviewStatus, reviewSource, reviewReason) {
  return Object.assign({}, event, {
    seriesOverride: '',
    manualOverride: '',
    reviewStatus: reviewStatus,
    effectiveReviewStatus: reviewStatus,
    includeInNewsletter: reviewStatus === 'include',
    reviewSource: reviewSource,
    reviewReason: reviewReason
  });
}

function chunkArray_(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function truncateText_(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength - 3) + '...';
}

function safeTrim_(value) {
  return value ? value.trim() : '';
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateForLog_(date) {
  return Utilities.formatDate(date, MASSPROV_CONFIG.DISPLAY_TIME_ZONE, 'yyyy-MM-dd');
}

function buildRecurringSeriesKey_(event) {
  return [
    normalizeSeriesText_(event.title),
    normalizeSeriesText_(event.location),
    event.isAllDay ? 'all-day' : Utilities.formatDate(event.start, MASSPROV_CONFIG.DISPLAY_TIME_ZONE, 'HH:mm')
  ].join('|');
}

function shouldCollapseRecurringSeries_(events) {
  if (events.length < MASSPROV_CONFIG.RECURRING_COLLAPSE_MIN_OCCURRENCES) {
    return false;
  }

  for (let index = 1; index < events.length; index += 1) {
    const dayDelta = Math.round(
      (stripTime_(events[index].start).getTime() - stripTime_(events[index - 1].start).getTime()) / 86400000
    );

    if (dayDelta < 5 || dayDelta > 9) {
      return false;
    }
  }

  return true;
}

function createRecurringSeriesEvent_(events) {
  const firstEvent = events[0];
  const weekday = Utilities.formatDate(
    firstEvent.start,
    MASSPROV_CONFIG.DISPLAY_TIME_ZONE,
    'EEEE'
  );
  const dateList = events.map(function(event) {
    return Utilities.formatDate(
      event.start,
      MASSPROV_CONFIG.DISPLAY_TIME_ZONE,
      'MMM d'
    );
  }).join(', ');

  let scheduleSummary = 'Weekly on ' + weekday;
  if (firstEvent.isAllDay) {
    scheduleSummary += ' (all day)';
  } else {
    scheduleSummary += ' at ' + formatEventTimeRange_(firstEvent);
  }
  scheduleSummary += ' (' + dateList + ')';

  return Object.assign({}, firstEvent, {
    id: firstEvent.id + '__series',
    isRecurringSeries: true,
    seriesOccurrences: events.length,
    seriesDateSummary: dateList,
    seriesScheduleSummary: scheduleSummary,
    sourceEventIds: events.map(function(event) {
      return event.id;
    })
  });
}

function buildSeriesLabel_(title, location) {
  if (location) {
    return title + ' @ ' + location;
  }

  return title;
}

function normalizeSeriesText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripTime_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function normalizeManualOverride_(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'include' || normalized === 'exclude') {
    return normalized;
  }

  return '';
}
