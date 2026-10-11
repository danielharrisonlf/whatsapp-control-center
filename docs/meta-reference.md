# WhatsApp Business Platform / Cloud API — Technical Reference (researched 2026-10-02)

Sources: developers.facebook.com (legacy `/docs/whatsapp/...` and the newer `/documentation/business-messaging/whatsapp/...` tree, to which many `/docs` pages now redirect).
Legend: **UNVERIFIED** = could not be confirmed on a currently fetched official page; the value comes from long-standing Meta docs or common usage and should be checked before you rely on it.

---

## 0. Key changes and deprecations to know (2025-07 → 2026-10)

| Date | Change |
|---|---|
| 2025-07-01 | **Per-message pricing (PMP)** replaced conversation-based pricing (CBP). `pricing.pricing_model` = `PMP`. CBP docs are now marked "(Deprecated)". |
| 2025-09-24 / 2025-10-09 | Uploaded media IDs are available for **7 days** (previously 30) per the changelog. The media reference page still says 30 days, so treat 7 days as current. |
| 2025-10-08 (v24.0+) | Messaging limits are now set **per business portfolio**, not per phone number. New field `whatsapp_business_manager_messaging_limit`; `messaging_limit_tier` is deprecated and now returns the portfolio limit. Tiers: `TIER_250`, `TIER_2K`, `TIER_10K`, `TIER_100K`, `TIER_UNLIMITED` (initial scaling step is 2,000). |
| 2025-10-08 (v24.0+) | Status webhooks **omit the `conversation` object** unless the message was sent inside an open free-entry-point window. |
| 2025-10-08 | New error **131059**: invalid pagination cursor. |
| 2025-10-08 | **Embedded Signup v4** released. |
| 2025-10-16 | Inbound media webhooks now include a `url` property. Audio can be sent as a voice message. |
| 2025-11-03 | New status value **`played`** for voice messages. The `unsupported` webhook now carries the actual message type. |
| 2025-12-01 | The analytics lookback window (messaging, conversation and pricing analytics) dropped from 10 years to **1 year**. |
| 2025-12-03 | Coupon code length raised from 15 to **20** characters. |
| 2026-04 (early) | **BSUIDs** (business-scoped user IDs) started appearing in webhooks (`user_id`, `from_user_id`, `recipient_user_id`, `parent_user_id`, `username`). `wa_id` may be **omitted** for users who have usernames. |
| 2026-07 | You can send to a BSUID using the `recipient` field instead of `to`. Authentication templates still require a phone number. |
| 2026-07-29 | **Graph API v26.0** released. |
| 2026-10-01 | Service (non-template) messages are now **charged per message**, at the same rate as utility/authentication messages in each market. |
| **2026-10-15** | **Embedded Signup v2 is deprecated.** v3 is "available until October 2026". Migrate to **v4**. |

---

## 1. Graph API version and base URL

- **Latest version: `v26.0`** (released 2026-07-29; end-of-life date to be announced).
- Earlier versions: v25.0 (2026-02-18 → available until 2028-07-29), v24.0 (2025-10-08 → 2028-02-18), v23.0 (2025-05-29 → 2027-10-08), v22.0 (→ 2027-05-20), v21.0 (→ 2027-01-21).
- Base URL: `https://graph.facebook.com/v26.0/`
- Auth header: `Authorization: Bearer <ACCESS_TOKEN>`
- Docs: https://developers.facebook.com/docs/graph-api/changelog
- Note: some WhatsApp guide pages still show `v25.0` or `v21.0` in their examples. Any non-expired version works, but v24.0+ semantics apply to messaging limits and status webhooks.

---

## 2. Embedded Signup (ES)

Docs: https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation ; versions: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions

### Versions
| Version | Released | Status |
|---|---|---|
| **v4** | 2025-10-08 | Current and recommended. Products (Cloud API, MM Lite, CTWA ads, Conversions API) are chosen in the **Facebook Login for Business configuration**, not in `extras`. |
| v4-public-preview | 2026-05-12 | Adds the "Phone Number First" flow. |
| v3 | 2025-05-29 | Available until October 2026. |
| v3-public-preview / v2-public-preview | 2025-08-14 | Simplified-flow preview. |
| v2 | 2023-01 | **Deprecated 2026-10-15.** |

- In v4, `extras` is `{ setup: {} }` or `{}`. In v2/v3, the version is set with `extras.version` (e.g. `"v3"`) and the flow is selected with `extras.featureType`.
- `featureType` values: `whatsapp_business_app_onboarding` (Coexistence: onboarding a WhatsApp Business app number), `only_waba_sharing` (v2 only, legacy), `marketing_messages_lite`.
- `sessionInfoVersion: "3"` is **required only for v2** to receive the session-info message event. v3 and later send it automatically.

### Launch (FB JS SDK)
```js
FB.login(fbLoginCallback, {
  config_id: '<CONFIGURATION_ID>',          // Facebook Login for Business configuration
  response_type: 'code',                    // returns an exchangeable code, not a token
  override_default_response_type: true,
  extras: { setup: {} }                     // v4. v2 used: { setup:{}, featureType:'', sessionInfoVersion:'3' }
});
// callback: response.authResponse.code
```
- **The code has a TTL of 30 seconds.** Exchange it on the server right away.

### Session-info message event
```js
window.addEventListener('message', (event) => {
  if (!event.origin.endsWith('facebook.com')) return;
  const data = JSON.parse(event.data);
  if (data.type === 'WA_EMBEDDED_SIGNUP') {
    // data.event: FINISH | FINISH_ONLY_WABA | FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING |
    //             FINISH_OBO_MIGRATION | FINISH_GRANT_ONLY_API_ACCESS | ERROR | CANCEL
    // data.data: { phone_number_id, waba_id, business_id,
    //   optional: ad_account_ids, page_ids, dataset_ids, catalog_ids, instagram_account_ids, waba_ids }
    // CANCEL -> data.data.current_step ; ERROR -> data.data.error_message, error_id, session_id (UNVERIFIED exact keys)
  }
});
```

### Code exchange
- `GET https://graph.facebook.com/v26.0/oauth/access_token?client_id=<APP_ID>&client_secret=<APP_SECRET>&code=<CODE>`
- Response: `{ "access_token": "<BUSINESS_TOKEN>", "token_type": "bearer" }`. This is a **business integration system user access token** scoped to the customer. Expiry fields: UNVERIFIED. Treat the token as long-lived and check it with `debug_token`.
- `redirect_uri` is not needed for the JS SDK popup flow (UNVERIFIED for every setup).

### Post-signup steps (Tech Provider)
Docs: https://developers.facebook.com/docs/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider
1. Exchange the code for a business token (above).
2. `POST /<WABA_ID>/subscribed_apps` with `Authorization: Bearer <BUSINESS_TOKEN>` subscribes your app to the customer WABA's webhooks.
3. `POST /<PHONE_NUMBER_ID>/register` with body `{"messaging_product":"whatsapp","pin":"<6-digit>"}`.
4. Optional: send a test message.
5. The customer adds a payment method in WhatsApp Manager. Solution Partners instead share their credit line (separate guide).

---

## 3. Debug token

- `GET /debug_token?input_token=<TOKEN_TO_INSPECT>&access_token=<APP_ID>|<APP_SECRET>` (an app token or a developer user token)
- Docs: https://developers.facebook.com/docs/graph-api/reference/debug_token
- Response is wrapped in `data`:

| Field | Type | Notes |
|---|---|---|
| `app_id` | string | |
| `type` | string | `USER`, `SYSTEM_USER`, `PAGE`, `APP` (UNVERIFIED enum) |
| `application` | string | App name |
| `data_access_expires_at` | unixtime | |
| `expires_at` | unixtime | **0 = never expires** (typical for system-user tokens; UNVERIFIED wording) |
| `is_valid` | bool | |
| `issued_at` | unixtime | |
| `scopes` | string[] | e.g. `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management` |
| `granular_scopes` | object[] | `{ "scope": "...", "target_ids": ["<WABA_ID>", ...] }`. **Use `target_ids` of `whatsapp_business_management` to find the WABA IDs the customer granted** |
| `user_id` | string | |
| `profile_id` | string | |
| `error` | object | `code`, `message`, `subcode` |

- Read-only.

---

## 4. WhatsApp Business Account (WABA)

Permission: `whatsapp_business_management` (reads); `business_management` for business-level edges.

### GET /{waba-id}
Docs: https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account and https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/whatsapp-business-account-api

Fields:
- `id`, `name`, `timezone_id`, `message_template_namespace`, `currency`, `country`, `status` (default `ACTIVE`).
- `account_review_status`: `APPROVED` | `DEFERRED` | `PENDING` | `REJECTED`
- `business_verification_status`: `EXPIRED` | `FAILED` | `INELIGIBLE` | `NOT_VERIFIED` | `PENDING` | `PENDING_NEED_MORE_INFO` | `PENDING_SUBMISSION` | `REJECTED` | `REVOKED` | `VERIFIED`
- `ownership_type`: `CLIENT_OWNED` | `ON_BEHALF_OF` | `SELF`
- `primary_business_location`, `health_status` (`can_send_message` + `entities[]`), `is_enabled_for_insights` (bool), `is_shared_with_partners`, `marketing_messages_lite_api_status`, `marketing_messages_onboarding_status`, `on_behalf_of_business_info`, `primary_funding_id`, `purchase_order_number`, `whatsapp_business_manager_messaging_limit` (TIER_*), `analytics` (see §12).
- `owner_business_info` (`{id,name}`): **UNVERIFIED**. It is not listed on the current reference pages but still works in practice.

Edges: `phone_numbers`, `message_templates`, `subscribed_apps`, `flows`, `analytics`, `conversation_analytics`, `pricing_analytics`, `template_analytics`, `template_group_analytics`, `call_analytics`, `message_template_previews`, `template_groups`, `product_catalogs`, `payment_configuration(s)`, `solutions`, `activities`, `dataset`.

### POST /{waba-id}
- `name`, `timezone_id`. Also `is_enabled_for_insights=true` enables template analytics (§12). Response: `{"success":true}`.

### GET /{business-id}/owned_whatsapp_business_accounts and GET /{business-id}/client_whatsapp_business_accounts
- Permissions: `business_management` + `whatsapp_business_management`. Token: an admin system user token for the business.
- Response: `data[]` of WABA nodes (default `id,name,timezone_id,message_template_namespace`; client WABAs also carry `permitted_tasks`) and `paging.cursors.before/after`. Use `?fields=` to request more fields.
- Docs: https://developers.facebook.com/docs/marketing-api/reference/business/owned_whatsapp_business_accounts/ ; .../client_whatsapp_business_accounts/

### /{waba-id}/subscribed_apps (webhooks for the WABA)
Docs: https://developers.facebook.com/docs/whatsapp/embedded-signup/webhooks/override
- `POST /{waba-id}/subscribed_apps`: with no body, it subscribes the calling app. Response `{"success":true}`.
  - Optional override body: `{"override_callback_uri":"https://...","verify_token":"..."}`. The URL must be at most **200 characters**, and Meta verifies it with a GET challenge. The override applies only to some fields (messages, calls, etc.). **Template and account-level webhooks always go to the app's default callback URL.**
  - To remove the override, POST again with no body.
- `GET /{waba-id}/subscribed_apps` returns `data[]` with `whatsapp_business_api_data{ id, name, link }` plus `override_callback_uri` when set (shape partly UNVERIFIED).
- `DELETE /{waba-id}/subscribed_apps` unsubscribes the app. **UNVERIFIED**: the v26 Graph reference says DELETE "cannot be performed", but the WhatsApp guides historically document it. Test before relying on it.
- Rate limit error **80008** applies.
- Phone-number-level override: `POST /{phone-number-id}` with `{"webhook_configuration":{"override_callback_uri":"...","verify_token":"..."}}`. Read it with `GET /{phone-number-id}?fields=webhook_configuration` (returns `phone_number`, `whatsapp_business_account`, `application`). Remove it by setting `"override_callback_uri":""`.

---

## 5. Phone numbers

Permissions: `whatsapp_business_management` (+ `whatsapp_business_messaging` for register/messaging). Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/phone-numbers ; https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers

### GET /{waba-id}/phone_numbers and GET /{phone-number-id}
- Default fields: `id`, `display_phone_number`, `verified_name`, `quality_rating`.
- `?fields=` options:
  - `code_verification_status`: `VERIFIED` | `NOT_VERIFIED` | `EXPIRED`
  - `quality_rating`: `GREEN` | `YELLOW` | `RED` | `NA` | `UNKNOWN`
  - `name_status`: `APPROVED` | `AVAILABLE_WITHOUT_REVIEW` | `DECLINED` | `EXPIRED` | `PENDING_REVIEW` | `NONE`
  - `status`: `CONNECTED` | `PENDING` | `FLAGGED` | `RESTRICTED` | `BANNED` (other values such as `DISCONNECTED`, `MIGRATED`, `UNVERIFIED` exist in older docs: UNVERIFIED)
  - `platform_type`: `CLOUD_API` | `ON_PREMISE` | `NOT_APPLICABLE` (**UNVERIFIED** enum)
  - `throughput`: object `{ "level": "STANDARD" | "HIGH" | "NOT_APPLICABLE" }` (**UNVERIFIED** enum; docs only say "throughput level")
  - `account_mode`: `SANDBOX` | `LIVE`
  - `whatsapp_business_manager_messaging_limit` (v24+: `TIER_250` | `TIER_2K` | `TIER_10K` | `TIER_100K` | `TIER_UNLIMITED`)
  - `messaging_limit_tier`: **deprecated**; now returns the portfolio limit
  - `last_onboarded_time` (when Embedded Signup completed), `is_official_business_account` (bool), `health_status`, `webhook_configuration`, `new_display_name`, `search_visibility`, `username` (2026)
- Filtering: `?filtering=[{"field":"account_mode","operator":"EQUAL","value":"LIVE"}]`
- Pagination: cursor-based (`limit`, `after`, `before`).
- Limits: a new portfolio can register **2 numbers**. This rises to **20** after business verification or after reaching the 2K messaging limit.
- Throughput: **80 mps** by default, **automatically upgraded to 1,000 mps** (requires an unlimited tier, more than 100K unique users in 24h, and quality YELLOW or better). Numbers coexisting with the WhatsApp Business app are fixed at 20 mps. The upgrade can cause up to 1 minute of downtime (error 131057).

### POST /{waba-id}/phone_numbers (add a number)
- Body: `cc` (country dial code), `phone_number` (digits only, without the country code or `+`), `verified_name` (display name). Optional: `migrate_phone_number` (bool, moves the number between WABAs), `preverified_id`.
- Response: `{"id":"<PHONE_NUMBER_ID>"}`. Errors: 100, 200, 200000.
- Docs: https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/phone_numbers

### POST /{phone-number-id}/request_code
- Body: `code_method` = `SMS` | `VOICE`, `language` (e.g. `en`, `pt_BR`). Response: `{"success":true}`.

### POST /{phone-number-id}/verify_code
- Body: `code` (string of digits). Response: `{"success":true}`.

### POST /{phone-number-id}/register
- Body: `{"messaging_product":"whatsapp","pin":"123456"}`. `pin` is 6 digits: the existing 2-step PIN, or a new one that becomes the PIN. Optional: `data_localization_region` (ISO 3166 alpha-2, e.g. `BR`, `DE`, `IN`, `SG`, `AU`) for Local Storage.
- Permissions: `whatsapp_business_management` + `whatsapp_business_messaging`. Response: `{"success":true}`.
- **Limit: 10 register/deregister requests per number in a 72-hour moving window.** Going over returns **133016** and blocks the number for 72h.
- Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/registration

### POST /{phone-number-id}/deregister
- No body. Response `{"success":true}`. Shares the 10-per-72h limit. Not allowed for numbers used with both Cloud API and the WhatsApp Business app (coexistence).

### Two-step verification PIN
- `POST /{phone-number-id}` with body `{"pin":"123456"}` (exactly 6 digits). Response `{"success":true}`. **No endpoint can disable 2SV**; reset it in WhatsApp Manager.
- Other `POST /{phone-number-id}` params: `webhook_configuration`, `new_display_name`, `search_visibility`, `username`, `connection_status`.
- Docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/two-step-verification

---

## 6. Business profile

Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/business-profiles
Permission: `whatsapp_business_management` (UNVERIFIED; the page does not state it, and `whatsapp_business_messaging` is commonly accepted too).

- `GET /{phone-number-id}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`
  - Response: `{"data":[{"about","address","description","email","messaging_product":"whatsapp","profile_picture_url","websites":[...],"vertical"}]}`
- `POST /{phone-number-id}/whatsapp_business_profile` (response `{"success":true}`)

| Field | Rule |
|---|---|
| `messaging_product` | **required**, `"whatsapp"` |
| `about` | 1–139 chars. Rendered emojis are allowed, Unicode escape values are not |
| `address` | max 256 |
| `description` | max 512 |
| `email` | max 128, valid format |
| `websites` | array, **max 2**, each max 256, must start with `http://` or `https://` |
| `profile_picture_handle` | handle `h` from the Resumable Upload API |
| `vertical` | enum below |

**`vertical` enum:** `ALCOHOL`, `APPAREL`, `AUTO`, `BEAUTY`, `EDU`, `ENTERTAIN`, `EVENT_PLAN`, `FINANCE`, `GOVT`, `GROCERY`, `HEALTH`, `HOTEL`, `NONPROFIT`, `ONLINE_GAMBLING`, `OTC_DRUGS`, `OTHER`, `PHYSICAL_GAMBLING`, `PROF_SERVICES`, `RESTAURANT`, `RETAIL`, `TRAVEL`. (An empty string `""` may be returned when the vertical is unset: UNVERIFIED.)

### Resumable Upload API (for profile_picture_handle and template header_handle)
Docs: https://developers.facebook.com/docs/graph-api/guides/upload
1. `POST /{app-id}/uploads?file_name=<name>&file_length=<bytes>&file_type=<mime>&access_token=<TOKEN>`. `file_type` must be one of `application/pdf`, `image/jpeg`, `image/jpg`, `image/png`, `video/mp4`. Response: `{"id":"upload:<SESSION_ID>"}`.
2. `POST /upload:<SESSION_ID>` with headers `Authorization: OAuth <TOKEN>` (note: **OAuth**, not Bearer) and `file_offset: 0`; the body is the raw binary. Response: `{"h":"<FILE_HANDLE>"}`.
3. To resume: `GET /upload:<SESSION_ID>` (same auth) returns `{"id","file_offset"}`. Then POST again with that `file_offset`.
- The docs say a user access token is needed. In practice a system user token from the same app works (UNVERIFIED). The page states no size limit.

---

## 7. Message templates

Permission: `whatsapp_business_management`.
Docs: https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates ; https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates ; components: .../message-templates/components ; management: .../message-templates/template-management

### GET /{waba-id}/message_templates
- Filter params: `name`, `name_or_content`, `content`, `language` (array), `category` (array), `status` (array), `quality_score` (array: `GREEN|YELLOW|RED|UNKNOWN`), `since`, `until`. Also `fields`, `limit`, `after`/`before` (cursor).
  - `category` filter enum: `UTILITY`, `MARKETING`, `AUTHENTICATION`, plus legacy values (`ACCOUNT_UPDATE`, `PAYMENT_UPDATE`, `PERSONAL_FINANCE_UPDATE`, `SHIPPING_UPDATE`, `RESERVATION_UPDATE`, `ISSUE_RESOLUTION`, `APPOINTMENT_UPDATE`, `TRANSPORTATION_UPDATE`, `TICKET_UPDATE`, `ALERT_UPDATE`, `AUTO_REPLY`, `TRANSACTIONAL`, `OTP`, `FREE_SERVICE`).
- Response: `data[]` (template nodes), `paging{cursors{before,after},next}`, and a `summary` with `total_count`, `message_template_count`, `message_template_limit`, `are_translations_complete`.
- Template node fields: `id`, `name`, `language`, `status`, `category`, `sub_category`, `components`, `parameter_format`, `quality_score{score,date}`, `rejected_reason`, `previous_category`, `message_send_ttl_seconds`, `cta_url_link_tracking_opted_out`, `library_template_name` (several of these are partly UNVERIFIED on the current page).

### GET /{template-id}
- Returns the same node fields. Use `?fields=`. (The node reference page returned 404, so the field list is UNVERIFIED.)

### Status enum
`APPROVED`, `PENDING`, `REJECTED`, `PAUSED`, `DISABLED`, `IN_APPEAL`, `PENDING_DELETION`, `DELETED`, `LIMIT_EXCEEDED`, `ARCHIVED` (all confirmed as filter values). Webhook events add `FLAGGED`, `REINSTATED`, `LOCKED`, `UNARCHIVED`.
- `rejected_reason` / webhook `reason` values: `ABUSIVE_CONTENT`, `INCORRECT_CATEGORY`, `INVALID_FORMAT`, `NONE`, `PROMOTIONAL`, `SCAM`, `TAG_CONTENT_MISMATCH` (`null` when the template is scheduled for deletion).
- Quality score: `GREEN` | `YELLOW` | `RED` | `UNKNOWN`. Pausing: the 1st pause lasts **3h**, the 2nd **6h**, and the 3rd disables the template.
- Templates inactive for 12+ months are **archived**.
- Review takes up to 24h. Appeals are decided within 24h.

### POST /{waba-id}/message_templates (create)
| Field | Rule |
|---|---|
| `name` | required. Max 512 chars, lowercase alphanumerics and `_` only |
| `language` | required (e.g. `en_US`, `pt_BR`) |
| `category` | required: `MARKETING` \| `UTILITY` \| `AUTHENTICATION` |
| `components` | required array |
| `parameter_format` | `POSITIONAL` (default) \| `NAMED` |
| `allow_category_change` | bool (optional) |
| `message_send_ttl_seconds` | optional TTL |
| `sub_category` | `ORDER_DETAILS` \| `ORDER_STATUS` \| `RICH_ORDER_STATUS` |
| `cta_url_link_tracking_opted_out`, `library_template_name` | optional |
- Response: `{"id":"<TEMPLATE_ID>","status":"PENDING|APPROVED|REJECTED","category":"MARKETING|..."}`
- Limits: **250 templates per WABA** if the portfolio is unverified; **up to 6,000** if it is verified and has an approved display name. **Max 100 template creations per WABA per hour.**
- Multi-language upsert (used in the auth template docs) takes `"languages":[...]` instead of `language`. The endpoint is `POST /{waba-id}/upsert_message_templates` (**UNVERIFIED** path).

### Component rules
- **HEADER** (optional, max 1): `format` = `TEXT` | `IMAGE` | `VIDEO` | `DOCUMENT` | `LOCATION` (the docs also mention GIF). TEXT: **max 60 chars**, max **1** variable. Media headers need `example.header_handle: ["<handle from Resumable Upload>"]`. LOCATION takes no example; values are supplied at send time.
- **BODY** (required): **max 1024 chars**, multiple variables allowed.
- **FOOTER** (optional): **max 60 chars**, text only, no variables.
- **BUTTONS**: **max 10 total**. Quick reply max 10. **URL max 2** (URL max 2000 chars, at most 1 variable at the end). **PHONE_NUMBER max 1** (max 20 chars). **COPY_CODE max 1** (max 20 chars since 2025-12). **Button text max 25 chars.** Other types: `OTP`, `FLOW`, `CATALOG`, `MPM`, `VOICE_CALL` (beyond OTP/FLOW: UNVERIFIED). Grouping rule: quick replies cannot be interleaved with other button types (UNVERIFIED on the current page).
- **Examples** (required whenever variables are used):
  - Positional: `example.header_text: ["v1"]`, `example.body_text: [["v1","v2"]]` (an array of arrays).
  - Named: `example.header_text_named_params: [{"param_name":"x","example":"..."}]`, `example.body_text_named_params: [{"param_name":"first_name","example":"Ana"}]`.
  - Media: `example.header_handle: ["4::aW..."]`.
- **Variable rules** (template review page): use `{{1}}`, `{{2}}`… **sequentially, with no gaps**. **The text cannot start or end with a variable.** No special characters (`#`, `$`, `%`) inside a parameter. No mismatched braces. No excessive variable-to-text ratio. Named params use lowercase letters and `_` only and must be unique. "No adjacent variables" is widely enforced but **UNVERIFIED** on the current page. Duplicate body+footer content is rejected (authentication templates are exempt).
- FLOW button (create): `{"type":"FLOW","text":"...","flow_id":"<ID>" | "flow_name" | "flow_json", "flow_action":"navigate|data_exchange","navigate_screen":"SCREEN_ID"}` (**UNVERIFIED** key set).

### Authentication templates
Docs: https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates
- The body has **no custom `text`**; the content is preset. BODY takes `add_security_recommendation: true|false`. FOOTER takes `code_expiration_minutes` (1–90). BUTTONS has exactly one `{"type":"OTP","otp_type":"COPY_CODE|ONE_TAP|ZERO_TAP", "text"?: "...", "supported_apps":[{"package_name","signature_hash"}]}`. `supported_apps` is needed for ONE_TAP/ZERO_TAP. ZERO_TAP also needs `zero_tap_terms_accepted: true` (UNVERIFIED).
- Send: the body parameter `text` = OTP **and** the button `sub_type: "url"`, `index: "0"`, parameter `text` = OTP (max **15 chars**). Authentication templates cannot be sent to a BSUID.

### POST /{template-id} (edit)
- Only `APPROVED`, `REJECTED` or `PAUSED` templates can be edited. Editable: `components` (the **whole array is replaced**), `category` (not when APPROVED), `message_send_ttl_seconds`. **You cannot change the name or language.**
- APPROVED templates: **1 edit per 24h** and **10 edits per 30 days**. REJECTED/PAUSED: unlimited. The edited template is re-reviewed.
- Response: `{"success":true}`.

### DELETE /{waba-id}/message_templates
- `?name=<name>` deletes **all languages** with that name.
- `?hsm_id=<template_id>&name=<name>` deletes one template.
- `?hsm_ids=[...]` bulk-deletes up to 100.
- After an APPROVED template is deleted, **its name cannot be reused for 30 days**. Templates with messages still pending delivery go to `PENDING_DELETION` for up to 30 days. The docs state that DISABLED templates cannot be deleted.

---

## 8. Sending messages — POST /{phone-number-id}/messages

Permission: `whatsapp_business_messaging`. Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages ; https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api

### Common envelope
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",           // or "group" (Groups API)
  "to": "5511999999999",                    // or "recipient": "<BSUID>" (2026+). If both are present, the phone number wins
  "context": {"message_id": "wamid...."},   // optional: reply/quote
  "biz_opaque_callback_data": "...",        // optional, echoed back in status webhooks
  "type": "<TYPE>",
  "<TYPE>": { ... }
}
```
`type` values: `text`, `image`, `video`, `audio`, `document`, `sticker`, `location`, `contacts`, `reaction`, `interactive`, `template`.

### Response
```json
{ "messaging_product":"whatsapp",
  "contacts":[{"input":"5511999999999","wa_id":"5511999999999"}],
  "messages":[{"id":"wamid.HBg...","message_status":"accepted"}] }
```
`message_status` values: `accepted` | `held_for_quality_assessment` | `paused`. With BSUID sends, `contacts` may include `user_id` (UNVERIFIED).

### Per-type bodies
- **text**: `{"body":"...","preview_url":true}`. Body **max 4096** chars. The preview uses the first `http(s)://` URL.
- **image | video | audio | document | sticker**: `{"id":"<MEDIA_ID>"}` or `{"link":"https://..."}`. Plus `caption` (image/video/document; max 1024: UNVERIFIED) and `filename` (document). Audio has an optional voice flag (`"voice": true`, OGG/OPUS, since 2025-10: UNVERIFIED key name).
- **location**: `{"latitude":-23.5,"longitude":-46.6,"name":"...","address":"..."}`
- **contacts**: an array (up to 257). Each item: `name{formatted_name (required), first_name, last_name, middle_name, suffix, prefix}`, `phones[{phone,type,wa_id}]`, `emails[{email,type}]`, `addresses[{street,city,state,zip,country,country_code,type}]`, `org{company,department,title}`, `urls[{url,type}]`, `birthday` (YYYY-MM-DD).
- **reaction**: `{"message_id":"wamid...","emoji":"👍"}`. An empty `emoji` removes the reaction (UNVERIFIED on current page).
- **interactive**: `interactive.type` = `button` | `list` | `cta_url` | `flow` | `location_request_message` | `product` | `product_list` | `catalog_message` | `call_permission_request` (also `address_message` in some markets: UNVERIFIED).
  - **button** (reply buttons): header (`text|image|video|document`), `body.text` (max 1024), `footer.text` (max 60), `action.buttons[]` = `{"type":"reply","reply":{"id":"<=256","title":"<=20"}}`, **max 3 buttons**.
  - **list**: header text (max 60), body (max 4096), footer (max 60), `action.button` (max 20), `action.sections[]{title(max 24), rows[{id(max 200), title(max 24), description(max 72)}]}`. **Max 10 sections and max 10 rows in total.**
  - **cta_url**: `action:{"name":"cta_url","parameters":{"display_text":"<=20","url":"https://..."}}`. Body max 1024, footer max 60, header text max 60 or an image/video/document header.
  - **location_request_message**: `{"type":"location_request_message","body":{"text":"<=1024"},"action":{"name":"send_location"}}`. The reply arrives as a `location` message.
  - **flow**: `action:{"name":"flow","parameters":{"flow_message_version":"3","flow_token":"...","flow_id":"..." | "flow_name":"...","flow_cta":"<=30","flow_action":"navigate|data_exchange","flow_action_payload":{"screen":"ID","data":{}},"mode":"draft|published"}}`
  - product / product_list / catalog_message: `action.catalog_id`, `product_retailer_id`, `sections[{title, product_items[{product_retailer_id}]}]` (details UNVERIFIED).
- **template**:
```json
"template": {
  "name": "order_confirmation",
  "language": {"code": "pt_BR", "policy": "deterministic"},
  "components": [
    {"type":"header","parameters":[{"type":"image","image":{"id":"<MEDIA_ID>"}}]},
    {"type":"body","parameters":[
        {"type":"text","text":"Ana"},                                  // positional
        {"type":"text","parameter_name":"order_number","text":"X1"},   // named
        {"type":"currency","currency":{"fallback_value":"$10","code":"USD","amount_1000":10000}},
        {"type":"date_time","date_time":{"fallback_value":"Oct 2"}}]},
    {"type":"button","sub_type":"quick_reply","index":"0","parameters":[{"type":"payload","payload":"X"}]},
    {"type":"button","sub_type":"url","index":"1","parameters":[{"type":"text","text":"suffix"}]},
    {"type":"button","sub_type":"copy_code","index":"2","parameters":[{"type":"coupon_code","coupon_code":"SAVE10"}]},
    {"type":"button","sub_type":"flow","index":"0","parameters":[{"type":"action","action":{"flow_token":"...","flow_action_data":{}}}]}
  ]}
```
  Named params (`parameter_name`) and the flow button were confirmed. The other shapes (currency, date_time, policy, coupon_code) follow long-standing docs and are **UNVERIFIED** on current pages.

### Mark as read / typing indicator
- `POST /{phone-number-id}/messages` with `{"messaging_product":"whatsapp","status":"read","message_id":"wamid..."}`. Response `{"success":true}`. This also marks earlier messages as read. Only works within **30 days** of receipt. An invalid ID returns 131009.
- Typing indicator: the same body plus `"typing_indicator":{"type":"text"}`. It shows until you reply or for 25 seconds, whichever comes first.

### Messaging rules
- Free-form messages are allowed only within **24h** of the user's last message (the customer service window). Outside it you must send a template, or you get **131047**.
- Pair rate limit: **1 message per 6 seconds to the same user** (bursts of up to 45 are allowed but borrow from future quota). Exceeding it returns **131056**.

---

## 9. Media

Permission: `whatsapp_business_messaging`. Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media ; https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media

- **Upload**: `POST /{phone-number-id}/media` (multipart/form-data) with `file=@path;type=<mime>`, `type=<mime>`, `messaging_product=whatsapp`. Response `{"id":"<MEDIA_ID>"}`.
  - **The ID is retained for 7 days** (changelog, effective 2025-10-09). The reference page still says 30 days. Media IDs from webhooks also expire after 7 days.
- **Get URL**: `GET /{media-id}[?phone_number_id=<ID>]` returns `{"messaging_product":"whatsapp","url","mime_type","sha256","file_size","id"}`.
- **Download**: `GET <url>` with `Authorization: Bearer <TOKEN>`. **The URL expires after 5 minutes**; request it again to get a fresh one.
- **Delete**: `DELETE /{media-id}[?phone_number_id=<ID>]` returns `{"success":true}`.
- Since 2025-10-16, inbound media webhooks also include `url`.

| Type | MIME | Max |
|---|---|---|
| Audio | `audio/aac`, `audio/amr`, `audio/mpeg`, `audio/mp4`, `audio/ogg` (OPUS codec only, mono) | 16 MB |
| Document | `text/plain`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation` | 100 MB |
| Image | `image/jpeg`, `image/png` (8-bit, RGB/RGBA) | 5 MB |
| Sticker | `image/webp` | 100 KB static / 500 KB animated |
| Video | `video/mp4`, `video/3gpp` (H.264 video + AAC audio) | 16 MB |

---

## 10. Webhooks

Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started ; https://developers.facebook.com/docs/whatsapp/webhooks/reference ; https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview

### Verification (GET)
- Query: `hub.mode=subscribe`, `hub.verify_token=<your token>`, `hub.challenge=<int>`. If the token matches, respond **200 with the raw `hub.challenge` value**; otherwise 403.

### Signature (POST)
- Header `X-Hub-Signature-256: sha256=<hex>`. Compute `HMAC-SHA256(key=APP_SECRET, msg=RAW_REQUEST_BODY_BYTES)` and compare in constant time. Use the raw bytes, never re-serialized JSON (Meta escapes Unicode).
- Respond **200** quickly. Failed deliveries are retried with decreasing frequency for **up to 7 days** (WhatsApp docs; generic Graph docs say 36h), so dedupe on message/status IDs. Payloads can be **up to 3 MB**. mTLS is supported. Delivery order is not guaranteed.

### Payload envelope
```json
{ "object":"whatsapp_business_account",
  "entry":[{ "id":"<WABA_ID>",
    "changes":[{ "field":"messages",
      "value":{ "messaging_product":"whatsapp",
        "metadata":{"display_phone_number":"...","phone_number_id":"..."},
        "contacts":[{"profile":{"name":"..."},"wa_id":"...","user_id":"<BSUID>","username":"..."}],
        "messages":[...], "statuses":[...], "errors":[...] }}]}]}
```

### `whatsapp_business_account` webhook fields (current list)
`account_alerts`, `account_review_update`, `account_update`, `automatic_events`, `business_capability_update`, `history`, `message_template_components_update`, `message_template_quality_update`, `message_template_status_update`, `messages`, `partner_solutions`, `payment_configuration_update`, `phone_number_name_update`, `phone_number_quality_update`, `security`, `smb_app_state_sync`, `smb_message_echoes`, `template_category_update`, `user_preferences`.
- Also documented elsewhere: **`flows`** (Flows docs; events `FLOW_STATUS_CHANGE`, `CLIENT_ERROR_RATE`, `ENDPOINT_ERROR_RATE`, `ENDPOINT_LATENCY`, `ENDPOINT_AVAILABILITY`), **`calls`** (Calling API), and group-related fields (Groups API). These are not in the 19-item reference list: UNVERIFIED names for calls/groups. None of the fields is marked deprecated.

### messages: inbound
- `messages[]`: `from` (wa_id; may be absent for username users), `from_user_id` (BSUID), `id` (wamid), `timestamp`, `type`, `context{from,id,forwarded,frequently_forwarded,referred_product}` (context subfields UNVERIFIED), `referral` (CTWA ads).
- `type` values: `text`, `image`, `audio`, `video`, `document`, `sticker`, `location`, `contacts`, `button` (template quick-reply: `button.payload`, `button.text`), `interactive` (`button_reply{id,title}`, `list_reply{id,title,description}`, `nfm_reply{response_json,body,name}` for Flows), `reaction`, `order`, `system`, `unsupported`, `request_welcome`.
- `wa_id` is included only if you messaged or called the user, or they messaged or called you, within the last 30 days, or the user is in your contact book. Otherwise rely on `user_id` (BSUID).

### messages: statuses
- `statuses[]`: `id`, `status`, `timestamp`, `recipient_id`, `recipient_user_id` (BSUID), `biz_opaque_callback_data`, `conversation`, `pricing`, `errors`, `recipient_participant_id` (groups).
- `status`: `sent` | `delivered` | `read` | `failed` | `played` (voice). (`deleted` is not listed: UNVERIFIED/absent.)
- `pricing`: `{billable: bool, pricing_model: "PMP" (since 2025-07-01; "CBP" before), type: "regular"|"free_customer_service"|"free_entry_point", category: "authentication"|"authentication_international"|"marketing"|"marketing_lite"|"referral_conversion"|"service"|"utility"}`
- `conversation`: `{id, expiration_timestamp, origin{type}}`. **v24+: present only inside free-entry-point windows.**
- `errors` (only when `failed`): `[{code, title, message, error_data{details}, href}]`

### message_template_status_update
- `value`: `event`, `message_template_id`, `message_template_name`, `message_template_language`, `message_template_category`, `reason`, plus conditional `disable_info`, `other_info`, `rejection_info`.
- `event` values: `APPROVED`, `ARCHIVED`, `UNARCHIVED`, `DELETED`, `DISABLED`, `FLAGGED`, `IN_APPEAL`, `LIMIT_EXCEEDED`, `LOCKED`, `PAUSED`, `PENDING`, `REINSTATED`, `PENDING_DELETION`, `REJECTED`.

---

## 11. Flows

Docs: https://developers.facebook.com/docs/whatsapp/flows/reference/flowsapi. Permission: `whatsapp_business_management` (sending uses `whatsapp_business_messaging`).

| Op | Endpoint | Notes |
|---|---|---|
| List | `GET /{waba-id}/flows` | paginated; fields `id,name,status,categories,validation_errors` |
| Create | `POST /{waba-id}/flows` | `name` (req), `categories` (req, array), optional `clone_flow_id`, `endpoint_uri`, `flow_json` (string), `publish` (bool). Response `{id, success, validation_errors[]}` |
| Get | `GET /{flow-id}?fields=...` | `id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,preview,whatsapp_business_account,application,health_status` |
| Update metadata | `POST /{flow-id}` | `name`, `categories`, `endpoint_uri` (and `application_id`: UNVERIFIED) |
| Upload JSON | `POST /{flow-id}/assets` (multipart) | `file` (≤10 MB), `name=flow.json`, `asset_type=FLOW_JSON`. Response `{success, validation_errors}` |
| List assets | `GET /{flow-id}/assets` | `data[{name, asset_type, download_url}]` |
| Publish | `POST /{flow-id}/publish` | DRAFT → PUBLISHED; irreversible. Must have no validation errors |
| Deprecate | `POST /{flow-id}/deprecate` | PUBLISHED → DEPRECATED |
| Delete | `DELETE /{flow-id}` | **DRAFT only** |
| Preview | `GET /{flow-id}?fields=preview.invalidate(false)` | `preview{preview_url, expires_at}`, valid 30 days. `invalidate(true)` makes a new link |

- **Status**: `DRAFT`, `PUBLISHED`, `DEPRECATED`, `BLOCKED`, `THROTTLED`. Sending a blocked flow returns 132068. A throttled flow (10 sends per hour) returns 132069.
- **Categories**: `SIGN_UP`, `SIGN_IN`, `APPOINTMENT_BOOKING`, `LEAD_GENERATION`, `CONTACT_US`, `CUSTOMER_SUPPORT`, `SURVEY`, `OTHER`.

---

## 12. Analytics

Docs: https://developers.facebook.com/docs/whatsapp/business-management-api/analytics. Permission: `whatsapp_business_management`. All analytics are read as fields on `GET /{waba-id}?fields=<metric>.start(<unix>).end(<unix>).granularity(<G>)...`, except template analytics, which can also be read as an edge.
**Lookback was capped at 1 year from 2025-12-01** for messaging, conversation and pricing analytics.

- **`analytics`** (messaging): `start`, `end`, `granularity` = `HALF_HOUR|DAY|MONTH`. Optional `phone_numbers[]`, `country_codes[]`, `product_types[]` (0 = notification, 2 = customer support, 100 = MM Lite: UNVERIFIED mapping). Returns `data_points[{start,end,sent,delivered}]`.
- **`conversation_analytics`**: `granularity` = `HALF_HOUR|DAILY|MONTHLY`, `metric_types` = `COST|CONVERSATION`, `conversation_categories`, `conversation_types` (`FREE_ENTRY_POINT|FREE_TIER|REGULAR`), `conversation_directions`, `dimensions`. **This covers the legacy CBP model.** Since 2025-07-01 billing is per message, so this returns historical data only. Meta labels CBP "deprecated"; I found no explicit removal date for the field (UNVERIFIED).
- **`pricing_analytics`** (per-message pricing, the replacement): `start`, `end`, `granularity` = `HALF_HOUR|DAILY|MONTHLY` (all required). Optional `phone_numbers`, `country_codes`, `metric_types` = `COST|VOLUME`, `pricing_categories`, `pricing_types`, `dimensions` (including `TIER` for volume tiers). Returns `data[{data_points[{start,end,volume,cost,pricing_category,pricing_type,country,phone_number,tier}]}]` (data-point keys UNVERIFIED).
- **`template_analytics`**: `GET /{waba-id}/template_analytics?start=&end=&granularity=DAILY&template_ids=[...]&metric_types=[...]`. `template_ids` is required (max **10**). `granularity` must be `DAILY`. `metric_types` = `SENT|DELIVERED|READ|CLICKED|COST` (+ MM API metrics). Optional `product_type`. Lookback **90 days**. Read/click data covers only 7 days after the send.
  - **First enable it with `POST /{waba-id}?is_enabled_for_insights=true`** (check the `is_enabled_for_insights` field).
- Also available: `template_group_analytics` (`template_group_ids` max 10, DAILY, 90d, `use_waba_timezone`), `call_analytics`, `group_analytics` (1 group_id, 90d).

---

## 13. Errors

Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes ; https://developers.facebook.com/docs/graph-api/guides/error-handling

```json
{ "error": {
    "message": "(#131030) Recipient phone number not in allowed list",
    "type": "OAuthException",
    "code": 131030,
    "error_subcode": 2655007,
    "error_user_title": "...", "error_user_msg": "...",
    "error_data": {"messaging_product":"whatsapp","details":"..."},
    "is_transient": false,
    "fbtrace_id": "A..." } }
```
Meta's advice: branch on `code` (+ `error_data.details`), not on `message` or the HTTP status. Async failures arrive in `statuses[].errors` with the same codes.

| Code | Meaning | HTTP | Retry? |
|---|---|---|---|
| 0 | Auth failure | 401 | No; re-auth |
| 1 | Invalid request / unknown | 400 | Maybe (backoff) |
| **2** | Service temporarily unavailable | 503 | **Yes** |
| 3 | Capability/permission | 403 | No |
| **4** | App-level rate limit | 429 | **Yes**, with backoff |
| 10 | Permission denied | 403 | No |
| **17** | User rate limit | — | **Yes**, backoff |
| 33 | Phone number deleted | 400 | No |
| 100 | Invalid parameter | 400 | No |
| 190 | Token expired/invalid (subcodes 458, 459, 460, 463, 464, 467, 492) | 401 | No; get a new token |
| 200–299 | Permission denied | 403 | No |
| 368 | Account restricted (policy) | 403 | No |
| **80007** | WABA rate limit | 429 | **Yes** |
| **80008** | WBM API rate limit (WABA) | 429 | **Yes** |
| 130403 | Business blocked the user | 400 | No |
| **130429** | Cloud API throughput reached | 429 | **Yes** (backoff) |
| 130472 | Excluded by experiment | 400 | No |
| 130497 | Country restricted | 403 | No |
| **131000** | Unknown error | 500 | **Yes** |
| 131005 | Access denied | 403 | No |
| 131008 | Required parameter missing | 400 | No |
| 131009 | Parameter value invalid | 400 | No |
| **131016** | Service unavailable | 503 | **Yes** |
| 131021 | Sender = recipient | 400 | No |
| 131026 | Undeliverable (not a WA user / old client / terms) | 400 | No (maybe later) |
| 131030 | Recipient not in allowed list (test number) | 400 | No |
| 131031 | Account locked / policy | 403 | No |
| 131037 | Display name not approved | 400 | No |
| 131042 | Payment issue | 402 | No |
| 131045 | Number not registered (cert) | 400 | No |
| 131047 | **24h window expired**; send a template | 400 | No (use a template) |
| 131048 | Spam rate limit (quality) | 429 | Later |
| 131049 | Marketing per-user limit (ecosystem) | 429 | Not sooner than 24h |
| 131050 | User opted out of marketing | 400 | **Never** |
| 131051 | Unsupported message type | 400 | No |
| 131052 | Media download error | 400 | No |
| 131053 | Media upload error | 400 | No |
| **131056** | Pair rate limit (same recipient) | 429 | **Yes**, after a delay |
| **131057** | Account in maintenance / throughput upgrade | 503 | **Yes** |
| 131059 | Invalid pagination cursor (v24+) | 400 | No |
| 131063 | Marketing templates disabled on Cloud API; use Marketing Messages API | 400 | No |
| 132000 | Template param count mismatch | 400 | No |
| 132001 | Template missing / not in that language / not approved | 400 | No |
| 132005 | Hydrated text too long | 400 | No |
| 132007 | Template policy violation | 400 | No |
| 132012 | Param format mismatch | 400 | No |
| 132015 | Template paused (low quality) | 400 | Later |
| 132016 | Template disabled permanently | 400 | No |
| 132068 / 132069 | Flow blocked / throttled | 400/429 | No / later |
| 133000 | Incomplete deregistration | 400 | Deregister, then register |
| **133004** | Server temporarily unavailable | 503 | **Yes** |
| 133005 | Wrong 2SV PIN | 400 | No |
| 133006 | Number needs verification | 400 | No |
| 133008 / 133009 | Too many PIN guesses / too fast | 429 | After the stated wait |
| 133010 | Number not registered | 400 | No |
| **133015** | Number recently deleted | 400 | **Yes, after 5 min** |
| 133016 | Register/deregister limit (10 per 72h) | 429 | After 72h |
| 134011 | Payments TOS not accepted | 400 | No |
| 135000 | Generic user error | 500 | Maybe |

Codes 132002–132004, 132006, 132008–132011, 132013 and 132014 (if any) are **not listed** on the current page (UNVERIFIED). Generic Graph docs list 1, 2, 4, 17 and 368 as "transient". Also honor `is_transient` when it is present.

---

## 14. Permissions and tokens

Docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens
- `whatsapp_business_management`: WABA, phone numbers, templates, flows, analytics, subscribed_apps, business profile.
- `whatsapp_business_messaging`: send messages, media, register/deregister, mark as read.
- `business_management`: business-level edges (`owned_/client_whatsapp_business_accounts`), system users, asset assignment.
- Also: `whatsapp_business_manage_events` (added 2025-08-04, for event logging / Conversions API).
- Token types:
  - **System user** (admin: all WABAs; employee: needs assigned WABAs). Long-lived, with an optional expiry chosen at generation. Created in Business Settings → System Users → Generate token with the 3 permissions above.
  - **Business integration system user** token: from the Embedded Signup code exchange, scoped to one customer.
  - **User** token: short-lived, for testing only.
- Tech Provider status no longer requires access verification (2025-10-03). Advanced access to the permissions still requires App Review (not re-verified).

---

## 15. Throttling headers

Docs: https://developers.facebook.com/docs/graph-api/overview/rate-limiting
- `X-Business-Use-Case-Usage`: a JSON object keyed by business ID, each entry an array of `{ "type": "whatsapp_business_management", "call_count": <%>, "total_cputime": <%>, "total_time": <%>, "estimated_time_to_regain_access": <minutes> }`. Values are percentages of the quota; throttling starts at 100.
- `X-App-Usage`: `{call_count, total_cputime, total_time}` as percentages over a 1h window (platform-level limits, error 4).
- WhatsApp Business Management API BUC limits: **200 calls/hour per WABA** by default, and **5,000/hour** for active WABAs with at least one registered number. Credit-line APIs: 5,000/hour per app. Error **80008** when exceeded.
- Messaging (Cloud API) is **not** governed by BUC headers. It is governed by throughput (80 → 1,000 mps; error 130429), the pair rate (131056), and portfolio messaging limits (TIER_*).
