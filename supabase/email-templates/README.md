# Supabase email templates

Paste these into **Supabase → Authentication → Emails → Templates** (subject + body).

Why: Supabase's default links (`{{ .ConfirmationURL }}`) are spent the moment
anything opens them — including Microsoft 365's link scanner — and with the
PKCE sign-in flow they only work in the same browser that asked for the email.
These links go straight to Watchman's `/auth/confirm` page with a token hash
instead: they work in any browser, and nothing is used up until the person
clicks **Continue** (scanners don't click buttons).

Requires **Site URL** (Authentication → URL Configuration) = the app's address.
