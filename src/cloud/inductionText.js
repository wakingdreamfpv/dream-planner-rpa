// Wording for the pilot induction (Chunk 3). Edit freely: nothing else depends on the exact text.
// Section references are to the Waking Dream FPV / Rubio Enterprises RPAS Operations Manual.

export const TLDR = [
  'Fill in your details, next of kin, hours and the aircraft types you\'ll fly for us (about 10 minutes).',
  'Upload a photo of your RePL and a summary of your logbook.',
  'Tick ONE declaration (the full list is under "What you\'re declaring") and agree to keep the manual confidential.',
  'Sign with your finger or type your name, then submit. The Chief Remote Pilot checks it and certifies you.',
];

export const APPROVALS = [
  { id: 'evlos', label: 'EVLOS (extended visual line of sight)' },
  { id: 'oonp', label: 'OONP (operations over or near people)' },
  { id: 'night', label: 'Night operations' },
];

export const DECLARATION_TITLE = 'I declare that I hold a current RePL, have read and understood the Operations Manual, and will operate in accordance with it.';
export const DECLARATION_ITEMS = [
  'I hold a current Remote Pilot Licence (RePL) for the RPA categories I will fly.',
  'I have read and understood the Operations Manual as it applies to my role (s1.3.1).',
  'I will keep flight logs for every flight and give them to the CRP.',
  'I understand flight planning and the job safety assessment (JSA), airspace checks, and the standard operating conditions: VLOS, 30 m from people not involved, 400 ft AGL, and giving way to crewed aircraft.',
  'I understand pre-flight briefings and the crew roles on a job.',
  'I understand battery handling, charging, storage and transport.',
  'I understand the emergency procedures.',
  'I understand incident and accident reporting, including immediately reportable matters (F.4, G.1).',
];

export const CONFIDENTIALITY = 'The Operations Manual and company procedures are confidential. I will use them only for operations under Rubio Enterprises Pty Ltd\'s ReOC, and I will not copy, photograph, share or pass them on to anyone, during or after my engagement.';

// Part 2 — the CRP's checks. `refs` are manual sections; `items` show as help text.
export const CRP_CHECKS = [
  { id: 'induction', label: 'Induction', refs: 'F.4 / G.1', items: [
    'Operations Manual structure and the sections that apply to the pilot',
    'Company procedures: planning, JSA, authorisation by the CRP, flight records',
    'Crew roles, briefings and standard calls',
    'Standard operating conditions and when an approval is needed',
    'Fitness to fly, alcohol and drugs, fatigue',
    'Emergency response plan, incident and accident reporting',
    'Record keeping: flight logs, battery and technical logs',
  ] },
  { id: 'type', label: 'Type practical', refs: 'G.2', items: [
    'Pre-flight inspection, assembly and controller / link set-up',
    'Failsafe and return-to-home settings checked and understood',
    'Normal take-off, hover, manoeuvres and landing',
    'Manual control without position hold',
    'Emergency procedures: link loss, low battery, GPS loss, flyaway',
    'Post-flight inspection, battery handling and logging',
  ] },
  { id: 'evlos', label: 'EVLOS check', refs: 'G5 · MOS 5.06', items: [
    'EVLOS procedures in the Operations Manual',
    'Observer briefing, positions and handover',
    'Communications check and standard calls',
    'Abort criteria and "land now" response',
  ] },
  { id: 'oonp', label: 'OONP check', refs: 'G7', items: [
    'Kinetic energy limits (15 J / 34 J) and the pathways',
    'Exclusion zones, consent and briefings',
    'Per-drone speed and height limits',
    '10+ hours on the type verified',
  ] },
  { id: 'night', label: 'Night check', refs: 'G3', items: [
    'Daylight site survey before night operations',
    'Aircraft lighting and orientation at night',
    'Visual illusions and maintaining VLOS at night',
    'Night emergency procedures',
  ] },
];

export const CRP_CERTIFY = 'I certify that I have checked this pilot against the items ticked above and the Operations Manual, and that the details recorded are correct.';
