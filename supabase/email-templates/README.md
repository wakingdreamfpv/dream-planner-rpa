# Branded auth emails

Paste each file into **Supabase › Authentication › Emails** (one tab per template). Custom SMTP (Resend) must be set up first: new free-plan projects can't edit templates on Supabase's built-in email service.

| Template tab | File | Subject |
|---|---|---|
| Invite user | `invite.html` | You're invited to the Dream Flight RPA Operations Planner |
| Reset password | `reset-password.html` | Reset your Dream Flight RPA planner password |
| Magic link | `magic-link.html` | Your sign-in link for the Dream Flight RPA planner |

Variables used: `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .SiteURL }}` and `{{ .Data.full_name }}` (set by the planner's Invite crew; dashboard invites fall back to "Hi,").
