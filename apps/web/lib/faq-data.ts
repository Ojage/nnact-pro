// The staff FAQ, kept as data so it can be searched, filtered and unit-tested
// without rendering.
//
// Every answer here is written against verified behaviour. If an answer names a
// limit, a gate or a side effect, that was confirmed in the code that enforces
// it — not inferred from a label. Where the product deliberately refuses to do
// something, the answer says so rather than describing an idealised flow.

export interface FaqEntry {
  id: string;
  category: FaqCategory;
  question: string;
  /** Plain prose. Concrete: names the screen, the gate, or the reason. */
  answer: string;
}

export const FAQ_CATEGORIES = [
  "Getting started",
  "Roles & permissions",
  "Growth campaigns",
  "Inbox & replies",
  "Deliverability & suppression",
  "Autopilot & sending limits",
  "AI content & costs",
  "Content Studio & publishing",
  "Image gallery",
  "Money: invoices, estimates, payments",
] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export const FAQ_ENTRIES: FaqEntry[] = [
  // ── Getting started ───────────────────────────────────────────────────────
  {
    id: "first-login",
    category: "Getting started",
    question: "What do I see first, and where are the areas I need?",
    answer:
      "The sidebar is grouped by what you do: Field, Operations, Finance, Marketing, Quality, Growth and System. Today is the default landing page. The sections you are not allowed to see are hidden rather than shown disabled, so if a menu item is missing it is a permission question, not a bug — see 'Roles & permissions'.",
  },
  {
    id: "find-anything",
    category: "Getting started",
    question: "Is there a search that finds anything in the system?",
    answer:
      "Not yet. There is no global search today. Lists such as Jobs, Customers, Campaigns and the Unified Inbox each have their own search box, and the Growth inbox also searches message text. The Help FAQ you are reading searches itself, but it only covers this page.",
  },
  {
    id: "notifications",
    category: "Getting started",
    question: "Will I be notified by email or push when something needs me?",
    answer:
      "In-app only. There is no email or push notification for staff events. The surfaces that need your attention are the Growth Unified Inbox filtered to 'Needs reply', the Today page, and any banner on a record that is waiting on review.",
  },
  {
    id: "audit-trail",
    category: "Getting started",
    question: "Is there a record of who changed what?",
    answer:
      "Partly, and unevenly by area. Growth campaigns have a full audit log on the campaign page. Everything sent outbound is recorded in the outbound send log, and replies additionally record which staff member sent them, so the log always distinguishes a person writing from the scheduler writing. Finance and Field records carry who created and updated them, but do not all have a full change-by-change history.",
  },

  // ── Roles & permissions ───────────────────────────────────────────────────
  {
    id: "roles-list",
    category: "Roles & permissions",
    question: "What roles exist and what can each one do?",
    answer:
      "There are four staff roles. Owner has full access. Dispatcher, Secretary and Field Technician have progressively narrower access, mainly around Finance, Marketing and Growth. Exact route access is defined in one place in the app, and the sidebar only shows you the areas your role may actually open.",
  },
  {
    id: "roles-missing-button",
    category: "Roles & permissions",
    question: "A button I can see is greyed out, or a page I need is missing. Why?",
    answer:
      "The screens gate controls on your role, and some gate on more than one thing. For example, a dispatcher can schedule content but not publish it, because publishing is owner-only. A control that is missing entirely usually means your role has no access to that area at all, rather than the action being unavailable.",
  },
  {
    id: "roles-content-gates",
    category: "Roles & permissions",
    question: "Who can approve and publish content?",
    answer:
      "Any staff member can write a draft and submit it for review. Approving, rejecting, publishing and unpublishing are owner-only. Scheduling is open to owners and dispatchers. The buttons shown to you match exactly what the API will accept, so a visible button will not fail with a permission error.",
  },
  {
    id: "roles-growth-gates",
    category: "Roles & permissions",
    question: "Who can reply to prospects, and who can change Growth strategy?",
    answer:
      "Replying from the Unified Inbox needs write access, so owners, dispatchers and secretaries can send replies; a read-only Growth role can still triage and add internal notes but cannot send. Changing sender identities, approving competitors, and Autopilot mode and cycle controls are owner-only, because they affect outbound reputation and spend.",
  },
  {
    id: "roles-financial",
    category: "Roles & permissions",
    question: "Why can I not see Finance?",
    answer:
      "Finance is restricted, and the section is hidden entirely rather than shown as a dead link. If you genuinely need it for your work, an owner has to grant it — the role cannot be changed from the UI by anyone else.",
  },

  // ── Growth campaigns ──────────────────────────────────────────────────────
  {
    id: "campaign-lifecycle",
    category: "Growth campaigns",
    question: "What is the lifecycle of a campaign?",
    answer:
      "Draft, then Researching while the system gathers prospects, then Ready for review, In review, Approved, Scheduled, Running, and finally Completed or Cancelled. Paused is a temporary state you can come back from. Once a campaign is Completed or Cancelled it is final and cannot be restarted.",
  },
  {
    id: "campaign-start",
    category: "Growth campaigns",
    question: "How do I start a campaign?",
    answer:
      "Create it in Growth → Campaigns, define the steps — the subject and body for the first email and each follow-up, with the delay in days between them — choose the sender identity, set the daily limit and quiet hours, then schedule it. A campaign must be approved by an owner before it will send.",
  },
  {
    id: "campaign-approve",
    category: "Growth campaigns",
    question: "Why is my campaign not sending?",
    answer:
      "Most often it is not approved yet, or its start time has not arrived, or it is inside quiet hours. The campaign page reports the specific reason for a refusal rather than silently doing nothing: not approved, not started, quiet hours, daily limit reached, or the organisation or sector send cap. Check the audit log for the last change and who made it.",
  },
  {
    id: "campaign-daily-limit",
    category: "Growth campaigns",
    question: "What is the daily limit on a campaign?",
    answer:
      "The maximum number of messages that campaign may send per day, counted in UTC. It is checked before any recipient is touched, so a campaign at its limit reports 'daily limit reached' and sends nothing. It is separate from the organisation-wide cap and from the per-sector share, either of which can stop a send before your campaign's own limit is reached.",
  },
  {
    id: "campaign-complete-cancel",
    category: "Growth campaigns",
    question: "What is the difference between Complete, Cancel and Pause?",
    answer:
      "Pause is temporary and reversible. Complete marks a campaign finished because it achieved what it was for; it is final. Cancel is for when you are abandoning it, and unlike Complete it also stops every remaining recipient so nobody is left eligible for a future follow-up. Both are final, and both refuse a second terminal transition rather than overwriting the record.",
  },
  {
    id: "campaign-timezone",
    category: "Growth campaigns",
    question: "Which timezone do quiet hours use?",
    answer:
      "The campaign's own timezone, an IANA zone name, defaulting to Africa/Douala. The value is validated when you save, so a typo is rejected rather than silently falling back to UTC and sending at the wrong hour. Quiet hours are set as a start and end hour and can wrap past midnight.",
  },
  {
    id: "campaign-followups",
    category: "Growth campaigns",
    question: "When does a follow-up sequence stop?",
    answer:
      "After a reply, a booked meeting, an opt-out, a hard bounce, a complaint, a manual stop, a genuine conversion, or once the follow-up limit is reached. The last of these used to be logged as a conversion, which made an ordinary end to a sequence indistinguishable from a win; it is now recorded as a follow-up limit.",
  },
  {
    id: "campaign-sender-required",
    category: "Growth campaigns",
    question: "Why can I not select a sender?",
    answer:
      "Every campaign needs a sender identity, and cold outreach additionally needs that identity to be verified and owner-approved for cold mail. The Sender Registry shows each identity's state. An unverified or unapproved identity blocks the whole campaign rather than partially sending, because a mixed-reputation send is worse than no send.",
  },
  {
    id: "campaign-meeting",
    category: "Growth campaigns",
    question: "How does a booked meeting stop the sequence?",
    answer:
      "When a meeting is recorded against the prospect, the recipient is marked as having a meeting booked, and no further step is sent to them. The check outranks a previous reply, so a thread that both replied and then booked a meeting stops for the right reason.",
  },

  // ── Inbox & replies ───────────────────────────────────────────────────────
  {
    id: "inbox-views",
    category: "Inbox & replies",
    question: "What do the inbox filters mean?",
    answer:
      "Needs reply is what is waiting on a person. All replies is everything inbound. Interested and Meeting requested are the positive intents. Unsubscribe and Complaint are the two ways a recipient asks to stop. Failed is what the classifier flagged as not worth a human answer. All shows every thread.",
  },
  {
    id: "reply-send",
    category: "Inbox & replies",
    question: "How do I reply to a prospect?",
    answer:
      "Open the thread in the Unified Inbox and use the Reply box above the message history. The reply goes out as that thread's NNACT sender, is added to the conversation, and clears the 'Needs reply' flag. It is recorded in the outbound send log attributed to you.",
  },
  {
    id: "reply-suppressed",
    category: "Inbox & replies",
    question: "Why was my reply refused because the address is suppressed?",
    answer:
      "Because suppression is re-checked at the moment you press send, not when the thread was opened. An inbox can sit open for hours, and someone can opt out or complain in between. Replying anyway would breach the suppression, so it is refused with the reason.",
  },
  {
    id: "reply-notes",
    category: "Inbox & replies",
    question: "What is the difference between an internal note and a reply?",
    answer:
      "An internal note is only visible to staff. A reply is emailed to the prospect and written to the outbound send log. Notes are for handoffs and context; if the prospect needs to read it, it is a reply.",
  },
  {
    id: "reply-classifier",
    category: "Inbox & replies",
    question: "How accurate is the automatic intent classification?",
    answer:
      "It is a starting point for triage, not a decision. A complaint, anything mentioning a lawyer, or harassment language is always flagged for a human rather than auto-answered, and a request for verification is recorded as such. Always read the message before replying.",
  },
  {
    id: "reply-thread-timeline",
    category: "Inbox & replies",
    question: "Does the thread show what we sent them?",
    answer:
      "Yes. The timeline combines inbound messages with the outbound send log, so you can see the full history including campaign emails and your replies, rather than only what they wrote.",
  },
  {
    id: "reply-paused",
    category: "Inbox & replies",
    question: "Can I reply while Growth is paused?",
    answer:
      "No. Pausing Growth blocks replies as well as campaign sends, because the pause is the emergency control for stopping all outbound mail from the organisation. Resume it from the Autopilot screen.",
  },

  // ── Deliverability & suppression ──────────────────────────────────────────
  {
    id: "suppression-list",
    category: "Deliverability & suppression",
    question: "What is the Suppression List?",
    answer:
      "The set of addresses and domains the system must never contact again, whatever a campaign says. It is org-wide and permanent. When a send would hit a suppressed address it is recorded as suppressed rather than delivered, so the reason is visible on the recipient.",
  },
  {
    id: "suppression-scope",
    category: "Deliverability & suppression",
    question: "What can be suppressed, and by what reason?",
    answer:
      "By scope: an email address, a whole domain, a phone number or a company. By reason: opt-out, hard bounce, complaint, manual block, a legal request, a previous customer asking not to be contacted, or other. Email is the scope that stops email sends; a domain block stops everything to that company.",
  },
  {
    id: "bounce-handling",
    category: "Deliverability & suppression",
    question: "What happens when an address hard-bounces?",
    answer:
      "The address is suppressed, and the recipient is stopped on every campaign, not just the one that bounced, so it can never be re-enrolled. This arrives through the deliverability webhook, signed and de-duplicated like inbound mail.",
  },
  {
    id: "bounce-soft",
    category: "Deliverability & suppression",
    question: "Why did a bounced address not get suppressed?",
    answer:
      "Because it was a soft bounce — mailbox full, greylisted, rate limited, or any 4xx. Those are temporary and the next send often succeeds, so suppressing on them would silently remove a large part of a healthy list. Only permanent failures suppress. An unclassifiable reason is treated as permanent, because mailing a dead address is the more expensive mistake.",
  },
  {
    id: "complaint-handling",
    category: "Deliverability & suppression",
    question: "What happens when someone marks our mail as spam?",
    answer:
      "The address is suppressed permanently and the recipient is stopped and treated as opted out. A complaint is recorded separately from an opt-out and counted separately, because it carries much more weight: the Autopilot allocation scoring penalises a complaint far more heavily than a polite unsubscribe, and the two are no longer folded together.",
  },
  {
    id: "sender-health",
    category: "Deliverability & suppression",
    question: "How do I know if a sender is degrading?",
    answer:
      "The Sender Registry shows sends, failures and blocks over the last 30 days for each identity, plus the real number of hard bounce and complaint signals attributed to that identity's own sends, and warns above a 5% rate. Watch this before the provider throttles or blocklists you — that is the point at which a campaign stops working.",
  },
  {
    id: "cold-transport",
    category: "Deliverability & suppression",
    question: "Why can cold campaigns not start?",
    answer:
      "Cold outreach runs on a dedicated transport, separate from the transport used for transactional and opted-in mail, so unsolicited mail cannot damage the reputation of the mail that customers and staff rely on. Until that transport is configured, cold sends fail closed rather than quietly falling back.",
  },

  // ── Autopilot & sending limits ────────────────────────────────────────────
  {
    id: "autopilot-modes",
    category: "Autopilot & sending limits",
    question: "What is the difference between Observe, Assisted and Autopilot?",
    answer:
      "Observe records what it would recommend and sends nothing. Assisted applies the allocation changes and waits for a person to start each campaign. Autopilot applies the allocations and dispatches the sends through the same scheduler the background worker uses, under all the same guards.",
  },
  {
    id: "autopilot-cycle",
    category: "Autopilot & sending limits",
    question: "What does 'Run cycle now' actually do?",
    answer:
      "It recomputes each sector's allocation from its recent results, records the decisions with the reasoning, and in Autopilot mode then dispatches any sends that are due. The result tells you what was sent; when nothing was sent it names the refusal reasons rather than reporting success.",
  },
  {
    id: "autopilot-cap",
    category: "Autopilot & sending limits",
    question: "What is the daily send cap, and does it really apply?",
    answer:
      "It is the maximum number of messages the whole organisation may send per day. It is enforced on every send path — scheduled, manual and Autopilot alike — checked before any recipient is touched. It used to be used only as a number in the allocation arithmetic and limited nothing at all, so many campaigns could each stay within their own limit while the organisation sent several times the cap.",
  },
  {
    id: "autopilot-sector-share",
    category: "Autopilot & sending limits",
    question: "What does a sector's allocation weight actually do?",
    answer:
      "It sets that sector's share of the daily cap. A sector allocated 30% of a 50/day cap may send 15 that day, and refuses with a distinct reason once it has. Shares floor rather than round, so sectors cannot collectively overshoot the cap. A sector allocated zero sends nothing, and says so rather than appearing to work.",
  },
  {
    id: "autopilot-weights",
    category: "Autopilot & sending limits",
    question: "How are sector weights decided?",
    answer:
      "From each sector's observed results: contacts, meetings, estimates won, replies, unsubscribes, bounces and complaints, over a minimum sample size and observation window, with a share of effort held back for exploration of underperforming sectors. A sector below its sample size is not judged, and pinned, excluded and paused sectors are left alone.",
  },
  {
    id: "autopilot-complaints-effect",
    category: "Autopilot & sending limits",
    question: "Do complaints actually reduce a sector's allocation?",
    answer:
      "Yes. Complaints are counted in the metrics that feed allocation and are weighted more heavily than unsubscribes, and bounces reduce it too. Before this was measured, complaints were recorded as zero, so no complaint ever influenced a single allocation decision.",
  },
  {
    id: "autopilot-pause",
    category: "Autopilot & sending limits",
    question: "How do I stop everything immediately?",
    answer:
      "Pause all sends on the Autopilot screen. It is the emergency control: it blocks campaign sends and staff replies together, and nothing can go out until it is resumed. Use it the moment a sender's health degrades or something looks wrong.",
  },
  {
    id: "autopilot-exploration",
    category: "Autopilot & sending limits",
    question: "What is exploration?",
    answer:
      "A configurable percentage of daily effort held back for sectors that are not currently winning, so the system does not permanently write off a sector that was simply under-tried. It is the counterweight to allocating everything to the sector with the best numbers so far.",
  },

  // ── AI content & costs ────────────────────────────────────────────────────
  {
    id: "ai-what",
    category: "AI content & costs",
    question: "What does the AI actually do?",
    answer:
      "It writes and reviews content, generates images, and analyses images. Briefs, quality reviews, image generation and vision review all call external providers. Every one of those calls is now metered with its cost, so the usage figures and budget caps reflect real spend rather than a fraction of it.",
  },
  {
    id: "ai-costs",
    category: "AI content & costs",
    question: "Where can I see what AI is costing?",
    answer:
      "AI Usage Analytics, broken down by provider, model and task, with export. Daily and monthly budget guardrails compare today and this month against a limit and stop further calls when it would be exceeded. The rates used are indicative budget proxies rather than a billing integration.",
  },
  {
    id: "ai-budgets",
    category: "AI content & costs",
    question: "What happens when an AI budget is reached?",
    answer:
      "Further calls are refused rather than allowed to overshoot. Because every provider call now reports a cost, the cap reflects briefs, reviews, image generation and vision, not just the main writing step as it previously did.",
  },
  {
    id: "ai-quality",
    category: "AI content & costs",
    question: "What stops bad AI content being published?",
    answer:
      "An image or text quality review can fail, and human review is still required before anything is published. AI output is a draft: only an owner can approve and publish, and every publication carries a recorded audit trail. The quality gate is a backstop, not a substitute for reading it.",
  },
  {
    id: "ai-providers",
    category: "AI content & costs",
    question: "Which AI providers can I use?",
    answer:
      "OpenAI, Anthropic and Grok, each configured independently with its own API key, default model and health status. Text calls fail over across the configured order when one provider errors, times out or returns an empty result, and the affected provider is marked degraded so you can see which one is unwell.",
  },
  {
    id: "ai-schedules",
    category: "AI content & costs",
    question: "Can AI work run on a schedule?",
    answer:
      "Yes, with daily and weekly windows and a per-run cap. Runs are recovered if one is stranded mid-flight, so a failed or interrupted run does not sit open forever.",
  },

  // ── Content Studio & publishing ───────────────────────────────────────────
  {
    id: "content-flow",
    category: "Content Studio & publishing",
    question: "What are the content stages?",
    answer:
      "Draft, In review, Approved, Scheduled, Published and Archived. Anyone can write a draft and submit it for review. Approving, rejecting, publishing and unpublishing are owner-only; scheduling is open to owners and dispatchers.",
  },
  {
    id: "content-stuck-draft",
    category: "Content Studio & publishing",
    question: "My content is stuck in Draft. How do I move it on?",
    answer:
      "Open the item and use Submit for review. That button was missing for a while, which meant a draft could not reach an owner and nothing could be approved — the workflow was genuinely stuck at the first step. Submitting moves it to In review and notifies the review queue.",
  },
  {
    id: "content-publish-where",
    category: "Content Studio & publishing",
    question: "Where do I publish to Facebook, LinkedIn and Instagram?",
    answer:
      "Content Studio publishes to the connected channels. Connect and verify each channel under Marketing → Channels first. Publishing is owner-only, and every attempt is recorded whether it succeeds or fails, with the provider's message when it does not.",
  },
  {
    id: "content-publish-fail",
    category: "Content Studio & publishing",
    question: "A publish failed. What should I check?",
    answer:
      "First that the channel is still connected and its token has not expired or been revoked, then that the account has not hit a platform rate limit. The publication record keeps the failure reason. Retrying is safe: a repeat publish of the same item to the same channel is recorded as a duplicate rather than posting twice.",
  },
  {
    id: "content-instagram-page",
    category: "Content Studio & publishing",
    question: "How do I choose which Instagram page to post to?",
    answer:
      "It currently defaults to the first connected page. If you manage several, verify which one is first after connecting, and post to the intended page from the page itself until the picker is added.",
  },
  {
    id: "content-revisions",
    category: "Content Studio & publishing",
    question: "Can I undo a publish?",
    answer:
      "Unpublish is available to owners. It takes the item off the channel; the publication record is kept, so the history of what was published and when remains available.",
  },
  {
    id: "content-pagination",
    category: "Content Studio & publishing",
    question: "Page 2 shows the same content as page 1.",
    answer:
      "That was a bug and is fixed. Both Content Studio and Publications were requesting the first page regardless of the page you chose, so page 2 onwards repeated page 1. Changing a filter also resets to page 1, so narrowing a list never lands you on an empty page.",
  },

  // ── Image gallery ─────────────────────────────────────────────────────────
  {
    id: "gallery-what",
    category: "Image gallery",
    question: "What is the Image Gallery?",
    answer:
      "A browsable library of the images you can use in content, replacing a flat list. It shows thumbnails, labels, tags, usage and archived state, with filters and a faceted tag browser, and supports bulk editing.",
  },
  {
    id: "gallery-labels",
    category: "Image gallery",
    question: "What are labels and tags, and which should I use?",
    answer:
      "A label says what an image is for — hero, product, poster, team and so on. Tags are free-form keywords for search, and an image can carry any number. Use a label when you want the image to appear in a specific slot, and tags for everything you might search by.",
  },
  {
    id: "gallery-any",
    category: "Image gallery",
    question: "What does it mean when an image has no label?",
    answer:
      "It means it is usable anywhere. An unlabelled image is treated as available for every use, so leaving something unlabelled never hides it from a slot it could fill.",
  },
  {
    id: "gallery-archive",
    category: "Image gallery",
    question: "What does archiving do? Is it the same as deleting?",
    answer:
      "Archiving hides an image from the gallery and from automatic selection while keeping it and its history. Deleting would remove it. Archive when you want something out of the way but recoverable.",
  },
  {
    id: "gallery-ai",
    category: "Image gallery",
    question: "How does AI choose which image to use?",
    answer:
      "It selects from the gallery by label and tags, so labelling and tagging is what makes automatic selection reliable. An image whose AI prompt is recorded can be regenerated or refined; archiving an image removes it from future automatic selections.",
  },
  {
    id: "gallery-duplicates",
    category: "Image gallery",
    question: "I see the same image twice in the gallery.",
    answer:
      "That is a real duplicate that has been uploaded twice. Duplicates are byte-identical, so one can be archived with no loss of coverage — but decide deliberately, because automatic selection may currently be choosing between them. Ask an owner to archive the one you do not want.",
  },

  // ── Money ─────────────────────────────────────────────────────────────────
  {
    id: "invoice-vs-estimate",
    category: "Money: invoices, estimates, payments",
    question: "What is the difference between an estimate and an invoice?",
    answer:
      "An estimate is a quote for work not yet done, and can be accepted or declined. An invoice bills for work that has been done or is due now, and takes payment. An accepted estimate is what an invoice is later created from.",
  },
  {
    id: "estimate-accept",
    category: "Money: invoices, estimates, payments",
    question: "How does an estimate become an invoice?",
    answer:
      "Accept the estimate, then raise the invoice from it. The estimate's lines carry over so the invoice reflects exactly what was quoted.",
  },
  {
    id: "payments",
    category: "Money: invoices, estimates, payments",
    question: "How do I record a payment?",
    answer:
      "Record it against the invoice from the Invoices and Payments screen. Payments are tracked separately from the invoice so the running balance and the money actually received are both visible.",
  },
  {
    id: "deposits",
    category: "Money: invoices, estimates, payments",
    question: "Can I take a deposit before the rest?",
    answer:
      "Yes, by recording a part payment against the invoice. The outstanding balance remains until the invoice is settled in full.",
  },
  {
    id: "currencies",
    category: "Money: invoices, estimates, payments",
    question: "Can I invoice in a currency other than rand?",
    answer:
      "Invoices can carry a currency, and the totals are calculated in that currency. The exchange rate used is recorded on the document so a later change in rates never alters an issued invoice.",
  },
  {
    id: "tax-vat",
    category: "Money: invoices, estimates, payments",
    question: "How is VAT calculated?",
    answer:
      "VAT is applied at the configured rate and itemised on the document, so the VAT portion and the total including VAT are both visible on the invoice and the estimate.",
  },
];

export interface FaqCategorySummary {
  category: FaqCategory;
  count: number;
  /** Anchor id on the page, matching the category heading. */
  anchor: string;
}

export function faqCategorySummaries(): FaqCategorySummary[] {
  return FAQ_CATEGORIES.map((category) => ({
    category,
    count: FAQ_ENTRIES.filter((e) => e.category === category).length,
    anchor: `faq-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  }));
}

/**
 * Search across question and answer. Deliberately simple substring matching on
 * lowercased text: a staff member searching "bounce" or "quiet hours" should find
 * the answer, and a ranking algorithm would only make the right answer harder to
 * find. Matching is on words rather than whole phrases so "daily cap" also
 * matches "send cap".
 */
export function searchFaq(query: string, entries: FaqEntry[] = FAQ_ENTRIES): FaqEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  const terms = q.split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    const haystack = `${entry.question} ${entry.answer} ${entry.category}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
