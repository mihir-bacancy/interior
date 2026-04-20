# Connect an Instagram account

We don't run Meta's OAuth flow ourselves — Outstand does. Steps:

1. **Convert your IG to a Business or Creator account.** Instagram API access requires this. Settings → Account type → Switch to Professional. Personal accounts cannot be posted to via API.

2. **Link it to a Facebook Page.** On mobile: Instagram Settings → Accounts Center → Connect Facebook → pick the Page. (If you don't have a Facebook Page, create one — any name is fine, it can be minimal.)

3. **Connect via the Outstand dashboard.**
   - Log in at https://outstand.so with the account that owns `OUTSTAND_API_KEY`.
   - Social Accounts → Connect → Instagram → sign in with the Facebook account that owns the Page from step 2.
   - Grant permissions. The handle appears in Outstand's list.

4. **Refresh in this app.** Open `/accounts`, click "Refresh from Outstand". Your handle appears. Click "Make default" to have it pre-selected when scheduling.

## If your IG disappears from the list

Usually means the Facebook Page's access token expired. Re-authorize in the Outstand dashboard — Outstand re-fetches the token and the handle returns.

## Multiple handles

Supported. Each row in `accounts` is independent. When scheduling a post, the UI dropdown shows all cached handles. The "default" only sets the pre-selected one — you can override per-post.
