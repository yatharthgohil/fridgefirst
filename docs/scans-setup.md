# Run grocery-photo and receipt recognition

This capstone MVP analyzes one grocery photo or receipt image at a time. A user reviews the suggestions, corrects any uncertain quantities, and confirms which foods to save. Nothing enters the pantry before confirmation.

## 1. Install the branch locally

Use Node.js 22.18 or later. From the repository directory, run:

```powershell
git fetch origin
git switch feat/receipt-recognition
npm ci
```

Keep the existing Supabase URL, publishable key, and Google sign-in configuration. Do not replace a working `.env.local` with the empty example.

The receipt branch includes the photo feature. To review only grocery photos, switch to `feat/grocery-photo-recognition` instead and apply only the first new migration below. Review and merge the photo PR first, then the receipt PR.

## 2. Apply the scan migration

Open the same Supabase project used by the application. Existing pantry migrations must already be applied. In **SQL Editor**, create a new query and run each new file once as the project database owner, in this order:

1. `supabase/migrations/20261118002121_grocery_scans.sql`.
2. `supabase/migrations/20261118042708_receipt_recognition.sql`.

The first migration creates the private scan records, commands, and `grocery-scans` Storage bucket with its ownership policies. The second enables receipt scans and their bounded food-line evidence. Do not create a public bucket or add permissive policies as a workaround. In **Storage**, verify that `grocery-scans` exists and is private.

If using a linked Supabase CLI migration workflow instead, apply the versioned migrations through that workflow. Do not apply the same migration manually and then run it again through the CLI without reconciling migration history.

## 3. Set the server-only AI configuration

Create an API key in your OpenAI project's dashboard and enable the API billing/access required by your project. Add these two values to `.env.local`:

```dotenv
OPENAI_API_KEY=your-project-api-key
SCAN_VISION_MODEL=gpt-5.4-mini
```

The suggested model supports image input, the Responses API, and structured output according to its [official model documentation](https://developers.openai.com/api/docs/models/gpt-5.4-mini). Access depends on your API project. If it is unavailable, use another standard image-input model that supports strict JSON-schema output. Do not use a text-only model or assume your ChatGPT subscription supplies API access.

Keep both values on the server. Never prefix the API key with `NEXT_PUBLIC_`, commit it, or put it in a browser request. The application sends normalized image content to OpenAI for recognition with response storage disabled. Users should upload only images they are comfortable processing with that provider.

For Vercel, add these settings in the project's environment variables for the intended environment. Keep `APP_ORIGIN` equal to the application's canonical browser origin. A deployment must support the analysis route's 60-second execution limit. Deploying or changing hosted environments is outside these implementation PRs.

## 4. Start and smoke-test

Run `npm run dev`, open `http://localhost:3000`, and sign in.

1. Open the pantry's add-groceries action and select one clear JPEG, PNG, or WebP photo under 5 MiB and 16 megapixels. Export HEIC to JPEG first.
2. Wait for recognition. Check the suggested names, quantities, units, storage locations, and confidence labels. Fill in any blank quantities or units. Deselect unwanted or duplicate suggestions.
3. Choose estimated, unknown, or manually entered expiration for each selected item. Recognition never verifies freshness or food safety.
4. Confirm the selected groceries. Refresh the page and verify they remain in the pantry with their real quantities and history.
5. Use **Delete source photos** after confirmation. Verify the corresponding file is gone from the private bucket while the pantry items remain.
6. Try an unclear or non-food image. Verify the flow shows an empty review or a recoverable error, and does not add invented sample groceries.
7. Sign in with a second account. Verify it cannot resume the first account's scan or view its source image.

Then test receipts:

1. Start a new scan and choose **Grocery receipt**. Cover personal and payment details before photographing it. Upload one clear image containing the complete food lines.
2. Verify that food suggestions show the food description from the original receipt line. Check abbreviated names against the receipt. Tax, totals, discounts, payments, and household goods should not appear as pantry foods.
3. Verify that a price such as `3.49` does not become a food quantity. Check any printed weight and unit. Fill in blank quantities and units yourself. Multipack amounts must not rely on an invented package size.
4. Keep repeated purchases separate if they represent separate lots. Correct or deselect mistakes, confirm, refresh, and check the saved pantry quantities.
5. Delete the source image through the flow. Verify the pantry foods remain. If the receipt is too small or blurry to read, retake it rather than trusting uncertain suggestions.

After a failed confirmation, retry without changing the selection first. A lost response must not create another batch. To import another purchase, finish or discard the saved scan and start a new one.

## Limits and verification boundaries

The application permits three analysis attempts per scan and ten attempts per user per UTC day. Failed attempts count. A request interrupted while analyzing can be retried after its two-minute lease expires. There is no automatic paid retry, background queue, PDF input, or HEIC conversion.

Images remain private until the owner deletes the scan through the flow. Retention is user-managed in this MVP. Server-side test doubles and disposable PostgreSQL verify behavior, ownership policies, and repeat-save protection locally. A real hosted Storage upload and paid-model recognition accuracy require the smoke test above. Those checks must not be described as already verified by the automated suite.
