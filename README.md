# فلوسي / Floussi

An Arabic and English income and expense tracker for CIH, Attijariwafa bank (Tijari), and cash. Switch languages with **English / العربية** in the top bar or entry dialog. The interface, categories, messages, currency formatting and layout direction switch together; existing transactions remain unchanged.

## Open the interactive app / فتح التطبيق التفاعلي

```sh
npm run build
```

Open **dist/floussi.html** (or **dist/index.html**) in a modern browser. The single HTML file includes all styles, translations and JavaScript, and works without a server or Internet connection. Download and open the HTML itself; PNG screenshots and document previews are not interactive.

افتح ملف **dist/floussi.html** في المتصفح بعد تنزيله. يتضمن الملف التطبيق كاملًا ويعمل دون تثبيت. صور المعاينة ليست التطبيق. استعمل زر **English / العربية** لتغيير اللغة.

Keep using the same browser profile and file location for saved data. Use JSON backups to move records between profiles, file locations and the hosted version.

## Development

Node.js 18+ is required. The app has no external package dependencies.

```sh
npm run dev
npm run check
npm run build
```

The server listens on port 3000, configurable with `PORT`. Assets use relative paths and the server supports mounting the app under a URL prefix. `npm run check` checks JavaScript syntax. The build checks that the exported HTML has no external stylesheet or script dependencies.

## Balances and monthly totals

- Set the opening balances for **CIH**, **Tijari**, and **Cash** before entering transactions.
- Every transaction belongs to one account. Cash income increases cash; cash expenses decrease it.
- **Total balance** includes both banks and cash, across all recorded dates.
- **Both banks** shows the bank-only subtotal separately; each account also has its own balance card.
- The selected month controls income, expenses, net cash flow, charts and the transaction list.
- Monthly net = income minus expenses. It is net cash flow, not accounting profit.
- Existing bank-only data and backups gain an initial cash balance of zero; transaction values and IDs are preserved.

Amounts are stored as integer centimes. No bank connection, automatic bank synchronization, login or server database is used.

## Interface and storage

Use **Add transaction / إضافة عملية** (the fixed + button on phones) to open the form. The row menu supports editing and deletion. Search recognizes Arabic and English category names. Month arrows change periods; **Back to this month / العودة إلى هذا الشهر** returns to the current month. Switching language within an entry form preserves its draft.

When browser storage is available, records and the chosen language persist locally. If it is blocked or full, the app continues in memory and displays a prominent **session-only** warning: download a JSON backup before closing or reloading. Unreadable existing data is left untouched; temporary new entries are not written over it.

**Download backup / تحميل نسخة** exports all opening balances and transactions as JSON. **Restore backup / استرجاع نسخة** replaces the displayed records after confirmation. CSV export contains the selected month's transactions in the current interface language. Clearing browser data removes locally saved records.
