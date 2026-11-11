# Planner changelog

## v7.35 — 11 Nov 2026 — RPIC signature no longer lost when the CRP picks their name
- **Fix: "can't approve even though both have signed".** Choosing your own name and ARN in the CRP box (or ticking which instruments attach to the PDF) after the RPIC had signed counted as a change to the plan, so the RPIC's signature looked out of date and "Add their signature" offered only to dismiss it. Those are your side of the sign-off, so they no longer affect the RPIC's signature. Signatures made before this update still count.
- A real change to the plan after the RPIC signed still needs them to sign again. The message now **says what changed** (for example "Authorisation details (notams)" or "Operation details (end time)").
- The "plan changed since — send again" note uses the same rule.
- **Clearer when the RPIC signed too early:** the green "signed this plan" box now shows the time they signed, and if they signed before you sent the latest version, the message says so ("They signed at 2:40 pm, before you sent the latest version (3:28 pm)…").
- **Supabase:** nothing to do.
- **Tests:** new suite (7 checks); everything passes.

## v7.34 — 10 Nov 2026 — Beta feedback, sample job for new testers, clear sample data, popular drones
- **Feedback & bugs (beta):** a **Feedback & bugs** button on the beta bar. Testers pick *Something's not working*, *Feature request* or *General feedback* and write a few words. It's emailed to you (subject "Bug report: …", "Feature request: …") and listed in Settings › Enquiries with a label. The app version and device type are added. Nothing from their jobs is sent. Testers can send up to 20 a day.
- **Your business details are gone from the free planner and the beta:** no CASA.OONP.0079, CASA.EVLOS.0346 or CASA.RPAS.1040, no ReOC 9037 or ARNs in the examples, no "Ops Manual V7" or your manual review task, no battery numbers from your own packs, and your name and phone are out of the sample job. Their OONP and EVLOS approvals start blank ("add your instrument number"). Your own signed-in planner is unchanged.
- **New beta testers find the sample job** (Acme Corp, Suncorp Stadium) waiting in their job list, marked SAMPLE.
- **Clear sample data:** the setup wizard shows **Clear sample data** while any is loaded. One tap (after a check) removes the sample job, its aircraft and batteries, and the sample pilots and clients. Their own jobs stay.
- **Popular aircraft and batteries:** the free planner and the beta start with a short list of 8 popular aircraft (Mini 5 Pro, Mini 4 Pro, Air 3S, Mavic 3 Pro, Mavic 4 Pro, Avata 2, Matrice 4E, 5" FPV) instead of the long list. In setup they tap the ones they fly, and **Quick add** makes 4 numbered batteries for each (e.g. MINI5-01 to 04).
- **Supabase:** (1) run `0015_beta_feedback.sql` in the SQL Editor; (2) update the **enquiry-alert** edge function with the new `supabase/functions/enquiry-alert/index.ts` (header says v7.34) and Deploy.
- **Tests:** new suite (25 checks) and 4 new database checks; everything passes.

## v7.33 — 10 Nov 2026 — Beta "set up now or later", landing page and poster
- **Beta sign-up:** after your name and email, the beta asks **Set up now** (opens company setup) or **Set up later** (straight into the planner; set up any time from Database & Settings).
- **"Get it for your company" form** now matches the plans: company accounts launch on 10 January 2027; options are Founding member (launch offer), Monthly and Annual plans (from 10 January 2027), Your own copy (source licence) and Just keep me posted. People not yet in the beta get a "Join the free beta" link.
- **Landing page:** a new "Why it's different" section (built for OONP and EVLOS, made by commercial operators, easy and compliant, solo to multi-crew, pilot hours, logins and registers) and a new headline. The pictures now start with a logged Mini 5 Pro flight (height and speed chart, GPS track) and the kinetic energy grid, then the 3D map.
- **Sample job:** the Mini 5 Pro now has its weight (0.28 kg) in the fleet, so imported flights show their peak impact energy.
- **Expo:** a one-page A4 poster with QR codes (`expo/poster-A4.pdf`), no pricing.
- **Supabase:** nothing new (v7.32's 0014 SQL and the enquiry-alert function, if not done yet).
- **Tests:** checks added for the set-up choice and the form wording; everything passes.

## v7.32 — 9 Nov 2026 — Enquiry emails, cleaner map PDF, landing page pictures
- **Map checks never print:** the advanced ops map's own checks (the yellow "Map checks" box, and the "To fix / To check" column for flight paths) are left out of every PDF, free or signed in. They're still shown to you in the map editor, which now says they're for you only.
- **Enquiries are emailed to you:** each "Get it for your company" enquiry and each beta sign-up is emailed to mike@wakingdreamfpv.com, once, with the person's details. Hit Reply to answer them. They also stay in Settings › Enquiries. If email ever fails, nothing is lost.
- **Sample job:** the Suncorp Stadium map overlay is back (permission confirmed). The ticket-site seating map is still left out.
- **Landing page:** a new "See it in action" section with six real screens from the sample job: the 3D ops map with flight paths, the 2D ops area map, the ballistic impact and energy chart, the kinetic energy limits, the RF band map, and a logged flight with its GPS track (sample data).
- **Supabase:** (1) run `0014_enquiry_emails.sql` in the SQL Editor; (2) create the edge function **enquiry-alert** from `supabase/functions/enquiry-alert/index.ts`, with Verify JWT **OFF**. It uses the RESEND_API_KEY you already have.
- **Tests:** checks added for the email hook-up, the PDF without map checks, the stadium map and the landing page pictures; everything passes.

## v7.31 — 9 Nov 2026 — Sample job: Acme Corp, Suncorp Stadium
- **Three ways to start:** the free planner's welcome now asks "How would you like to start?": **Start a plan from scratch**, **See a sample job** or **Take the 2-minute tour** (camera drone or FPV cinewhoop), with the free beta and "Get it for your company" underneath.
- **The sample job** is Mike's finished stadium concert plan (Acme Corp, Suncorp Stadium, 7 Dec 2026, over people): plan, map with paths and zones, 3D view, risks, approval and flight log, with its two aircraft. It opens as the visitor's own copy to explore, edit, save and export as a PDF. Your own records aren't touched.
  - Also from **See a sample job** on the free dashboard, the landing page, and links ending in **?sample** (e.g. a second QR code).
  - Left out of the public copy: the official Suncorp Stadium seating map overlay and the ticket-site seating map (both belong to others). The operator is a made-up "Sample Drone Co Pty Ltd".
  - It needs internet to open. Without it, the planner says so.
- **Landing page:** a third button, **See a sample job**.
- **Supabase:** nothing to do (0013_enquiries.sql from v7.30 still needs running if it hasn't been).
- **Tests:** new suite for the welcome, the sample job and its links (15 checks); everything else passes.

## v7.30 — 9 Nov 2026 — Free beta until 9 January 2027; "Get it for your company" enquiries
- **Free beta (new):** anyone on the free planner can tap **Free beta: full planner** (purple bar, free welcome box, dashboard, or a link ending in **?beta**). They give their name, email and company (no payment details) and get the full planner on that device until **9 January 2027**: company setup, fleet and batteries, saved jobs and drafts, flight records, templates and the calendar. Their job from the free planner comes with them, and the company setup opens straight away.
  - Their data stays **on their device only** (its own private space, no account, nothing shared). An amber bar shows the days left with **Back up** and **Get it for your company** buttons. PDFs end with "Planned with Dream Flight RPA Planner".
  - Their sign-up lands in your **Enquiries** list (marked "beta-signup"). With no signal, the beta still starts and the sign-up is sent the next time they open the planner.
  - **On 10 January 2027** (paid launch) they're back on the free planner, with a "Thanks for testing" box and a **Download my beta records** button (also on the free bar afterwards), so nobody loses their work.
- **For visitors:** the free planner has an amber **Get it for your company** button on the purple Free mode bar, a link on the free welcome box and one on the dashboard. It opens a short form: name, email, company, phone, what they're interested in (founding member, monthly, annual, buying the whole thing to customise, or just keep me posted), a message, and a tick box saying it's OK to contact them. They get a thank-you, and their job stays on their device.
- **No signal?** If the form can't send (common at venues), it offers to email the details to mike@wakingdreamfpv.com instead, already filled in.
- **For you:** **Database & Settings › Enquiries** lists them, newest first, with tap-to-email and tap-to-call. Mark each one **contacted** or **closed**, and **Download CSV** for a spreadsheet. Only CRP accounts can see enquiries; crew can't. Nothing is ever deleted, and what someone sent can't be changed.
- **Spam limits:** at most 3 enquiries a day from one email address and 200 an hour in total. Long messages are cut to 2,000 characters.
- **Phones:** the purple Free mode bar is tidier: the text has its own line and the duplicate Sign in button is hidden (Sign in is still at the top).
- **Landing page:** **planner.wakingdreamfpv.com/welcome.html** explains the planner, the free version (no sign-up), the free beta (no payment details) and paid plans from 10 January 2027, with buttons straight into each.
- **Supabase:** run **0013_enquiries.sql** (SQL Editor › New query › paste › Run; safe to run twice). It creates the private enquiries list. Until it's run, the form offers the email fallback instead.
- **Tests:** new browser suites for the beta (23 checks) and for the form and the Enquiries list (22 checks); new database test for who can add, read and change enquiries (17 checks); everything else passes.

## v7.29 — 8 Nov 2026 — Visitors go straight into the free planner (ready for the expo QR code); BETA sticker
- **BETA sticker:** a small amber "BETA" tag next to the planner's name at the top of every page, and on the sign-in screen. It isn't printed on PDFs.
- **No sign-in screen for visitors:** anyone who scans the QR code or opens planner.wakingdreamfpv.com without being signed in now lands straight in the free planner, with its short welcome. No account, no sign-in, no choice to make first. Their job stays on their own device only.
- **Signing in is one tap away:** **Sign in** is at the top and on the purple "Free mode" bar. Logins are still by invitation only, so nobody can create an account for themselves.
- **Expired invite links:** a crew member who opens an expired or already-used invite link still gets the full sign-in screen with the "email me a fresh link" box, as before.
- **Free PDFs:** the line at the bottom now reads "Planned with Dream Flight RPA Planner · planner.wakingdreamfpv.com" (no "(free edition)").
- **Fixed:** the ✕ on the free welcome box could be hard to tap because the heading was drawn over it.
- **Supabase:** nothing to do.
- **Tests:** new suite for visitors, sign-in, expired links, the BETA sticker and the free PDF (15 checks); everything else passes.

## v7.28 — 6 Nov 2026 — Your company setup follows you to any device; change your password; 3D zones on the ground
- **Fixed: a new device showing a blank company.** Until now your company setup (company profile, fleet, batteries, crew lists, clients, templates, PDF views, compliance calendar) was kept only on the device you set it up on. Jobs already synced, which is why your iPhone showed the right job but a blank company. Now:
  - Your setup is saved to your account (CRP only; crew can't see it) and any device you sign in on as CRP loads it. A green note says so, and which device it was last saved on.
  - If a device has its own, different setup *and* the account copy has also changed, an amber box asks which one to keep. Nothing is shared with crew until you choose.
  - A blank or not-yet-loaded device never sends anything up. Before this fix, opening the planner on the iPhone could replace the company details your crew see with a blank one. That can't happen now.
- **Set or change your password any time:** Account & crew now has **Set or change password** for everyone, crew and CRP, while signed in. You no longer need a reset email to change it.
- **3D zones sit on the terrain:** on sloping ground each zone's walls now start at the ground along its edge and rise to its height limit above that ground. The zone's floor is painted on the satellite ground. Take-off, E-LZ and caution markers sit on the ground too. Before, they were all at take-off height, floating or buried on a slope.
- **Supabase:** run **0012_crp_store.sql** (SQL Editor › New query › paste › Run). It creates the private place your setup is saved. Until it's run, nothing changes except that a blank device no longer overwrites what crew see.
- **Tests:** new suite for setup sync, password and 3D-on-terrain (27 checks); new database test for the CRP-only setup store (9 checks); everything else passes.

## v7.27 — 6 Nov 2026 — Advanced map follows the ground, cleaner map and 3D satellite; live link on one page; amending approved plans
- **Flight paths follow the ground.** A path's new **Height** setting has two choices:
  - **Follow the ground** (now the default for new paths): set one height, e.g. 3 m, and keep it within 1–5 m. The planner adds a point every 5 m along the path and works out each one's height from free public terrain data, so the drone stays that far above the ground, rising and falling with it. No typing a height for every point. Change the path, the height or a bridge and the heights are worked out again. If the terrain data can't be reached, the path is flown level at that height and the panel says so.
  - **Set each point**: works as before.
  - Existing paths, like your Path A, stay as they were until you choose **Follow the ground**.
- **Bridges:** new zone tool **Bridge / raised surface**. Draw it over a bridge and ground-following paths ride over the deck instead of dipping to the water below. For most bridges the deck runs level from the ground at one end to the other; for a stage, platform or boardwalk, set a height above the ground.
- **Less clutter on the map:** no point numbers or "5 m" labels on every point. Each path gets one green start flag with its name and height ("Path A · 3 m above ground"); the selected path shows small handles to drag. **Show › Path point numbers** brings the numbers back when you want them. The PDF and the side-on profile are cleaned up the same way.
- **3D on satellite:** outdoors, the 3D view's ground is now satellite imagery draped over the real terrain, with your site plan blended on top at its opacity. Paths and the ground share the same take-off height, so the path is seen hugging the ground. It needs the internet; it falls back to the flat view offline.
- **Live link is one continuous page:** every section, one after another. The side menu (or the row of tabs on a phone) now jumps down the page and highlights the section you're reading.
- **Changing an approved plan:**
  - **You (the CRP):** click any field in an approved plan and a **"Change an approved plan?"** pop-up explains that the flight authorisation and the CRP and RPIC signatures are withdrawn and the plan must be re-approved. Give a reason (kept in the record of amendments) and you're editing straight away. An amber reminder shows on each section until it's re-approved.
  - **Pilots and observers on a company job:** they get **"Suggest changes to an approved plan?"**. Their edits go to you as suggestions when they save, with their reason, and your approved plan doesn't change until you accept.
- **Supabase:** nothing to do.
- **Tests:** new suites for the advanced map (14 checks: ground following, bridges, offline fallback, no numbers, PDF flag, 3D satellite on terrain) and amending (16); live-link suite updated for the single page (35); everything else passes.

## v7.25 — 6 Nov 2026 — New risk template: night outdoor event with a mini-lifter and OONP Pathway 2
- **New built-in risk template** under JSA & Risk › Risk assessment register › OONP Operations: **"OONP Pathway 2 — Night outdoor event (mini-lifter away from people + small drones with consent)"**. Written for jobs like the Enchanted Garden: a prop-guarded ~1.5 kg mini-lifter kept in closed or cleared areas and never within 30 m of the public, plus small drones near people under Pathway 2 (≤15 J near the public, up to 34 J with informed consent).
- **16 risks:**
  - The **night OONP hold point** (no flight within 30 m of people at night until CASA's written confirmation on CASA.OONP.0079 Schedule 1.3 is held).
  - The mini-lifter.
  - Small drones near the public and near consenting participants.
  - Unseen obstacles (light strings, wires), low-light FPV and glare.
  - Event RF congestion, GNSS loss under canopy, and the public entering the TOLZ.
  - Slips and trips in the dark, LiPo fire, wildlife, helicopters, weather, fatigue and privacy.
  Each has controls, additional controls and initial / residual ratings on the planner's matrix (all residuals Low).
- Load it as is, or load it and edit, then save it as your own template.
- **Supabase:** nothing to do.
- **Tests:** new template suite (3 checks); everything else passes.

## v7.24 — 6 Nov 2026 — Calc AMSL keeps working when the elevation service is down
- **Fixed: "Could not fetch elevation data … HTTP 503".** Calc AMSL used one free elevation service (Open-Elevation), which goes down from time to time. It now asks **Open-Meteo** first (free, no key, very reliable) and falls back to Open-Elevation, each with an 8-second limit. You only see a message if both are down, and it says so plainly, with the by-hand formula.
- **Supabase:** nothing to do.
- **Tests:** elevation checks added to the airspace suite (8 checks); everything else passes.

## v7.23 — 6 Nov 2026 — Migration 0011 fixed for the live database; clearer airspace check errors
- **Fixed: migration 0011 stopped with "This sign-off is locked".** An early step filled in a new column on every sign-off, and the lock guard (rightly) refused to touch the ones already locked. The script now pauses the guard for just that one step, so it installs on a database that already has locked sign-offs. Nothing about those records changes, and they stay locked. The first failed run changed nothing, so just run the new file.
- **Airspace check (OpenAIP) says what actually went wrong.** A wrong or expired Client ID used to show as "Failed to fetch", because the planner's retry got blocked by the browser. It now says "OpenAIP refused the Client ID" with where to copy it from. If OpenAIP can't be reached at all, it says so and suggests what to try (a blocker, VPN or work Wi-Fi, a private window, or a few minutes' wait).
- **Supabase:** run the new `0011_locked_copies_versions.sql` (first line says v7.23). No edge function changes.
- **Tests:** database suite now installs 0011 over existing locked sign-offs (44 checks); new airspace-error suite (4); everything else passes.

## v7.22 — 6 Nov 2026 — Smoother crew invites, admin password resets, crew edits become suggestions, mandatory box at the bottom
- **Mandatory items box moved to the bottom of each section,** just above Back / Next. Working down a page you only meet it at the end; the sidebar still shows how many are left in each section.
- **Fixed: invite link "flashing" and losing the password step.** After a first sign-in the planner reloads once to open the person's own space, and that reload dropped the invite details, so there was no password step and some people ended up at the sign-in screen. The details are now kept for that tab, so the welcome still offers the password after the reload.
- **Expired or used links explain themselves.** Invite and sign-in links work once, for about an hour, and some email apps open links to check them first, which uses them up. Arriving from one now shows "That link has expired or was already used" with a box to email yourself a fresh sign-in link. The normal sign-in screen also has "Invite link not working? Email me a sign-in link".
- **One welcome card for new crew.** It names the company and who invited them ("Michael Rubio has invited you to fly with Waking Dream FPV as an observer"), includes an optional password (no separate pop-up), and then shows the next step. Observers see their EVLOS sign-off status: current until a date, or "not done yet" with what happens on site. The welcome is remembered on their account, so a new phone doesn't show it again. The CRP's own invite, and password resets, still use the plain password form.
- **Admin: Reset password and Sign-in link for anyone.** In Crew & users, each login has **Reset password** (emails them a link to choose a new one; their old password works until they do) and **Sign-in link** (a one-tap link, for expired invites or lockouts). You never see or set their password.
- **Crew changes to a company plan become suggestions.** When a pilot or observer edits a company job's plan and saves, they're told that only the CRP can change the plan and asked to send their changes as suggestions. Each changed field becomes a suggestion (location, task overview, JSA fields, NOTAMs, risk fields, new risks); anything that can't be applied automatically (map, contacts and so on) is listed in one note. You get an email listing the changes, and its button opens the job straight to Comments, where you accept or decline each one. Their copy goes back to your version until you accept. Their flight log still goes to you as before. New email setting: "Crew suggest changes to a plan".
- **Supabase:** redeploy the `notify` edge function (header says v7.22). No SQL changes.
- **Tests:** new onboarding and suggestions suite (40 checks); all earlier suites pass.

## v7.21 — 5 Nov 2026 — Locked copies, fingerprints and corrections as versions (Chunk 5 complete)
- **A copy is kept the moment a record locks:** when a pilot induction or EVLOS observer sign-off is certified (or recorded as not yet competent, or imported), the database keeps the record exactly as signed, plus a **fingerprint** (a SHA-256 hash) of it. Your planner also makes a printable **signed copy** (prints to PDF) from that kept data, with its own fingerprint. Sign-offs locked before this update get their copy when you install it, marked as such.
- **Approved job plans too:** each time you approve a plan and save it to the cloud, the database keeps the plan as stored plus the full standard PDF, both fingerprinted. Saving again without re-approving adds nothing. Re-approving after an amendment keeps **version 2**, with the amendment reason ("Re-approved after an amendment: launch site moved west"). The panel is in Authorisation under the approve switch; crew on the job can see and verify it too.
- **Nobody can change or delete a kept copy,** not even you. The database refuses it, and there are no edit or delete permissions on copies at all.
- **Verify:** each version has a **Verify** button. It works out the fingerprints again from what's stored and shows "Verified: unchanged since it was kept" or a red warning if anything has been altered. **Signed copy** opens the kept copy to read or print.
- **Corrections are new versions:** on a locked induction (crew review) or observer sign-off (the job's observer panel › lock button), **Correct…** lists the record's fields. Change what's wrong, say why (required), and save as version 2. Version 1 stays exactly as signed, with its copy and fingerprint. Signatures carry over, and a corrected CRP check date moves the certification and its due date. Registers, the observer register and the crew list show the latest version; the old one says "corrected — open the latest version".
- **Audit pack:** each sign-off shows its version and any correction reason, and a new table lists every kept copy with both fingerprints.
- **Supabase:** run `0011_locked_copies_versions.sql`. No edge function changes.
- **Tests:** database suite (42 checks: copy on lock, fingerprints, no edit or delete even for the database owner, Verify catches tampering, corrections and certifications, who can see what, job versions, observer register); browser suite (21 checks); all earlier suites pass, and the induction, observer and import suites also pass with 0011 loaded.

## v7.20 — 5 Nov 2026 — Live link laid out like the planner; KE for clients; choose what they see
- **Laid out like the planner:** the live link now has the planner's side menu (**Preliminary**, **JSA & Risk**, **Authorisation**, **Flight Log**), with the same icons and highlight. Each tab shows one section card with the planner's grey header bar ("Section 2: Job Safety Assessment (JSA)"), and the headings inside use the planner's style, with a Comment button beside each one. On a phone the menu becomes a row of tabs across the top.
- **Risk register as in the planner:** the same table, with Ref, Date added, Hazard, Risk description, Existing controls, Initial risk (L, C, rating), Additional controls, Residual risk (L, C, rating) and Risk owner. Each L and C shows its meaning (e.g. "4 Occasional", "B Hazardous"), and the ratings use the planner's colours.
- **Energy transfer (KE) is its own section** in the PDF views and the live link. It is on in **Client view** and **WHS inspector**, so clients now see the KE tool and the ballistic splash area. Before, it was tied to the OONP section, which Client view leaves out. It shows on any job with OONP, a KE chart, extra KE charts or the ballistic splash turned on. Your own saved PDF views include it automatically; untick it in Database & Settings › PDF views if you don't want it.
- **Choose what they see when sharing:** Share › **Choose what they see** lists every part of the plan with ticks. It starts from the view's defaults (Client view for a client, WHS inspector for crew/VO). Change any tick for this link only; "Back to Client view" resets it. The link remembers your picks each time it refreshes, and the link list shows it as "Client view (edited)".
- **Supabase:** nothing to do.
- **Tests:** live-link suite now 33 checks (tabs, planner table, KE in Client view, section picker); PDF views, collab, smoke and all 10 database suites pass.

## v7.19 — 5 Nov 2026 — Live link looks like the app, with the 3D map and the KE tool
- **The live link is now a simplified version of the planner itself**, not a PDF copy: the same cards, colours and type as the app, with section chips at the top to jump around, and it works on a phone.
- **Same sections as the PDF view you share:** whatever a view strips out of the PDF (e.g. Client view drops internal checklists, JSA detail, logs and crew records) is stripped out of the live link too.
- **Maps they can move:** the 2D ops area map pans and zooms, and the **3D ops map** can be opened and rotated (it loads on tap so the page opens fast).
- **Energy transfer (KE) tool:** each RPA shows its 15 J and 34 J hover heights and ground-impact speeds, a height/speed table of limits, and sliders to try a height and ground speed and see the impact energy and its band (under 15 J, 15–34 J informed consent, over 34 J). Same calculation as the planner's KE chart.
- **Ballistic splash:** fall height, speed at failure, fall time, throw distance and impact energy.
- Comments, suggested edits and observer signatures work as in v7.18; each section card has its own 💬 Comment button with a count.
- **Existing links** switch to the new look the next time you save the job; until then they show the PDF copy as before.
- **Supabase:** nothing to do.
- **Tests:** new live-view suite (20 checks); collab (38), smoke (12), PDF views (16) and all 10 database suites pass.

## v7.18 — 5 Nov 2026 — Live plan links, comments, suggested edits, short observer signatures
- **Share a live link** (job bar › **Share**, CRP): make a link for a **client** or for **crew / VO**, pick what they see (any PDF view, e.g. Client view), how long it works, and optionally email it. They open the plan in their browser with no login. It's the plan as that view, and it refreshes each time you save the job. Stop a link at any time; the panel lists every link for the job.
- **Comments on each section:** the live link has a 💬 button on every section of the plan. Clients' comments are private between them and you; crew links see each other's comments. Crew with a login comment from the job bar's **Comments** button or the 💬 chips on Sections 1–4 and the risk register.
- **Suggested edits:** the RPIC, observers and crew links can suggest a change: a field (operation name, location, date, times, task, max height, airspace, hazards, NOTAMs…), a change to a risk, a new risk, or a described change. You see each as "Max height → 150 (now 200)" and **Accept & apply** (the plan changes; save to keep it, and the RPIC re-signs if they had signed) or **Decline** with a note. Nothing changes until you accept. An approved, locked plan has to be amended first.
- **Awaiting action** on Home lists open comments and suggestions per job; **Review** opens the job and its comments. The job bar shows the open count.
- **Comments in the PDF:** a new "Comments & suggested edits" section you can tick in any PDF view (on in My record, WHS inspector and CASA; off in Client view). The standard Export PDF is unchanged.
- **Observers sign each job with one tick:** on their job link, an observer enters their name and mobile first. If they're already trained (a current EVLOS observer sign-off), they just tick "I have been briefed for this job, I am fit for duty, and I will follow the Remote Pilot's lawful directions" and sign. Anyone not yet trained does the full EVLOS observer sign-off as before. Logged-in observers get the same short **Sign for this job** button.
- **Post-flight sign (optional):** the same link (or button) lets the observer sign after the flight ("conducted as briefed, any incident reported"), with a note.
- **Observer signatures on the plan:** they show under the RPIC's signature (Authorisation) and at the top of the Post-Flight Log, and print in the PDF in the same places.
- **Supabase:** run `0010_comments_links_briefs.sql`; redeploy **notify** (the live-link email).
- **Tests:** database suite (35 checks: link tokens hashed, clients only see their own thread, crew can't accept, only the job's crew comment, short sign needs a current certification); browser suite (38 checks); smoke and PDF-views suites pass.

## v7.17 — 5 Nov 2026 — PDF views, crew map fix
- **PDF views:** **Export PDF** is unchanged (the full standard PDF). The new arrow beside it opens **PDF views**: **Client view** (plan, maps, risks and sign-off; no internal checklists, JSA detail, logs or crew records), **My record** (everything), **WHS inspector** (JSA, risks, OONP, emergency contacts, sign-off and the post-flight log) and **CASA** (the full operational record). The PDF names the view at the top.
- **Pick for one print:** the sliders button on a view (or "Pick sections for this print…") ticks sections on or off for this PDF only, from 17 sections: overview, sites, preliminary checklist, ops area map, advanced ops map, JSA, emergency contacts, RF, OONP, risks, approval & signatures, post-flight log, amendments, flight log, attachments, CASA instruments, crowd density map.
- **Edit the views** in Database & Settings › PDF views: rename, change sections, copy, delete, add your own, "Try it", or reset to the standard four. Saved with your company settings and shared with your crew.
- **Fixed:** for crew (pilots and observers) the job's map opened zoomed out to the whole world. It now zooms to the ops area and pins.
- **Version headers:** every Supabase SQL and function file starts with the planner version and where to paste it.
- **Supabase:** nothing to do.
- **Tests:** the browser test suites now live in the repo (tests/e2e). New suites: smoke (12 checks) and PDF views + crew map (16); database suites (9) pass. The older browser suites were lost in a workspace reset and are being rebuilt in the repo.

## v7.16 — 5 Nov 2026 — RPIC signs by logging in
- **Email the RPIC to sign** (Authorisation › Remote Pilot in Command, CRP): one button saves the job as a draft, puts it in the cloud with the RPIC on it, and emails them a "Log in and sign" link. The RPIC box shows "Emailed to … (date)". If the RPIC has no login yet, the planner says so and offers the sign-off file instead (still there as "No login? Send a sign-off file").
- **Waiting for your signature** on the RPIC's Home: every job where they're RPIC and haven't signed (or were asked again after the plan changed), with **Review & sign**. My jobs shows **Sign**, or "Signed · with the CRP" once they have.
- **The sign screen** (RPIC): the job at a glance (date, location, RPA, operation, max height, risks, whether NOTAMs are recorded), shortcuts to the plan & map, JSA & risks and NOTAMs, then sign one of three ways: **Click to sign** (a digital signature recorded against their login), **Type my name**, or **Draw** (finger or mouse). They tick the RPIC declaration and can leave comments for the CRP. Works on a phone. The email link opens straight onto it.
- The signature goes to the job in the cloud straight away, tied to that plan version; the CRP is emailed and sees it in Awaiting action, and it's added when the CRP opens the job (refused if the plan has changed since).
- **The CRP signs the same way** (click, typed or drawn; the method is remembered on the device).
- **Signatures on screen and in the PDF:** each block shows the drawn or typed signature (or "Digital signature"), when, the plan version, the declaration and any comments.
- Email notifications: crew can turn off "The CRP asks you to sign a job as RPIC".
- **Supabase:** redeploy **notify** (new "sign request" email). No database changes.
- Tests: new suite (31 checks); signing suites updated; full regression passes (88 app suites, 9 database suites, digest and backup functions).

## v7.15 — 4 Nov 2026 — Records: Google Forms import, audit packs, retention, backups (Chunk 9) + CSV imports
- **Import the Google Forms registers** (Registers & currency › Import Google Forms, CRP): pick the CSV downloads of both tabs of the Pilot Register and the Observer Register F15 at once. The planner recognises each file, matches Part 1 (pilot / observer) to Part 2 (CRP) by name, and shows each person before anything is saved: who signed and when, your CRP notes, the check date (editable, with the due date it gives and "already expired" in red), the competencies ticked, and for pilots every aircraft with its hours read from the free-text list ("pavo 20 - 40", "Neo2 40", "3.5 20") and matched to your fleet (change or leave out any of them).
- Each imported row becomes a **locked sign-off** marked "Imported from Google Forms", with the typed signatures and the original form times; certifications are created from the check date (due 12 months later). People are matched by email or name; their existing details are kept and only empty ones filled in (ARN, RePL, phone, address, next of kin, total hours), and hours per type go into their experience. A row without the CRP part (e.g. Matthew Ryan) is imported as waiting for you to certify. Importing the same rows again does nothing.
- **Audit pack (PDF) per person:** "Audit pack" beside each name in the registers: details, currency, every check on record, each sign-off with its answers and both signatures, hours on type, time logged with the company, the flights counted for currency, Operations Manual reads and jobs. Print, or Save as PDF.
- **Registers Print / PDF** prints the table as filtered (tab, only due / expired, search).
- **Records retention:** the registers list anyone last engaged more than 7 years ago (latest check or flight). Nothing is ever deleted automatically. "Date last engaged" now moves forward with each counted flight too.
- **Daily cloud backup:** every night the people, registers, sign-offs, jobs, flights and settings are saved to a private backup (only the CRP can read it), and emailed to you as a file **daily, weekly (Mondays) or not at all** (Email notifications › Cloud backups; default weekly). **Download a cloud backup now** gives you the same file any time.
- **OONP 10 hours on type** now counts hours on record (from the induction or the imported register) as well as time logged in the planner.
- **Risk assessment CSV** in the job's Risk Assessment Register: **Import CSV** (replace the job's risks, or add them to the end), **Export CSV**, and a **CSV template**. Likelihood 1–5 and consequence A–E (or words like "Major").
- **Battery CSV** (Settings › Batteries, and the Import batteries from CSV section): Battery, Aircraft, Prior cycles, Cycle limit, Retired; adds new packs, updates existing ones, links them to the aircraft. Still reads the older two-column layout (RPA Name, Battery Name) and asset-register exports. **Fleet CSV** (Settings › RPAS fleet): Aircraft, Weight, Cells, CASA registration, Registration expiry (dd/mm/yyyy), Serial, Prior flight minutes. Blank cells leave what's there. Both have a template.
- **Supabase:** run `0009_records_import_backup.sql`; create the **backup** edge function (Verify JWT **off**).
- Tests: database suite (20 checks), backup function (9), app suite (34); full regression passes (82 hosted + 47 offline app suites, 9 database suites, digest and backup functions).

## v7.14 — 4 Nov 2026 — CRP bypass for crew records
- **CRP: bypass crew records** in the Approved for Flight box: when crew currency items are holding up approval (because the records live outside the planner), the CRP presses the button, gets the crew items pre-ticked, writes why (e.g. "inducted and checked on paper; to be entered") and ticks a CRP declaration. The items show as "Overridden by …" with the reason, and the reason is kept in the plan's record.
- Only the CRP's account can bypass crew records, and a bypass doesn't void the RPIC's signature (it's admin, not part of what the RPIC signs).
- **The CRP isn't asked for their own induction** (on jobs and in the email digest).
- **Supabase:** redeploy **digest** (CRP not listed for an induction).
- Tests: crew currency suite (24 checks) and signing / crew suites pass.

## v7.13 — 4 Nov 2026 — More than one VO / support person
- **Several people per field:** Section 1 "Visual Observer / Support", the JSA's Visual Observer (VO), Remote Observer (BVLOS) and Night VO, and the Flight Record's Observer / Crew now take as many people as you need. Each person shows as a chip with × to remove; pick from your saved list or type a name and press Enter to add the next one. The same person isn't added twice.
- Stored the same way as before ("Name A, Name B"), so the PDF, crew currency checks, observer sign-offs, the VO auto-fill from Section 1 and older plans all work unchanged.
- Tests: new suite (10 checks); crew, observer, currency and settings suites pass.

## v7.12 — 4 Nov 2026 — Advanced ops map: drawn flight paths, easier overlay sizing, m/s and kph
- **Draw a flight path:** the Flight path tool now draws freehand: press and drag (mouse, finger or pen). When you let go, the line is smoothed and thinned to a clean path. The map doesn't pan while drawing. **Smoothing** Off / Light / Medium / Strong. It starts on the ground at the start point; drawn back to where it started, it lands there (0 m); points in between at 5 m (change them in the list or drag them on the profile). **Click points** is still there for exact paths.
- On a path: **Smooth** rounds off its corners (heights smoothed with it), **Fewer points** thins it, **Draw more from the end** carries it on.
- **Plan overlay sizing without numbers:** drag any **corner** to resize it (keeps its shape), drag the **round knob** above the top edge to turn it, plus **Size** and **Turn** sliders and ±1% / ±1° nudges. Exact numbers are tucked under "Exact numbers". A new overlay is sized to fit on screen, corners included, and the legend no longer gets in the way of the handles.
- **Speeds in m/s or kph:** every speed box (zone limits, clear-of-people max speed, path speed) has an **m/s | kph** switch (remembered on this device). Speeds are saved in m/s and shown in both everywhere: limit chips, the applied limit, zone labels on the map, checks, the profile, 3D labels and the PDF.
- **Event Logistics & Key Personnel** (OONP): press **Edit fields** to rename any field, switch it off (eye), delete it, add your own (name + phone, or text), and move fields up / down. **Use for new jobs** makes it your default; **Reset to default** on a job. Values you'd already filled in stay put, and a filled-in field never disappears from an older job. The PDF prints the job's own fields (hidden ones left out).
- **Views for the plan and the PDF:** frame the 2D map, or turn the 3D view to the angle you want, and press **Add this view to the plan** (up to 8). Each view gets a title; **Show**, **Retake**, reorder or remove them. In the PDF, 2D views are redrawn sharp at that framing and 3D views print as the picture taken.
- **Zone heights and speeds filled in for you:** a new over-people or near-people zone (and any zone still without a limit when the map opens) gets its height and speed from the drone's 15 / 34 J energy table: the job's planned height if it fits under the limit, with the top speed allowed there. A pop-up note and a **Pilot to review** box ask the pilot to check it; **I've reviewed it** records who. Changing the drone or 15 / 34 J refills it until the pilot picks a limit. The PDF zone table says "from the 34 J table, reviewed by …".
- **Acknowledge map checks:** each check can be acknowledged with a note (a note is required for a "Fix"); acknowledged checks drop out of the count and show the note. **In the PDF:** all checks, only open ones, or leave them out.
- **Back** button (and Esc) to get from a selected zone, path, marker or overlay back to the checks and the list. The coloured dots beside path points are explained (the leg to the next point: clear / check / fix).
- **RF: DJI O4 channels:** O4 video items have a **Channels** switch: **Stock** (what DJI's manual lists: one channel at 40 / 60 MHz, CH1–3 at 20 / 10 MHz) or **FCC mode** (CH1–3 at 40 and 60 MHz, 7 channels at 20 MHz). In the planner, a channel whose range goes outside the 5.8 GHz class-licence band is flagged in yellow to check.
- **RF in the PDF:** the Australian class-licence (LIPD) band is now a planner-only aid (shaded in the planner chart, not printed anywhere in the PDF). Overlaps are yellow "look at this" warnings, not red. **Agreements** print big and bold in a green **RF plan agreed** box (and the box turns green in the planner) once there's text in it.
- Tests: new suites (21 + 8 + 8 + 13 + 12 checks); full regression passes (85 app suites, 8 database suites, digest function).
## v7.11 — 4 Nov 2026 (shipped with v7.12) — Crew currency on jobs, registers, compliance email digest (Chunks 7 & 8)
- **Crew currency for each job** (Authorisation, CRP): everyone named on the job (RPIC, pilots, EVLOS observers) is checked against what this job needs: induction, the aircraft type, EVLOS (RPIC), OONP (with 10+ hours logged on type), night, and EVLOS observer. Each shows Current / Due soon / Expired / Not certified / Not in the crew list, with the due date. Anything not current is added to the job's requirements, so the job can't be authorised until it's sorted, or the CRP overrides it with a reason (only the CRP can override these; the reason is kept in the plan's record).
- **Currency rules (Ops manual):** a check is good for 12 months, or up to 24 months while the person flies at least 3 flights of that kind in each 12-month period. Applies to type, EVLOS, OONP and night. Induction and EVLOS observer use their certified due date.
- **Flights count automatically:** completed jobs send each flight (the pilot who flew, the aircraft type, and EVLOS / OONP / night from the JSA) to the cloud once, so currency updates itself.
- **Registers & currency** (Database & Settings, CRP): induction, type, EVLOS, OONP, night and EVLOS observers in one table, with counts (current / due within 60 days / expired), flights in year one and the last 12 months, logged hours, "extended by recent flights", search, "only due / expired", CSV, and **Record a check** (due again in 12 months).
- **Flight Record observer / crew:** fills from the job's observers and support crew (or one click when a saved job is opened).
- **Email notifications** (Database & Settings, everyone with a login): a **compliance digest weekly, fortnightly or off**, on the day you pick (CRP default weekly, crew fortnightly), sent only when there's something to look at. CRP digest: crew certifications expired or due within 60 days, crew not current for jobs in the next 4 weeks, sign-offs and access requests waiting, the compliance calendar (overdue or due within 30 days), and setup still to do (company details, ReOC / insurance dates, aircraft weights, OpenAIP key, Ops Manual upload, pilots without an induction, observers not yet trained). Crew digest: their own certifications and upcoming jobs. Plus an **expiry alert** 7 days before something expires (on/off), and switches for the other emails (RPIC signed, induction, log requests). **Preview my digest** and **Email it to me now**.
- **Supabase:** run `0008_currency_registers_digest.sql` (currency, registers, record a check, flight counts, email settings, and a daily 07:30 run of the digest); create the **digest** edge function (Verify JWT **off**); redeploy **notify** (respects the email switches).
- Tests: database suite (19 checks: 12 / 24-month rule incl. the edge cases, crew see only their own, CRP-only checks and flight counts, email settings), digest function (10 checks: CRP and pilot content, weekly / fortnightly, off, 7-day alerts, never twice), app suite (20 checks); full regression passes.
## v7.10 — 4 Nov 2026 — Airspace class lookup for the whole job
- **Airspace class for this job:** Fetch Live (JSA › Airspace) now checks every point we know for the job: ops area corners and centre, launch / recovery sites, and the advanced ops map's zones, paths and markers. It answers in one line ("Class G", "Class C", or "Class D and G" when part of the area is inside a control zone), at your planned height: an airspace counts when its floor is at or below your max height (AGL floors against the AGL height; AMSL / FL floors against the SUA max altitude, or the AGL height if the ground height isn't set).
- Lists the controlled airspace you're in (and which points it covers when it's only part of the area), **restricted / danger / prohibited areas in red**, and the controlled airspace **above** you with its floor ("Class C SYDNEY CTA from 1,500 ft: keep below it").
- **Use Class X in the JSA** puts the class straight into the Airspace Class field (one of your usual options, e.g. "Class D (ATC Auth)"), with the details and date in the source line that prints in the PDF. **Add to JSA** also fills aerodromes and radio.
- Quick checks against official sources: OK2FLY, the Airservices AIP (Designated Airspace Handbook, ERSA), your VTC / VNC or EFB.
- **One key for the company:** the CRP's OpenAIP key is shared (when signed in) with crew and the CRP's other devices; nobody else has to set it up. The key is now sent the way OpenAIP currently expects (apiKey), with the old header as a fallback.
- **Advanced ops map** draws controlled airspace (blue dashed) and restricted / danger areas (magenta dashed) with their limits; hide them with **Airspace (openAIP)**.
- Data © openAIP (CC BY-NC 4.0, community data): always confirm against official sources and NOTAMs.
- Tests: airspace suite updated (20 checks), new suite (9 checks); full regression passes (79 app suites, 7 database suites).
## v7.9 — 4 Nov 2026 — Advanced ops map
- **Advanced ops map** (Section 1 › **Advanced ops map**): a full-screen editor for multi-zone jobs. Start **Outdoor** (satellite map at the job) or **Indoor / floor plan** (no GPS: the venue plan set to scale).
- **Zones** (shape or circle): **Exclusion** (red, the only red), **Over people – direct** (green, or blue in the side panel), **Near people** (amber, dashed), **Clear of people** (lavender). Drag corners, drag a midpoint to add one, right-click a corner to delete.
- **Limits per drone:** pick the drone and **≤15 J (no consent)** or **≤34 J (consent)**. Ready-made height/speed limits come from the drone's weight (same physics and drag setting as the KE chart). Type a height and speed and **Add**: it becomes a limit you can tap, saved against that drone for every job. Each shows its impact energy; over the limit it turns red and can't be applied. Edit or remove any of them.
- **Buffers:** exclusion zones get a 30 m buffer drawn around them. Change it, or tick **Shielded** (roof, netting, barrier) for a smaller buffer and say what shields it.
- **Ground level per zone** (raised stage, stands, hills): heights in that zone are measured from its own ground.
- **Flight paths** with a height at every point and a speed. Each leg is checked against every zone it crosses: inside an exclusion, inside the buffer, above the zone's ceiling, over its speed, over the drone's 15 / 34 J at that height and speed, or outside the planned zones. Legs show black (clear), dashed amber (check) or red (fix), with the reasons in **Checks**.
- **Side-on profile** under the map: the path's heights against distance, the ground and each zone's ceiling. Drag a point up or down to change its height.
- **Points & notes:** take-off / landing (TLZ, sized in metres), emergency landing (E-LZ), **Caution !** and text notes, with the text shown on the map.
- **Plan overlay:** add a venue PDF (any page) or image. Drag to move, turn and resize with the handles, **Set scale** from a distance you know, opacity, lock.
- **3D view:** zones rise to their ceilings, exclusion zones as red walls, paths at their heights, the floor plan as the ground. Drag to turn, right-drag to pan, scroll or pinch to zoom.
- Undo (Ctrl+Z), measure, show / hide layers, print. Works on a tablet (Tools and Details open as drawers).
- **Saved with the job** and part of what the RPIC and CRP sign (older plans keep their signatures). The PDF gets an **Advanced Operations Map** page with the zones, paths and notes, plus tables of zone limits, buffers, paths and the checks.
- **Observers** see the zones (with limits), buffers, path, E-LZ and cautions on their job link and in the job for logged-in crew. The floor-plan picture isn't sent to their phone.
- **Supabase:** run `0007_opsmap_observer.sql` (adds the ops map to the observer's job link).
- Tests: new suites (36 + 4 + 5 checks), database suite (6 checks); full regression passes (78 app suites, 7 database suites).
## v7.8 — 4 Nov 2026 — EVLOS observer register, job links for crew without a login, protected Ops Manual
Two separate things, as asked:
- **EVLOS training register (replaces the Google Form):** Database & Settings › **EVLOS observers** lists everyone trained and assessed: name, phone, email, status (current / due soon / expired / waiting for you), how they signed (link, your device, logged in), job or training session, signed and certified dates, next due, assessor, callsign and the manual version they read. Search, **Export CSV**, and **Countersign** waiting entries. **Train & assess on this device** and **Training link / QR** work without a job (training sessions). Certifying creates the 12-month EVLOS observer certification.
- **Read-only Operations Manual:** upload the PDF once in Database & Settings › **Operations Manual** (CRP), with its version number and the short observer briefing extract. Crew and observers read it in a viewer with a watermark (name · date · CONFIDENTIAL), no download or print. Every open and every page read (with time on page) is logged; the read report is on the same screen. Observers must tick that they read the manual before they can sign; the manual version goes on their record.
- **VO access to the job:** crew you name on a job either log in and see it in My jobs, or get a **job link** with no login (QR, copy, SMS or **email** from the planner). The link page now carries the job pack: summary, map (area, zones, launch / recovery sites), full hazards with controls, emergency contacts, operation types, the briefing extract and the manual. It never shows the client.
- **VO auto-filled:** when Visual Observer (VO) is ticked in Operation Types, the VO field fills from Section 1's support personnel (until you change it, and not after signing).
- **Supabase:** run `0006_evlos_register_manual.sql`; create the `manual-link` edge function (Verify JWT **off**); redeploy `notify` (adds the job / training link email).
- Tests: database suite (18 checks: training links, register CRP-only, manual log by link, no client data); app suites (23 + 4 checks); full regression passes (75 suites).

## v7.7 — 4 Nov 2026 — Chunk 4: EVLOS observer sign-off
Three ways for an observer to sign, all ending with your countersignature:
- **QR / link on their own phone (no login):** on an EVLOS job's Authorisation tab, **QR for their phone** makes a one-time link (7 days, up to 5 observers on that job). It opens a simple page: your company and the job, "Your job in one minute" (watch the drone only, call hazards, "Area clear", "Land now"), the job summary (date, location, RPIC, aircraft, max height, operation types, hazards with controls, emergency contacts), their name and mobile, one declaration tick (with the full item list) and a finger or typed signature. No sign-in screen; it never shows the client. With no signal it keeps their entry on the phone and sends when it can.
- **On your device (works offline):** **Sign off on this device**: hand them the tablet or phone for their part, they tap "Done: hand back to the CRP", then you tick your checks (eyesight sighted, won't operate the radio, practical demonstrated, EVLOS brief / callsign / comms check), add callsign or notes, choose Certified or Not yet competent and sign. Saved on the device and uploaded when online (and once the job is saved to the cloud).
- **Logged-in observer on the job:** they open the job from My jobs with full access to the plan, map, JSA and risk register to review it before the job. A bar on Authorisation and the Flight Log says "You're an observer on this job"; **Sign as observer** requires them to confirm they reviewed the plan and risk assessment, then the declaration and signature.
- **Countersign:** waiting sign-offs show in the job's observer panel and in **Awaiting action** on Home ("<name> signed as EVLOS observer"). Countersigning locks the record and creates an **EVLOS observer** certification due again in 12 months (shown in the crew profile).
- Observers named in the JSA's EVLOS / BVLOS / night observer fields are now counted as crew on the job.
- **Supabase:** run migration `0005_chunk4_evlos_observer.sql` (one-time links, the sign-off functions and the observer certification).
- Tests: database security suite (33 checks: links hashed and limited, no client data, crew can't certify, locked after countersign); app suite (29 checks: phone link, offline device queue, countersign, logged-in observer); full regression passes (73 suites).

## v7.6 — 3 Nov 2026 — Flight video replay
- **Link videos:** in Section 4, **Link videos** (per aircraft) takes the DJI goggle / air unit recordings (.LRF or .MP4) from a job and matches each to its flight by start time (from the video's own metadata, else the file name; camera-local vs radio-UTC time zones are handled). Unmatched files are listed. Each flight also has **Link video** to attach one by hand, and Unlink.
- Videos are **linked, not copied**: the plan keeps the name, size, length and sync. In Chrome/Edge the planner remembers where the file is; elsewhere (or if it moved) it asks you to find it and checks it's the same size.
- **Replay:** the video plays with the telemetry burned in as an OSD (height, speed, distance from home, V/cell, link, sats, KE coloured against 15 / 34 J, clock), a satellite map following the aircraft, live readouts, and an altitude/speed chart you can click to jump. The shaded band shows where the video sits in the flight.
- **Sync:** nudge ±0.1 s / ±1 s and **Save sync** (stored with the flight).
- **Telemetry flags** appear on the replay chart and as chips; tap one to watch from 2 s before it.
- **Export video with telemetry:** records the video side by side with a telemetry panel (company, title, readouts, track, chart) to an MP4 (or WebM) download. It records in real time, so keep the tab in front.
- Works for flights without telemetry too (video only). Tested with your real DJI .LRF: start time and length read correctly.
- Tests: new replay suites (14 + 4 checks); full regression passes (72 suites).

## v7.5.7 — 3 Nov 2026 — Crew profiles; ask crew to fill in the post-flight log
- **Crew profile page:** in Crew & users, click a person's name to see their details (ARN, RePL, phone, next of kin, declared hours), induction status and certifications (with due dates), logged time with you by aircraft type, **every job they're on** (role, date, status, with Open), and their access to company areas (Grant / Decline / Revoke).
- **Ask crew to fill in the log:** Section 4 has **Ask crew to fill in the log** for the CRP. Pick the RPIC / observers on the job (people with logins), add a note, and they get an email with **Open the flight log**, which opens that job on Section 4 for them.
- **Crew send post-flight answers too:** besides flights, a pilot's answers (weather, on-site validation initials, conducted as planned, serviceable at end, defects, crew names, comments, pre-flight checklist) go to you with **Send my log to the CRP**. Awaiting action shows "… post-flight answers from <pilot>"; **Add to log** merges them into Section 4 for you to check and save.
- The job must be saved (so it's in the cloud) before you send the request.
- **Supabase:** redeploy `notify` (adds the log-request email).
- Tests: new suite (22 checks); crew, signing, settings and account suites pass.

## v7.5.6 — 3 Nov 2026 — Company jobs open from the cloud on any device
- A job that isn't saved on the device you're using now opens from the cloud: pilot signatures and crew flights no longer stop with "isn't saved on this device". Save it afterwards to keep a copy on that device (telemetry traces and site attachments stay on the device the job was made on).
- Home's Saved drafts lists company jobs in the cloud that aren't on this device ("in the cloud"), with Open.
- If a pilot signs more than once, Awaiting action shows only their newest signature; adding it clears the older ones.
- Fixed: a plan opened on two devices could fingerprint differently (the CRP emergency contact default), so a valid pilot signature looked like an older version.
- Tests: new suite (8 checks); full regression passes (69 suites).

## v7.5.5 — 3 Nov 2026 — RPIC declaration to bypass mandatory items; company name for crew
- **Bypass a mandatory item:** each section's "mandatory items" box has **Can't record an item? RPIC declaration to bypass it**. Pick the item(s), write why it isn't needed or how it's covered (a sentence at least), and tick the declaration ("I, <RPIC>, as Remote Pilot in Command, declare…"). The item stops counting as outstanding (so the job can be approved) and shows in amber with the reason and who declared it, with Undo.
- Only the RPIC named on the job or the CRP can do this when signed in (others see a lock note); offline, whoever uses the planner.
- The PDF prints **Mandatory items bypassed by RPIC declaration** in Section 3 with each item, reason, name and time. The declaration is part of the signed plan, so an RPIC signature made before it needs re-signing.
- **Crew header:** pilots and observers see your company name (and ReOC) at the top instead of "Dream Planner RPA"; the app name shows only when no company is set up.
- Tests: new bypass suite (12 checks); crew-settings suite now 19; signing, crew and settings suites pass.

## v7.5.4 — 3 Nov 2026 — Crew settings locked down
- For a signed-in pilot or observer, **Database & Settings** now shows only: their drafts, approved plans and completed records, import and recovery copies, their account (Crew & users), **My flight time**, and the **Company** card (your company name, ReOC, CRP etc., read-only from your planner).
- Fleet, batteries, battery register, official authorisations, clients, assessors, risk library, backup, storage, API keys and reset are hidden for crew.
- New **Company areas** card for crew: request access to fleet, batteries, job records or planning; granted areas show read-only (e.g. the company fleet with rego and hours).
- The **Compliance Calendar** tab is locked for crew (managed by the CRP).
- Crew PDFs and forms use your company details from the cloud.
- Tests: new crew-settings suite (17 checks); signing, crew, settings, account and induction suites pass.

## v7.5.3 — 3 Nov 2026 — Pilot signatures land on the job
- A pilot's RPIC signature is now added to the job as soon as you open that job (any way: Home, Database & Settings, or the email). The RPIC block also shows "<pilot> signed this plan as RPIC" with **Add their signature** while one is waiting.
- The "signed as RPIC" email's **Review and sign** button now opens that job straight on the **Authorisation** tab with the signature added, ready for you to sign as CRP and approve.
- The planner checks for new crew signatures and flights when you come back to it and when you open Authorisation (not only once a minute).
- The plan-version check still applies: if you changed the plan after the pilot signed, you're told instead.
- **Supabase:** redeploy `notify` (new link in the email).

## v7.5.2 — 3 Nov 2026 — Crew RPIC signatures reach the CRP; induction prompt fixed
- **RPIC signing on a company job:** when a pilot opens a job from My jobs and signs as RPIC, the signature (with the plan version they signed) goes to the cloud and the CRP is emailed ("…has signed … as RPIC", button opens Awaiting action).
- **CRP:** Awaiting action shows "<pilot> signed as RPIC: <job>" with **Review & sign**. It opens the job, checks the pilot signed this exact plan version, adds their signature (recorded as signed in the planner by them) and opens the Authorisation tab for you to sign as CRP and approve. If the plan changed after they signed, you're told and can ask them to sign again.
- **Induction prompt:** a pilot who has submitted their induction (with the CRP, certified or not yet competent) no longer gets the "complete your induction" welcome, on any device. Their Home shows the induction status next to My induction.
- **Supabase:** redeploy the `notify` function with the new code (adds the RPIC-signed email).
- Tests: new signing round-trip suite (16 checks: CRP saves → pilot signs → CRP adds the signature, same plan version); related suites pass.

## v7.5.1 — 3 Nov 2026 — Crew logins in the pilot pickers
- RPIC, CRP, remote pilot, second RP, observer and support-personnel pickers now list your crew with logins (pilots and the CRP for pilot roles; everyone for observers), as well as your saved pilot and observer lists. A signed-in pilot sees their own name.
- Tests: new picker suite (7 checks).

## v7.5 — 3 Nov 2026 — Speed smoothing and telemetry flags
**Speed smoothing**
- The telemetry detail view now has a **Speed smoothing** row (Off / Light / Normal / Strong) beside Height smoothing. Each works on its own, has "Apply to all flights on this aircraft" and "Use for new imports".
- It removes GPS speed spikes the aircraft didn't fly (dropouts, multipath), keeping anything that lines up with a throttle punch. The raw speed shows as a dashed line, Max speed is labelled "smoothed" with the raw figure, and Off restores it exactly. The PDF marks smoothed speeds "sm".

**Telemetry flags** (checked on the raw readings, so smoothing never hides them)
- ◇ **Height glitch:** height jumps and comes straight back with no current rise behind it.
- ◇ **Speed glitch:** a speed spike with no current rise.
- ◇ **GPS jump:** the position moves further between fixes than the aircraft could fly.
- ⚑ **Satellites:** GPS satellites drop below 6 (position hold and RTH unreliable).
- ⚑ **Voltage dip:** voltage drops with no current rise to explain it (connector, leads, pack).
- ⚑ **Low voltage:** under 3.3 V per cell under load.
- ⚑ **Current spike:** a big current spike while the aircraft isn't climbing or moving (prop strike, crash, motor or ESC).
- ⚑ **Log ends airborne:** the log stops above 10 m or faster than 20 km/h.
- Real climbs and dives, and anything with a matching throttle punch, aren't flagged. Logs where the radio only updates sensors every few seconds are handled, so held readings aren't mistaken for jumps.
- Each flight shows "N telemetry flags" with the first few; the detail view lists them all (tap one to jump to it on the charts and map) and shades them on the charts. The PDF lists them per flight (full flight pages and the compact table).
- Existing failsafe and link-quality events are unchanged.
- Tests: new suite (26 checks) including your real FPV log (no false flags), a clean log (none) and a log with one of each problem (all eight found); full regression passes.

## v7.4 — 3 Nov 2026 — Crew home, cloud jobs (Chunk 2b), access requests, instrument copies
**Crew home (pilots and observers signed in)**
- Home now shows the company name, **My jobs** (every job the CRP has named you on, with your role and status), **My flight time** (per aircraft type, from jobs the CRP has completed, plus the hours you declared at induction) and a **My induction** button.
- **Access to company areas:** Fleet management, Battery management, Job records and Flight planning. Tap Request (with an optional note); the CRP grants or declines. Granted areas appear as read-only cards (Company fleet, Company batteries, Job records).
- Weather, go/no-go, daylight, sun direction, Kp and quick links stay; CRP-only cards (drafts, setup, compliance, quick actions) are hidden.
- **Open a job** from My jobs: it loads in your own space and goes to the Flight Log. Log your flights, then **Send my flights to the CRP**. Only new flights are sent, and they aren't sent twice.

**CRP: jobs in the cloud**
- Every saved draft, approved plan and completed record is copied to the cloud with who's on it. Crew are matched to logins by name (RPIC, pilots, observers, support personnel), so crew only see jobs they're listed on. Telemetry traces stay on your device.
- Company details, fleet, batteries, a summary of job records and each pilot's logged time are published for crew to read (by grant).
- **Awaiting action** on Home now lists flights crew have sent ("Add to log" opens the job and merges them into Section 4 for you to check and save) and access requests (Grant / Decline).

**Instrument copies (Official authorisations)**
- Each instrument can hold an uploaded copy (PDF or scan) and a **Needed for** setting: OONP, EVLOS, Night, BVLOS (defaults: OONP.0079 → OONP, EVLOS.0346 → EVLOS, Night VLOS → Night). Expired and soon-to-expire instruments are flagged.
- On the Authorisation tab, a job that includes OONP, EVLOS, night or BVLOS shows **Instrument copies for this job**: the instruments it needs, their expiry against the job date, a one-click "add to the authorisation reference", and **Attach to PDF** (on by default when a copy is uploaded). You can upload a copy from there too.
- The plan PDF gets an **Authorisation Instruments** appendix with each attached copy printed page by page (PDFs up to 8 pages are converted when uploaded online; offline uploads are listed to append).

**Supabase:** run migration `0004_chunk2b_cloud_jobs.sql` in the SQL editor (pilot hours, access requests, shared data). Until then the planner works as before and the cloud parts wait.
- Tests: new crew/cloud suite (34 checks), instrument suite (17 + 3 with real PDF pages), database security tests for 0004 (26); full regression passes.

## v7.3 — 3 Nov 2026 — Database & Settings regrouped and folded
- **Five groups** in a UX order: Jobs & records (drafts, approved plans, completed records, import, recovery copies), Organisation (company profile, official authorisations, crew & users, clients, assessors & observers), Equipment (fleet, batteries, battery register, CSV import, logged time), Libraries (risk assessment library), Data & system (backup & sync, storage, API integrations, reset).
- **Folded sections:** each shows its title plus a one-line preview with quick actions (e.g. the latest draft with an Open button), so you don't need to expand it for the common job. Expand/Collapse all; your open/closed choice is remembered on this device.
- **Jump to a section** opens the fold before scrolling, so the jump lands correctly. The menu has group headings and fits the screen.
- On this tab, the planner tabs (JSA etc.) fold down to icons in the side menu, leaving more room.
- Removed the duplicate Saved/Completed lists; heading renamed "Database & Settings".
- Tests: new settings suite (18 checks); the full regression passes (two older tests updated for the new section names and folds).

## v7.2.7 — 3 Nov 2026 — One crew list: logins and inductions linked
- Each row in **Crew with logins** now shows the person's induction: Not started, Draft, Awaiting you, Certified (with date) or Not yet competent. It has one **Review** button (when waiting) or **View** button, which opens that person's induction.
- Rows are matched by login account, falling back to email. Observers show no induction.
- The separate list of past inductions has gone. **Pilot inductions** at the top now holds only the Ops Manual version and the **Waiting for you** box.
- Rows wrap on phones.
- Tests: the induction suite now opens an induction from the crew row (22 checks); the account and crew suites pass.

## v7.2.6 — 3 Nov 2026 — Induction: typed licence details and hours; uploads optional
- The **RePL photo** upload is now optional too, so both uploads are optional.
- New **Licence details** box in Documents, for RePL categories and weight limit, issue date, AROC and other ratings, conditions or expiry dates.
- New **Logged hours (optional, type it in)** box in Experience, for hours on each type and night/EVLOS hours. It's meant for pilots without a logbook file. The hint explains that the CRP checks 10+ hours on type before an OONP sign-off.
- The CRP's review shows both typed boxes above "Types and hours".
- Tests: the induction suite passes with uploads, and with typed details only.

## v7.2.5 — 3 Nov 2026 — Signing locked to the right account (security fix)
- **CRP block:** "Sign Document" works only for a signed-in **CRP account**. Pilots and observers see it greyed out, with "Only the Chief Remote Pilot's account can sign as CRP", even if they type your name. When the CRP signs, their own account name goes in (with a prompt if the block named someone else) and the ARN fills from the pilot list.
- **RPIC block:** a pilot or observer can sign only when they are the RPIC named on the plan. If no RPIC is named yet, signing puts their own name in.
- **Approve for flight:** the switch is locked for pilots and observers, with a note.
- **Audit trail:** every in-app signature records the account (name, email, role, time). It shows under the signature and in the PDF, e.g. "✓ Signed in the planner by Michael Rubio (mike@…, CRP account) 3 Nov 2026 09:30". Clearing signatures (amendments) clears it too. These fields don't change the plan fingerprint, so an RPIC remote signature isn't invalidated.
- **Clean spaces:** crew, free and guest spaces no longer start with the owner's sample people (pilots including "Michael Rubio", assessors, observers, clients) or the CRP's name and phone in the default emergency contacts.
- The free edition and the offline file are unchanged: there, you are the operator.
- Tests: new signing suite (12 checks); the RPIC sign-off, approval lock, PDF, account, free-mode and privacy suites pass.

## v7.2.4 — 3 Nov 2026 — Induction email buttons open the right screen
- **"Review the induction"** in the CRP's email now links to `planner…/#review-induction=<id>`, which opens that pilot's induction review directly. If the CRP isn't signed in, it opens after sign-in, once the planner has opened the CRP's own data space.
- **"Open the planner"** in the pilot's certified / not yet competent email links to `#my-induction`, which opens their account panel and induction.
- Works in a fresh tab or a tab that already has the planner open. The link is cleared from the address bar once used.
- **Supabase:** redeploy the `notify` function with the new code (the links are built there).
- Tests: the induction suite now opens a review from the email link (20 checks).

## v7.2.3 — 3 Nov 2026 — Private planner data per person (security fix)
- **The fault:** planner jobs, drafts and flight records live in the browser. Anyone who signed in on the same browser saw them, so a test pilot signed in on the CRP's browser could see every record.
- **The fix:** each identity now gets its own separate database in the browser, chosen before anything loads:
  - the CRP keeps the existing data, unchanged;
  - each pilot or observer gets their own empty space;
  - "Use free on this device" gets its own;
  - the signed-out sign-in screen gets an empty one.
- **How it decides:** the planner remembers each email's role on this device. The first time someone signs in on a device, it shows "Opening your account…" until their role is known, then opens the right space. Signing in, signing out, or choosing free mode reloads into the right space (at most 3 hops, to avoid a loop).
- The old localStorage mirror and quick-start copy of the database belong to the CRP's space only, and are never read or written for other spaces.
- **Fixed with it:** free mode reopens its one saved job after a reload, now checked by job uid and an untouched form.
- **Still to come:** crew seeing the jobs they're on is Chunk 2b (cloud jobs), where the database rules already limit each pilot or observer to their own jobs.
- Tests: new shared-browser privacy suite (13 checks: CRP job saved, pilot signs in on the same browser and can't see it anywhere, signed out, free mode, back to the CRP, no reload loop). All hosted suites and the main offline tests pass.

## v7.2.2 — 3 Nov 2026 — Logbook summary optional in the pilot induction
- The logbook summary upload is now **optional**: "Logbook summary (optional)". A pilot can submit with just the RePL photo, which is still required.
- The Documents hint explains why to add the logbook anyway: it's the easiest evidence of hours on type, which the CRP must verify (10+ hours) before certifying OONP.
- The induction TL;DR wording was updated to match.
- Tests: induction suite passes with and without a logbook upload.

## v7.2.1 — 3 Nov 2026 — Company name in crew invite emails
- **Crew invite emails now name your company:**
  - in the header (e.g. "Rubio Enterprises");
  - in the title: "You're invited to join the Rubio Enterprises crew";
  - in the body: "Michael Rubio has invited you to join **Rubio Enterprises** as a pilot on the Dream Flight RPA Operations Planner…";
  - in the expiry note: "ask Michael Rubio to send a new invitation";
  - in the footer: "on behalf of Rubio Enterprises".

  Without a company name it falls back to neutral wording.
- **How it works:** the planner sends the company name (Database & Settings › Company profile) with each invite. The `invite-user` function adds the inviter's name and the role, and stores all three on the invite. The Supabase **Invite user** email template prints them.
- **Supabase updates needed:** redeploy `invite-user` with the new code, and paste the new **Invite user** email template (`supabase/email-templates/invite.html`). Until both are done, emails keep the old wording.

## v7.2 — 2 Nov 2026 — Telemetry altitude smoothing
- **Altitude smoothing** in the telemetry flight view, with Off / Light / Normal / Strong. It's for barometer spikes the quad never flew: height jumping 1–2 m for a second and back, caused by gusts, prop wash or pressure changes in a stadium bowl.
  - **Spike removal:** any height far from the median of its neighbours (a 1.5 / 2.5 / 4 s window) is replaced, in two passes so wider spikes go too. Then a light Gaussian smooth evens out the barometer's 1 m steps.
  - **Real climbs are kept:** a climb held for longer than the window stays, so the max height isn't under-reported. On a real log, the sustained 50 m climb stays at 50 m on Light and Normal and 49.7 m on Strong.
  - **Throttle punches are kept:** a jump that lines up with a current spike (above both 1.5× the flight's median current and its 85th percentile, within ±1 s) is left alone and smoothed less.
  - **Raw data is kept:** the raw trace and the raw max height, take-off, landing and KE figures are stored. Off restores them exactly.
- **Showing it:** the view shows "N spikes removed · raw max X m → Y m" and the raw height as grey dashes under the smoothed line. Max height is labelled "(smoothed)" with the raw figure beneath. The flight card's "Max alt" reads "smoothed".
- **Apply to all flights on this aircraft:** one click. **Use for new imports** applies the chosen level to every telemetry import from now on (kept on this device). Re-importing a flight keeps its smoothing.
- Auto-filled height segments (Take-Off / Flight Operation / Landing) follow the smoothed values, the same way re-basing does. Peak KE uses the smoothed height.
- **PDF:** the telemetry chart is titled "TELEMETRY · HEIGHT SMOOTHED (NORMAL, RAW MAX n FT)". The compact flight table marks smoothed heights "sm" and adds a note that the raw values are kept in the planner.
- Tests: new suite (14 checks: 5 m spikes removed, a real throttle-punch climb kept, Off restores exactly, levels ordered, and the UI, apply-to-all, PDF labels and new-import default on a real EdgeTX log).

## v7.1 — 2 Nov 2026 — Check all, and Send to phone for crew
- **Pre-flight checklist › Check all:** a green button in the checklist header. It switches the list on and records every item at once: items that apply are marked Done; OONP/EVLOS items on a job without those operations are marked N/A. Items already set are left alone, and Clear resets the list. (It replaces the small "Mark the rest done" link.)
- **Send to phone** (in the checklist header and next to Share log in the crew bar):
  - **Online planner:** makes a link to the crew form with a **QR code**, plus **Text it**, **Email it**, **Copy link** and **Share…**. The job details (name, date, location, client, aircraft, battery names, which checklist groups apply) travel inside the link, compressed (about 900 characters for a typical job). Nothing is uploaded or stored on a server. The panel notes that anyone with the link can see those details.
  - **Offline file:** the planner can't make a link, so the panel offers Share file… or Download file instead.
- **Crew phone form:**
  - now includes the **pre-flight checklist**, with Done / N/A per item and Check all / Clear;
  - **keeps what's typed if the phone reloads the page**;
  - **Send completed log back** opens the phone's share sheet (Messages, WhatsApp, email, AirDrop), or downloads the file where sharing isn't available.
- **Importing a crew log back** (Flight Log › Import log) now fills in the pre-flight checklist items the crew recorded, without overwriting any already ticked in the planner.
- The crew form now shows the operation date from the plan.
- Its code moved out of an encoded blob into a readable file (`src/crew/crewFormScript.js`). The downloaded file and the link share one builder.
- Tests: new end-to-end suite (12 checks: Check all, link + QR, opening the link as a phone, reload keeps entries, send back, import fills the checklist, downloaded file still works).

## v7.0 — 1 Nov 2026 — Home dashboard
- **New Home tab**, first in the sidebar and the phone tab bar. The planner now opens on it. It greets you by name and shows the date and company.
- **Widgets:**
  - **Quick actions:** New operation, Continue the open job, Log flights, Export backup (free mode: Open a plan file), Plan & map.
  - **Next job:** the next dated draft, approved plan or open job, with a countdown, Draft/Approved status, the mandatory items left and "RPIC to sign".
  - **Local weather** (Open-Meteo, free, no key): wind and direction, gusts, wind at 80/120 m, rain chance for the next 3 hours, temperature and cloud, plus a 12-hour strip. The location is the current job's launch point, the phone's GPS or a place search, and is set up in the card itself on first use.
  - **Go / no-go:** the next 6 hours checked against your limits (sustained wind at 10/80/120 m, gusts, rain chance, visibility), with presets per aircraft. Advisory; the RPIC decides.
  - **Daylight & twilight:** nautical dawn, first light (civil), sunrise, sunset, last light (civil) and nautical dusk, for today and the next job's date.
  - **Sun direction & golden hour:** a compass dial with the sunrise and sunset bearings, golden-hour and blue-hour times, and the bearings for the next job's date. Calculated on the device.
  - **Kp index:** now, the 24-hour maximum and a 3-hourly forecast (NOAA SWPC); Kp 5+ is flagged for GPS and compass.
  - **Awaiting action:** inductions to review, mandatory items left on the open job, plans waiting for the RPIC signature, past-dated jobs not yet logged.
  - **Saved drafts & plans.**
  - **Recently completed jobs**, with flights and flight time.
  - **Upcoming compliance:** calendar tasks, expiries and fleet CASA registration, overdue first.
  - **Pilot flight hours:** all-time and the last 90 days, flagged if not flown in 90+ days.
  - **RPA fleet hours:** includes prior hours, rego and expiry.
  - **Setup completion:** a progress ring.
  - **Quick links:** OK2FLY, NAIPS, BoM radar, myCASA, CASA drone rules. Editable.
  - Off by default: **Battery health** (cycles, idle packs, low cell voltage), **Monthly activity** (6-month chart), **Notes**.
- **Edit dashboard:**
  - drag or use the arrows to reorder;
  - S / M / L width;
  - hide, and add back from the tray;
  - Reset layout;
  - per-widget settings via the gear (location, go/no-go limits, how many rows, compliance look-ahead, links).

  Saved on this device.
- **Free mode** gets a slimmer dashboard: actions, next job, weather, go/no-go, daylight, sun direction, Kp, links and notes.
- "Start planning" (free) and "Start a new job" (welcome) go straight to the Plan tab.
- Tests: new dashboard suite (20 checks, weather and Kp mocked); journey, phone, job-bar and account suites pass.

## v6.9 — 1 Nov 2026 — Job name on every page
- **Job bar on every page:** a slim bar stays at the top of every tab while scrolling (Plan, JSA, Approve, Log, Calendar, Settings). It shows:
  - the **operation / event name**;
  - the client (on wider screens);
  - the operation ID;
  - the date (or range);
  - a status chip (Approved / Unsaved / Saved).
- Tapping the name jumps to the Operation / Event Name field. A job with no name yet shows "Untitled job, tap to name it".
- Adjusted to sit under the job bar:
  - the sidebar;
  - the phone section picker in Settings;
  - section jumps;
  - scroll-into-view positions.
- Tests: new job-bar checks (14) at desktop and phone size across all six tabs; phone, journey and account suites pass.

## v6.8 — 1 Nov 2026 — Sign-in first, role-based first-time journey, free edition
- **Sign-in screen first** (hosted planner, signed out). There are two choices:
  - **Sign in**;
  - **Use free on this device**.

  Invited crew are told to open their invitation email. The welcome screen and wizard no longer appear behind it.
- **After sign-in, each role gets its own path:**
  - **CRP:** a "Welcome, Michael" screen with the sample tour, setup, Import backup and Start a new job, then a **Getting started checklist** on the Plan tab. The checklist covers Company details, Aircraft with CASA registration, Batteries, Invite your crew and Plan your first job, plus "Already using the planner on another device? Import backup". It shows progress and can be hidden; each item opens the right wizard step or section.
  - **Pilot:** a welcome with **Start my induction** first, or "Later, show me the planner". It's shown once.
  - **Observer:** a short welcome. Neither crew role sees company setup or the checklist.
- **Crew invites no longer pop up first.** In the account panel, "Crew logins & invites" is folded into one row (open it to invite). The invite form stays open in Database & Settings › Crew & users. Sign-in closes the panel and shows a "You're signed in…" toast.
- **Free edition ("Use free on this device"):**
  - A short intro, with an optional sample tour that ends in a blank job rather than company setup.
  - A "Free mode · one job at a time on this device · keep your PDFs" banner.
  - An **Operator block at the top of Section 1** (company, ReOC, ARN, phone, email) that prints on the PDF and the header, for that job only.
  - **One job at a time:** Save keeps just this job, and it reopens by itself next visit so the flight log can be finished after the flight. New job replaces it after a warning to export first.
  - "Log completed flight" offers to export the PDF instead, since the PDF is the record.
  - Names typed into fields aren't added to saved lists.
  - Settings shows what's free and what comes with an account, plus **Export this job / Open a plan file** for moving a job between devices.
  - The Compliance calendar is an account feature.
  - Free PDFs carry a credit line: "Planned with Dream Flight RPA Planner (free edition) · planner.wakingdreamfpv.com".
- **Operator block for accounts:** a one-line summary of the company profile, with "Different operator for this job" (e.g. flying under another ReOC) to override it for one job. The PDF, the print header and the RPIC sign-off use the override when it's filled in; blank fields fall back to the profile.
- **Preview edition (testing)** selector in Database & Settings (signed-in CRP and the offline file): Automatic / Free / Full, for this browser only.
- The welcome now also shows for a planner that was opened but never set up (not only a brand-new database).
- Tests: new journey suite (35 checks: gate, CRP, free mode, pilot, edition preview); hosted tests updated for the sign-in screen; the phone suite still passes.

## v6.7 — 1 Nov 2026 — Phone layout fixes
- **Bottom tab bar on phones** (Plan, JSA, Approve, Log, Calendar, Settings). It stays on screen while scrolling and shows a badge with the mandatory items left. It replaces the stacked sidebar menu below 768 px; tablets and desktops are unchanged.
- **Compact header on phones**:
  - company name on one line, with the account chip, New, Save and PDF in one row;
  - an unsaved-changes dot on Save;
  - the empty grey status pill is removed.
- **No more iPhone zoom-in**: fields are 16 px on phones, so Safari no longer zooms in when a field is tapped and stays stuck zoomed.
- **Setup wizard** is a full-screen panel on phones. Close (with a label) is always at the top, Back and Next are always at the bottom, the steps scroll inside, the step pills scroll sideways, and the page behind is locked.
- **Welcome screen** scrolls on small screens and has a Close button. It also adds a **Sign in** option that explains planner data stays on the device it was made on until cloud sync arrives (use Import my backup).
- **Sign-in rework**:
  - email and password first, with name/autocomplete hints so the phone offers to save the login;
  - Show password;
  - "Email me a sign-in link instead" and "Forgot password?" as links underneath;
  - the last email is remembered;
  - "You're signed in. You'll stay signed in on this device until you tap Sign out." confirmation;
  - on phones the account chip shows initials and role.
- **Account, crew and induction panels**: full-screen on phones, with a labelled Close button and safe-area padding (notch and home bar).
- **Database & Settings on phones**: the sticky section picker shows the current section, jumps clear the picker, and nested card padding is tighter.
- `dvh` units are used for panel heights, so Safari's toolbars no longer push buttons off-screen; viewport-fit=cover is set.
- Tests: new phone suite (26 checks at 375×560, 390×760 and desktop); sign-in test updated for password-first; no sideways overflow on any tab at 360 and 412 px with an 82-flight job.

## v6.6 — 31 Oct 2026 — Sample-job tour as the first part of the setup wizard
- The setup wizard now opens on **Try it**. The user picks a sample aircraft, **DJI Mini 4 Pro** or **Custom 3.5" FPV cinewhoop** (4S, about 280 g), and the planner loads a ready-made sample job: "SAMPLE — Park promo shoot", Doug Jennings Park, Gold Coast. The sample includes:
  - details;
  - map pins and an ops area;
  - a completed checklist;
  - Class G VLOS;
  - 5 risks;
  - approval answers;
  - 3 logged flights with batteries.

  The sample aircraft is added to the fleet.
- **An 8-step guided tour** follows. A card at the bottom gives a short explanation, and a ring highlights each item in turn:
  1. mandatory-items list;
  2. map;
  3. preliminary checklist;
  4. risk register;
  5. OONP tools;
  6. authorisation;
  7. flight log;
  8. PDF export.

  Back, Next, and **Skip tour** are available at any time.
- **Finishing the tour** goes into the company setup (Company › You › Fleet › Batteries › Finish), with the chosen aircraft ticked and highlighted in the fleet step. Skipping the tour clears the sample job and removes the sample aircraft. The sample job is never saved unless the user saves it.
- The welcome screen offers "Get started: sample job tour, then set up my company". Next on the Try it page goes straight to the company setup.
- Tests: 8 new tour checks; the wizard and earlier suites pass.

## v6.5 — 31 Oct 2026 — Setup wizard, CASA registration on the fleet, fleet fixes
- **Setup wizard**, offered on the welcome screen of a new planner ("Set up my company") and from Database & Settings › Run setup wizard. It has five steps:
  1. Company: name, ReOC number, operator ARN, phone, email, address.
  2. You as CRP: added to the pilots list, with an option to remove the sample pilots.
  3. Fleet: tick the aircraft you fly, or add new ones. Each has weight, cells, **CASA registration number**, rego expiry and serial, plus a "Keep only aircraft with a CASA rego" button.
  4. Batteries: a generator (e.g. 3S-650, 6 packs, from 01, assigned to an aircraft) and the pack list. Packs of aircraft you dropped are unticked.
  5. A summary that flags aircraft without a rego number. Nothing is saved until you click Finish.
- **Fleet cards** gain a **CASA rego** number (stored in capitals) and **Serial / ID**. "Registration" is renamed **Rego expiry**; it still feeds the Compliance Calendar and the job expiry check.
- **The Section 1 PDF** lists each aircraft with its rego and serial, e.g. "Pavo 20 Pro (PF1234567, S/N 001)" (MOS 10.07 asks for each RPA's ID).
- **Airframe time** is now the real logged time from Completed Flight Records (hours, minutes and number of flights), plus a new **Prior** minutes field for time flown before the planner. It used to be a static field that stayed at 0.
- **Fix:** the fleet section appeared twice in Database & Settings. An old copy without the delete confirmation was left over from the original file and has been removed.
- Tests: 12 new wizard and fleet checks; earlier suites pass.

## v6.4 — 31 Oct 2026 — Auto-assign batteries, finer KE heights, stale-altitude fix
**Auto-assign batteries** (Flight Log, each RPA, shown when there are 2+ flights)
- Opens a picker with your packs grouped by cells and capacity from the name: 3S 720 mAh, 3S 650 mAh, 6S 1550 mAh, and so on. Tick a whole group or single packs.
- **Defaults:** this aircraft's assigned packs with a matching cell count.
- **How packs are assigned:** they go into the flights in time order, cycling 1, 2, 3 … then back to the first.
- **Options:**
  - only flights with no battery yet (on by default when there are blanks);
  - start with a chosen pack;
  - skip a pack when the log's cell count doesn't match, or the flight used more mAh than the pack holds.
- A preview shows each flight's current battery and its new one, with a ×count per pack, before you click "Assign to N flights".

**KE limits table**
- Below each ceiling, the 15 J and 34 J limits now list every whole metre over the last few metres (every half metre for ceilings under 6 m). The exact ceiling row stays.
- Lower down, where there's more allowance, the table keeps the coarse steps.
- Example for the 0.15 kg Pavo: 0, 2, 4, 6, 7, 8, 9, 10, 10.19, 12 … 20, 21, 22, 23, 23.10.

**Telemetry height fix**
- At arming, the receiver can repeat an old altitude for a few samples and then jump to the real one (for example 24 m dropping to 0 m in 0.1 s). That gave a false max altitude and a false peak KE.
- Any jump faster than 25 m/s (and over 6 m) in the first 3 s now marks the samples before it as stale, and they're ignored.
- **Re-importing** a log that's already in the job now refreshes its telemetry with the corrected reading. Battery, label, notes and OONP flag are kept. Before this, re-imported flights were skipped.

Tests: 10 new checks (auto-assign cycling, saved assignments, KE rows), a stale-altitude log comparison, and the earlier telemetry, KE and PDF suites.

## v6.3 — 30 Oct 2026 — Chunk 3: pilot induction
Replaces the Google Forms Part 1 and Part 2. Online planner only. Setup steps are in `supabase/SETUP-CHUNK3.md`: migration 0003, the `notify` function and the `RESEND_API_KEY` secret.

**Part 1 (the pilot, on their own login).** Account & crew shows a **Pilot induction** card with Start / Continue / waiting / certified, the pilot's certifications and their due dates. The form is full-screen and works on a phone:
- an "In short" summary at the top;
- details: name, mobile, ARN, RePL number, address;
- next of kin (F.3);
- total hours, the company types they'll fly (published from your fleet) and hours on each;
- approvals being assessed (EVLOS / OONP / night, on top of induction and type);
- RePL photo and logbook summary uploads, to a private folder only they and the CRP can open;
- one declaration tick, with the full list under "What you're declaring", plus the confidentiality clause;
- a signature drawn with a finger, or their typed name.

"Save and finish later" keeps a draft. Submit lists anything missing. On submit the database checks the declaration, confidentiality and signature, sets the status to awaiting_crp and emails the CRP.

**Part 2 (the CRP).**
- **Pilot inductions** list in Account & crew, with "Waiting for you", and an amber count on the account button.
- **Review** shows Part 1: details, types and hours, approvals sought, links to the documents, the declaration and signature.
- The CRP sets the types assessed and ticks the checks. Each tick has a "What's checked" help list:
  - Induction (F.4/G.1);
  - Type practical (G.2);
  - EVLOS (G5, MOS 5.06);
  - OONP (G7), which also needs a "10+ hours on type verified" tick;
  - Night (G3).
- Then the check date, notes, the CRP certification tick and the CRP signature, and **Certify** or **Not yet competent** (a note is required).
- One database step locks the record and creates the certifications. Each one is due 12 months after the check, with you named as assessor. It also updates the pilot's "date last engaged".
- The pilot is emailed whether they were certified or not yet competent, and can start a new induction after a "not yet competent".
- The Ops Manual version is set in the Pilot inductions header and saved on each induction.

**Database (0003)**
- `fleet_types` (your planner keeps it in step) and `app_settings`.
- One open induction per pilot.
- `submit_induction` and `certify_induction`.
- A private `crew-docs` bucket. Each person has their own folder; only the CRP reads everyone's; no deletes.

**Tests**
- 32 database checks (`rls3.test.mjs`).
- 19 end-to-end screen checks with a stand-in database: the pilot fills in, saves, uploads, submits; the CRP is notified, reviews and certifies; the pilot sees the result.
- All earlier suites pass.

**Wording to check:** the declaration items and the CRP "What's checked" lists are in `src/cloud/inductionText.js`, drafted from your Chunk 3 spec. Check them against your manual's sections.

## Chunk 2 — 30 Oct 2026 — Crew & job data model (cloud database)
Database only, with no planner change. Run `supabase/migrations/0002_chunk2_data_model.sql` after Chunk 1 (steps in `supabase/SETUP-CHUNK2.md`).

**Tables**
- **people:** name, role, email, phone, address, ARN, RePL no., next of kin (name, relationship, phone), total hours, medical/training expiry, active, date last engaged, notes, optional login link.
- **experience:** hours per RPA type.
- **signoff_records:** pilot_induction / evlos_observer; draft → awaiting_crp → certified / not_yet_competent; answers JSON; both signatures with times; manual version; locked.
- **certifications:** induction / evlos / oonp / night / type:<RPA>, with check date, next due and assessor.
- **flight_counts.**
- **document_access_log.**
- **audit_log.**
- **jobs:** the plan as JSON, op ID, dates, status.
- **job_crew:** RPIC / pilot / observer per job.
- **job_flights:** one row per flight, owned by whoever logged it.

**Linking logins**
- Accepting an invite links the login to the person with the same email, or creates a person record.
- Existing Chunk 1 logins are linked when the migration runs.
- A role change in the logins list carries over to the person record.

**Access (row-level security)**
- The CRP sees everything.
- Crew see and edit their own details, including contact, licence, next of kin and hours. They can't change their role, status, currency dates or notes.
- Crew see only jobs they're assigned to, with the plan read-only. The client name and contact come from the plan itself, never from the client database.
- Pilots and the RPIC see the whole job's flight log. Observers see only their own flights.
- Everyone logs flights only as themselves, and flights lock when the CRP closes the job.
- Crew can start and submit their own sign-offs but can't certify themselves. A locked sign-off can't be changed by anyone, the CRP included.
- Certifications and flight counts are written by the CRP only.
- Crew record their own manual page views; only the CRP reads the access report.
- Nothing can be deleted (crew assignments excepted). People are deactivated instead, and deactivating a login removes job access at once.

**Audit log**
- Every insert and update on the tables above records who, when, and the before/after values.
- It's written only by the database, and only the CRP can read it. Nobody can edit or delete it.

**Seed:** "Test Pilot (seed)" and "Test Observer (seed)", without logins.

**Tests:** 52 checks in PGlite (`supabase/tests/rls2.test.mjs`), plus the 18 Chunk 1 checks.

**Next (Chunk 2b, planner wiring):**
- Crew & users reads and writes `people`.
- Jobs save to `jobs`, with crew assigned to each job.
- A "My jobs" view for crew logins.
- In-app RPIC sign-off.

## v6.2 — 30 Oct 2026 — Crew & users in one place
- Database & Settings › **Crew & users** (was "Users & logins") now holds:
  - **Pilots** (moved from Personnel / Pilots). Each pilot can store an email, and the add row has an Email field.
  - **Observers / spotters** (moved from Visual Observers).
  - **Logins** (your account, Invite crew, the logins list, pending invites).
- **Per-person login status** when you're signed in as CRP online:
  - "Login · Pilot / Observer / CRP" (green);
  - "Invited · not signed in yet" (amber);
  - "Invite to log in" button: asks for the email if there isn't one (and saves it on the pilot record), confirms, then sends the branded invite with that person's name and role.
  - Not having a login is fine: they stay records you manage.
- The account panel and the Crew & users lists share one view of the logins, so an invite sent from either place shows up in both.
- Tests: new Crew & users checks (7); account tests 15/15; offline suites pass.

## v6.1 — 30 Oct 2026 — Settings menu and Users & logins
- **Database & Settings section menu.** On desktop and iPad, a "Jump to a section" list sits under the main sidebar. It scrolls on its own, highlights the section you're in, and clicking an item scrolls there and flashes that card. On phones it's a "Jump to a section…" dropdown pinned to the top of the tab. The list is built from the tab's visible headings, so new sections appear automatically.
- **Users & logins section** (Database & Settings, above Company Profile). It shows the same account panel as the header button, inline: sign in, your role, and for the CRP the crew list, pending invites and Invite crew. The offline file says that logins work in the online planner.
- **Clearer sign-in messages:**
  - no login for this email yet (with how to invite it);
  - wrong password;
  - too many emails just now;
  - invite not accepted yet.

  All of these used to show one generic message.
- Tests: new v6.1 checks (8); the account tests now cover the inline panel (15/15).

## v6.0 — 30 Oct 2026 — Mandatory record items, faster form, ready for beta
Marks the move to the hosted (cloud) app. The offline file is still built as a backup.

**Mandatory items, from CASA Part 101 MOS Chapter 10 and the F.1 form**
- **Operational release (MOS 10.04)**, required before approval:
  - nature and purpose (task overview);
  - RPIC with ARN;
  - dates and times;
  - RPA type/model;
  - remote pilot station (new field);
  - max height AGL;
  - launch and recovery coordinates;
  - flight mode;
  - the CASA approval relied on (only when the job is EVLOS/OONP/BVLOS/NVLOS or night);
  - a "RPA serviceable" statement (new Yes/No in Section 3).
- **F.1 items:**
  - assessor;
  - preliminary checklist answered;
  - airspace class;
  - at least one risk;
  - SOP / JSA answers;
  - NOTAMs (or "Nil");
  - approved dates and types.
- **Operational log (MOS 10.05/10.06)**, needed to complete the record:
  - weather answer;
  - on-site validation initials;
  - conducted as planned;
  - serviceable at end;
  - remote pilot who flew;
  - every flight with its length and height.
- **Where they show:**
  - each section starts with a "still to record" strip of chips, and tapping one jumps to the field and highlights it;
  - the sidebar shows "N left" per tab;
  - required labels have a red * (hover for the CASA/F.1 source);
  - Approve lists everything outstanding, with jump links, and stays blocked until all release items and both signatures are in.
- The Next button no longer pops up a warning list.
- PDF Section 1 adds remote pilot station, RPIC ARN and flight mode. Section 3 adds the serviceable statement.

**Yes / No answers instead of switches**
- An untouched switch used to save as "No". Now each answer is Yes, No or not answered (click again to clear). This covers:
  - the preliminary checklist;
  - SOP mitigates;
  - JSA correct;
  - weather;
  - conducted IAW;
  - serviceable at end.
- The reason box opens only on No. A No with a reason prints as "Not met — covered by: …"; a No without one prints as "Not met — see JSA". Unanswered prints as "—".
- "Check all" is now "Yes to the rest" (it fills only unanswered items).
- The "JSA required" banner shows only after a No.
- **Older jobs:** a "No" with nothing written beside it loads as not answered.
- The RPIC sign-off fingerprint ignores the CRP-side answers and the serviceable statement, and still matches replies signed in older versions.

**Less clutter**
- **OONP physics tools:** the kinetic energy charts, per-drone limits and ballistic splash area show only when OONP is ticked, or when this job already uses them. Otherwise there's a one-line note with "Show anyway". On a VLOS job the JSA tab went from about 6,700 px to 2,200 px.
- **NAIPS location codes:** a single line of nearest codes, with Copy all codes and Add all to NOTAMs; "Show" opens the full list and search.
- **OpenAIP set-up:** a one-line link.
- **Risk matrix:** hidden until "Show Matrix" (it still prints).
- **KE formula note:** folded under "How these limits are calculated".
- **Emergency contacts:** can fold to a summary ("3 of 5 with a number · nearest hospital not filled").
- **RF coordination:** off by default on new jobs (one tick to switch on).
- **Max height:** a single value shared by Section 1 and the JSA.
- **Flight Coordinates box:** re-laid out so inputs no longer overlap, with a note that map pins fill it.
- The orange "Internal Operations Tool" banner is removed.

**Fixes**
- New Operation now fully clears the last job. Before, it kept the OONP set-up and contacts, the KE/ballistic settings and the site attachments.

**Beta preparation**
- A new database starts with a blank company profile. The title reads "Dream Planner RPA" until a company name is set in Database & Settings › Company profile. Existing data keeps its name.
- The crew log page and welcome screen use the company name.

**Supabase**
- SETUP-CHUNK1.md adds Authentication › URL Configuration (site URL and redirect URLs).
- Branded invite, password-reset and sign-in-link emails are in `supabase/email-templates/`. They need Resend SMTP first, because new free projects can't edit templates on Supabase's own mailer.

**Tests:** new v6.0 suite (13 checks); all earlier suites pass after updating them for the Yes/No answers and the mandatory items.

## v5.55 — 29 Oct 2026 — Audit and tidy-up
- **Phones and tablets:**
  - The header buttons (New, Save, PDF, account) now show on phones. Before this, they were hidden below 768 px wide.
  - Fixed rows that ran off the screen: the risk template picker, the OONP contact name/phone fields, the nearby-aerodrome search, the Flight Log toolbar, and the Database & Settings export/import buttons. Wide tables scroll sideways inside their card.
  - Checked at 390 px (phone), 820 px (iPad) and 1024 px, with no clipped controls.
- **PDF:**
  - Footer on every page: operation number, job name and company on the left, "Page X of Y" on the right.
  - Removed the forced page break before the OONP per-drone table (it left a near-empty page).
  - The OONP heading names the pathway, or says "pathway not selected"; a Custom pathway uses its own name.
  - Flight log: new "PDF flight list" setting in Part C. Auto prints a compact table when there are more than 24 flights; you can also choose cards or table. The 82-flight test job went from 16 to 13 pages.
- **Approval logic:** Approve is blocked until "Does SOP adequately mitigate all hazards?" and "Preliminary Assessment / JSA correct?" are answered. Each needs Yes, or a No with the hazards or changes written in.
- **Remote RPIC sign-off fix:** answering those two CRP review questions after the RPIC has signed no longer marks the plan as changed. Before this fix, it voided their signature. Replies signed under v5.51–5.54 still match.
- **Maintenance:**
  - The page title takes its version from `APP_VERSION` automatically, and `package.json` is at 5.55.0.
  - DEPLOY.md and README.md now describe the real setup: Cloudflare Pages, Supabase, and the leftover Worker that can be deleted.
  - Regression tests updated for current behaviour (the take-over-and-save prompt in a read-only tab; the version is no longer hard-coded).
- **Logic checked and correct:** kinetic-energy limits (15 J: 50.9 km/h at 0 m, 10.19 m ceiling; 34 J: 76.6 km/h), the ballistic fall (2.02 s, 20.2 m throw, 36.9 J), the risk matrix ordering, and the operation window and flight totals.

## v5.54 — 29 Oct 2026 — Chunk 1: logins and crew roles
- **Supabase** (project `jirvugtgclgdbysrfjsc`, Sydney). The publishable key is in `src/cloud/config.js`, which is safe because RLS protects the data.
- **Database** (`supabase/migrations/0001_chunk1_auth_roles.sql`, re-runnable):
  - `profiles` (one per login: email, full_name, role crp/pilot/observer, active) and `invites` (email → role, set by the CRP).
  - New logins get their role only from a matching invite; anyone not invited is inactive with no access.
  - `profiles_guard` trigger: only the CRP can change role, active or email, and the CRP can't remove their own CRP access.
  - RLS: crew read and update only their own profile; the CRP reads and updates all; invites are CRP-only; nobody can delete; signed-out users get nothing.
  - Bootstrap lines make Mike the CRP (email placeholder to replace).
- **Edge function `invite-user`:** checks that the caller is an active CRP, records the invite, and sends Supabase's invite email (redirect back to the app). The service key stays on the server.
- **App (hosted only; the offline file is unchanged):** an account button in the header opens Account & crew.
  - Sign-in options: emailed link (no self sign-up), password, or forgot password.
  - An invite or reset link opens "Set your password".
  - The CRP sees the crew list (change role, deactivate/activate, can't edit own role), pending invites, and the Invite crew form.
  - Pilots and observers see only their own profile.
- **Tests:**
  - 18 RLS checks run in PGlite (`supabase/tests/rls.test.mjs`): pilot sees only themselves, can't promote themselves, can't see invites; uninvited users inactive; CRP sees all; anon gets nothing.
  - 13 UI checks run against a mocked Supabase.
  - Full regression on the offline file passes.
- **Mike's setup:** `supabase/SETUP-CHUNK1.md` — invite-only signups, run the SQL (replace the email), deploy the function via the dashboard editor with JWT enforcement off, invite himself, then the acceptance test with a second email.
- The sandbox can't reach `*.supabase.co`, so the live check is done by Mike.

## v5.53 — 29 Oct 2026
- **Hosting is live:** GitHub repo `wakingdreamfpv/dream-planner-rpa` (private). Cloudflare Pages project `dream-planner` serves `dream-planner-6f6.pages.dev` and `planner.wakingdreamfpv.com` (CNAME at Squarespace). Every push to `main` deploys automatically. A Cloudflare Worker `dream-planner-rpa` (`*.workers.dev`) also exists from the first attempt, deployed via `wrangler.jsonc`; it isn't needed and can be deleted.
- **Welcome screen** on a brand-new database on a device: Import my backup (whole database), Import a single job (plan file), or Start a new job. It's shown once (`localStorage wd_welcomed`).
- One-time upgrade notices (the v5.29 fleet battery-cell report) no longer pop up on a fresh database; the update still applies silently.

## v5.52 — 29 Oct 2026
- **Approved plans: save and export work again.** The approval lock had blocked Save Approved Plan and Save PDF on the Authorisation tab. These read-only actions are now allowed while Sections 1–3 stay locked: Save Approved Plan, Save PDF, Save risks as template, Copy our RF bands, copy an aerodrome code, Show risk matrix, map Pan, and re-centre on location.
- **PDF file name includes the event date:** the print window title (which browsers use as the saved PDF's file name) is now "<operation name> dd.mm.yy", or "dd.mm.yy-dd.mm.yy" for multi-day events. Characters not allowed in file names are replaced.

## v5.51 — 27 Oct 2026
**Remote RPIC sign-off** (Authorisation › RPIC block)
- **"Send to RPIC for signing"** downloads `Sign-RPIC_<OP id>_<title>.html`: a standalone page that works offline in any browser and is phone-friendly. It contains:
  - an operation summary and the full risk register with initial and residual ratings
  - the full plan, embedded exactly as the PDF ("Open the full plan")
  - the RPIC declaration, name/ARN prefilled, an optional comments box, and a finger/mouse signature pad or typed signature
- On signing, the RPIC sends back `RPIC-signed_<OP id>.json` (Share button on phones, or Download). It holds name, ARN, signature image/typed name, comments, the device time, time zone and user agent, and the plan fingerprint.
- **"Import signed reply"** checks that the reply is for this job (ID or uid) and that the plan fingerprint matches the current plan. If the plan changed, the import is refused ("send for signing again"). A different signer name asks for confirmation. On success it sets the RPIC as signed and keeps a `rpRemote` record.
- **Plan fingerprint:** SHA-256 of everything the RPIC agrees to — overview, JSA, risks (minus ids), OONP, map, KE, ballistic, authorisation details — excluding the signatures, approval state and amend log. It's shown as a 10-character version code.
- If the plan changes after the RPIC signed, the RPIC block turns amber ("send for signing again") and the approval switch is blocked ("RPIC to re-sign the changed plan").
- In the PDF, the RPIC block shows the drawn signature (or typed name), "Signed remotely <date/time> (<time zone>) · plan version …" and any RPIC comments.
- Amend plan and signing in person both clear the remote record. Signing in person at the computer still works as before.

**Build fix (from Chunk 0):** Vite's default minifier renamed functions, which broke the heatmap script inside the PDF (`drawHeatDabs is not defined`). It now uses terser with `keep_fnames` like the old bundler. A test now opens the generated PDF and fails on any script error.

## v5.50 — 27 Oct 2026
**Risk Assessment Library** (Database & Settings, above Recovery copies)
- Lists your saved risk assessments, plus the 10 built-in templates (read-only). Each row can be expanded to show hazards with initial/residual ratings and owner.
- **Import** (several files at once, with the progress bar) accepts:
  - this app's risk files (`.risk.json`, `_type: wdfpv_risk_template`)
  - "Export all" library files (`wdfpv_risk_library`)
  - full plan files (takes the plan's risk register, named from the plan title)
  - database backups (their custom templates)
  - CSV from Excel / Google Sheets
- **CSV format:** columns Ref, Hazard, Risk Description, Existing Controls, Initial L, Initial C, Additional Controls, Residual L, Residual C, Risk Owner. Header matching is flexible. Likelihood 1–5; consequence A–E or the words (Catastrophic/Hazardous/Major/Moderate/Minor/Negligible). Rows without a hazard are skipped.
- **Per assessment:**
  - Use in open job: replace, or add to the end with numbering continued. An empty register is filled directly. Blocked on an approved, locked job (amend first).
  - Export JSON / CSV, Duplicate (built-ins too, to make an editable copy)
  - Rename, Update from job (overwrite with the open job's register), Delete (jobs keep their copy)
- Name clashes on import or copy get " (2)" etc., so nothing is overwritten.
- Toolbar: Import, Save open job's risks, Export all.
- Custom templates stay in `db.customRiskTemplates` (in backups) and still appear in the JSA template dropdown.

## v5.49 — 27 Oct 2026
**New risk template: "OONP Pathway 1 + EVLOS — Controlled set with talent (guarded cinewhoops)"** (JSA & Risk › template list, next to the Aria vessel template)
- 22 risks for a controlled shoot with briefed, consenting talent using guarded 3.5" cinewhoops with GoPros:
  - talent contact; unexpected movement; talent reaching or catching; entanglement (hair, costume, props); GoPro/mount detachment
  - set, rigging and lighting collisions; no GPS indoors; link/video loss in a busy RF space; failsafe over talent; EVLOS VO loss of sight
  - pilot/VO/production calls; crew entering the area; talent comfort and consent withdrawal; minors; downwash/debris; hot motors
  - component failure; LiPo on set; lighting/haze; fatigue; outdoor sections; privacy
- At Mike's request, energy is not expressed as 15/34 J (the aircraft exceed those by weight). Wording used instead: "speed, height and proximity kept within the pilot's demonstrated capability and the talent's stated comfort, agreed shot by shot at the briefing".
- Source moved to the Vite project: change is in `src/legacy/planner.jsx`; built with `npm run build:all`.

## v5.48 — 26 Oct 2026 — Chunk 0: moved to a Vite project
The planner is now a proper project (`dream-planner-rpa`, Git) instead of a hand-patched single HTML file. The app code is the v5.47 code, moved in unchanged.
- **Two builds from one codebase:**
  - `npm run build` produces the hosted app (`dist/`): installable, and works offline after the first visit (service worker via vite-plugin-pwa; map tiles and APIs are never cached).
  - `npm run build:single` produces the single offline file (`dist-single/index.html`), delivered as WakingDream_v5.48.html. It's 1.55 MB, smaller than v5.47 (1.67 MB), because Font Awesome is trimmed to woff2.
- **Build details:**
  - React 18.3.1 / ReactDOM 18.3.1 from npm, exposed as the same globals (`src/globals.js`).
  - `let`/`const` are compiled to `var` (`@babel/plugin-transform-block-scoping`, `tdz:false`) to keep the classic-script hoisting the code relies on. This avoids the v5.26 TDZ crash.
  - Leaflet stays inline in index.html with ids `wd-leaflet-css` / `wd-leaflet-js`, injected after Vite processing, because the PDF export copies them.
  - Tailwind 3.4.17 via PostCSS. Font Awesome 6.4.0 solid + regular, woff2 only (`src/styles/vendor/fontawesome.css`, regenerated with `npm run vendor:fa`).
- **Storage modes groundwork** (`src/storage/index.js`): local / sync / cloud as a per-device setting; only local is active until the backend exists.
- **Hosting decision:** a subdomain `planner.wakingdreamfpv.com` (Squarespace can't serve an app at a page path), on Cloudflare Pages via GitHub, with a CNAME record in Squarespace DNS. See DEPLOY.md.
- **Verified:**
  - Full Playwright suite on the single-file build: all pass. The only failures are tests written for old behaviour, which fail identically on v5.47: v525 read-only refusal and old version strings, v528 version string; crew_test is a helper needing an argument.
  - Core suites on the hosted build over HTTP: lock, tabs, autosave/restore, PDF, RF, flight logs, KE, log dump, emergency contacts — all pass.
  - PWA: manifest and service worker active; the app loads with icons offline.
- **Data note:** browsers keep each site's data separately. Move plans from the file version to the hosted app with Export backup, then Import backup.

From here on, changes are made in `src/legacy/planner.jsx` (and new modules), not in patch scripts against the HTML.

## v5.47 — 26 Oct 2026
**RF planner expanded**
- DJI O4 channel plan from DJI's spec page:
  - 60 and 40 MHz: 1 channel, centred 5794.5 MHz
  - 20 and 10 MHz: CH1–3 at 5768.5, 5789.5 and 5814.5 MHz
  - Picking a bandwidth or channel fills the MHz range automatically
  - A separate O4 5.1 GHz band preset (5170–5250 MHz, where allowed)
  - O3 / Avatar kept on its published table (now 20/40 MHz)
- Power selector on transmitters: VTX 25 mW to 2 W; RC 10 mW to 1 W; radios 0.5–5 W. Power shows on the chart, in the copy text and in the PDF.
- New "ours" presets: DJI RC / FPV Remote 3, DJI Transmission, airband radio (VHF AM), UHF CB handhelds (AU 40-channel picker; note to avoid CH5/35 and 22/23).
- New "others" presets:
  - pyro firing systems at 2.4 GHz (e.g. COBRA, whose site states 2.4 GHz), 915–928 MHz and 433 MHz
  - broadcast COFDM 2 GHz, 6 GHz wireless video (e.g. Teradek Bolt 6), DJI Transmission (camera crew)
  - 1.9 GHz DECT intercom (Clear-Com, Hollyland Solidcom, Eartec), licensed UHF two-way radios, UHF CB
  - wireless focus / gimbal / timecode 2.4 GHz
- Presets are grouped (Control / Video / Comms / Pyro / Lighting / Audio / Camera / Other).
- New types "Voice comms" and "Pyro / SFX firing". Any overlap with a pyro system is a red, safety-critical warning: the pyro tech confirms band/channel, and there's a full power-up test with all our transmitters on before arming.
- Chart panels added: VHF airband, UHF, 868/915, 1.9–2.1 GHz, 6 GHz. Narrow bands zoom finer.
- **RF section now has an "Include in this job & the PDF" switch.** When off, the body is hidden, nothing prints, and the OONP field fill is skipped.

Optional-section audit (anything not strict compliance can be left out of print):
- Already switchable or print-only-when-used: emergency contacts, pre-flight checklist, KE charts, ballistic visualiser, OONP sections, site attachments, crowd heatmap.
- RF coordination: switch added in this version.
- Core Flight Record sections always print.

## v5.46 — 26 Oct 2026
**RF coordination planner** (JSA & Risk, under Emergency Contacts)
- Lists every transmitter on site in two columns, "Ours" and "Others on site", each with system, who, MHz range(s) and type (hopping control link / video / other).
- One-click presets:
  - ours: ELRS 2.4 GHz, ELRS / Crossfire 915 MHz, DJI O4/O3 fixed channel (CH1–8 at 20/40 MHz, from the published DJI 20 MHz table; confirm the MHz in the goggles), DJI auto channel, DJI drone O4 link (2.4 + 5.8), analog / Walksnail / HDZero, Wi-Fi 2.4
  - others: LED light sticks / wristbands 2.4 GHz and 433 MHz, broadcast wireless camera 7 GHz, wireless monitoring 5 GHz (Teradek / Hollyland), wireless DMX, UHF mics / IEMs, venue Wi-Fi 5 GHz, another DJI drone team
- Spectrum chart panels (sub-GHz, 2.4, 5, 7 GHz, plus "Other" for anything else) zoom to what's in them. AU class-licence (LIPD) bands are shaded pale blue.
- Overlap check:
  - red "clash" when a video link overlaps (move a channel or agree a split)
  - amber "shared" when hopping control links share a band (normally coexist; range-check with everything on)
  - "near" warning when systems are under 10 MHz apart
  - also flags two of our own video links on the same channel
- "Copy our bands to send" produces a message for other teams (our systems + MHz + "Where do you sit?"). There is an Agreements notes box.
- The PDF prints an "RF Coordination — Radio & Video Bands" section in Section 2: chart, table, overlap results, agreements.
- OONP logistics RC link / RC freq / video TX / video freq fill from the RF plan when they're blank.
- Stored as `jsa.rfPlan = {items, notes}`; helpers `rfRanges`, `rfConflicts`, `rfChartSvg`, `rfSummaryText`.

**OONP checklist:** new pre-flight sign-off "Wireless video & radio (RF) coordinated — signal bands checked with production, broadcast, lighting & other drone teams". It's added to checklists customised earlier too; deleting it is remembered (`db.oonpRemovedDefaults`).

## v5.45 — 24 Oct 2026
**Data safety: work can't be lost to the "open in another tab" lock**

What went wrong (Veteran Games plan):
- A tab opened while another planner tab was open becomes read-only. You could still type in it, but nothing was saved, not even the autosave.
- "Use this tab instead" reloaded the page and discarded the form.
- The single autosave slot (`rpas_working`) was shared by all plans, so it could hold a blank or older copy.

Fixes:
- **Every tab autosaves**, read-only or not, about 2.5 s after each change. Copies are kept per form, with up to 8 copies per job, in `rpas_rec:<form uid>` (outside the database, so a read-only tab can't overwrite another tab's data). They are kept as history for 30 days and are not cleared on save.
- **Blank forms are never autosaved**, so an empty new form can't overwrite a job's copy.
- **Closing or reloading** with unsaved changes autosaves first, then warns. This applies in read-only tabs too. The close handler uses the latest form (a ref); an earlier attempt saved a stale snapshot, caught by the tests.
- **"Use this tab instead"** no longer reloads. The tab takes over in place and keeps everything on screen. Database writes pause until the stored database is re-read, so the other tab's saves are kept.
- **Save Draft / Save Approved Plan in a read-only tab** now offers "use THIS tab and save". It takes over, re-reads the stored database, merges this tab's plan record in (newest wins per plan id; other plans from the other tab are kept), then saves and verifies.
- **A tab with unsaved changes is never silently made read-only.** If two tabs both think they're the writer, the one with unsaved work keeps writing.
- **New Database & Settings › Recovery copies:** each job's autosaved copies with times. Click one to open it (nothing changes in the database until you save), or delete.
- The restore banner's Discard is now "Not now"; the copy stays under Recovery copies.

**Approval: sign first, then approve**
- The small "Approved for Flight" toggle in the Flight Authorisation header is replaced by a status badge.
- A large "Approved for Flight" switch now sits under the CRP and RPIC signature blocks. It stays disabled with "Sign first: CRP signature and RPIC signature" until both have signed, then shows who approved it and when.
- After "Amend plan" (which clears signatures), both must sign again before re-approving.

## v5.44 — 24 Oct 2026
**Risk register: L and C values readable**
- The L and C dropdowns were too narrow to show their values (only the arrow was visible). Each now shows the chosen value large with its meaning underneath (e.g. "4 / Occasional", "B / Hazardous"). The normal dropdown sits invisibly over it, so clicking still opens the full list.
- Residual L and C show "was 4" / "was B" when they differ from the initial value.
- Column widths: L/C 8%, Rating 5.5%, Hazard and Risk Description 10%, Existing and Additional Controls 12%. Print/PDF output unchanged.

## v5.43 — 24 Oct 2026
**Nearby aerodromes load automatically for the job's own area**
- Bug: the automatic search ran 2 s after the location text changed, before the place name had been looked up, so it fell back to Brisbane CBD (a Sunshine Coast job still showed Archerfield 6.2 nm until Search was pressed).
- The search now runs whenever the job's resolved position is known or changes: when a job opens, when the location name is found, and when launch/recovery GPS or map pins change.
- Positions are taken in this order: launch GPS, recovery GPS, map pins / ops area (new), location coordinates or place-name lookup.
- If no position is known yet, the list stays empty instead of showing Brisbane (`getCurrentCoords` now flags its fallback). The OpenAIP live fetch runs with it when a key is set.

## v5.42 — 21 Oct 2026
**Height zeroed at take-off**
- Each telemetry flight now starts at 0 m. Zero is the median smoothed altitude while armed on the ground: before ground speed first passes 3 km/h, up to 20 s, skipping the first 0.5 s, which often holds a stale value.
- Fallbacks: if the log started already moving, the landing point is used; if the log has no time on the ground, the lowest point is used. Each case is noted on the flight.
- Fixed the v5.41 behaviour (lowest point of the flight) that made flights start at 20/50/70 m when the aircraft flew below its launch level or GPS altitude drifted. Flights that go more than 3 m below take-off get a note: "Flew up to X m below the take-off point".
- Existing telemetry (imported with v5.40 or v5.41) is re-zeroed automatically from its stored trace when the job opens (`rebaseTelemetry` / `rebaseFlight`). Auto-filled Take-Off / Flight Operation / Landing heights update; heights typed by hand are kept. Save the job afterwards.
- Panel, detail view and PDF wording: "ft above take-off".

**Flight notes**
- Every flight has a notes box (Section 4 › Part C, under the telemetry). If the flight has limit warnings and no note, the box turns amber and offers quick notes:
  - above plan height/speed in a sheltered area, no people exposed
  - flown clear of people
  - area closed to the public and controlled by crew
  - performers/crew briefed and consented
- Notes print on the flight card in the PDF ("NOTES — …").
- Stored as `flight.notes`.

## v5.41 — 21 Oct 2026
**Progress bar for every import and upload**
- A progress card (bottom centre) shows the file being read, "File 3 of 12", percent by size, and then each processing step ("Finding flights", "Matching flights to aircraft by cell count"). It turns green with a result ("4 new flights found", "2 attached") and closes by itself.
- Covers: Import flight logs / Log dump, per-aircraft telemetry CSV import, site attachments (now uploaded one at a time), plan JSON, database backup restore, crew log, crew amendment, Flight Log tool export, battery CSV, logo.
- Helpers: `wdProgress`, `wdReadFiles`, `wdTrackReader`, `<WdProgressOverlay/>` (window event `wd-progress`).

**Import flight logs in Part C (Crew Logging)**
- A large "Import flight logs" button sits directly under the Primary RP / Second RP / Observer fields. It opens the multi-drone log dump (select every EdgeTX CSV from the day).
- In the review list, each aircraft dropdown now leads with "Matches 4S (16.2 V)": fleet aircraft whose cell count fits that log's starting RxBt voltage, with aircraft on this job first. Every other aircraft is listed after.
- If the plan is approved and a log is assigned to an RPA that isn't on the plan, the app asks first. Importing then withdraws approval for CRP re-approval and records the reason in the amendment log.

**Flight detail view + satellite route**
- The route thumbnail is now a satellite map (Google, with Esri fallback), built only when it scrolls into view. Clicking it, or the new "Details" button, opens a full-screen view of the flight:
  - stat tiles, including peak KE
  - a large satellite map with the route coloured by height, plus home and end markers
  - height/speed, battery/current and link/GPS-sats charts
  - hovering a chart moves a marker along the route and shows height, speed, V and V/cell, A, RQ, sats and position at that moment
  - limit issues, events and notes
- Esc or a click outside closes it.
- Telemetry traces now store 240 points with volts, amps, RQ and sats. Logs imported earlier show the height/speed chart only.

**Fix: height reading 0 m on FPV logs**
- The cause: CRSF "Alt" is noisy and often holds a stale value at arming. Mike's 17 Oct log read 13 m at the arm moment, then 0–8 m in flight. The old code measured from the first armed sample, so every reading went negative and was clamped to 0.
- Height is now measured from the lowest point of the flight, using 5-sample median-smoothed altitude for both the base and the peak. This can only over-state height, never under-state it. Mike's log now reads 8 m.
- Telemetry imported before v5.41 that shows 0 m gets a note asking for the CSV to be re-imported.

## v5.40 — 20 Oct 2026
**Emergency contacts** (JSA & Risk, above the risk register) — added after checking the ERP (30-05-2025), which says a list of relevant stakeholders for the location and type of operation "must be readily available to all personnel while on site".
- On by default, with an "Include in this job & the PDF" toggle. Prefilled from ERP Appendix B: emergency services 000 / 112, CRP Michael Rubio 0433 011 409, ATSB 1800 011 034, plus blank rows for nearest hospital and site contact. Rows are editable, removable, and "Add contact" adds more.
- ATC suggestions: the 28 ATC units from ERP Appendix B B2 are offered as one-click chips when their ICAO code appears in Nearby Aerodromes or the detected list. The OONP venue contact can also be added in one click.
- Prints in the PDF under Section 2 (rows with no name or phone are skipped). Jobs saved before v5.39 pick up the defaults. Locked with the rest of Section 2 once approved.
- The pre-flight checklist item now reads "Emergency contacts available on site", with ERP wording.

## v5.39 — 20 Oct 2026
**Approval lock**
- Once "Approved for flight" is on, Sections 1–3 (Preliminary, JSA & Risk, Authorisation) are locked: fields grey out and edits are blocked. Navigation, maps view, Fetch Live and OK2FLY still work.
- A green banner says who approved and when, with an **Amend plan** button. Amending asks for a reason, withdraws the approval and clears the CRP/RPIC signatures and dates, so the CRP must re-approve (ops manual: change to RPA type, crew, location or dates means re-authorisation).
- The amendment reason and time are kept and printed in the PDF above the authorisation banner ("Amended after approval … · re-approved …").
- Section 4 (Flight Log) stays editable after approval.

**Optional pre-flight checklist** (Section 4 › Part A)
- "Include in this job & the PDF" toggle. 14 items in three groups: Before flight (authorisation, on-site validation, briefing, daily serviceability, pre-flight inspection), Extra items for OONP/EVLOS jobs (proficiency, EVLOS comms, CASA.OONP.0079), General Part 101 checks (airspace, NOTAMs, weather, RePL/accreditation, registration, emergency contacts).
- Each item: Done / N/A (click again to clear). OONP/EVLOS group shows whether the job includes those ops. "Mark the rest done" fills unrecorded items (Done, or N/A for a group not on the job).
- PDF prints every item with full text and a DONE / N/A / — badge under Part A.
- Stored in `log.preflightChecks = {enabled, items:{"group.item":"done"|"na"}}`.

## v5.38 (20 Oct 2026): OONP free-text fields now printed in the PDF
Built on WakingDream_v5.37.html (source v538_src.html, patch538.py, bundle.py). Mike's in-person pyro briefing notes were in the app but not in the PDF. Four OONP fields entered in the app had never been printed; all are now in the OONP box of the PDF:
- **SFX / pyro notes** (`oonp.pyroSfxNotes`): under the "SFX / PYRO PRESENT" chips. The section now also appears when there are notes but no ticked effects.
- **Consent notes** (`oonp.performerConsentNotes`): under the informed-consent list.
- **Media lead and phone** (`oonp.mediaLead`, `mediaLeadPhone`): as an extra row in the contacts grid when filled.
- **Additional OONP notes** (`oonp.oonpNotes`): at the end of the OONP box.
- Notes keep their line breaks and are escaped. Pyro chip labels are now escaped too.
- Tested: 6 PDF checks, plus all earlier suites.

## v5.37 (20 Oct 2026): edits can't be lost silently: autosaved working copy, unsaved-changes warning, save check
Built on WakingDream_v5.36.html (source v537_src.html, patch537.py, bundle.py). Mike reported a NOTAM update and pyro info not saving. A straight save → reload → resume kept both in testing, so this build closes every way edits can go missing.
- **Unsaved-changes indicator** in the header, next to Save Draft: "● Unsaved changes", then "✓ Saved 4:52 pm".
  - Closing or reloading the tab while unsaved triggers the browser's leave-page warning.
  - Loading another plan or pressing New Operation while unsaved warns that the changes will be lost.
- **Autosaved working copy.** About 2.5 s after any change, the whole form is written to its own IndexedDB slot (`rpas_working`), separate from the database and not counted as a draft.
  - On next open, if it's newer than anything saved for that job, a blue bar offers "Restore them / Discard".
  - Saving clears it. Read-only second tabs don't write it.
- **Every save is checked.** After Save Draft or Save Approved Plan, the database is read back and overview, approval (incl. NOTAMs), OONP (incl. pyro), JSA, risks, log and checklist are compared with what's on screen. The alert says "Draft saved and checked"; a mismatch gives a clear warning to export a backup.
- **Approved vs draft copies:**
  - Saving a draft of a job that also has an approved plan says the approved copy hasn't changed.
  - Opening an approved or completed copy when a newer draft exists offers "open the newer draft instead".
  - Saved-plan lists now show the save time and the operation ID, so copies can be told apart.
- **OONP checklists** (pyro, pre-flight and others with tick boxes): clicking the item text now ticks it. Before, only the small square responded.
- Tested: 15 checks (autosave, restore after a simulated closed tab, NOTAM + pyro note + pyro tick restored, save check, approved/newer-draft prompt, list times, text click), plus all earlier suites.

## v5.36 (20 Oct 2026): OONP note and PDF expiry box removed
Built on WakingDream_v5.35.html (source v536_src.html, patch536.py, bundle.py).
- **Authorisation tab:** an authorisation set to the second "Doesn't cover" option (renamed "Don't flag: covered by the ops manual", stored as `exclusionMode: 'manual'`) now shows nothing on the job. The blue CASA.OONP.0079 / Schedule 1.3 note is gone. Entries set to "Warn on the job" still warn.
- **PDF:** the "Expiry check for the job dates" box is removed from Section 3, because it isn't useful to clients and could worry them. The expiry check stays on screen in the Authorisation tab (internal use), and approving with out-of-date items still asks first.
- Tested: all suites (v5.30 and v5.32 tests updated for no note; v5.27 test now checks the PDF has no expiry box).

## v5.35 (19 Oct 2026): Airspace & radio check (OpenAIP), filling the JSA in one click
Built on WakingDream_v5.34.html (source v535_src.html, patch535.py, bundle.py). OK2FLY's recreational view doesn't show airspace or frequencies, and its commercial mode is expensive, so the planner now gets these from OpenAIP.
- **Fetch Live** (JSA airspace field) was rewritten (`buildAirspaceCheck`). It checks at the ops-area centre, else the launch site or job location (same point OK2FLY opens on). Both requests go in parallel: bbox, with a position-search fallback.
  - **Airspace at the point:** only airspaces that actually contain it (point-in-polygon), with name, type, class and lower/upper limits (SFC, ft AGL/AMSL, FL). FIR/UIR/ACC/FIS sectors are left out. Special-use areas (R/D/P, alert, warning, TFR) are tinted red; controlled airspace starting at or below 400 ft is tinted amber.
  - **Within 3 km:** airspace edges nearby, with the distance to the edge.
  - **Aerodromes and heliports within 15 km** (up to 8): bearing and distance in OK2FLY style (078° / 2,484 m), a "within 5.5 km" flag for aerodromes, a "controlled" tag when tower/approach/ground frequencies exist, and every frequency with its decoded type (Tower, Ground, ATIS, CTAF…).
  - **Add to JSA** fills Airspace Class (e.g. "Class G at the surface (controlled airspace above: Class C from 1,500 ft); R407B SYDNEY RESTRICTED SFC to 1,000 ft"), Nearby Aerodromes and Radio Frequencies, and stores `jsa.airspaceSource` ("OpenAIP, checked <date> at the <point> (lat, lng)"). The PDF prints it next to Airspace Class.
  - Every panel carries this note: "OpenAIP is community data, not an official source. Confirm against the ERSA, the Designated Airspace Handbook and NAIPS (including temporary restricted areas by NOTAM) before flight."
- **No client ID yet:** the panel shows the three setup steps (openaip.net account → create client ID → paste into Database & Settings › API Integration Settings).
- **Errors:** the automatic background fetch (on location change) no longer pops alerts; it shows the error in the panel instead.
- **OpenAIP numeric codes** (airspace type, ICAO class, limit unit/datum, airport type, frequency type) are decoded from OpenAIP's published scheme. Its live documentation couldn't be reached from the sandbox, and names from the data are always shown alongside.
- Tested against a mocked OpenAIP API (Sydney Olympic Park: R407B, Class C CTA above, FIR, danger area nearby, Concord Hospital heliport, Bankstown with Tower/Ground/ATIS): 14 checks, plus all earlier suites. **Not yet run against the live OpenAIP service.**

## v5.34 (19 Oct 2026): launch/recovery pins without text labels, so the tip sits on the exact point
Built on WakingDream_v5.33.html (source v534_src.html, patch534.py, bundle.py).
- **Ops map (app):**
  - The "Launch 1" / "Recovery 1" text boxes under the pins are gone. Each pin was anchored by the bottom of the whole marker, label included, so the pin tip sat about 20 px above the true point.
  - The tip now lands within 1 px of the GPS point.
  - The name still shows on hover, and in the pin's edit pop-up when clicked.
- **PDF map:** the permanent name boxes over the launch (blue) and recovery (purple) dots are removed. The map key below still explains the colours.
- Tested: 7 checks (tip position for both pins, hover names, PDF), plus all earlier suites.

## v5.33 (18 Oct 2026): OK2FLY opens straight at the job
Built on WakingDream_v5.32.html (source v533_src.html, patch533.py, bundle.py).
- OK2FLY takes the map position in its address: `https://ok2fly.com.au/?lat=…&lon=…&map=SATELLITE&zoom=…` (confirmed from Mike's browser). The OK2FLY panel and its "Open in its own window" link now use it, so OK2FLY's own search isn't needed.
- **Where it opens:**
  - **Ops area drawn:** centred on the ops area, zoomed so the area takes about a third of the panel width (zoom 10–18).
  - **No ops area:** the first launch or recovery site with coordinates, or the job location, at zoom 16.
  - **Nothing set:** OK2FLY's home page, with a prompt to draw the ops area or add a launch site.
- The panel header shows what it opened on ("Opened at the ops area centre -27.54…, 153.22…") with a Copy button.
- Tested: 10 OK2FLY checks (ops area centre and zoom, launch-site fallback, own-window link), plus all earlier suites.

## v5.32 (18 Oct 2026): CASA.OONP.0079 Schedule 1.3 shown as a note, not a warning
Built on WakingDream_v5.31.html (source v532_src.html, patch532.py, bundle.py).
- **Mike's reading, agreed by his CASA delegate (written CASA confirmation pending):** Schedule 1.3 (EVLOS, night, swarm) applies only where those operations aren't already approved in the operations manual. Mike's manual approves EVLOS and night.
- **New setting per authorisation:** `exclusionMode`, either "Warn on the job" (as before) or "Note only: covered if approved in the ops manual". It sits under "Doesn't cover" in Database & Settings › Official authorisations.
- **CASA.OONP.0079 defaults to "Note only".** On an EVLOS or night job its chip stays green, and a blue info note replaces the amber warning, quoting the note text: "Schedule 1.3 lists EVLOS, night and swarm. Read with the CASA delegate as applying only where these are not already approved in the operations manual (ours approves EVLOS and night). Written CASA confirmation pending."
- **One-time update** (flag `5.32-oonp-note`): a saved list from v5.30/5.31 gets this mode and note on its CASA.OONP.0079 entry. A note Mike has edited himself is kept. Other entries are untouched.
- When CASA confirms, edit the note or switch the mode in Database & Settings; no new build is needed.
- Tested: 7 new checks, plus all earlier suites (the v5.30 test was updated for the new wording).

## v5.31 (17 Oct 2026): new KE chart layout ("Limits table") as the default, energy grid rebuilt around the limits
Built on WakingDream_v5.30.html (source v531_src.html, patch531.py, bundle.py). The main KE chart and every "Additional RPA" chart now use one shared component, `KeChartPanel`, with the same physics (`computeKeLimits`). The PDF copies whichever view is on screen.
- **Limits table (default)**, in the layout Mike supplied:
  - **Columns:** Operating height m (ft); Max speed for 15 J (no consent); Max speed for 34 J (informed consent).
  - **Rows:** even height steps chosen per aircraft (0.25/0.5/1/2/5/10 m, about 15 rows or fewer), plus the exact 15 J and 34 J hover ceilings as bold "0 — N J CEILING" rows.
  - **Colours:** green and yellow cells; red "—" above each ceiling.
  - **Summary pills:** "15 J ceiling: x m (ft) hovering | y kph (m/s) at ground level", and the same for 34 J. Legend line underneath.
  - **Aerodynamic model:** if 34 J is never reached vertically, the pill says so (terminal velocity).
- **Energy grid** (toggle), rebuilt to put the limits first:
  - **Axes:** built around the exact 15 J and 34 J max heights and max speeds, plus a few even steps and one over-limit row and column.
  - **Limit lines:** limit rows and columns are tinted and labelled "15 J MAX" / "34 J MAX", and the limit cells are outlined so they read exactly 15.0 / 34.0.
- **Toggle** per chart ("Limits table | Energy grid"), saved with the plan (`keData.chartView`, `extraKe[].chartView`). "Add chart for new RPA" is in the toggle bar, and both are left out of the PDF.
- **Rounding:** every limit is rounded DOWN (heights to 0.01 m, speeds to 0.01 m/s and 0.1 kph), so a printed limit never exceeds the true limit. Mike's reference image rounds to nearest, so some figures read 0.1 lower (e.g. 34 J ceiling 11.74 m vs 11.75 m; 54.6 vs 54.7 kph).
- Tested offline: 25 checks against the Mini 5 Pro (0.295 kg) reference figures, the toggle, the saved view, an extra chart, a Mavic 4 aero chart and PDF output; plus all earlier suites.

## v5.30 (16 Oct 2026): official authorisations as a clickable list, OK2FLY inside the planner
Built on WakingDream_v5.29.html (source v530_src.html, patch530.py, bundle.py).
- **Database & Settings › Official authorisations.** An editable list stored in `db.officialAuths`, so it's included in backups.
  - Each entry has a reference, description, applies to (Your approval / All operators), expiry, "Doesn't cover" (EVLOS / Night / BVLOS) and a note.
  - Add and remove entries; "Restore defaults" brings back any default that was deleted.
  - Defaults, your approvals:
    - CASA.OONP.0079, over or near people. Marked as not covering EVLOS, night or swarm (Schedule 1.3).
    - CASA.EVLOS.0346.
  - Defaults, all operators:
    - CASA 20/25: Operation of Certain Unmanned Aircraft and Rockets – Directions Instrument 2025, expires 31 Mar 2028.
    - CASA EX87/25: Obtaining Experience Exemption 2025, expires 30 Sep 2028.
    - Night VLOS under the ReOC (Part 101 MOS and ops manual night procedures). This is a reference note, not a separate instrument.
- **Authorisation tab › Identification of Official Authorisation.**
  - Click-to-add chips, grouped as "Your approvals" and "All operators". Clicking adds a line "CODE (description)" to the text box; clicking again removes it. Free typing still works.
  - The text box grows to fit.
  - The stored value is still the plain text field `approval.officialAuth`, so the PDF, Copy as new job and old plans are unchanged.
- **Warnings:** a selected authorisation that doesn't cover an operation type on the job (EVLOS, or night from NVLOS / time of day) turns its chip amber and shows a warning, e.g. CASA.OONP.0079 on an EVLOS job.
- **Expiry check:** selected authorisations with an expiry date are included.
- **OK2FLY button**, next to "Fetch Live" on the JSA airspace field and next to NAIPS on the Authorisation tab.
  - Opens https://ok2fly.com.au in a panel inside the planner and copies the job's launch coordinates for pasting into its search.
  - "Open in its own window" is always available, because the site may not allow being shown inside another page. That couldn't be checked from the sandbox.
- Tested offline on the bundled file: 10 authorisation checks, 7 OK2FLY panel checks, and all earlier suites.

## v5.29 (16 Oct 2026): Log dump for multi-drone days, battery rating per aircraft, fleet update
Built on WakingDream_v5.28.html (source v529_src.html, patch529.py, bundle.py).
- **Fleet › each aircraft:** two new settings, both stored on `db.fleet[rpa]`.
  - **Battery:** 1S–14S, or "No radio logs (DJI etc.)". Stored as `cells`.
  - **Radio model:** the EdgeTX model name that starts each log file name. Stored as `radioModel`.
- **Section 4 › Radio logs › Log dump:** pick every telemetry CSV from the day at once. Each armed flight is matched to an aircraft:
  1. Radio model in the file name (EdgeTX names logs `<model>-YYYY-MM-DD-HHMMSS.csv`) against each aircraft's Radio model, or the aircraft name.
  2. Otherwise by battery: the starting RxBt voltage gives the possible cell counts (3.30–4.45 V/cell; 3.7–4.4 preferred when two fit), matched to the aircraft's Battery setting. Aircraft on this job are tried before the rest of the fleet.
  - **Review screen** before anything is added. It shows start time, armed time, file and model, start V, detected cells (\* when another count also fits), max altitude, an aircraft drop-down and the reason for each match. Two matching aircraft on the job are left for you to choose. Flights already in Section 4 are skipped.
  - **On import:** the aircraft is added to the job if needed, blank starter flights are dropped, flights are sorted by time, and `telemetry.cells` is set from the aircraft so per-cell sag is right.
  - **Learns radio models:** hand-picked and battery-matched logs save their model name to aircraft that don't have one yet, so the next dump sorts by name.
- **Battery picker** on each flight, using the aircraft's Battery setting and the pack ID prefix (`6s-…`, `3S-…`, `4S …`):
  - Order: packs assigned to this aircraft (right rating first), then "Other NS packs", then other ratings and unlabelled packs.
  - Any pack can still be chosen. A pack of the wrong rating shows an amber rating tag in the list, and an amber chip with a warning icon once picked.
- **One-time fleet update** (runs once per database, flag `db.migrations['5.29-cells']`, with a summary message):
  - Battery set by name: 5" → 6S, Cinelog (not 30) → 6S, Cinelog 30 → 4S, Pavo 20 → 3S. 2.5" and Pavo 25 are not touched.
  - Then any pack whose rating doesn't match its aircraft is moved to the one aircraft of that rating. With the default packs, that moves 4S-850 #31–34 from Cinelog 35 to Cinelog 30. Packs with no single match are left and listed.
- Tested offline on the bundled file:
  - Log dump 17 checks: cells, name and radio-model matches, ambiguity, manual choice, learning, duplicates, cancel.
  - Battery and fleet 13 checks.
  - All earlier suites: v5.25 31, v5.27 18, v5.28 17, equipment, pins, matrix, telemetry, templates, offline PDF.

## v5.28 (13 Oct 2026): one planner again: Flight Log import merged, battery register, flights checked against plan limits
Built on WakingDream_v5.27.html, plus the Flight Log chat's planner build (WakingDream_v5.26b.html, "Planner v5.26" in the Flight Log changelog). That build was branched from v5.25, so it was merged in with a 3-way merge (base v5.25). Only the version lines conflicted. **v5.28 is now the single planner line**; the Flight Log chat should build on it from here.
- **From the Flight Log build (unchanged):**
  - Flight Log → Import in Section 4: `wd-flightlog-export` schemaVersion 2.
  - The `mergeFlightLog` merge logic.
  - Database & Settings → Logged time (pilots and aircraft).
- **Battery register** (Database & Settings, full width; replaces the small battery table in the Logged time card):
  - Lists every pack known to the fleet, database or completed records.
  - Cycles = prior cycles (entered per pack, for packs used before logging started) + each completed flight the pack is listed on.
  - Default cycle limit is 200 (editable), with a per-pack override (e.g. 300 for DJI packs).
  - Flags: amber "Near cycle limit" at 90%, red "At cycle limit, retire", amber "Sagged to x.xx V/cell" when telemetry shows below 3.30 V/cell.
  - Retired tick box, plus filters: In service / Needs attention / Retired / All.
  - CSV export.
  - Stored in `db.batteryInfo` (`priorCycles`, `cycleLimit`, `retired`) and `db.batteryCycleLimit`, so it's included in backups.
- **Flights checked against the plan** (`flightLimitIssues`), on every flight with telemetry:
  - **Height:** max height vs the plan's max operating height (JSA, else the Section 1 planned height, else 400 ft), with 10 ft tolerance.
  - **Flights marked OONP only:**
    - Peak KE estimate over 34 J is red.
    - Max speed above the plan's 34 J speed limit and max height above its 34 J height limit are amber. The limits come from the OONP KE limits table: typed overrides first, otherwise the auto values.
  - **Where issues show:**
    - On each flight's telemetry panel.
    - In a "Flight checks for this job" box at the top of Section 4, which also lists batteries used on the job that are retired, at or near their cycle limit, or sagging.
    - In the PDF under each flight's telemetry strip.
- Tested offline on the bundled file:
  - 17 new checks: Flight Log import with a skipped aircraft, height/KE/speed flags, a non-OONP flight not KE-checked, retired and near-limit packs, register limits and filters, PDF.
  - The v5.25 (31), v5.27 (18), equipment, GPS pin, matrix, telemetry, template and offline PDF tests.

## v5.27 (12 Oct 2026): expiry check per job, Copy as new job
Built on WakingDream_v5.26.html (offline bundle; source v527_src.html, built with bundle.py).
- **Expiry check on the Authorisation tab**, measured against the job's own dates (operation date to end date), not today's date. It checks:
  - **Company:** every expiry in Compliance Calendar › Expiries. ReOC and insurance are flagged when no date is entered. The OONP approval is only checked when OONP mode is on.
  - **Crew:** the pilots named on the job (RPIC, support personnel, and the CRP/RPIC names in the authorisation), matched to Database & Settings › Pilots: medical and RePL/training currency.
  - **Aircraft:** each selected RPA's CASA registration and maintenance due date.
  - **Statuses:** red ⚠ means expired before the job or expires during it. Amber ⚠ means it expires within 14 days after the job. A grey dot means the date is missing. In-date items are collapsed under "N items in date".
- **Approving asks first.** Switching on "Approved for Flight" while anything is out of date lists those items and asks to confirm. Out-of-date items also appear in the tab warnings.
- **PDF:** Section 3 has an "Expiry check for the job dates" box listing the issues, plus a line of the in-date items. Warning signs are used rather than red crosses.
- **Copy as new job** button on every draft, approved plan and completed record in Database & Settings. It asks for the new date and gives the job the next operation ID and a new uid.
  - **Kept:** site, map and pins, risks, JSA, OONP set-up, KE charts, crew, client and photos. Multi-day jobs keep their length.
  - **Kept from the approval:** "Official authorisation reference" and "Other restrictions".
  - **Cleared:** approvals and signatures, NOTAMs, the post-flight log and telemetry, consent answers (back to pending) and amendments.
  - The new job isn't saved until Save Draft, and the original plan is untouched.
- Tested offline on the bundled file: 18 new checks, plus the v5.25 suite (31/31), equipment, GPS pins, matrix, telemetry, templates and offline PDF.

## v5.26 (12 Oct 2026): works offline, opens in about half a second
Built on WakingDream_v5.25.html. The planner no longer needs internet to open.
- **Everything bundled into the one file:** React 18.3.1 and ReactDOM 18.3.1, Leaflet 1.9.4 (JS and CSS), Font Awesome Free 6.4.0 (CSS with the solid and regular fonts embedded), and the Tailwind 3.4 CSS prebuilt from the planner's own classes. No unpkg, Tailwind CDN or cdnjs requests.
- **Precompiled.** The JSX is compiled ahead of time with the same Babel standalone 7.29.9 settings the browser used (presets react + env, same plugins), then minified. This matters: the old in-browser compile turned `const` into `var`, and the app relies on that in places, so a different compile setting crashes on load. In the test browser the UI was up in about 0.55 s, against roughly 1.5 s of in-browser compiling before.
- **PDF export works offline:** the PDF window uses the copy of Leaflet bundled in the page instead of cdnjs.
- **Still needs signal:** map tiles (Google/Esri), address search (Nominatim), elevation lookup, OpenAIP airspace and NAIPS. Forms, checklists, risk register, saving, backups, crew logs and the PDF all work without it.
- Header title is now white (it was dark slate on the purple bar).
- File size about 1.5 MB (was 1.0 MB, but the old file also downloaded about 1.3 MB of libraries every time it opened).
- **Build note:** the editable source is v526_src.html (still the text/babel form). build526.py produces the bundled file. Future changes go into the source and are rebuilt.
- Tested on the bundled file with all network requests blocked: the 31 v5.25 checks, the equipment, GPS pin, matrix, telemetry and template tests, PDF export with its maps, and crew log generation.

## v5.25 (12 Oct 2026): safety fixes from the v5.24 code audit
Built on WakingDream_v5.24.html. No change to how the planner is used day to day.
- **Crew log import merges instead of overwriting.** Only fields the crew actually filled in are taken; blank fields never replace Mike's. Ticks are only ever added. Crew flights are added after the existing flights (blank starter flights are dropped, duplicates skipped). A confirm box lists every change before it's applied.
- **Sequential operation IDs** (OP-2026-0001, 0002…), worked out from every saved plan, draft and completed record. Each plan also gets a hidden `overview.uid`. If saving would overwrite a *different* job with the same ID (possible with old random IDs), the planner warns and offers the next free ID instead.
- **Backups:**
  - Export now downloads as a real file (named with local date and time) and includes custom risk templates plus a `_backup` stamp (version, time).
  - Export records the "last backup" date; Database & Settings shows "Last backup N days ago" (amber after 14 days or if none).
  - Import asks first (shows counts for the backup and the current data), keeps a **safety copy** of the current database, and keeps custom templates from this device.
  - "Restore safety copy" link in Database & Settings; restoring swaps, so it can be undone.
- **Custom risk templates moved into the database** (were browser storage only), migrated automatically on first open.
- **Two-tab guard.** A second tab or window opens read-only with a yellow bar and refuses to save; it refreshes when the main tab saves. "Use this tab instead" hands over.
- **Error screen:** Reload, Download Backup, and a "Reset app data…" that needs RESET typed and keeps a safety copy. The Database & Settings "Clear & Reset" does the same.
- **Local dates** instead of UTC for the default operation date, amendment dates, completed-record dates and export file names.
- **Pinned libraries:** React/ReactDOM 18.3.1, Babel standalone 7.29.9, Tailwind CDN 3.4.17 (Leaflet already 1.9.4).
- **Version stamp:** v5.25 in the header, tab title, PDF footer, and `appVersion` in every saved plan and backup.
- Removed the unused 17.5 KB base64 copy of the crew page script.
- Tested: 31 checks (IDs, clash, crew merge, export/import/safety copy, two tabs, reset, Brisbane date) plus the earlier equipment, GPS pin, matrix, telemetry and template tests.

## v5.24 (11 Oct 2026): GPS pins fill Launch/TOLZ and Recovery sites
Built on WakingDream_v5.23.html.
- Launch and recovery pins on the ops map now fill the Launch / TOLZ Sites and Recovery Sites coordinates automatically (matched by pin, then within 5 m, then an empty row, else a new row). Removing a pin clears its row.
- Typing coordinates on a pinned site detaches it from the pin (`pinOverride`) so it isn't duplicated on reload.
- The load summary now includes an OONP line (equipment, logistics fields, checklist answers) to help trace drafts that don't seem to keep values.

## v5.23 (11 Oct 2026): risk matrix graphic, no red crosses, green "approved by mitigation", 4-state consent
Built on WakingDream_v5.22.html.
- **One risk matrix everywhere.** This keeps the CASA 1–5 × A–E scale; Mike chose to keep the letters and restyle only.
  - Previously, three different rules disagreed: the matrix picture, the register badges, and a product formula in the PDF. All three now use one `RISK_LEVELS` table, taken from the matrix graphic the planner already showed:
    - **Extreme:** 5A, 5B, 4A.
    - **High:** 5C, 4B, 3A, 2A.
    - **Low:** 3D, 3E, 2C, 2D, 2E, 1B–1E.
    - **Medium:** the rest.
  - Register badges that changed: 5C, 4B and 3A move from Extreme to High; 2A moves from Medium to High; 2C moves from Medium to Low.
- **New matrix graphic in Mike's style.**
  - Dark-grey Likelihood/Consequence headers and coloured cells labelled like "5A - EXTREME".
  - A legend with the actions: Extreme/High mean the task is not permitted; Medium means proceed and reduce ALARP; Low means proceed.
  - Live counts show where the register's initial (●) and residual (◆) ratings fall.
  - The same HTML (`riskMatrixHtml`) is used in the planner (now shown by default), in browser print, and in the PDF above the register. The old colour chips under the PDF register have been removed.
- **Preliminary checklist, no red crosses.**
  - Ticked items show a green ✓.
  - Unticked items with a mitigating approval typed in (e.g. "EVLOS 1", "Pathway 2 OONP — CASA.RPAS.1040") show green: in the planner (green label and green note box), in browser print, and in the PDF (green ✓ plus an "Approved: …" pill).
  - Items with nothing typed show a grey dot.
  - The PDF now lists the configured checklist items, including custom ones, instead of a fixed short list.
- **Informed consent & venue compliance**, now a four-state list:
  - pending: grey dot (the default);
  - Yes: green ✓;
  - No: red ✗;
  - N/A: greyed and struck through.

  It uses Yes/No/N/A buttons per item; clicking the selected answer again clears it. The values are stored in `oonp.checkboxes` as true, 'no', 'na', or unset. The PDF shows the same states.
- **Other red crosses removed from the report:** YES/NO fields, the "Unsigned" signature status, the "Flight not yet authorised" banner and the in-app print badge. A genuine over-400 ft exceedance now shows "⚠ NO".

## v5.22 (11 Oct 2026): OONP Pathway 2 + EVLOS night festival template — covered venue with open roof, SFX/pyro
Built on WakingDream_v5.21.html. Adds the risk template "OONP Pathway 2 + EVLOS — Night / Covered festival venue, open roof (limited GPS, SFX/pyro)" (key `oonpP2EvlosNightVenue`) to the OONP Operations group. It's based on the OONP + EVLOS Night template.

20 risks. Rows adapted for a covered venue with an open roof:
- Degraded or intermittent GNSS. The aircraft is flown manually, with no reliance on GPS hold under the roof. RTH/GPS rescue is disabled or set to land in place (never climb-and-return under a roof). Failsafe is set to hold then drop over a cleared area.
- Wind and rain through the roof opening, plus AC, fans, CO2 jets and propwash recirculation.
- Manned aircraft: the open roof exposes the operation to outside airspace, so the aircraft stays below the roofline and airspace and NOTAMs are checked.

New rows for this venue:
- **SFX/pyrotechnics (initial 3B → residual 1C)**, controlled by:
  - a pre-event briefing with the pyro/SFX and laser teams, reviewing the pyrotechnician's cue sheet;
  - mapping the splash/fallout zones as no-fly while effects are live;
  - flight timing locked to the runlist, with direct comms to the pyro operator or show caller (a "drone clear" call before firing, and a hold call either side can use);
  - test flights during the tech run or rehearsal.
- Lasers.
- Haze and smoke.
- Truss, rigging, LED walls and kinetic rigs.
- Stage lighting, strobes and blackouts.
- High sound levels: noise-cancelling headsets, with hand signals as backup.
- RF from LED walls, wireless mics/IEMs and crowd phones.
- LiPo fire in an enclosed venue.
- Downwash on performers and props.
- Venue emergency, show stop and evacuation.

## HUD Overlay Studio v1.2 (10 Oct 2026): real map tiles under the GPS mini-map, themed to each HUD
Built on HUD Studio v1.1. A new **GPS map** panel in the sidebar.
- **Background:**
  - None (track only).
  - Satellite.
  - Street map.
  - Hybrid: satellite plus roads and labels.
- **Source:**
  - **Google** (tried first).
  - **Esri World Imagery** for satellite.
  - **CARTO Voyager** (OpenStreetMap data) for streets.
  - **Esri reference layers** for hybrid.
- **CORS fallback:** tiles are drawn into the HUD canvas, so the server must allow cross-origin use. If Google refuses, the tool switches automatically to Esri/CARTO and says so in the panel.
- **Look:** Natural, or **Themed to HUD**:
  - Fighter: monochrome tinted in the HUD colour; street maps are inverted so roads glow on dark.
  - Sci-fi: an inverted cyan hologram with scanlines.
  - Warbird: sepia, multiplied onto the paper chart so the folds and stains show through.
  - Race: a dark broadcast-style map in a panel with a red underline.
  - Arcade: pixelated and posterised.
- **Size and opacity:** map size 70–200% and map opacity, for every style.
- **Tile zoom:** picked from the output resolution, so 4K exports fetch sharper tiles. Every tile the export needs is fetched before rendering starts.
- **Credits:** provider attribution is drawn on the map (© Google / © Esri, Maxar, Earthstar / © OpenStreetMap contributors © CARTO). The panel notes that the provider's terms should be checked for paid client work.
- **Testing:** done against a mock tile server. A red dot at the home GPS point lined up with the HUD home marker. A 20 s fighter overlay export with street tiles produced 480 frames, with no tainted-canvas errors. The Google CORS fallback can't be exercised in the sandbox (Chromium was run with file access), so it's unverified on a real machine.

## HUD Overlay Studio v1.1 (10 Oct 2026): five HUD styles + GPS mini-map
Built on HUD Studio v1.0. A new **HUD style** picker with five complete designs. The element switches apply to every style where they make sense.
- **Fighter jet** (the v1.0 look): adds a corner-bracketed GPS mini-map with a heading-rotated aircraft symbol. Screen-blend friendly.
- **Sci-fi:**
  - Neon chamfered frame, a title tab showing SYSTEMS ARMED / STANDBY or warnings, and a heading tape in the bottom tab.
  - Segmented rotating reticle; ring gauges for velocity and altitude (with V/S).
  - Ring counters for link, sats and throttle; coordinates and clock.
  - A segmented POWER bar panel, and a radar minimap with sweep and the GPS trail.
  - Orbitron font. Screen-blend friendly.
- **Vintage warbird (WWII):**
  - Revi-style amber reflector gunsight.
  - A row of brass-bezel dials: air speed, altimeter (two needles plus a counter), rotating compass card, artificial horizon (only when the pitch ladder is on and attitude data exists), throttle "% power", fuel (battery), and radio signal with distance out.
  - Riveted brass caption plaque, a typed clock slip, a SORTIE timer, and a red warning lamp.
  - **Paper flight-chart mini-map:** aged paper with fold creases, grid, dashed red-ink route, X for home, plane silhouette, compass rose, scale bar and coordinates.
  - Special Elite font. Solid dials, so export as PNG or burn-in.
- **Race broadcast** (surprise 1, suits motorsport jobs):
  - F1-TV-style speed panel with 15 shift-light LEDs driven by throttle.
  - Timing tower: FLT, ALT, DIST, BATT, USED, LINK.
  - LIVE badge and clock, and a white circuit-style track map with a chequered home marker.
  - Optional driver-input circle.
  - Flags: YELLOW FLAG for low battery or link, RED FLAG for failsafe.
  - Barlow Condensed font. PNG or burn-in.
- **Arcade 8-bit** (surprise 2):
  - 1UP score (distance flown ×10), HI-SPEED (max speed) and TIME.
  - LIFE = battery as five pixel hearts; SPD, ALT and SIG pixel bars; pixel crosshair; pixel-grid mini-map.
  - Event banners: PRESS START, READY… GO! on arming, STAGE CLEAR on landing, LOW FUEL!, NO SIGNAL!, GAME OVER? (failsafe) and MAX SPEED!
  - Press Start 2P font. PNG or burn-in.
- **New "GPS mini-map" element:** the track is held in metres from home. It fits the whole flight's bounding box, so it doesn't rescale mid-video, and it draws the trail so far.
- **Fonts and warnings:** each style's Google Fonts are loaded before export. A warning appears when a solid-panel style is paired with the overlay-on-black (Screen) export.
- **Testing:** all five styles rendered at 1080p using local copies of the fonts, with no errors. The sci-fi 1440×1080 at 24 fps black-overlay export produced 5,494 frames.

## HUD Overlay Studio v1.0 (10 Oct 2026): fighter-style telemetry overlay for footage
New separate tool, WakingDream_HUD_Studio_v1.0.html. It reads the same EdgeTX/ELRS CSV as the planner and the Flight Replay tool. It's a single file with the mp4-muxer library (MIT) inlined, and it uses the B612 Mono cockpit font from Google Fonts with a monospace fallback.
- **Workflow:**
  1. Open the log.
  2. Optionally open the GoPro or DVR clip.
  3. Scrub to the moment of arming and press **Arming is here**. Nudge by ±1 s, ±0.1 s or ±1 frame.
  4. Pick a style.
  5. Export.

  With a clip loaded, the overlay is exactly the clip's length, so it drops in at the same start point on the timeline.
- **HUD elements** (each can be switched on or off):
  - Heading tape.
  - Ground-speed tape on the left; altitude tape on the right, with V/S.
  - Boresight.
  - Pitch ladder: rotates with roll, with camera-uptilt and invert settings. It switches off automatically when attitude updates are slower than 2/s.
  - Battery block: V, per-cell, current, mAh, %.
  - Link block: LQ and RSSI, sats, TX power, distance with a home arrow.
  - T+ timer, flight mode, throttle bar.
  - Optional stick inputs, clock and date, and caption.
  - Blinking warnings: FAILSAFE, LOW BATTERY under 3.4 V/cell, LINK LOW under 50%.
- **Style options:**
  - Colours: green, amber, white or cyan.
  - Size 70–150% and opacity.
  - Glow, and a dark outline for readability on bright sky.
  - Units: metric, imperial, or aviation (ft and kt, V/S in fpm).
- **Smoothing:** telemetry is eased between updates. Each field is reduced to its change points and blended over the last update interval. Sticks use every sample.
- **Update-rate report:** shows how often each field changed per second. The sample log showed attitude, altitude, speed and GPS updating only about every 5.6 s (ELRS telemetry ratio too low), while sticks were at 10/s.
- **Export modes:**
  - **Overlay on black (MP4):** use the Screen or Add blend mode in the editor.
  - **Transparent PNG sequence:** written straight to a folder in Chrome/Edge, otherwise as a store-only .zip.
  - **Burned into the video (MP4):** no audio; frames are seeked and drawn one at a time.
- **Encoding:** WebCodecs H.264 (High profile) where available, otherwise VP9. On Chrome/Edge the file is saved through the save-file picker (streamed), otherwise as an in-memory download.
- **Resolutions:** match the video, 1080p, 2.7K, 4K, the 4:3 variants, or vertical 1080×1920.
- **Frame rates:** 24, 25, 30, 50 or 60 fps.
- **Testing:** done in Chromium (VP9 path). Exports had the correct frame counts (600 frames for a 20 s clip at 30 fps). PNG frames are RGBA.

## Flight Replay v1.0 (10 Oct 2026): standalone DJI-style log viewer
New separate tool, WakingDream_FlightReplay_v1.0.html. It reads the same EdgeTX/ELRS telemetry CSV as the planner's v5.21 import. It's kept separate so full-resolution logs (about 850 KB per flight) don't bloat plan storage. The planner keeps the summary and the replay tool shows the full flight.
- **Loading logs:** open or drag-drop one or more CSVs. Each armed period becomes a flight in the list, using the same FM-based logic as the planner, with 3 s of padding either side.
- **Map:** Google satellite or road map (same tiles as the planner).
  - The GPS track is coloured by ground speed or by height.
  - Home marker, plus an aircraft marker rotated by attitude yaw.
  - Failsafe and low-link points are marked.
  - Click the track to jump to that moment.
  - Follow and Fit modes.
- **HUD:** height (relative to arming), distance from home, horizontal speed, vertical speed (over a 1 s window), battery V and per-cell, mAh and %, link RQly and RSSI, flight mode. Plus an attitude indicator with heading.
- **Sticks:** two gimbals with a 1 s trail, from the EdgeTX Rud/Ele/Thr/Ail columns (falling back to CH1–4 AETR). Mode 1 or 2 toggle. Switch positions SA–SH are shown.
- **Timeline:** three chart lanes:
  - Height and speed.
  - Voltage and current.
  - RQly and throttle.

  The armed period is shaded, events are marked, and you can drag to scrub. Play/pause at ½× to 8×.
- **Keyboard:** space plays and pauses, ←/→ step 1 s, Shift steps 10 s, [ and ] change speed.
- **Summary panel:** armed time, max height, max speed, max distance, path length, battery start → end and sag, mAh, max current, min link, max TX power, GPS sats. Also notes such as a log starting or ending while armed.
- **Radio clock UTC/Local:** shares the planner's setting key `wd_tlm_clock`.
- Works on desktop and mobile. On mobile the order is map, then sticks and charts, then summary.

## v5.21 (10 Oct 2026): Automatic flight logging from EdgeTX / ELRS telemetry
Built on WakingDream_v5.20.html. Flight logs can now be filled automatically from the telemetry CSV that EdgeTX (e.g. RadioMaster TX16S MAX) writes to the radio's /LOGS folder from Betaflight/INAV over CRSF/ELRS. Manual entry is unchanged and works alongside it.
- **Import telemetry** (Flight Log → each RPA → Flights). Accepts one or more CSVs.
  - Each armed period becomes a flight. Armed state comes from the FM field: Betaflight adds `*`/`!` when disarmed, and `!FS!` counts as armed.
  - Drop-outs under 3 s are merged. Bench arms under 5 s that never leave the ground are ignored.
  - Duplicates are skipped by start time.
  - A blank starter flight is replaced by the imported flights.
- **Attach telemetry CSV** on an existing manual flight. You get the option to keep or replace the manual duration and heights.
- **Radio clock setting** (UTC or Local), remembered per browser. EdgeTX logs use the radio's clock.
- **Auto-filled fields**:
  - Duration (rounded minutes; the exact time is shown).
  - Label (date and start–end time).
  - Height segments: take-off max over the first 15 s, overall max, landing max over the last 15 s.
  - Flights are badged AUTO; others are MANUAL.
- **Telemetry panel on each flight**:
  - Max altitude (relative to the arming point).
  - Max GPS ground speed (3-sample median).
  - Max distance from home, and path length.
  - Battery start → end volts, sag, cell count, mAh used, max and average current.
  - Link: minimum RQly and RSSI, max TX power.
  - GPS sats.
  - Altitude and speed chart, and a GPS track sketch.
  - Failsafe and low-link events.
  - Notes if the log started or ended while armed.
  - Peak KE estimate (no drag) from the fleet weight. It's flagged red when a flight marked OONP exceeds 34 J.
- **Data storage**: data is kept in `flight.telemetry`, with a downsampled trace of about 160 points (around 6 KB per flight). It saves and loads with the plan.
- **PDF flight records**: AUTO flights draw the real telemetry altitude trace instead of the segment profile. They add a strip with max speed, max distance, battery, mAh used, link and peak KE, plus an explanatory footnote.

## v5.20 (8 Oct 2026): OONP Pathway 1 + EVLOS vessel risk template
Built on WakingDream_v5.19.html. Adds the risk template "OONP Pathway 1 + EVLOS — Vessel / Whale watching" (key `oonpP1EvlosVessel`) to the OONP Operations group in the JSA template dropdown. First used for the Aria Cruises whale-watching shoot, with launch and recovery on a sailing catamaran.
- 22 risks:
  - Pathway 1 KE, ≤34 J over signed, briefed participants.
  - Moving-deck launch and recovery, including hand catch.
  - Mast and rigging strike.
  - Person overboard.
  - Moving-vessel home point and RTH.
  - Hull compass interference.
  - Ditching.
  - Apparent wind.
  - Salt spray.
  - EVLOS: VO on a moving platform with glare.
  - Link loss as the vessel separates.
  - Whale and dolphin disturbance: 100 m drone rule (Qld); land the RPA for special interest whales.
  - Seabirds.
  - Non-participant passengers.
  - Other vessels.
  - Coastal manned aircraft.
  - Battery over water.
  - LiPo fire on board.
  - Crew seasickness and fatigue.
  - Skipper coordination.
  - Motor failure.
  - Privacy.
- Still to confirm per job: aircraft and weight (KE chart), Commonwealth rules beyond 3 nm, local whale protection area rules, airspace in a CASA-verified app, and NOTAMs for each day.

## v3.6 (28 Sep 2026): REOC Compliance Calendar tab
Built on WakingDream_v3.5.html. Brings the REOC Compliance Calendar (artifact H6uc2TEGizwDbVwZBdvb2R) into the app as a new sidebar tab.
- 13 tasks from Ops Manual V7: weekly Monday admin, monthly MC fleet session (1st Mon), monthly CRP people/registers session (3rd Mon), quarterly regulation check (2nd Mon Jan/Apr/Jul/Oct), 6 annual tasks (audit Nov, crew checks + proficiency checks Feb, archive Jul, risk register Aug, manual Sep), 3 October 2026 one-offs (overdue manual review catch-up 6 Oct, expiry set-up 7 Oct, register gaps 14 Oct).
- Each task has a tickable checklist, notes and a "Completed by" field; marking a task complete rolls it to the next occurrence. Missed occurrences are flagged in the record.
- Alert windows: monthly 7 days, quarterly and one-offs 14 days, annual 30 days.
- Expiries table: ReOC, OONP approval CASA.RPAS.1040, insurance, CASA 20/25 (31 Mar 2028), EX87/25 (30 Sep 2028). Rows are editable and can be added.
- Pulls in the existing pilot and aircraft expiry alerts from Database & Settings.
- Completion record with CSV export (audit evidence, OM 1.6.1 / 1.4.5).
- 12-month year view, daily and event-driven reference tables, and a .ics export built from the app's current state.
- Sidebar badge counts items that are overdue or due soon.
- Data is stored in db.compliance, so it's included in the existing JSON backup and restore.
