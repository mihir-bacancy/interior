# Outstand.so

Third-party social posting API. We use it for Instagram.

## Credentials

`OUTSTAND_API_KEY` — reused from `../socialMedia/reelGen/.env`. Same Outstand account, same connected handles.

## Endpoints we call

Base URL: `https://api.outstand.so/v1`. Auth: `Authorization: Bearer <OUTSTAND_API_KEY>`.
All responses are wrapped as `{ success, data, message? }` — `lib/outstand.ts::unwrap` handles it.

| Call                  | Method + path                                                 |
| --------------------- | ------------------------------------------------------------- |
| List IG accounts      | `GET /social-accounts`                                        |
| Upload video          | `POST /media/upload` → `PUT <upload_url>` → `POST /media/{id}/confirm` |
| Create post           | `POST /posts/`                                                |
| Check status          | `GET /posts/{id}/`                                            |

## Typical post lifecycle

From the publisher's perspective:

1. Fetch Cloudinary mp4 bytes.
2. Call `uploadRemoteVideo()` → 3-step Outstand upload → returns `{ mediaId, url, filename }`.
3. Call `createPost()` → returns `{ postId, status: 'submitted' }`.
4. Update `posts` row: `status='posted'`, `outstand_post_id=<id>`, `posted_at=now()`.

We don't poll `getPostStatus` today — Outstand usually publishes within 30s of submission, and if it fails the webhook (not yet wired) would notify us. If you want delivery status: call `getPostStatus(post.outstand_post_id)` from a new admin endpoint.

## Account connection

Don't do OAuth through this app. Connect handles via the Outstand dashboard, then hit `/accounts` in our UI and click "Refresh from Outstand" — new accounts will appear. See `instagram-connect.md`.

## Failure patterns

- `401` = the API key rotated or the handle was disconnected. Re-check Outstand dashboard.
- `500` from `/posts/` = Outstand's Meta-side queue rejected the submission (usually a rate limit or an IG policy violation). The error message is relayed verbatim to `posts.error_message`.
- Cloudinary URL unreachable = `uploadRemoteVideo` throws; post moves to `failed` before Outstand is even touched.
